import axios from "axios";
import { spawn } from "child_process";
import { createInterface } from "readline";
import { v4 as uuidv4 } from "uuid";

import { Service, ServiceProtocol, ServiceSource, ServiceStatus } from "@shared";

import { config } from "../lib/config.js";
import {
  detectProtocolByPort,
  HTTP_PROTOCOLS,
  PORT_INFO_MAP,
  USER_AGENT,
} from "../lib/constants.js";
import { logger } from "../lib/logService.js";

const SCAN_CONCURRENCY = 15;
const DEEP_SCAN_CONCURRENCY = 5;

interface CIDRConfig {
  cidr: string;
}

interface PortInfo {
  port: number;
  protocol: ServiceProtocol;
  serviceName?: string;
}

export class NetworkScanner {
  parseCIDRConfig(): CIDRConfig[] {
    return config.networkCidrs.map((cidr) => ({ cidr }));
  }

  async *scanNetworkStream(cidr: string, deepScan = false): AsyncGenerator<Service[]> {
    logger.info(`[NetworkScanner] Starting ${deepScan ? "deep" : "standard"} scan for ${cidr}`);

    // Queue for completed results + a notify handle to wake the generator
    const queue: Service[] = [];
    let pingSweepDone = false;
    let pendingScans = 0;
    let notify: (() => void) | null = null;
    const wake = () => {
      const fn = notify;

      notify = null;
      fn?.();
    };

    // Semaphore to cap concurrent nmap port-scan processes and avoid exhausting
    // file descriptors. Deep scan (-p-) is much heavier so gets a tighter limit.
    const maxConcurrent = deepScan ? DEEP_SCAN_CONCURRENCY : SCAN_CONCURRENCY;
    let running = 0;
    const semQueue: (() => void)[] = [];
    const acquire = () =>
      new Promise<void>((resolve) => {
        if (running < maxConcurrent) {
          running++;
          resolve();
        } else {
          semQueue.push(resolve);
        }
      });
    const release = () => {
      const next = semQueue.shift();

      if (next) {
        next();
      } else {
        running--;
      }
    };

    // Stream the ping sweep line-by-line, firing a port scan for each live host
    // immediately rather than waiting for the full sweep to finish.
    const pingProc = spawn("nmap", ["-sn", "-T4", cidr, "-oG", "-"]);
    const pingRl = createInterface({ input: pingProc.stdout, crlfDelay: Infinity });
    let pingSweepStderr = "";

    pingProc.stderr.on("data", (d: Buffer) => (pingSweepStderr += d.toString()));

    void (async () => {
      try {
        for await (const line of pingRl) {
          const match = line.match(/Host:\s+(\S+)\s+\(([^)]*)\)\s+Status:\s+Up/);

          if (!match) continue;

          pendingScans++;
          void (async () => {
            try {
              await acquire();
              const service = await this.scanHost(match[1], match[2] || undefined, deepScan);

              if (service) queue.push(service);
            } catch (err) {
              logger.error(
                `[NetworkScanner] Failed to scan host ${match[1]}: ${err instanceof Error ? err.message : String(err)}`,
              );
            } finally {
              release();
              pendingScans--;
              wake();
            }
          })();
        }

        if (pingSweepStderr)
          logger.warn(`[NetworkScanner] ping sweep stderr:\n${pingSweepStderr}`);
      } catch (err) {
        logger.error(
          `[NetworkScanner] Ping sweep failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      } finally {
        pingSweepDone = true;
        wake();
      }
    })();

    // Yield results as they arrive while work is still in progress
    while (!pingSweepDone || pendingScans > 0 || queue.length > 0) {
      while (queue.length > 0) yield [queue.shift()!];

      if (!pingSweepDone || pendingScans > 0) {
        await new Promise<void>((resolve) => {
          notify = resolve;
        });
      }
    }
  }

  private async scanHost(
    ip: string,
    hostname: string | undefined,
    deepScan: boolean,
  ): Promise<Service | null> {
    const now = new Date().toISOString();
    const openPorts = await this.nmapPortScan(ip, deepScan);

    logger.debug(`[NetworkScanner] ${ip} open ports: ${openPorts.join(", ")}`);

    const detectedPorts = await Promise.all(
      openPorts.map(async (port): Promise<PortInfo> => {
        const protocol = [...HTTP_PROTOCOLS, ServiceProtocol.SSH].includes(
          detectProtocolByPort(port),
        )
          ? detectProtocolByPort(port)
          : ServiceProtocol.TCP;
        const name = await this.detectService(ip, port, protocol);

        return { port, protocol, serviceName: name || protocol };
      }),
    );

    // One service per host: prefer HTTP, fall back to first detected port
    const primary =
      detectedPorts.find((p) => HTTP_PROTOCOLS.includes(p.protocol)) ?? detectedPorts[0];

    return {
      id: `net-${uuidv4()}`,
      name: hostname || primary?.serviceName || ip,
      host: ip,
      ports: detectedPorts.map((p) => p.port).sort((a, b) => a - b),
      checkPort: primary?.port,
      source: ServiceSource.NETWORK,
      status: ServiceStatus.UP,
      createdAt: now,
      updatedAt: now,
    };
  }

  private nmapPortScan(ip: string, deepScan: boolean): Promise<number[]> {
    return new Promise((resolve, reject) => {
      let stdout = "";
      let stderr = "";
      const args = ["-sT", "-T4", ...(deepScan ? ["-p-"] : []), "--open", ip, "-oG", "-"];
      const proc = spawn("nmap", args);

      proc.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
      proc.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
      proc.on("close", () => {
        if (stderr) logger.warn(`[NetworkScanner] port scan ${ip} stderr:\n${stderr}`);

        resolve(this.parseNmapOpenPorts(stdout));
      });
      proc.on("error", reject);
    });
  }

  private parseNmapOpenPorts(output: string): number[] {
    const ports: number[] = [];

    for (const line of output.split("\n")) {
      if (!line.startsWith("Host:")) continue;

      const portsSection = line.match(/Ports:\s+([^\t]+)/);

      if (!portsSection) continue;

      for (const portEntry of portsSection[1].trim().split(", ")) {
        const parts = portEntry.split("/");

        if (parts[1] === "open") ports.push(parseInt(parts[0], 10));
      }
    }

    return ports;
  }

  private async detectService(
    ip: string,
    port: number,
    protocol: ServiceProtocol,
  ): Promise<string | undefined> {
    try {
      const timeout = 2000;

      // HTTP services
      if (HTTP_PROTOCOLS.includes(protocol)) {
        try {
          const baseUrl = `${protocol}://${ip}:${port}`;
          const resp = await axios.get(baseUrl, {
            timeout,
            validateStatus: () => true,
            headers: { "User-Agent": USER_AGENT },
          });

          const title = resp.data?.match(/<title>([^<]+)/i);

          if (title?.[1]) return title[1].trim();

          // Check common health/status endpoints
          const endpoints = ["/health", "/healthz", "/status", "/api/health"];

          for (const ep of endpoints) {
            try {
              const healthResp = await axios.get(`${baseUrl}${ep}`, { timeout: 1000 });

              if (healthResp.status === 200 && healthResp.data) {
                const healthTitle = healthResp.data?.match(/<title>([^<]+)/i);

                if (healthTitle) return healthTitle[1].trim();

                return ip;
              }
            } catch {
              // continue
            }
          }
        } catch {
          // fall through
        }

        return ip;
      }

      // SSH
      if (protocol === ServiceProtocol.SSH || port === 22) {
        return "SSH Server";
      }

      if (PORT_INFO_MAP[port]) return PORT_INFO_MAP[port].name;

      return undefined;
    } catch {
      return undefined;
    }
  }
}

export const networkScanner = new NetworkScanner();
