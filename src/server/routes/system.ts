import { Router } from "express";

import type { AppUpdateInfo, DashboardConfig } from "@shared/api";

import { config } from "../lib/config.js";
import { appUpdateService } from "../services/appUpdateService.js";

const router = Router();

router.get("/config", (_req, res) => {
  const cfg: DashboardConfig = {
    version: config.appVersion,
    dockerHosts: config.dockerHosts,
    networkCidrs: config.networkCidrs,
    healthCheckInterval: config.healthCheckInterval,
    updateCheckInterval: config.updateCheckInterval,
    healthHistoryTtlDays: config.healthHistoryTtlDays,
    appriseConfigured: config.appriseConfigured,
    containerControlsEnabled: config.containerControlsEnabled,
    healthHistoryEnabled: config.healthHistoryEnabled,
    resourceMonitorEnabled: config.resourceMonitorEnabled,
    fileExplorerEnabled: config.fileExplorerEnabled,
    terminalEnabled: config.terminalEnabled,
  };

  res.json(cfg);
});

router.get("/app-update", async (_req, res) => {
  const result = await appUpdateService.check();
  const info: AppUpdateInfo = result ?? { hasUpdate: false };

  res.json(info);
});

export default router;
