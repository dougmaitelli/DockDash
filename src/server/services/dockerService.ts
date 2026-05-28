import Docker from "dockerode";
import { v4 as uuidv4 } from "uuid";
import { Service, ServiceProtocol, ServiceSource, ServiceStatus } from "@shared";
import { PORT_INFO_MAP } from "../lib/constants.js";
import { config } from "../lib/config.js";

export function createDockerClientForHost(host: string): Docker {
  if (host.startsWith("unix://")) {
    return new Docker({ socketPath: host.replace("unix://", "") });
  }

  const url = new URL(host.startsWith("tcp://") ? host : `tcp://${host}`);

  return new Docker({ host: url.hostname, port: parseInt(url.port, 10) || 2375 });
}

export function createDockerClients(): { host: string; docker: Docker }[] {
  return config.dockerHosts.map((host) => ({ host, docker: createDockerClientForHost(host) }));
}

export async function* scanDockerContainers(
  docker: Docker,
  dockerHost: string,
): AsyncGenerator<Service> {
  const containers = await docker.listContainers({ all: true });
  const now = new Date().toISOString();

  for (const container of containers) {
    if (!container.Id || !container.Names) continue;

    const name = container.Names[0].replace(/^\//, "") || container.Id.slice(0, 12);

    const containerObj = docker.getContainer(container.Id);
    const inspect = await containerObj.inspect();

    let host = "localhost";
    let protocol: ServiceProtocol = ServiceProtocol.HTTP;

    const containerPorts = container.Ports || [];
    // Docker emits one entry per IP family (IPv4 + IPv6) for each binding,
    // so deduplicate by PrivatePort — one PublicPort per unique container port.
    const seenPrivate = new Set<number>();
    const hostPorts = containerPorts
      .filter((p) => p.PublicPort && !seenPrivate.has(p.PrivatePort) && seenPrivate.add(p.PrivatePort))
      .map((p) => p.PublicPort!)
      .sort((a, b) => a - b);

    for (const p of containerPorts) {
      if (p.PublicPort) {
        host = p.IP || "localhost";

        if (p.Type === "tcp") {
          protocol = detectProtocol(p.PublicPort);
        }

        break;
      }
    }

    if (hostPorts.length === 0 && inspect.Config) {
      const exposedPorts = Object.keys(inspect.Config.ExposedPorts || {});

      if (exposedPorts.length > 0) {
        const portMatch = exposedPorts[0].match(/\/(\w+)/);

        if (portMatch) {
          protocol = detectProtocol(parseInt(portMatch[1], 10));
        }
      }
    }

    const networks = inspect.NetworkSettings?.Networks || {};
    const networkNames = Object.keys(networks);
    const { image, tag: imageTag } = parseImage(container.Image);

    yield {
      id: `docker-${uuidv4()}`,
      name,
      host,
      ports: hostPorts,
      checkPort: hostPorts[0],
      protocol,
      source: ServiceSource.DOCKER,
      status:
        container.State === "running"
          ? ServiceStatus.UP
          : container.State === "exited"
            ? ServiceStatus.DOWN
            : ServiceStatus.UNKNOWN,
      metadata: {
        dockerHost,
        containerId: container.Id,
        containerName: name,
        image,
        imageTag,
        networkNames: networkNames,
      },
      created_at: now,
      updated_at: now,
    };
  }
}

export type ContainerStateMap = Map<string, { state: string; imageTag: string }>;

export async function getContainersStateMap(docker: Docker): Promise<ContainerStateMap> {
  const containers = await docker.listContainers({ all: true });

  return new Map(
    containers.map((c) => {
      const { tag: imageTag } = parseImage(c.Image);

      return [c.Id, { state: c.State, imageTag }];
    }),
  );
}

function detectProtocol(port: number): ServiceProtocol {
  return PORT_INFO_MAP[port]?.protocol ?? ServiceProtocol.HTTP;
}

export function parseImage(image: string): { image: string; tag: string } {
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

  return { image: withoutDigest, tag: "latest" };
}
