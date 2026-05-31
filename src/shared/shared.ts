import type { ServiceWithPosition } from "./ServiceWithPosition.js";

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

export interface ServiceLink {
  id: string;
  source_id: string;
  source_name?: string;
  target_id: string;
  target_name?: string;
  label: string;
  type: ServiceLinkType;
  description: string;
  targetPort?: number | null;
  protocol?: ServiceProtocol | null;
  created_at: string;
}

export interface DashboardData {
  services: ServiceWithPosition[];
  links: ServiceLink[];
}

export interface ServiceHealthHistoryItem {
  status: ServiceStatus;
  checked_at: string;
}

/** Stored inside service.metadata for Docker services once an update check has run. */
export interface ServiceUpdateInfo {
  hasUpdate: boolean;
  /** Tag name (SemVer case) or short digest string ("latest" case) */
  latestVersion?: string;
  /** ISO timestamp of the last update check */
  updateCheckedAt?: string;
}
