import type { ServiceSource, ServicePosition, DiscoveryStats } from "@shared";
import { ServiceLinkType } from "@shared";

export type { ServiceSource, ServicePosition, DiscoveryStats };
export { ServiceLinkType };

export interface LinkType {
  value: ServiceLinkType;
  label: string;
  color: string;
  icon: string;
}

export const LINK_TYPES: LinkType[] = [
  { value: ServiceLinkType.COMMUNICATION, label: "Communication", color: "#3b82f6", icon: "↔" },
  { value: ServiceLinkType.DEPENDENCY, label: "Dependency", color: "#10b981", icon: "↓" },
  { value: ServiceLinkType.OTHER, label: "Other", color: "#8b5cf6", icon: "🔗" },
];

export interface DashboardConfig {
  dockerHost: string;
  networkCidrs: string[];
  scanPorts: number[];
  refreshInterval: number;
}

export interface DockerHealth {
  connected: boolean;
  containers?: number;
  containersRunning?: number;
  containersPaused?: number;
  containersStopped?: number;
  serverVersion?: string;
  error?: string;
}
