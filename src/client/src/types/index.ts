import type { ServiceSource, ServicePosition } from "@shared";
import { ServiceLinkType, ServiceProtocol } from "@shared";
import { rawColors } from "../styles/themes/dark.theme";

export type { ServiceSource, ServicePosition };
export { ServiceLinkType, ServiceProtocol };

export interface LinkType {
  value: ServiceLinkType;
  label: string;
  color: string;
  icon: string;
}

export const SERVICE_PROTOCOLS: ServiceProtocol[] = Object.values(ServiceProtocol);

export const LINK_TYPES: LinkType[] = [
  {
    value: ServiceLinkType.COMMUNICATION,
    label: "Communication",
    color: rawColors.accentBlue,
    icon: "↔",
  },
  {
    value: ServiceLinkType.DEPENDENCY,
    label: "Dependency",
    color: rawColors.accentGreen,
    icon: "↓",
  },
  { value: ServiceLinkType.OTHER, label: "Other", color: rawColors.accentPurple, icon: "🔗" },
];

export interface DashboardConfig {
  dockerHost: string;
  networkCidrs: string[];
  scanPorts: number[];
  refreshInterval: number;
  healthCheckInterval: number;
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
