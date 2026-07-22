import type { ServiceWithPosition } from "./ServiceWithPosition.js";

export const SSE_EVENT = {
  DONE: "done",
  SCAN_ERROR: "scan-error",
  LOG_ERROR: "log-error",
  TERMINAL_SESSION: "terminal-session",
  TERMINAL_ERROR: "terminal-error",
} as const;

export enum ContainerAction {
  STOP = "stop",
  START = "start",
  RESTART = "restart",
}

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
  metadata?: Partial<ServiceMetadata>;
  cpuPercent?: number;
  memoryPercent?: number;
}

export interface ServiceMetadata {
  dockerHostId?: string;
  containerId?: string;
  containerName?: string;
  networkNames?: string[];
  image?: string;
  imageTag?: string;
  imageDigest?: string;
  hasUpdate?: boolean;
  latestVersion?: string;
  updateCheckedAt?: string;
}

export interface ServicePosition {
  serviceId: string;
  x: number;
  y: number;
  parentId?: string;
  w?: number;
  h?: number;
}

export interface ServiceLink {
  id: string;
  sourceId: string;
  sourceName?: string;
  targetId: string;
  targetName?: string;
  type: ServiceLinkType;
  label?: string;
  description?: string;
  targetPort?: number;
  protocol?: ServiceProtocol | null;
}

export interface DashboardData {
  services: ServiceWithPosition[];
  links: ServiceLink[];
}
