import { ServiceLinkType } from "@shared";

export interface LinkType {
  value: ServiceLinkType;
  color: string;
}

export const LINK_TYPES: LinkType[] = [
  { value: ServiceLinkType.COMMUNICATION, color: "var(--primary)" },
  { value: ServiceLinkType.DEPENDENCY, color: "var(--success)" },
  { value: ServiceLinkType.OTHER, color: "var(--accent-purple)" },
];
