import axios from "axios";
import net from "net";

import { Service, ServiceSource, ServiceStatus } from "@shared";

import { db } from "../db/databaseService.js";
import { t } from "../i18n/index.js";
import { detectProtocolByPort, HTTP_PROTOCOLS, USER_AGENT } from "../lib/constants.js";
import { TagParser } from "../lib/tagParser.js";
import {
  type ContainerStateMap,
  DOCKER_CONTAINER_DOWN_STATES,
  DOCKER_CONTAINER_STATE,
  dockerService,
} from "./dockerService.js";
import { notificationService } from "./notificationService.js";

const HTTP_TIMEOUT = 1000;
const TCP_TIMEOUT = 1000;

export class HealthCheckService {
  private async checkSingleDockerService(
    service: Service,
    stateMap?: ContainerStateMap,
  ): Promise<ServiceStatus | null> {
    const dockerHostId = service.metadata?.dockerHostId as string | undefined;
    const resolvedHost = dockerHostId ? dockerService.resolveHost(dockerHostId) : undefined;
    const containerName = service.metadata?.containerName as string | undefined;

    try {
      let status: ServiceStatus;

      if (!resolvedHost || !containerName) {
        status = ServiceStatus.UNKNOWN;
      } else {
        const map =
          stateMap ??
          (await dockerService.getContainersStateMap(
            dockerService.createDockerClientForHost(resolvedHost),
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
          const prevTag = service.metadata?.imageTag as string | undefined;
          const newTag = containerInfo.imageTag;
          const hasUpdate = service.metadata?.hasUpdate as boolean | undefined;
          const latestVersion = service.metadata?.latestVersion as string | undefined;

          const patch: Record<string, string | number | boolean | string[] | number[] | undefined> =
            {
              containerId: containerInfo.containerId,
              imageTag: newTag,
              imageDigest: containerInfo.imageDigest,
            };

          if (hasUpdate && newTag !== prevTag && this.isUpdateApplied(newTag, latestVersion)) {
            patch.hasUpdate = false;
            patch.latestVersion = "";
          }

          db.updateServiceMetadata(service.id!, patch);
        }
      }

      this.logStatusChange(service.name, service.status, status);
      this.notifyStatusChange(service.name, service.status, status);
      db.updateServiceStatus(service.id!, status);
      db.addHealthHistory(service.id!, status);

      return status;
    } catch (err) {
      console.error(
        `Health check failed for Docker service "${service.name}" (${service.id}):`,
        err,
      );

      return null;
    }
  }

  private async checkSingleNetworkService(service: Service): Promise<ServiceStatus | null> {
    try {
      const status = await this.checkNetworkService(service);

      this.logStatusChange(service.name, service.status, status);
      this.notifyStatusChange(service.name, service.status, status);
      db.updateServiceStatus(service.id!, status);
      db.addHealthHistory(service.id!, status);

      return status;
    } catch (err) {
      console.error(
        `Health check failed for network service "${service.name}" (${service.id}):`,
        err,
      );

      return null;
    }
  }

  async checkSingleService(serviceId: string): Promise<ServiceStatus | null> {
    const service = db.getService(serviceId);

    if (!service) return null;

    return service.source === ServiceSource.DOCKER
      ? this.checkSingleDockerService(service)
      : this.checkSingleNetworkService(service);
  }

  async checkAllServices(): Promise<{ updated: number; errors: number }> {
    const services = db.getServices();
    let updated = 0;
    let errors = 0;

    // Pre-fetch one stateMap per Docker host so checkSingleDockerService
    // doesn't call listContainers once per container.
    const hostById = services
      .filter((s) => s.source === ServiceSource.DOCKER)
      .reduce((map, service) => {
        const dockerHostId = service.metadata?.dockerHostId as string | undefined;
        const resolvedHost = dockerHostId ? dockerService.resolveHost(dockerHostId) : undefined;

        if (resolvedHost && dockerHostId) map.set(dockerHostId, resolvedHost);

        return map;
      }, new Map<string, string>());

    const stateMapByHostId = new Map<string, ContainerStateMap>();

    for (const [dockerHostId, resolvedHost] of hostById) {
      try {
        stateMapByHostId.set(
          dockerHostId,
          await dockerService.getContainersStateMap(
            dockerService.createDockerClientForHost(resolvedHost),
          ),
        );
      } catch (err) {
        console.error(`Failed to fetch container states for Docker host ${resolvedHost}:`, err);
      }
    }

    for (const service of services) {
      let status: ServiceStatus | null;

      if (service.source === ServiceSource.DOCKER) {
        const dockerHostId = service.metadata?.dockerHostId as string | undefined;

        status = await this.checkSingleDockerService(
          service,
          dockerHostId ? stateMapByHostId.get(dockerHostId) : undefined,
        );
      } else {
        status = await this.checkSingleNetworkService(service);
      }

      if (status === null) {
        errors++;
      } else if (status !== service.status) {
        updated++;
      }
    }

    return { updated, errors };
  }

  private isUpdateApplied(newTag: string, latestVersion: string | undefined): boolean {
    const newParsed = TagParser.extractSemVer(newTag);
    const latestParsed = latestVersion ? TagParser.extractSemVer(latestVersion) : null;

    return (
      !newParsed ||
      !latestParsed ||
      TagParser.compareSemVer(newParsed.parts, latestParsed.parts) >= 0
    );
  }

  private async checkTcp(host: string, port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      const timer = setTimeout(() => {
        socket.removeAllListeners();
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
      void notificationService
        .notify(
          t("notifications.serviceDown", { name }),
          t("notifications.serviceDownBody", { name }),
          "failure",
        )
        .catch(() => {
          // notify() already logs the error before rethrowing; swallow here to
          // avoid an unhandled rejection blocking the health-check cycle
        });
    } else if (newStatus === ServiceStatus.UP && oldStatus === ServiceStatus.DOWN) {
      void notificationService
        .notify(
          t("notifications.serviceRecovered", { name }),
          t("notifications.serviceRecoveredBody", { name }),
          "success",
        )
        .catch(() => {
          // notify() already logs the error before rethrowing; swallow here to
          // avoid an unhandled rejection blocking the health-check cycle
        });
    }
  }
}

export const healthCheckService = new HealthCheckService();
