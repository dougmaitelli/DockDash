import type { Service } from "./Service.js";

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

export function resolveTlsEndpoint(service: Pick<Service, "host" | "ports">): TlsEndpoint | null {
  const value = service.host.trim();

  if (!value) return null;

  try {
    const hasScheme = value.includes("://");
    const url = new URL(hasScheme ? value : `https://${value}`);

    if (hasScheme && url.protocol !== "https:") return null;

    const hostname = url.hostname.replace(/^\[(.*)\]$/, "$1");

    if (!hasScheme && isIpHostname(hostname) && !service.ports.includes(443)) return null;

    return { hostname, port: url.port ? Number(url.port) : 443 };
  } catch {
    return null;
  }
}
