import { db } from "../db/databaseService.js";
import { config } from "../lib/config.js";
import { BackgroundJob } from "./BackgroundJob.js";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export class HistoryCleanupJob extends BackgroundJob {
  readonly name = "HistoryCleanupJob";
  readonly intervalMs = ONE_DAY_MS;

  run(): void {
    const removed = db.cleanOldHistory(config.healthHistoryTtlDays);

    if (removed > 0) {
      console.log(`Health history cleanup: removed ${removed} old entries`);
    }
  }
}
