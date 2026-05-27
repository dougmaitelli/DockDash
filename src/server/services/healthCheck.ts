import net from "net";
import axios from "axios";
import { db } from "../lib/database.js";
import { ServiceProtocol, ServiceSource, ServiceStatus } from "@shared";
import { USER_AGENT, HTTP_PROTOCOLS, TCP_CHECKABLE_PROTOCOLS } from "../lib/constants.js";
import { createDockerClient, getContainersStateMap } from "./dockerService.js";

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

export async function checkService(service: {
  id: string;
  host: string;
  port: number | null;
  protocol: ServiceProtocol;
  source: ServiceSource;
}): Promise<ServiceStatus> {
  if (service.port === null) return ServiceStatus.UNKNOWN;

  // Docker containers: check by port (protocol already set from scan)
  if (service.source === ServiceSource.DOCKER) {
    if (TCP_CHECKABLE_PROTOCOLS.includes(service.protocol)) {
      return (await checkTcp(service.host, service.port)) ? ServiceStatus.UP : ServiceStatus.DOWN;
    }

    return ServiceStatus.UNKNOWN;
  }

  // Network services: check HTTP first, fall back to TCP
  if (HTTP_PROTOCOLS.includes(service.protocol)) {
    const httpOk = await checkHttp(service.host, service.port, service.protocol);

    if (httpOk) return ServiceStatus.UP;

    // HTTP probe failed, try raw TCP
    return (await checkTcp(service.host, service.port)) ? ServiceStatus.UP : ServiceStatus.DOWN;
  }

  // Non-HTTP protocols: TCP check
  const open = await checkTcp(service.host, service.port);

  return open ? ServiceStatus.UP : ServiceStatus.DOWN;
}

export async function checkSingleService(serviceId: string): Promise<ServiceStatus | null> {
  const services = db.getServices();
  const service = services.find((s) => s.id === serviceId); //TODO: optimize by adding getService to db

  if (!service) return null;

  try {
    const status = await checkService({
      id: service.id || "",
      host: service.host,
      port: service.port,
      protocol: service.protocol,
      source: service.source,
    });

    const oldStatus = service.status;

    db.updateServiceStatus(service.id || "", status);

    if (oldStatus !== status) {
      console.log(`Service "${service.name}" status changed: ${oldStatus} -> ${status}`);
    }

    return status;
  } catch (err) {
    console.error(`Health check failed for service "${service.name}" (${serviceId}):`, err);

    return null;
  }
}

async function refreshDockerContainerStates(
  services: ReturnType<typeof db.getServices>,
): Promise<void> {
  const dockerServices = services.filter((s) => s.source === ServiceSource.DOCKER);

  if (dockerServices.length === 0) return;

  try {
    const docker = await createDockerClient();
    const stateMap = await getContainersStateMap(docker);

    for (const service of dockerServices) {
      const containerId = service.metadata?.containerId as string | undefined;

      if (!containerId) continue;

      const containerState = stateMap.get(containerId);

      if (containerState) {
        db.updateServiceMetadata(service.id || "", {
          state: containerState.state,
          status: containerState.status,
          imageTag: containerState.imageTag,
        });
      }
    }
  } catch (err) {
    console.error("Failed to refresh Docker container states:", err);
  }
}

export async function checkAllServices(): Promise<{ updated: number; errors: number }> {
  const services = db.getServices();
  let updated = 0;
  let errors = 0;

  for (const service of services) {
    const status = await checkSingleService(service.id || "");

    if (status === null) {
      errors++;
    } else if (status !== service.status) {
      updated++;
    }
  }

  await refreshDockerContainerStates(services);

  return { updated, errors };
}
