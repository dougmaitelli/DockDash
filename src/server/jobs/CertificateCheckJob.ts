import { config } from "../lib/config.js";
import { certificateMonitorService } from "../services/certificateMonitorService.js";
import { BackgroundJob } from "./BackgroundJob.js";

export class CertificateCheckJob extends BackgroundJob {
  readonly name = "CertificateCheckJob";
  readonly intervalMs = config.certificateCheckInterval;
  readonly runImmediately = true;

  async run(): Promise<void> {
    await certificateMonitorService.checkAll();
  }
}
