import { ServiceProtocol } from "@shared";

export const USER_AGENT = "DockDash/1.0";

export interface PortInfo {
  protocol: ServiceProtocol;
  name: string;
}

// prettier-ignore
export const PORT_INFO_MAP: Record<number, PortInfo> = {
  21:    { protocol: ServiceProtocol.FTP,   name: "FTP" },
  22:    { protocol: ServiceProtocol.SSH,   name: "SSH" },
  25:    { protocol: ServiceProtocol.SMTP,  name: "SMTP" },
  53:    { protocol: ServiceProtocol.DNS,   name: "DNS" },
  80:    { protocol: ServiceProtocol.HTTP,  name: "HTTP" },
  443:   { protocol: ServiceProtocol.HTTPS, name: "HTTPS" },
  465:   { protocol: ServiceProtocol.SMTP,  name: "SMTP (SSL)" },
  587:   { protocol: ServiceProtocol.SMTP,  name: "SMTP (submission)" },
  1433:  { protocol: ServiceProtocol.TCP,   name: "MSSQL" },
  1883:  { protocol: ServiceProtocol.MQTT,  name: "MQTT" },
  2375:  { protocol: ServiceProtocol.HTTP,  name: "Docker API" },
  2376:  { protocol: ServiceProtocol.HTTPS, name: "Docker API (TLS)" },
  3000:  { protocol: ServiceProtocol.HTTP,  name: "HTTP" },
  3306:  { protocol: ServiceProtocol.TCP,   name: "MySQL" },
  5000:  { protocol: ServiceProtocol.HTTP,  name: "HTTP" },
  5432:  { protocol: ServiceProtocol.TCP,   name: "PostgreSQL" },
  5672:  { protocol: ServiceProtocol.TCP,   name: "RabbitMQ" },
  6379:  { protocol: ServiceProtocol.TCP,   name: "Redis" },
  6443:  { protocol: ServiceProtocol.HTTPS, name: "Kubernetes API" },
  8080:  { protocol: ServiceProtocol.HTTP,  name: "HTTP" },
  8443:  { protocol: ServiceProtocol.HTTPS, name: "HTTPS" },
  8500:  { protocol: ServiceProtocol.HTTP,  name: "Consul" },
  8600:  { protocol: ServiceProtocol.DNS,   name: "Consul DNS" },
  8883:  { protocol: ServiceProtocol.MQTT,  name: "MQTT (TLS)" },
  9200:  { protocol: ServiceProtocol.HTTP,  name: "Elasticsearch" },
  9300:  { protocol: ServiceProtocol.HTTP,  name: "Elasticsearch Cluster" },
  11211: { protocol: ServiceProtocol.TCP,   name: "Memcached" },
  15672: { protocol: ServiceProtocol.HTTP,  name: "RabbitMQ Management" },
  27017: { protocol: ServiceProtocol.TCP,   name: "MongoDB" },
};

export function detectProtocolByPort(port: number): ServiceProtocol {
  return PORT_INFO_MAP[port]?.protocol ?? ServiceProtocol.TCP;
}

export const HTTP_PROTOCOLS = [ServiceProtocol.HTTP, ServiceProtocol.HTTPS];
