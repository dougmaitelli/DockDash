import { BackgroundJob } from "./BackgroundJob.js";
import { updateCheckerService } from "../services/updateCheckerService.js";
import { config } from "../lib/config.js";

export class UpdateCheckJob extends BackgroundJob {
  readonly name = "UpdateCheckJob";
  readonly intervalMs = config.updateCheckInterval;
  readonly runImmediately = true;

  async run(): Promise<void> {
    console.log("Update check: starting…");
    await updateCheckerService.checkAllServicesForUpdates();
    console.log("Update check: done");
  }
}
