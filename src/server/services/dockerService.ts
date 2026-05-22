import Docker from "dockerode";
import { v4 as uuidv4 } from "uuid";
import { Service, ServiceSource, ServiceStatus } from "@shared";

export async function createDockerClient(): Promise<Docker> {
  const dockerHost = process.env.DOCKER_HOST || "unix:///var/run/docker.sock";

  if (dockerHost.startsWith("unix://")) {
    return new Docker({ socketPath: dockerHost.replace("unix://", "") });
  }

  const url = dockerHost.startsWith("tcp://") ? dockerHost : `tcp://${dockerHost}`;
  const docker = new Docker({ host: url.replace("tcp://", "") });

  return docker;
}

export async function scanDockerContainers(docker: Docker): Promise<Service[]> {
  const containers = await docker.listContainers({ all: true });

  const services: Service[] = [];

  for (const container of containers) {
    if (!container.Id || !container.Names) continue;

    const name = container.Names[0].replace(/^\//, "") || container.Id.slice(0, 12);

    const containerObj = docker.getContainer(container.Id);
    const inspect = await containerObj.inspect();

    let host = "localhost";
    let port: number | null = null;
    let protocol = "http";

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

    services.push({
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
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  return services;
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

function detectProtocol(port: number): string {
  const protocolMap: Record<number, string> = {
    80: "http",
    443: "https",
    8080: "http",
    8443: "https",
    3000: "http",
    5000: "http",
    22: "ssh",
    3306: "mysql",
    5432: "postgresql",
    6379: "redis",
    27017: "mongodb",
    9200: "http",
    9300: "http",
    8500: "http",
    8600: "dns",
    2375: "http",
    2376: "https",
  };

  return protocolMap[port] || "http";
}
