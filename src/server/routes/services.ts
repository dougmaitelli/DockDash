import { Router } from "express";

import { ServiceSource } from "@shared";
import type {
  ApiSuccess,
  CreateServiceRequest,
  SavePositionsRequest,
  SavePositionsResponse,
  UpdateServiceRequest,
} from "@shared/api";

import { db } from "../db/databaseService.js";
import { isNonEmptyString, isValidEnumValue } from "../lib/validate.js";
import { changelogService } from "../services/changelogService.js";
import { healthCheckService } from "../services/healthCheckService.js";

const router = Router();

router.get("/services", (_req, res) => {
  res.json(db.getServices());
});

router.get("/serviceStatuses", (_req, res) => {
  res.json(db.getServiceStatuses());
});

router.get("/services/:id", (req, res) => {
  const service = db.getServices().find((s) => s.id === req.params.id);

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

  const service = db.saveService({
    name,
    host,
    ports: Array.isArray(ports) ? ports : [],
    checkPort,
    source: source || ServiceSource.NETWORK,
    metadata: metadata || {},
  });

  void healthCheckService.checkSingleService(service.id!).catch(console.error);

  res.json(service);
});

router.put("/services/:id", (req, res) => {
  const { name, host, ports, checkPort } = req.body as UpdateServiceRequest;

  if (name !== undefined && !isNonEmptyString(name)) {
    return res.status(400).json({ error: "name cannot be empty" });
  }

  if (host !== undefined && !isNonEmptyString(host)) {
    return res.status(400).json({ error: "host cannot be empty" });
  }

  try {
    const service = db.updateService(req.params.id, {
      name,
      host,
      ports: Array.isArray(ports) ? ports : undefined,
      checkPort,
    });

    void healthCheckService.checkSingleService(req.params.id).catch(console.error);

    res.json(service);
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.delete("/services/:id", (req, res) => {
  db.deleteService(req.params.id);

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
    db.saveServicePosition(p);
  }

  const response: SavePositionsResponse = { positions: db.getServicePositions() };

  res.json(response);
});

router.get("/services/:id/health-history", (req, res) => {
  const days = Math.max(1, parseInt(req.query.days as string, 10) || 7);
  const history = db.getHealthHistory(req.params.id, days);

  res.json(history);
});

router.get("/services/:id/changelog", async (req, res) => {
  const service = db.getService(req.params.id);

  if (!service) return res.status(404).json({ error: "Service not found" });

  const result = await changelogService.fetchChangelog(service);

  res.json(result);
});

export default router;
