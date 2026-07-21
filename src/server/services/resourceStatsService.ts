import type { ContainerStats } from "@shared";
import { Service, ServiceSource } from "@shared";

import { historyRepository } from "../db/historyRepository.js";
import { serviceRepository } from "../db/serviceRepository.js";
import { t } from "../i18n/index.js";
import { config } from "../lib/config.js";
import { logger } from "../lib/logService.js";
import { ConcurrentService } from "./ConcurrentService.js";
import { dockerService } from "./dockerService.js";
import { notificationService } from "./notificationService.js";

export class ResourceStatsService extends ConcurrentService {
  protected readonly concurrencyLimit = 10;
  private readonly latestStats = new Map<string, { cpuPercent: number; memoryPercent: number }>();
  private readonly cpuSpiking = new Map<string, boolean>();
  private readonly memorySpiking = new Map<string, boolean>();
  // tracks when each service first crossed the CPU threshold (ms); cleared on recovery
  private readonly cpuSpikeStart = new Map<string, number>();

  getLatestStats(): ReadonlyMap<string, { cpuPercent: number; memoryPercent: number }> {
    return this.latestStats;
  }

  async fetchAndCacheAllStats(): Promise<void> {
    if (!config.resourceMonitorEnabled) return;

    const services = serviceRepository
      .getServices()
      .filter((s) => s.source === ServiceSource.DOCKER);

    await this.mapWithConcurrency(services, async (service) => {
      try {
        const container = dockerService.getContainerForServiceId(service.id!);
        const stats = await dockerService.getContainerStats(container);

        this.latestStats.set(service.id!, {
          cpuPercent: stats.cpuPercent,
          memoryPercent: stats.memoryPercent,
        });

        historyRepository.addResourceStatsHistory(
          service.id!,
          stats.cpuPercent,
          stats.memoryPercent,
        );

        if (notificationService.configured) this.notifyResourceSpikes(service, stats);
      } catch (err) {
        logger.debug(
          `Resource stats: skipping ${service.name}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    });
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
}

export const resourceStatsService = new ResourceStatsService();
