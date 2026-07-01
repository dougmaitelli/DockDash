import { v4 as uuidv4 } from "uuid";

import { ServiceMetadata, ServiceSource, ServiceStatus } from "./types.js";

export class Service {
  id!: string;
  name!: string;
  host!: string;
  ports: number[] = [];
  checkPort?: number | null;
  source!: ServiceSource;
  status: ServiceStatus = ServiceStatus.UNKNOWN;
  metadata?: ServiceMetadata;
  onDashboard?: boolean;
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
        a.host === b.host &&
        a.metadata?.containerName === b.metadata?.containerName &&
        a.metadata?.dockerHostId === b.metadata?.dockerHostId
      );
    }

    // Network services: one service per host, ports are additive
    return a.host === b.host;
  }
}
