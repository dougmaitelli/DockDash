import { historyRepository } from "../db/historyRepository.js";
import { config } from "../lib/config.js";
import { logger } from "../lib/logService.js";
import { BackgroundJob } from "./BackgroundJob.js";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export class HistoryCleanupJob extends BackgroundJob {
  readonly name = "HistoryCleanupJob";
  readonly intervalMs = ONE_DAY_MS;

  run(): void {
    const removed = historyRepository.cleanOldHistory(config.healthHistoryTtlDays);

    if (removed > 0) {
      logger.info(`Health history cleanup: removed ${removed} old entries`);
    }
  }
}
