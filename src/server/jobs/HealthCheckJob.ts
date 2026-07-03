import { config } from "../lib/config.js";
import { logger } from "../lib/logService.js";
import { healthCheckService } from "../services/healthCheckService.js";
import { BackgroundJob } from "./BackgroundJob.js";

export class HealthCheckJob extends BackgroundJob {
  readonly name = "HealthCheckJob";
  readonly intervalMs = config.healthCheckInterval;

  async run(): Promise<void> {
    const result = await healthCheckService.checkAllServices();

    if (result.updated > 0 || result.errors > 0) {
      logger.info(`Health check: ${result.updated} updated, ${result.errors} errors`);
    }
  }
}
