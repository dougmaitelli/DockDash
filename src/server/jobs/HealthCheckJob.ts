import { BackgroundJob } from "./BackgroundJob.js";
import { healthCheckService } from "../services/healthCheckService.js";
import { config } from "../lib/config.js";

export class HealthCheckJob extends BackgroundJob {
  readonly name = "HealthCheckJob";
  readonly intervalMs = config.healthCheckInterval;

  async run(): Promise<void> {
    const result = await healthCheckService.checkAllServices();

    if (result.updated > 0 || result.errors > 0) {
      console.log(`Health check: ${result.updated} updated, ${result.errors} errors`);
    }
  }
}
