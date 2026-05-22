import Docker from "dockerode";
import { v4 as uuidv4 } from "uuid";
import { Service, ServiceProtocol, ServiceSource, ServiceStatus } from "@shared";
import { PORT_INFO_MAP } from "../lib/constants.js";

export async function createDockerClient(): Promise<Docker> {
  const dockerHost = process.env.DOCKER_HOST || "unix:///var/run/docker.sock";

  if (dockerHost.startsWith("unix://")) {
    return new Docker({ socketPath: dockerHost.replace("unix://", "") });
  }

  const url = dockerHost.startsWith("tcp://") ? dockerHost : `tcp://${dockerHost}`;
  const docker = new Docker({ host: url.replace("tcp://", "") });

  return docker;
}

export async function* scanDockerContainers(docker: Docker): AsyncGenerator<Service> {
  const containers = await docker.listContainers({ all: true });
  const now = new Date().toISOString();

  for (const container of containers) {
    if (!container.Id || !container.Names) continue;

    const name = container.Names[0].replace(/^\//, "") || container.Id.slice(0, 12);

    const containerObj = docker.getContainer(container.Id);
    const inspect = await containerObj.inspect();

    let host = "localhost";
    let port: number | null = null;
    let protocol: ServiceProtocol = ServiceProtocol.HTTP;

    const ports = container.Ports || [];

    for (const p of ports) {
      if (p.PublicPort) {
        host = p.IP || "localhost";
        port = p.PublicPort;

        if (p.Type === "tcp") {
          protocol = detectProtocol(port);
        }

        break;
      }
    }

    if (!port && inspect.Config) {
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
    const hostPorts = ports.map((p) => p.PublicPort ?? 0);

    yield {
      id: `docker-${uuidv4()}`,
      name,
      host,
      port,
      protocol,
      source: ServiceSource.DOCKER,
      status:
        container.State === "running"
          ? ServiceStatus.UP
          : container.State === "exited"
            ? ServiceStatus.DOWN
            : ServiceStatus.UNKNOWN,
      metadata: {
        containerId: container.Id,
        image: container.Image,
        state: container.State,
        status: container.Status,
        networkNames: networkNames,
        labels: inspect.Config?.Labels ? Object.values(inspect.Config.Labels) : [],
        hostPorts: hostPorts,
      },
      created_at: now,
      updated_at: now,
    };
  }
}

export async function scanDockerNetworks(docker: Docker) {
  const networks = await docker.listNetworks();

  return networks.map((net) => ({
    id: net.Id,
    name: net.Name,
    driver: net.Driver,
    ipam: net.IPAM,
    containers: net.Containers || {},
  }));
}

function detectProtocol(port: number): ServiceProtocol {
  return PORT_INFO_MAP[port]?.protocol ?? ServiceProtocol.HTTP;
}
