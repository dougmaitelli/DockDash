import axios from "axios";
import net from "net";
import { v4 as uuidv4 } from "uuid";
import { Service, ServiceSource, ServiceStatus } from "@shared";

interface CIDRConfig {
  cidr: string;
  ports: number[];
}

export interface NetworkHost {
  ip: string;
  ports: PortInfo[];
}

interface PortInfo {
  port: number;
  protocol: string;
  serviceName?: string;
}

export function parseCIDRConfig(): CIDRConfig[] {
  const cidrs = process.env.NETWORK_CIDRS || "192.168.1.0/24";
  const ports = process.env.SCAN_PORTS || "80,443,3000,3001,5432,6379,8080,8443,9090,27017,22,3306";

  const portList = ports
    .split(",")
    .map((p) => parseInt(p.trim(), 10))
    .filter((p) => !isNaN(p));
  const cidrList = cidrs
    .split(",")
    .map((c) => c.trim())
    .filter((c) => c.length > 0);

  return cidrList.map((cidr) => ({ cidr, ports: portList }));
}

async function portScan(ip: string, port: number, timeout = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, timeout);

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
  protocol: string,
): Promise<string | undefined> {
  try {
    const timeout = 2000;

    // HTTP services
    if (["http", "https"].includes(protocol)) {
      try {
        const baseUrl = `${protocol}://${ip}:${port}`;
        const resp = await axios.get(baseUrl, {
          timeout,
          validateStatus: () => true,
          headers: { "User-Agent": "DockDash/1.0" },
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
    if (protocol === "ssh" || port === 22) {
      return "SSH Server";
    }

    // Database protocols
    const dbMap: Record<number, string> = {
      3306: "MySQL",
      5432: "PostgreSQL",
      6379: "Redis",
      27017: "MongoDB",
      9200: "Elasticsearch",
      11211: "Memcached",
      1433: "MSSQL",
      5672: "RabbitMQ",
      15672: "RabbitMQ Management",
    };

    if (dbMap[port]) return dbMap[port];

    return undefined;
  } catch {
    return undefined;
  }
}

export async function scanNetwork(cidr: string, ports: number[]): Promise<NetworkHost[]> {
  const results: NetworkHost[] = [];

  // Parse CIDR to get IP range
  const [network, mask] = cidr.split("/");
  const maskBits = parseInt(mask, 10);
  const networkNum = ipToNumber(network);

  // Calculate host range (skip network and broadcast addresses)
  const hostCount = Math.pow(2, 32 - maskBits) - 2;
  const maxHosts = Math.min(hostCount, 254); // Cap for performance

  // Scan first 254 IPs per CIDR by default
  for (let i = 1; i <= maxHosts && i <= 254; i++) {
    const ip = numberToIp(networkNum + i);

    // Scan each port concurrently with parallelism limit
    const portPromises = ports.map(async (port) => {
      const isOpen = await portScan(ip, port);

      if (isOpen) {
        const protocol = ["http", "https", "ssh"].includes(detectProtocolByPort(port))
          ? detectProtocolByPort(port)
          : "tcp";

        return { port, protocol } as PortInfo;
      }

      return null;
    });

    const portResults = await Promise.all(portPromises);
    const validPorts = portResults.filter((p): p is PortInfo => p !== null);

    // Detect services on open ports
    const services = await Promise.all(
      validPorts.map(async (p) => {
        const name = await detectService(ip, p.port, p.protocol);

        return { ...p, serviceName: name || p.protocol };
      }),
    );

    if (services.length > 0) {
      results.push({ ip, ports: services });
    }
  }

  return results;
}

function detectProtocolByPort(port: number): string {
  const map: Record<number, string> = {
    80: "http",
    443: "https",
    8080: "http",
    8443: "https",
    3000: "http",
    5000: "http",
    22: "ssh",
  };

  return map[port] || "tcp";
}

export function convertToServices(hosts: NetworkHost[]): Service[] {
  const services: Service[] = [];

  for (const host of hosts) {
    for (const portInfo of host.ports) {
      const protocol = portInfo.protocol || "http";

      services.push({
        id: `net-${uuidv4()}`,
        name: portInfo.serviceName || `${host.ip}:${portInfo.port}`,
        host: host.ip,
        port: portInfo.port,
        protocol,
        source: ServiceSource.NETWORK,
        status: ServiceStatus.UP,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
  }

  return services;
}

function ipToNumber(ip: string): number {
  return ip.split(".").reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

function numberToIp(num: number): string {
  return [(num >>> 24) & 255, (num >>> 16) & 255, (num >>> 8) & 255, num & 255].join(".");
}
