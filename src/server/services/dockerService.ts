import { createHash } from "crypto";
import Docker from "dockerode";
import { v4 as uuidv4 } from "uuid";
import { Service, ServiceSource, ServiceStatus } from "@shared";
import { config } from "../lib/config.js";
import { DOCKER_LATEST_TAG } from "../lib/constants.js";

export type ContainerStateMap = Map<
  string,
  { containerId: string; state: string; imageTag: string }
>;

export const DOCKER_CONTAINER_STATE = {
  RUNNING: "running",
  EXITED: "exited",
  DEAD: "dead",
  STOPPED: "stopped",
} as const;

export const DOCKER_CONTAINER_DOWN_STATES: string[] = [
  DOCKER_CONTAINER_STATE.EXITED,
  DOCKER_CONTAINER_STATE.DEAD,
  DOCKER_CONTAINER_STATE.STOPPED,
];

export class DockerService {
  private readonly clients: Map<string, Docker>;

  constructor() {
    this.clients = new Map(config.dockerHosts.map((host) => [host, this.buildClient(host)]));
  }

  static hostId(host: string): string {
    return createHash("sha256").update(host).digest("hex").slice(0, 16);
  }

  resolveHost(dockerHostId: string): string | undefined {
    return config.dockerHosts.find((host) => DockerService.hostId(host) === dockerHostId);
  }

  private buildClient(host: string): Docker {
    if (host.startsWith("unix://")) {
      return new Docker({ socketPath: host.replace("unix://", "") });
    }

    const url = new URL(host.startsWith("tcp://") ? host : `tcp://${host}`);

    return new Docker({ host: url.hostname, port: parseInt(url.port, 10) || 2375 });
  }

  createDockerClientForHost(host: string): Docker {
    const client = this.clients.get(host);

    if (!client) throw new Error(`Docker host not configured: ${host}`);

    return client;
  }

  createDockerClients(): { host: string; docker: Docker }[] {
    return [...this.clients.entries()].map(([host, docker]) => ({ host, docker }));
  }

  async *scanDockerContainers(docker: Docker, dockerHost: string): AsyncGenerator<Service> {
    const containers = await docker.listContainers({ all: true });
    const now = new Date().toISOString();

    for (const container of containers) {
      if (!container.Id || !container.Names) continue;

      const name = this.normalizeContainerName(container.Names[0]);

      const containerObj = docker.getContainer(container.Id);
      const inspect = await containerObj.inspect();

      const containerPorts = container.Ports || [];
      // Docker emits one entry per IP family (IPv4 + IPv6) for each binding,
      // so deduplicate by PrivatePort — one PublicPort per unique container port.
      const seenPrivate = new Set<number>();
      const hostPorts = containerPorts
        .filter(
          (p) => p.PublicPort && !seenPrivate.has(p.PrivatePort) && seenPrivate.add(p.PrivatePort),
        )
        .map((p) => p.PublicPort!)
        .sort((a, b) => a - b);

      const boundPort = containerPorts.find((p) => p.PublicPort);
      const host = boundPort?.IP || "localhost";

      const networks = inspect.NetworkSettings?.Networks || {};
      const networkNames = Object.keys(networks);
      const { image, tag: imageTag } = this.parseImage(container.Image);

      yield {
        id: `docker-${uuidv4()}`,
        name,
        host,
        ports: hostPorts,
        checkPort: hostPorts[0],
        source: ServiceSource.DOCKER,
        status:
          container.State === DOCKER_CONTAINER_STATE.RUNNING
            ? ServiceStatus.UP
            : container.State === DOCKER_CONTAINER_STATE.EXITED
              ? ServiceStatus.DOWN
              : ServiceStatus.UNKNOWN,
        metadata: {
          dockerHostId: DockerService.hostId(dockerHost),
          containerId: container.Id,
          containerName: name,
          image,
          imageTag,
          networkNames: networkNames,
        },
        createdAt: now,
        updatedAt: now,
      };
    }
  }

  async getContainersStateMap(docker: Docker): Promise<ContainerStateMap> {
    const containers = await docker.listContainers({ all: true });
    const map: ContainerStateMap = new Map();

    for (const c of containers) {
      const { tag: imageTag } = this.parseImage(c.Image);
      const entry = { containerId: c.Id, state: c.State, imageTag };

      for (const name of c.Names ?? []) {
        map.set(this.normalizeContainerName(name), entry);
      }
    }

    return map;
  }

  private normalizeContainerName(name: string): string {
    return name.replace(/^\//, "");
  }

  private parseImage(image: string): { image: string; tag: string } {
    // Strip digest (sha256:...) if present
    const withoutDigest = image.split("@")[0];
    // Reconstruct the path segments, splitting the tag off the last segment only
    const segments = withoutDigest.split("/");
    const lastSegment = segments[segments.length - 1];
    const colonIdx = lastSegment.lastIndexOf(":");

    if (colonIdx >= 0) {
      segments[segments.length - 1] = lastSegment.slice(0, colonIdx);

      return { image: segments.join("/"), tag: lastSegment.slice(colonIdx + 1) };
    }

    return { image: withoutDigest, tag: DOCKER_LATEST_TAG };
  }
}

export const dockerService = new DockerService();
