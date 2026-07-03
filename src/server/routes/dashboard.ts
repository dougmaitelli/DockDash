import { Router } from "express";

import type { CheckAllServicesResponse } from "@shared/api";

import { db } from "../db/databaseService.js";
import { logger } from "../lib/logService.js";
import { healthCheckService } from "../services/healthCheckService.js";

const router = Router();

router.get("/dashboard", (_req, res) => {
  const data = db.getDashboardData();

  res.json(data);
});

router.post("/checkAllServices", (_req, res) => {
  void healthCheckService
    .checkAllServices()
    .then((result) => {
      logger.info(`Health check: ${result.updated} updated, ${result.errors} errors`);
    })
    .catch((err: unknown) => {
      logger.error(`Health check failed: ${err instanceof Error ? err.message : String(err)}`);
    });

  const response: CheckAllServicesResponse = {
    status: "running",
    message: "Health check started in background",
  };

  res.json(response);
});

export default router;
