import axios from "axios";
import net from "net";
import { v4 as uuidv4 } from "uuid";
import { Service, ServiceProtocol, ServiceSource, ServiceStatus } from "@shared";
import { USER_AGENT, PORT_INFO_MAP, HTTP_PROTOCOLS } from "../lib/constants.js";
import { config } from "../lib/config.js";

interface CIDRConfig {
  cidr: string;
  ports: number[];
}

interface PortInfo {
  port: number;
  protocol: ServiceProtocol;
  serviceName?: string;
}

function ipToNumber(ip: string): number {
  return ip.split(".").reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

function numberToIp(num: number): string {
  return [(num >>> 24) & 255, (num >>> 16) & 255, (num >>> 8) & 255, num & 255].join(".");
}

const PORT_SCAN_TIMEOUT_MS = 1000;

export function parseCIDRConfig(): CIDRConfig[] {
  const portList = config.scanPorts;
  const cidrList = config.networkCidrs;

  return cidrList.map((cidr) => ({ cidr, ports: portList }));
}

async function portScan(ip: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, PORT_SCAN_TIMEOUT_MS);

    socket.once("connect", () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(true);
    });

    socket.once("error", () => {
      clearTimeout(timer);
      resolve(false);
    });

    socket.connect(port, ip);
  });
}

async function detectService(
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

              return `${ip}:${port} (healthy)`;
            }
          } catch {
            // continue
          }
        }
      } catch {
        // fall through
      }

      return `${ip}:${port}`;
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

export async function* scanNetworkStream(cidr: string, ports: number[]): AsyncGenerator<Service[]> {
  const [network, mask] = cidr.split("/");
  const maskBits = parseInt(mask, 10);
  const networkNum = ipToNumber(network);
  const hostCount = Math.pow(2, 32 - maskBits) - 2;
  const maxHosts = Math.min(hostCount, 254);
  const now = new Date().toISOString();

  for (let i = 1; i <= maxHosts && i <= 254; i++) {
    const ip = numberToIp(networkNum + i);

    const portPromises = ports.map(async (port) => {
      const isOpen = await portScan(ip, port);

      if (isOpen) {
        const protocol = [...HTTP_PROTOCOLS, ServiceProtocol.SSH].includes(
          detectProtocolByPort(port),
        )
          ? detectProtocolByPort(port)
          : ServiceProtocol.TCP;

        return { port, protocol } as PortInfo;
      }

      return null;
    });

    const portResults = await Promise.all(portPromises);
    const validPorts = portResults.filter((p): p is PortInfo => p !== null);

    if (validPorts.length === 0) continue;

    const detectedPorts = await Promise.all(
      validPorts.map(async (p) => {
        const name = await detectService(ip, p.port, p.protocol);

        return { ...p, serviceName: name || p.protocol };
      }),
    );

    // One service per host: pick the most meaningful name and protocol from
    // the detected ports (prefer HTTP services, fall back to the first port).
    const primary =
      detectedPorts.find((p) => HTTP_PROTOCOLS.includes(p.protocol)) ?? detectedPorts[0];

    yield [
      {
        id: `net-${uuidv4()}`,
        name: primary?.serviceName || ip,
        host: ip,
        ports: detectedPorts.map((p) => p.port).sort((a, b) => a - b),
        checkPort: primary?.port,
        protocol: primary?.protocol ?? ServiceProtocol.TCP,
        source: ServiceSource.NETWORK,
        status: ServiceStatus.UP,
        created_at: now,
        updated_at: now,
      },
    ];
  }
}

function detectProtocolByPort(port: number): ServiceProtocol {
  return PORT_INFO_MAP[port]?.protocol ?? ServiceProtocol.TCP;
}
