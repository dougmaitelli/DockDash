import type { Service } from "./Service.js";
import { ServiceProtocol } from "./types.js";

export interface TlsEndpoint {
  hostname: string;
  port: number;
}

export function isIpHostname(hostname: string): boolean {
  const value = hostname.replace(/^\[(.*)\]$/, "$1");

  if (value.includes(":")) return true;

  const octets = value.split(".");

  return (
    octets.length === 4 &&
    octets.every((octet) => /^\d+$/.test(octet) && Number(octet) >= 0 && Number(octet) <= 255)
  );
}

export function resolveTlsEndpoint(
  service: Pick<Service, "host" | "protocol" | "checkPort">,
): TlsEndpoint | null {
  if (service.protocol !== ServiceProtocol.HTTPS) return null;

  const value = service.host.trim();

  if (!value) return null;

  try {
    const hasScheme = value.includes("://");
    const url = new URL(hasScheme ? value : `https://${value}`);

    if (hasScheme && url.protocol !== "https:") return null;

    const hostname = url.hostname.replace(/^\[(.*)\]$/, "$1");

    return { hostname, port: url.port ? Number(url.port) : (service.checkPort ?? 443) };
  } catch {
    return null;
  }
}
