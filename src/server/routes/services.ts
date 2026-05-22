import { Router } from "express";
import { db } from "../lib/database.js";
import { checkAllServices, checkSingleService } from "../services/healthCheck.js";
import { ServiceSource, ServiceStatus, ServiceLinkType } from "@shared";

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
  const { name, host, port, protocol, source, status, metadata } = req.body;

  if (!name || !host) {
    return res.status(400).json({ error: "name and host are required" });
  }

  const service = db.upsertService({
    name,
    host,
    port: port || null,
    protocol: protocol || "http",
    source: source || ServiceSource.NETWORK,
    status: status || ServiceStatus.UNKNOWN,
    metadata: metadata || {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  checkSingleService(service.id!);

  res.json(service);
});

// Update service
router.put("/services/:id", (req, res) => {
  const { name, host, port, protocol } = req.body;

  if (!name || !host) {
    return res.status(400).json({ error: "name and host are required" });
  }

  try {
    const service = db.updateService(req.params.id, {
      name,
      host,
      port: port || null,
      protocol: protocol || "http",
    });

    checkSingleService(req.params.id);

    res.json(service);
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Delete service
router.delete("/services/:id", (req, res) => {
  db.deleteService(req.params.id);

  res.json({ success: true });
});

// Create link
router.post("/links", (req, res) => {
  const { source_id, target_id, label, type, description } = req.body;

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
    });
    res.json(link);
  } catch (err) {
    res.status(409).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Update link
router.put("/links/:id", (req, res) => {
  const { label, type, description } = req.body;

  try {
    const link = db.updateLink(req.params.id, {
      label: label ?? "",
      type: type ?? ServiceLinkType.COMMUNICATION,
      description: description ?? "",
    });
    res.json(link);
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Delete link
router.delete("/links/:id", (req, res) => {
  db.deleteLink(req.params.id);

  res.json({ success: true });
});

// Update service positions
router.post("/positions", (req, res) => {
  const { positions } = req.body as { positions: { service_id: string; x: number; y: number }[] };

  for (const p of positions) {
    db.saveServicePosition(p.service_id, p.x, p.y);
  }

  const allPositions = db.getServicePositions();

  res.json({ positions: allPositions });
});

// Dashboard data (services with positions, links, and stats in one request)
router.get("/dashboard", (_req, res) => {
  const data = db.getDashboardData();

  res.json(data);
});

router.post("/checkAllServices", (_req, res) => {
  checkAllServices()
    .then((result) => {
      console.log(`Health check: ${result.updated} updated, ${result.errors} errors`);
    })
    .catch((err) => {
      console.error("Health check failed:", err instanceof Error ? err.message : String(err));
    });

  res.json({ status: "running", message: "Health check started in background" });
});

router.get("/serviceStatuses", (_req, res) => {
  const statuses = db.getServiceStatuses();

  res.json(statuses);
});

export default router;
