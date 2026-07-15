import { historyRepository } from "../db/historyRepository.js";
import { logger } from "../lib/logService.js";
import { BackgroundJob } from "./BackgroundJob.js";

const ROLLUP_INTERVAL_MS = 2 * 60_000; // 2 minutes

export class HistoryRollupJob extends BackgroundJob {
  readonly name = "HistoryRollupJob";
  readonly intervalMs = ROLLUP_INTERVAL_MS;
  readonly runImmediately = true;

  run(): void {
    const { health, resource } = historyRepository.rollupHistory();

    if (health > 0 || resource > 0) {
      logger.debug(`History rollup: compacted ${health} health, ${resource} resource raw records`);
    }
  }
}
