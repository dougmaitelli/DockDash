import net from "net";
import axios from "axios";
import { db } from "../lib/database.js";
import { Service, ServiceProtocol, ServiceSource, ServiceStatus } from "@shared";
import { USER_AGENT, HTTP_PROTOCOLS, TCP_CHECKABLE_PROTOCOLS } from "../lib/constants.js";
import {
  createDockerClientForHost,
  getContainersStateMap,
  type ContainerStateMap,
} from "./dockerService.js";

const HTTP_TIMEOUT = 1000;
const TCP_TIMEOUT = 1000;

async function checkTcp(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, TCP_TIMEOUT);

    socket.once("connect", () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
    socket.connect(port, host);
  });
}

async function checkHttp(host: string, port: number, protocol: string): Promise<boolean> {
  try {
    const url = `${protocol}://${host}:${port}`;
    const resp = await axios.get(url, {
      timeout: HTTP_TIMEOUT,
      validateStatus: () => true,
      headers: { "User-Agent": USER_AGENT },
    });

    return resp.status < 500;
  } catch {
    return false;
  }
}

async function checkNetworkService(service: Service): Promise<ServiceStatus> {
  const port = service.checkPort;

  if (!port) return ServiceStatus.UNKNOWN;

  if (HTTP_PROTOCOLS.includes(service.protocol)) {
    const httpOk = await checkHttp(service.host, port, service.protocol);

    if (httpOk) return ServiceStatus.UP;

    // HTTP probe failed, fall back to raw TCP
    return (await checkTcp(service.host, port)) ? ServiceStatus.UP : ServiceStatus.DOWN;
  }

  if (TCP_CHECKABLE_PROTOCOLS.includes(service.protocol)) {
    return (await checkTcp(service.host, port)) ? ServiceStatus.UP : ServiceStatus.DOWN;
  }

  return ServiceStatus.UNKNOWN;
}

function logStatusChange(name: string, oldStatus: ServiceStatus, newStatus: ServiceStatus): void {
  if (oldStatus !== newStatus) {
    console.log(`Service "${name}" status changed: ${oldStatus} -> ${newStatus}`);
  }
}

export async function checkSingleDockerService(
  serviceId: string,
  stateMap?: ContainerStateMap,
): Promise<ServiceStatus | null> {
  const service = db.getService(serviceId);

  if (!service) return null;

  const containerId = service.metadata?.containerId as string | undefined;
  const dockerHost = service.metadata?.dockerHost as string | undefined;

  try {
    let status: ServiceStatus;

    if (!containerId || !dockerHost) {
      status = ServiceStatus.UNKNOWN;
    } else {
      const map = stateMap ?? (await getContainersStateMap(createDockerClientForHost(dockerHost)));
      const containerInfo = map.get(containerId);

      if (!containerInfo) {
        status = ServiceStatus.UNKNOWN;
      } else if (containerInfo.state === "running") {
        status = ServiceStatus.UP;
      } else if (["exited", "dead", "stopped"].includes(containerInfo.state)) {
        status = ServiceStatus.DOWN;
      } else {
        status = ServiceStatus.UNKNOWN;
      }

      if (containerInfo) {
        db.updateServiceMetadata(service.id || "", { imageTag: containerInfo.imageTag });
      }
    }

    logStatusChange(service.name, service.status, status);
    db.updateServiceStatus(service.id || "", status);

    return status;
  } catch (err) {
    console.error(`Health check failed for Docker service "${service.name}" (${serviceId}):`, err);

    return null;
  }
}

export async function checkSingleNetworkService(serviceId: string): Promise<ServiceStatus | null> {
  const service = db.getService(serviceId);

  if (!service) return null;

  try {
    const status = await checkNetworkService(service);

    logStatusChange(service.name, service.status, status);
    db.updateServiceStatus(service.id || "", status);

    return status;
  } catch (err) {
    console.error(`Health check failed for network service "${service.name}" (${serviceId}):`, err);

    return null;
  }
}

export async function checkSingleService(serviceId: string): Promise<ServiceStatus | null> {
  const service = db.getService(serviceId);

  if (!service) return null;

  return service.source === ServiceSource.DOCKER
    ? checkSingleDockerService(serviceId)
    : checkSingleNetworkService(serviceId);
}

export async function checkAllServices(): Promise<{ updated: number; errors: number }> {
  const services = db.getServices();
  let updated = 0;
  let errors = 0;

  // Pre-fetch one stateMap per Docker host so checkSingleDockerService
  // doesn't call listContainers once per container.
  const stateMapByHost = new Map<string, ContainerStateMap>();

  for (const service of services) {
    if (service.source !== ServiceSource.DOCKER) continue;

    const host = service.metadata?.dockerHost as string | undefined;

    if (host && !stateMapByHost.has(host)) {
      try {
        stateMapByHost.set(host, await getContainersStateMap(createDockerClientForHost(host)));
      } catch (err) {
        console.error(`Failed to fetch container states for Docker host ${host}:`, err);
      }
    }
  }

  for (const service of services) {
    let status: ServiceStatus | null;

    if (service.source === ServiceSource.DOCKER) {
      const host = service.metadata?.dockerHost as string | undefined;

      status = await checkSingleDockerService(
        service.id || "",
        host ? stateMapByHost.get(host) : undefined,
      );
    } else {
      status = await checkSingleNetworkService(service.id || "");
    }

    if (status === null) {
      errors++;
    } else if (status !== service.status) {
      updated++;
    }
  }

  return { updated, errors };
}
