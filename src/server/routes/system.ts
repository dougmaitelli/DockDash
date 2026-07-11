import { Router } from "express";

import type { AppUpdateInfo, DashboardConfig } from "@shared/api";
import {
  CONFIG_SCHEMA,
  type ConfigKey,
  type SchemaConfig,
  type SchemaEntry,
} from "@shared/configSchema.js";

import { config } from "../lib/config.js";
import { appUpdateService } from "../services/appUpdateService.js";

const router = Router();

router.get("/config", (_req, res) => {
  const schemaValues = Object.fromEntries(
    (Object.keys(CONFIG_SCHEMA) as ConfigKey[])
      .filter((k) => (CONFIG_SCHEMA[k] as SchemaEntry).showOnUi)
      .map((k) => [k, (config as unknown as SchemaConfig)[k]]),
  );

  const cfg: DashboardConfig = {
    version: config.appVersion,
    appriseConfigured: config.appriseConfigured,
    ...schemaValues,
  } as DashboardConfig;

  res.json(cfg);
});

router.get("/app-update", async (_req, res) => {
  const result = await appUpdateService.check();
  const info: AppUpdateInfo = result ?? { hasUpdate: false };

  res.json(info);
});

export default router;
