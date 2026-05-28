import { ServiceSource, ServiceStatus, ServiceProtocol } from "./shared.js";

export class Service {
  id?: string;
  name!: string;
  host!: string;
  port!: number | null;
  protocol!: ServiceProtocol;
  source!: ServiceSource;
  status: ServiceStatus = ServiceStatus.UNKNOWN;
  metadata?: Record<string, string | number | boolean | string[] | number[]>;
  created_at: string;
  updated_at: string;

  constructor() {
    const now = new Date().toISOString();

    this.created_at = now;
    this.updated_at = now;
  }

  static equals(a: Service, b: Service): boolean {
    if (a.source === ServiceSource.DOCKER && b.source === ServiceSource.DOCKER) {
      return (
        a.host === b.host &&
        a.metadata?.containerName === b.metadata?.containerName &&
        a.metadata?.dockerHost === b.metadata?.dockerHost
      );
    }

    return a.host === b.host && a.port === b.port;
  }
}
