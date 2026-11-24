import { config } from "../lib/config.js";
import { logger } from "../lib/logService.js";
import { updateCheckerService } from "../services/updateCheckerService.js";
import { BackgroundJob } from "./BackgroundJob.js";

const UPDATE_SCAN_TIMEOUT_MS = 5 * 60_000;

export class UpdateCheckJob extends BackgroundJob {
  readonly name = "UpdateCheckJob";
  readonly intervalMs = config.updateCheckInterval;
  readonly runImmediately = true;

  private active?: AbortController;

  async run(): Promise<void> {
    const controller = new AbortController();

    this.active = controller;
    const deadline = setTimeout(() => controller.abort(), UPDATE_SCAN_TIMEOUT_MS);

    try {
      logger.info("Update check: starting…");
      await updateCheckerService.checkAllServicesForUpdates(controller.signal);
      logger.info(controller.signal.aborted ? "Update check: cancelled" : "Update check: done");
    } finally {
      clearTimeout(deadline);
      this.active = undefined;
    }
  }

  override async stop(): Promise<void> {
    this.active?.abort();
    await super.stop();
  }
}
