import { Router } from "express";

import { ServiceSource } from "@shared";
import type {
  ApiSuccess,
  CreateServiceRequest,
  SavePositionsRequest,
  SavePositionsResponse,
  UpdateServiceRequest,
} from "@shared/api";

import { historyRepository } from "../db/historyRepository.js";
import { serviceRepository } from "../db/serviceRepository.js";
import { config } from "../lib/config.js";
import { logger } from "../lib/logService.js";
import { isNonEmptyString, isValidEnumValue, isValidPort } from "../lib/validate.js";
import { changelogService } from "../services/changelogService.js";
import { healthCheckService } from "../services/healthCheckService.js";

const router = Router();

router.get("/services", (_req, res) => {
  res.json(serviceRepository.getServices());
});

router.get("/serviceStatuses", (_req, res) => {
  const statuses = serviceRepository.getServiceStatuses();

  if (!config.resourceMonitorEnabled) {
    return res.json(statuses);
  }

  const resourceMap = healthCheckService.getLatestStats();
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

router.post("/services", (req, res) => {
  const { name, host, ports, checkPort, source, metadata } = req.body as CreateServiceRequest;

  if (!isNonEmptyString(name)) {
    return res.status(400).json({ error: "name is required" });
  }

  if (!isNonEmptyString(host)) {
    return res.status(400).json({ error: "host is required" });
  }

  if (source !== undefined && !isValidEnumValue(ServiceSource, source)) {
    return res.status(400).json({ error: "invalid source" });
  }

  if (Array.isArray(ports) && !ports.every(isValidPort)) {
    return res.status(400).json({ error: "ports must be integers between 1 and 65535" });
  }

  if (checkPort !== undefined && !isValidPort(checkPort)) {
    return res.status(400).json({ error: "checkPort must be an integer between 1 and 65535" });
  }

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

router.put("/services/:id", (req, res) => {
  const { name, host, ports, checkPort } = req.body as UpdateServiceRequest;

  if (name !== undefined && !isNonEmptyString(name)) {
    return res.status(400).json({ error: "name cannot be empty" });
  }

  if (host !== undefined && !isNonEmptyString(host)) {
    return res.status(400).json({ error: "host cannot be empty" });
  }

  if (Array.isArray(ports) && !ports.every(isValidPort)) {
    return res.status(400).json({ error: "ports must be integers between 1 and 65535" });
  }

  if (checkPort != null && !isValidPort(checkPort)) {
    return res.status(400).json({ error: "checkPort must be an integer between 1 and 65535" });
  }

  try {
    const service = serviceRepository.updateService(req.params.id, {
      name,
      host,
      ports: Array.isArray(ports) ? ports : undefined,
      checkPort,
    });

    void healthCheckService
      .checkSingleService(req.params.id)
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

router.post("/positions", (req, res) => {
  const { positions } = req.body as SavePositionsRequest;

  if (!Array.isArray(positions)) {
    return res.status(400).json({ error: "positions must be an array" });
  }

  for (const p of positions) {
    if (!isNonEmptyString(p.serviceId)) {
      return res.status(400).json({ error: "each position must have a valid serviceId" });
    }

    if (p.x !== undefined && typeof p.x !== "number") {
      return res.status(400).json({ error: "position x must be a number" });
    }

    if (p.y !== undefined && typeof p.y !== "number") {
      return res.status(400).json({ error: "position y must be a number" });
    }

    if (p.parentId != null && !isNonEmptyString(p.parentId)) {
      return res.status(400).json({ error: "position parentId must be a non-empty string" });
    }

    if (p.w != null && typeof p.w !== "number") {
      return res.status(400).json({ error: "position w must be a number" });
    }

    if (p.h != null && typeof p.h !== "number") {
      return res.status(400).json({ error: "position h must be a number" });
    }
  }

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
