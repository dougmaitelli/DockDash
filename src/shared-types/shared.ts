export enum ServiceSource {
  DOCKER = "docker",
  NETWORK = "network",
}

export enum ServiceStatus {
  UP = "up",
  DOWN = "down",
  UNKNOWN = "unknown",
}

export enum ServiceProtocol {
  HTTP = "http",
  HTTPS = "https",
  TCP = "tcp",
  UDP = "udp",
  SSH = "ssh",
  FTP = "ftp",
  SMTP = "smtp",
  DNS = "dns",
  MQTT = "mqtt",
  GRPC = "grpc",
  WEBSOCKET = "websocket",
  CUSTOM = "custom",
}

export enum ServiceLinkType {
  COMMUNICATION = "communication",
  DEPENDENCY = "dependency",
  OTHER = "other",
}

export interface Service {
  id?: string;
  name: string;
  host: string;
  port: number | null;
  protocol: ServiceProtocol;
  source: ServiceSource;
  status: ServiceStatus;
  metadata?: Record<string, string | number | boolean | string[] | number[]>;
  created_at: string;
  updated_at: string;
}

export interface ServiceStatusItem {
  id: string;
  status: ServiceStatus;
}

export interface ServicePosition {
  service_id: string;
  x: number;
  y: number;
  parent_id?: string | null;
}

export interface ServiceWithPosition extends Service {
  position: ServicePosition | null;
}

export interface ServiceLink {
  id: string;
  source_id: string;
  source_name?: string;
  target_id: string;
  target_name?: string;
  label: string;
  type: ServiceLinkType;
  description: string;
  created_at: string;
}

export interface DashboardData {
  services: ServiceWithPosition[];
  links: ServiceLink[];
}
