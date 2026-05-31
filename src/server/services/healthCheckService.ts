import net from "net";
import axios from "axios";
import { db } from "../db/databaseService.js";
import { Service, ServiceSource, ServiceStatus } from "@shared";
import { USER_AGENT, HTTP_PROTOCOLS, detectProtocolByPort } from "../lib/constants.js";
import {
  dockerService,
  DOCKER_CONTAINER_STATE,
  DOCKER_CONTAINER_DOWN_STATES,
  type ContainerStateMap,
} from "./dockerService.js";
import { notificationService } from "./notificationService.js";

const HTTP_TIMEOUT = 1000;
const TCP_TIMEOUT = 1000;

export class HealthCheckService {
  private async checkSingleDockerService(
    serviceId: string,
    stateMap?: ContainerStateMap,
  ): Promise<ServiceStatus | null> {
    const service = db.getService(serviceId);

    if (!service) return null;

    const containerName = service.metadata?.containerName as string | undefined;
    const dockerHost = service.metadata?.dockerHost as string | undefined;

    try {
      let status: ServiceStatus;

      if (!containerName || !dockerHost) {
        status = ServiceStatus.UNKNOWN;
      } else {
        const map =
          stateMap ??
          (await dockerService.getContainersStateMap(
            dockerService.createDockerClientForHost(dockerHost),
          ));
        const containerInfo = map.get(containerName);

        if (!containerInfo) {
          status = ServiceStatus.UNKNOWN;
        } else if (containerInfo.state === DOCKER_CONTAINER_STATE.RUNNING) {
          status = ServiceStatus.UP;
        } else if (DOCKER_CONTAINER_DOWN_STATES.includes(containerInfo.state)) {
          status = ServiceStatus.DOWN;
        } else {
          status = ServiceStatus.UNKNOWN;
        }

        if (containerInfo) {
          db.updateServiceMetadata(service.id || "", { imageTag: containerInfo.imageTag });
        }
      }

      this.logStatusChange(service.name, service.status, status);
      this.notifyStatusChange(service.name, service.status, status);
      db.updateServiceStatus(service.id || "", status);
      db.addHealthHistory(service.id || "", status);

      return status;
    } catch (err) {
      console.error(
        `Health check failed for Docker service "${service.name}" (${serviceId}):`,
        err,
      );

      return null;
    }
  }

  private async checkSingleNetworkService(serviceId: string): Promise<ServiceStatus | null> {
    const service = db.getService(serviceId);

    if (!service) return null;

    try {
      const status = await this.checkNetworkService(service);

      this.logStatusChange(service.name, service.status, status);
      this.notifyStatusChange(service.name, service.status, status);
      db.updateServiceStatus(service.id || "", status);
      db.addHealthHistory(service.id || "", status);

      return status;
    } catch (err) {
      console.error(
        `Health check failed for network service "${service.name}" (${serviceId}):`,
        err,
      );

      return null;
    }
  }

  async checkSingleService(serviceId: string): Promise<ServiceStatus | null> {
    const service = db.getService(serviceId);

    if (!service) return null;

    return service.source === ServiceSource.DOCKER
      ? this.checkSingleDockerService(serviceId)
      : this.checkSingleNetworkService(serviceId);
  }

  async checkAllServices(): Promise<{ updated: number; errors: number }> {
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
          stateMapByHost.set(
            host,
            await dockerService.getContainersStateMap(
              dockerService.createDockerClientForHost(host),
            ),
          );
        } catch (err) {
          console.error(`Failed to fetch container states for Docker host ${host}:`, err);
        }
      }
    }

    for (const service of services) {
      let status: ServiceStatus | null;

      if (service.source === ServiceSource.DOCKER) {
        const host = service.metadata?.dockerHost as string | undefined;

        status = await this.checkSingleDockerService(
          service.id || "",
          host ? stateMapByHost.get(host) : undefined,
        );
      } else {
        status = await this.checkSingleNetworkService(service.id || "");
      }

      if (status === null) {
        errors++;
      } else if (status !== service.status) {
        updated++;
      }
    }

    return { updated, errors };
  }

  private async checkTcp(host: string, port: number): Promise<boolean> {
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

  private async checkHttp(host: string, port: number, protocol: string): Promise<boolean> {
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

  private async checkNetworkService(service: Service): Promise<ServiceStatus> {
    const port = service.checkPort;

    if (!port) return ServiceStatus.UNKNOWN;

    const protocol = detectProtocolByPort(port);

    if (HTTP_PROTOCOLS.includes(protocol)) {
      const httpOk = await this.checkHttp(service.host, port, protocol);

      if (httpOk) return ServiceStatus.UP;

      // HTTP probe failed, fall back to raw TCP
      return (await this.checkTcp(service.host, port)) ? ServiceStatus.UP : ServiceStatus.DOWN;
    }

    return (await this.checkTcp(service.host, port)) ? ServiceStatus.UP : ServiceStatus.DOWN;
  }

  private logStatusChange(name: string, oldStatus: ServiceStatus, newStatus: ServiceStatus): void {
    if (oldStatus !== newStatus) {
      console.log(`Service "${name}" status changed: ${oldStatus} -> ${newStatus}`);
    }
  }

  private notifyStatusChange(
    name: string,
    oldStatus: ServiceStatus,
    newStatus: ServiceStatus,
  ): void {
    if (oldStatus === newStatus) return;

    if (newStatus === ServiceStatus.DOWN) {
      notificationService
        .notify(`Service Down: ${name}`, `${name} is no longer reachable.`, "failure")
        .catch(() => {});
    } else if (newStatus === ServiceStatus.UP && oldStatus === ServiceStatus.DOWN) {
      notificationService
        .notify(`Service Recovered: ${name}`, `${name} is back online.`, "success")
        .catch(() => {});
    }
  }
}

export const healthCheckService = new HealthCheckService();
