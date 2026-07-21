import { config } from "../lib/config.js";
import { resourceStatsService } from "../services/resourceStatsService.js";
import { BackgroundJob } from "./BackgroundJob.js";

export class ResourceStatsJob extends BackgroundJob {
  readonly name = "ResourceStatsJob";
  readonly intervalMs = config.resourceMonitorInterval;

  async run(): Promise<void> {
    await resourceStatsService.fetchAndCacheAllStats();
  }
}
