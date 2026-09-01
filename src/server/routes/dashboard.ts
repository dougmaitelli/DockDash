import { Router } from "express";

import type { CheckAllServicesResponse } from "@shared/responseSchemas.js";

import { serviceRepository } from "../db/serviceRepository.js";
import { logger } from "../lib/logService.js";
import { containerRuntimeService } from "../services/containerRuntime/containerRuntimeService.js";
import { healthCheckService } from "../services/healthCheckService.js";

const router = Router();

router.get("/dashboard", (_req, res) => {
  const data = serviceRepository.getDashboardData();

  res.json({
    ...data,
    services: data.services.map((service) => containerRuntimeService.withSourceName(service)),
  });
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
