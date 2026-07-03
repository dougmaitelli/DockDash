import { config } from "../lib/config.js";
import { logger } from "../lib/logService.js";
import { updateCheckerService } from "../services/updateCheckerService.js";
import { BackgroundJob } from "./BackgroundJob.js";

export class UpdateCheckJob extends BackgroundJob {
  readonly name = "UpdateCheckJob";
  readonly intervalMs = config.updateCheckInterval;
  readonly runImmediately = true;

  async run(): Promise<void> {
    logger.info("Update check: starting…");
    await updateCheckerService.checkAllServicesForUpdates();
    logger.info("Update check: done");
  }
}
