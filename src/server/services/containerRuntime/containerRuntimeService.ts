import { Service, ServiceSource } from "@shared";

import { dockerRuntime } from "./dockerRuntime.js";
import { kubernetesRuntime } from "./kubernetesRuntime.js";
import type { ContainerRuntime } from "./types.js";

class ContainerRuntimeService {
  private readonly runtimes = new Map<ServiceSource, ContainerRuntime>([
    [ServiceSource.DOCKER, dockerRuntime],
    [ServiceSource.KUBERNETES, kubernetesRuntime],
  ]);

  isContainer(service: Service): boolean {
    return this.runtimes.has(service.source);
  }

  getRuntime(service: Service): ContainerRuntime {
    const runtime = this.runtimes.get(service.source);

    if (!runtime) throw new Error("Not a container service");

    return runtime;
  }

  withSourceName<T extends Service>(service: T): T {
    if (!this.isContainer(service)) return service;

    const sourceName = this.getRuntime(service).sourceName(service);

    return sourceName ? { ...service, sourceName } : service;
  }
}

export const containerRuntimeService = new ContainerRuntimeService();
