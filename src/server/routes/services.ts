import { Router } from "express";

import { ServiceSource } from "@shared";
import {
  type CreateServiceRequest,
  createServiceRequestSchema,
  type SavePositionsRequest,
  savePositionsRequestSchema,
  type UpdateServiceRequest,
  updateServiceRequestSchema,
} from "@shared/requestSchemas.js";
import type { ApiSuccess, SavePositionsResponse } from "@shared/responseSchemas.js";

import { historyRepository } from "../db/historyRepository.js";
import { serviceRepository } from "../db/serviceRepository.js";
import { config } from "../lib/config.js";
import { logger } from "../lib/logService.js";
import { validateBody } from "../middleware/validateRequest.js";
import { changelogService } from "../services/changelogService.js";
import { healthCheckService } from "../services/healthCheckService.js";
import { resourceStatsService } from "../services/resourceStatsService.js";

const router = Router();

router.get("/services", (_req, res) => {
  res.json(serviceRepository.getServices());
});

router.get("/serviceStatuses", (_req, res) => {
  const statuses = serviceRepository.getServiceStatuses();

  if (!config.resourceMonitorEnabled) {
    return res.json(statuses);
  }

  const resourceMap = resourceStatsService.getLatestStats();
  const enriched = statuses.map((status) => {
    const stats = resourceMap.get(status.id);

    return stats
      ? { ...status, cpuPercent: stats.cpuPercent, memoryPercent: stats.memoryPercent }
      : status;
  });

  return res.json(enriched);
});

router.get("/services/:id", (req, res) => {
  const service = serviceRepository.getServices().find((s) => s.id === req.params.id);

  if (!service) return res.status(404).json({ error: "Service not found" });

  res.json(service);
});

router.post("/services", validateBody(createServiceRequestSchema), (req, res) => {
  const { name, host, ports, checkPort, source, metadata } = req.body as CreateServiceRequest;

  const service = serviceRepository.saveService({
    name,
    host,
    ports: Array.isArray(ports) ? ports : [],
    checkPort,
    source: source || ServiceSource.NETWORK,
    metadata: metadata || {},
  });

  void healthCheckService
    .checkSingleService(service.id!)
    .catch((err: unknown) =>
      logger.error(`Health check failed: ${err instanceof Error ? err.message : String(err)}`),
    );

  res.status(201).json(service);
});

router.put("/services/:id", validateBody(updateServiceRequestSchema), (req, res) => {
  const { name, host, ports, checkPort } = req.body as UpdateServiceRequest;

  try {
    const serviceId = String(req.params.id);
    const service = serviceRepository.updateService(serviceId, {
      name,
      host,
      ports: Array.isArray(ports) ? ports : undefined,
      checkPort,
    });

    void healthCheckService
      .checkSingleService(serviceId)
      .catch((err: unknown) =>
        logger.error(`Health check failed: ${err instanceof Error ? err.message : String(err)}`),
      );

    res.json(service);
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.delete("/services/:id", (req, res) => {
  serviceRepository.deleteService(req.params.id);

  const response: ApiSuccess = { success: true };

  res.json(response);
});

router.post("/services/:id/dashboard", (req, res) => {
  if (!serviceRepository.getService(req.params.id)) {
    return res.status(404).json({ error: "Service not found" });
  }

  serviceRepository.addServiceToDashboard(req.params.id);

  const response: ApiSuccess = { success: true };

  res.json(response);
});

router.delete("/services/:id/dashboard", (req, res) => {
  serviceRepository.removeServiceFromDashboard(req.params.id);

  const response: ApiSuccess = { success: true };

  res.json(response);
});

router.post("/positions", validateBody(savePositionsRequestSchema), (req, res) => {
  const { positions } = req.body as SavePositionsRequest;

  for (const p of positions) {
    serviceRepository.saveServicePosition(p);
  }

  const response: SavePositionsResponse = { positions: serviceRepository.getServicePositions() };

  res.json(response);
});

router.get("/services/:id/health-history", (req, res) => {
  if (!config.healthHistoryEnabled) {
    return res.status(403).json({ error: "Health history is disabled" });
  }

  const days = Math.max(1, parseInt(req.query.days as string, 10) || 7);
  const buckets = Math.max(1, Math.min(200, parseInt(req.query.buckets as string, 10) || 80));

  res.json(historyRepository.getHealthHistory(req.params.id, days, buckets));
});

router.get("/services/:id/resource-history", (req, res) => {
  if (!config.resourceMonitorEnabled) {
    return res.status(403).json({ error: "Resource monitoring is disabled" });
  }

  const days = Math.max(1, parseInt(req.query.days as string, 10) || 7);
  const buckets = Math.max(1, Math.min(200, parseInt(req.query.buckets as string, 10) || 80));

  res.json(historyRepository.getResourceHistory(req.params.id, days, buckets));
});

router.get("/services/:id/changelog", async (req, res) => {
  const service = serviceRepository.getService(req.params.id);

  if (!service) return res.status(404).json({ error: "Service not found" });

  const result = await changelogService.fetchChangelog(service);

  res.json(result);
});

export default router;
