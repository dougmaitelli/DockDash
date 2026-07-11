import axios from "axios";
import net from "net";

import type { ContainerStats, ServiceMetadata } from "@shared";
import { Service, ServiceSource, ServiceStatus } from "@shared";

import { db } from "../db/databaseService.js";
import { t } from "../i18n/index.js";
import { config } from "../lib/config.js";
import { detectProtocolByPort, HTTP_PROTOCOLS, USER_AGENT } from "../lib/constants.js";
import { logger } from "../lib/logService.js";
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
  private readonly cpuSpiking = new Map<string, boolean>();
  private readonly memorySpiking = new Map<string, boolean>();
  // tracks when each service first crossed the CPU threshold (ms); cleared on recovery
  private readonly cpuSpikeStart = new Map<string, number>();

  private async checkSingleDockerService(
    service: Service,
    stateMap?: ContainerStateMap,
  ): Promise<ServiceStatus | null> {
    const dockerHostId = service.metadata?.dockerHostId;
    const resolvedHost = dockerHostId ? dockerService.resolveHost(dockerHostId) : undefined;
    const containerName = service.metadata?.containerName;

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
          status = ServiceStatus.DOWN;
        } else if (containerInfo.state === DOCKER_CONTAINER_STATE.RUNNING) {
          status = ServiceStatus.UP;
        } else if (DOCKER_CONTAINER_DOWN_STATES.includes(containerInfo.state)) {
          status = ServiceStatus.DOWN;
        } else {
          status = ServiceStatus.UNKNOWN;
        }

        if (containerInfo) {
          const prevTag = service.metadata?.imageTag;
          const newTag = containerInfo.imageTag;
          const hasUpdate = service.metadata?.hasUpdate;
          const latestVersion = service.metadata?.latestVersion;

          const patch: Partial<ServiceMetadata> = {
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

      return status;
    } catch (err) {
      logger.error(
        `Health check failed for Docker service "${service.name}": ${err instanceof Error ? err.message : String(err)}`,
      );

      // Can't reach the Docker host — state is unknown, not necessarily down.
      return ServiceStatus.UNKNOWN;
    }
  }

  private async checkSingleNetworkService(service: Service): Promise<ServiceStatus | null> {
    try {
      return await this.checkNetworkService(service);
    } catch (err) {
      logger.error(
        `Health check failed for network service "${service.name}": ${err instanceof Error ? err.message : String(err)}`,
      );

      return null;
    }
  }

  async checkSingleService(serviceId: string): Promise<ServiceStatus | null> {
    const service = db.getService(serviceId);

    if (!service) return null;

    const status =
      service.source === ServiceSource.DOCKER
        ? await this.checkSingleDockerService(service)
        : await this.checkSingleNetworkService(service);

    if (status !== null) this.commitStatus(service, status);

    return status;
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
        const dockerHostId = service.metadata?.dockerHostId;
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
        logger.error(
          `Failed to fetch container states for Docker host ${resolvedHost}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    for (const service of services) {
      let status: ServiceStatus | null;
      let stats: ContainerStats | undefined;

      if (service.source === ServiceSource.DOCKER) {
        const dockerHostId = service.metadata?.dockerHostId;

        status = await this.checkSingleDockerService(
          service,
          dockerHostId ? stateMapByHostId.get(dockerHostId) : undefined,
        );

        if (config.resourceMonitorEnabled) {
          try {
            const container = dockerService.getContainerForServiceId(service.id!);

            stats = await dockerService.getContainerStats(container);
          } catch (err) {
            logger.debug(
              `Resource monitor: skipping ${service.name}: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }
      } else {
        status = await this.checkSingleNetworkService(service);
      }

      if (status !== null) this.commitStatus(service, status, stats);

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

    return !newParsed || !latestParsed || TagParser.compareSemVer(newParsed, latestParsed) >= 0;
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

  private notifyResourceSpikes(service: Service, stats: ContainerStats): void {
    const id = service.id!;

    if (config.cpuSpikeThreshold > 0) {
      const wasCpuSpiking = this.cpuSpiking.get(id) ?? false;
      const nowAboveCpuThreshold = stats.cpuPercent >= config.cpuSpikeThreshold;
      const durationMs = config.spikeDurationThreshold * 1000;

      if (nowAboveCpuThreshold) {
        if (!this.cpuSpikeStart.has(id)) this.cpuSpikeStart.set(id, Date.now());

        const elapsed = Date.now() - this.cpuSpikeStart.get(id)!;

        if (!wasCpuSpiking && elapsed >= durationMs) {
          this.cpuSpiking.set(id, true);
          void notificationService
            .notify(
              t("notifications.cpuSpike", { name: service.name }),
              t("notifications.cpuSpikeBody", {
                name: service.name,
                percent: stats.cpuPercent.toFixed(1),
              }),
              "warning",
            )
            .catch(() => {});
        }
      } else {
        if (wasCpuSpiking) {
          this.cpuSpiking.set(id, false);
          void notificationService
            .notify(
              t("notifications.cpuRecovered", { name: service.name }),
              t("notifications.cpuRecoveredBody", { name: service.name }),
              "success",
            )
            .catch(() => {});
        }

        this.cpuSpikeStart.delete(id);
      }
    }

    if (config.memorySpikeThreshold > 0) {
      const wasMemSpiking = this.memorySpiking.get(id) ?? false;
      const nowMemSpiking = stats.memoryPercent >= config.memorySpikeThreshold;

      this.memorySpiking.set(id, nowMemSpiking);

      if (nowMemSpiking && !wasMemSpiking) {
        void notificationService
          .notify(
            t("notifications.memorySpike", { name: service.name }),
            t("notifications.memorySpikeBody", {
              name: service.name,
              percent: stats.memoryPercent.toFixed(1),
            }),
            "warning",
          )
          .catch(() => {});
      } else if (!nowMemSpiking && wasMemSpiking) {
        void notificationService
          .notify(
            t("notifications.memoryRecovered", { name: service.name }),
            t("notifications.memoryRecoveredBody", { name: service.name }),
            "success",
          )
          .catch(() => {});
      }
    }
  }

  private commitStatus(service: Service, status: ServiceStatus, stats?: ContainerStats): void {
    this.logStatusChange(service.name, service.status, status);
    this.notifyStatusChange(service.name, service.status, status);
    db.updateServiceStatus(service.id!, status);

    if (config.healthHistoryEnabled) {
      db.addHealthHistory(service.id!, status);
    }

    if (stats && config.resourceMonitorEnabled) {
      db.addResourceStatsHistory(service.id!, stats.cpuPercent, stats.memoryPercent);
    }

    if (stats && notificationService.configured) this.notifyResourceSpikes(service, stats);
  }

  private logStatusChange(name: string, oldStatus: ServiceStatus, newStatus: ServiceStatus): void {
    if (oldStatus !== newStatus) {
      logger.info(`Service "${name}" status changed: ${oldStatus} -> ${newStatus}`);
    }
  }

  private notifyStatusChange(
    name: string,
    oldStatus: ServiceStatus,
    newStatus: ServiceStatus,
  ): void {
    if (oldStatus === newStatus) return;

    if (!notificationService.configured) return;

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
