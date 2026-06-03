import type { ServiceWithPosition } from "./ServiceWithPosition.js";

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
}

export interface ServicePosition {
  serviceId: string;
  x: number;
  y: number;
  parentId?: string | null;
  w?: number | null;
  h?: number | null;
}

export interface ServiceLink {
  id: string;
  sourceId: string;
  sourceName?: string | null;
  targetId: string;
  targetName?: string | null;
  label: string | null;
  type: ServiceLinkType;
  description: string | null;
  targetPort?: number | null;
  protocol?: ServiceProtocol | null;
  createdAt: string;
}

export interface DashboardData {
  services: ServiceWithPosition[];
  links: ServiceLink[];
}

export interface ServiceHealthHistoryItem {
  status: ServiceStatus;
  checked_at: string;
}

export interface ChangelogRelease {
  version: string;
  publishedAt: string;
  body: string;
  htmlUrl: string;
}

export type ChangelogResponse =
  | { available: true; release: ChangelogRelease }
  | { available: false; reason: string };

export interface ServiceMetadata {
  dockerHostId?: string;
  containerId?: string;
  containerName?: string;
  image?: string;
  imageTag?: string;
  imageDigest?: string;
  hasUpdate?: boolean;
  latestVersion?: string;
  updateCheckedAt?: string;
  [key: string]: string | number | boolean | string[] | number[] | undefined;
}
