import { Router } from "express";
import { db } from "../db/databaseService.js";
import { healthCheckService } from "../services/healthCheckService.js";
import { ServiceSource, ServiceStatus, ServiceLinkType } from "@shared";
import type {
  ApiSuccess,
  SavePositionsRequest,
  SavePositionsResponse,
  CheckAllServicesResponse,
} from "@shared/api";

const router = Router();

// Get all services
router.get("/services", (_req, res) => {
  const services = db.getServices();

  res.json(services);
});

// Get single service
router.get("/services/:id", (req, res) => {
  const service = db.getServices().find((s) => s.id === req.params.id);

  if (!service) return res.status(404).json({ error: "Service not found" });

  res.json(service);
});

// Import / upsert service manually
router.post("/services", (req, res) => {
  const { name, host, ports, checkPort, source, status, metadata } = req.body;

  if (!name || !host) {
    return res.status(400).json({ error: "name and host are required" });
  }

  const service = db.upsertService({
    name,
    host,
    ports: Array.isArray(ports) ? ports : [],
    checkPort,
    source: source || ServiceSource.NETWORK,
    status: status || ServiceStatus.UNKNOWN,
    metadata: metadata || {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  healthCheckService.checkSingleService(service.id!);

  res.json(service);
});

// Update service
router.put("/services/:id", (req, res) => {
  const { name, host, ports, checkPort } = req.body;

  if (!name || !host) {
    return res.status(400).json({ error: "name and host are required" });
  }

  try {
    const service = db.updateService(req.params.id, {
      name,
      host,
      ports: Array.isArray(ports) ? ports : [],
      checkPort,
    });

    healthCheckService.checkSingleService(req.params.id);

    res.json(service);
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Delete service
router.delete("/services/:id", (req, res) => {
  db.deleteService(req.params.id);

  const response: ApiSuccess = { success: true };

  res.json(response);
});

// Create link
router.post("/links", (req, res) => {
  const { source_id, target_id, label, type, description, targetPort, protocol } = req.body;

  if (!source_id || !target_id) {
    return res.status(400).json({ error: "source_id and target_id are required" });
  }

  if (source_id === target_id) {
    return res.status(400).json({ error: "source and target cannot be the same" });
  }

  try {
    const link = db.saveLink({
      source_id,
      target_id,
      label: label || "",
      type: type || ServiceLinkType.COMMUNICATION,
      description: description || "",
      targetPort: targetPort != null ? Number(targetPort) : null,
      protocol: protocol || null,
    });

    res.json(link);
  } catch (err) {
    res.status(409).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Update link
router.put("/links/:id", (req, res) => {
  const { label, type, description, targetPort, protocol } = req.body;

  try {
    const link = db.updateLink(req.params.id, {
      label: label ?? "",
      type: type ?? ServiceLinkType.COMMUNICATION,
      description: description ?? "",
      targetPort: targetPort != null ? Number(targetPort) : null,
      protocol: protocol ?? null,
    });

    res.json(link);
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Delete link
router.delete("/links/:id", (req, res) => {
  db.deleteLink(req.params.id);

  const response: ApiSuccess = { success: true };

  res.json(response);
});

// Update service positions
router.post("/positions", (req, res) => {
  const { positions } = req.body as SavePositionsRequest;

  for (const p of positions) {
    db.saveServicePosition(p.service_id, p.x, p.y, p.parent_id);
  }

  const response: SavePositionsResponse = { positions: db.getServicePositions() };

  res.json(response);
});

// Dashboard data (services with positions, links, and stats in one request)
router.get("/dashboard", (_req, res) => {
  const data = db.getDashboardData();

  res.json(data);
});

router.post("/checkAllServices", (_req, res) => {
  healthCheckService
    .checkAllServices()
    .then((result) => {
      console.log(`Health check: ${result.updated} updated, ${result.errors} errors`);
    })
    .catch((err) => {
      console.error("Health check failed:", err instanceof Error ? err.message : String(err));
    });

  const response: CheckAllServicesResponse = {
    status: "running",
    message: "Health check started in background",
  };

  res.json(response);
});

router.get("/serviceStatuses", (_req, res) => {
  const statuses = db.getServiceStatuses();

  res.json(statuses);
});

export default router;
