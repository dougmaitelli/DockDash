import { v4 as uuidv4 } from "uuid";

import type { ServiceMetadata, ServiceProtocol } from "./types.js";
import { ServiceSource, ServiceStatus } from "./types.js";

export class Service {
  id!: string;
  name!: string;
  host!: string;
  protocol?: ServiceProtocol | null;
  ports: number[] = [];
  checkPort?: number | null;
  source!: ServiceSource;
  status: ServiceStatus = ServiceStatus.UNKNOWN;
  metadata?: ServiceMetadata;
  onDashboard?: boolean;
  cpuPercent?: number;
  memoryPercent?: number;
  createdAt: string;
  updatedAt: string;

  constructor() {
    const now = new Date().toISOString();

    this.id = uuidv4();
    this.createdAt = now;
    this.updatedAt = now;
  }

  static equals(a: Service, b: Service): boolean {
    if (a.source === ServiceSource.DOCKER && b.source === ServiceSource.DOCKER) {
      return (
        a.metadata?.dockerHostId === b.metadata?.dockerHostId &&
        a.metadata?.containerName === b.metadata?.containerName
      );
    }

    if (a.source === ServiceSource.KUBERNETES && b.source === ServiceSource.KUBERNETES) {
      return (
        a.metadata?.clusterId === b.metadata?.clusterId &&
        a.metadata?.namespace === b.metadata?.namespace &&
        a.metadata?.workloadKind === b.metadata?.workloadKind &&
        a.metadata?.workloadName === b.metadata?.workloadName &&
        a.metadata?.containerName === b.metadata?.containerName
      );
    }

    // Network services: one service per host, ports are additive
    return a.host === b.host;
  }
}
