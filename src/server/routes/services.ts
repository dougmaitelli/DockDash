import { Router } from "express";
import { db } from "../db/databaseService.js";
import { healthCheckService } from "../services/healthCheckService.js";
import { dockerService } from "../services/dockerService.js";
import { notificationService } from "../services/notificationService.js";
import { changelogService } from "../services/changelogService.js";
import { ServiceSource, ServiceLinkType, ServiceProtocol, ContainerAction } from "@shared";
import { APP_NAME } from "../lib/constants.js";
import { t } from "../i18n/index.js";
import { isNonEmptyString, isValidEnumValue } from "../lib/validate.js";
import { config } from "../lib/config.js";
import type {
  ApiSuccess,
  CreateServiceRequest,
  UpdateServiceRequest,
  CreateLinkRequest,
  UpdateLinkRequest,
  SavePositionsRequest,
  SavePositionsResponse,
  CheckAllServicesResponse,
} from "@shared/api";
import { SSE_EVENT } from "@shared/api";

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

// Add service
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

  healthCheckService.checkSingleService(service.id!);

  res.json(service);
});

// Update service
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
  const { sourceId, targetId, label, type, description, targetPort, protocol } =
    req.body as CreateLinkRequest;

  if (!isNonEmptyString(sourceId)) {
    return res.status(400).json({ error: "sourceId is required" });
  }

  if (!isNonEmptyString(targetId)) {
    return res.status(400).json({ error: "targetId is required" });
  }

  if (sourceId === targetId) {
    return res.status(400).json({ error: "source and target cannot be the same" });
  }

  if (protocol != null && !isValidEnumValue(ServiceProtocol, protocol)) {
    return res.status(400).json({ error: "invalid protocol" });
  }

  try {
    const link = db.saveLink({
      sourceId,
      targetId,
      label: label || "",
      type: type || ServiceLinkType.COMMUNICATION,
      description: description || "",
      targetPort: targetPort != null ? Number(targetPort) : undefined,
      protocol: protocol || undefined,
    });

    res.json(link);
  } catch (err) {
    res.status(409).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Update link
router.put("/links/:id", (req, res) => {
  const { label, type, description, targetPort, protocol } = req.body as UpdateLinkRequest;

  if (type !== undefined && !isValidEnumValue(ServiceLinkType, type)) {
    return res.status(400).json({ error: "invalid type" });
  }

  if (protocol != null && !isValidEnumValue(ServiceProtocol, protocol)) {
    return res.status(400).json({ error: "invalid protocol" });
  }

  try {
    const link = db.updateLink(req.params.id, {
      label,
      type,
      description,
      targetPort: targetPort != null ? Number(targetPort) : targetPort,
      protocol,
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

router.post("/services/:id/container/:action", async (req, res) => {
  if (!config.containerControlsEnabled) {
    return res.status(403).json({ error: "Container controls are disabled" });
  }

  const action = req.params.action as ContainerAction;

  if (!Object.values(ContainerAction).includes(action)) {
    return res.status(400).json({ error: "Invalid action" });
  }

  const service = db.getService(req.params.id);

  if (!service) return res.status(404).json({ error: "Service not found" });

  if (service.source !== ServiceSource.DOCKER) {
    return res.status(400).json({ error: "Not a Docker service" });
  }

  const containerId = service.metadata?.containerId as string | undefined;
  const dockerHostId = service.metadata?.dockerHostId as string | undefined;
  const resolvedHost = dockerHostId ? dockerService.resolveHost(dockerHostId) : undefined;

  if (!resolvedHost || !containerId) {
    return res.status(400).json({ error: "Container metadata not available" });
  }

  const docker = dockerService.createDockerClientForHost(resolvedHost);
  const container = docker.getContainer(containerId);

  if (action === "stop") await container.stop();
  else if (action === "start") await container.start();
  else await container.restart();

  healthCheckService.checkSingleService(req.params.id);

  const response: ApiSuccess = { success: true };

  res.json(response);
});

router.get("/services/:id/logs/stream", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const sendError = (message: string) => {
    res.write(`event: ${SSE_EVENT.LOG_ERROR}\ndata: ${JSON.stringify({ message })}\n\n`);
    res.end();
  };

  const service = db.getService(req.params.id);

  if (!service || service.source !== ServiceSource.DOCKER) {
    sendError("Not a Docker service");

    return;
  }

  const dockerHostId = service.metadata?.dockerHostId as string | undefined;
  const resolvedHost = dockerHostId ? dockerService.resolveHost(dockerHostId) : undefined;
  const containerName = service.metadata?.containerName as string | undefined;

  if (!resolvedHost || !containerName) {
    sendError("Container metadata not available");

    return;
  }

  let closed = false;
  let logStream: (NodeJS.ReadableStream & { destroy?: () => void }) | null = null;

  req.on("close", () => {
    closed = true;
    logStream?.destroy?.();
  });

  try {
    const docker = dockerService.createDockerClientForHost(resolvedHost);
    const containers = await docker.listContainers({ all: true });
    const containerInfo = containers.find((c) =>
      c.Names?.some((n) => n.replace(/^\//, "") === containerName),
    );

    if (!containerInfo) {
      if (!closed) sendError(`Container "${containerName}" not found`);

      return;
    }

    if (closed) return;

    const container = docker.getContainer(containerInfo.Id);
    const inspect = await container.inspect();
    const isTty = inspect.Config?.Tty ?? false;

    container.logs(
      { follow: true, stdout: true, stderr: true, tail: 100, timestamps: true },
      (err, stream) => {
        if (err || !stream) {
          if (!closed) sendError(err?.message ?? "Stream unavailable");

          return;
        }

        logStream = stream;

        const sendLine = (line: string) => {
          if (!closed) res.write(`data: ${line}\n\n`);
        };

        if (isTty) {
          stream.on("data", (chunk: Buffer) => {
            chunk.toString("utf8").split("\n").filter(Boolean).forEach(sendLine);
          });
        } else {
          // Demux Docker multiplexed stream: 8-byte header (1 type + 3 pad + 4 size) + payload
          let buf = Buffer.alloc(0);

          stream.on("data", (chunk: Buffer) => {
            buf = Buffer.concat([buf, chunk]);

            while (buf.length >= 8) {
              const size = buf.readUInt32BE(4);

              if (buf.length < 8 + size) break;

              const type = buf[0];
              const payload = buf.slice(8, 8 + size);

              if (type === 1 || type === 2) {
                payload.toString("utf8").split("\n").filter(Boolean).forEach(sendLine);
              }

              buf = buf.slice(8 + size);
            }
          });
        }

        stream.on("end", () => {
          if (!closed) res.end();
        });

        stream.on("error", (streamErr) => {
          if (!closed) sendError(streamErr.message);
        });
      },
    );
  } catch (err) {
    if (!closed) sendError(err instanceof Error ? err.message : String(err));
  }
});

router.post("/notifications/test", async (req, res) => {
  if (!notificationService.configured) {
    return res.status(400).json({ error: "Apprise not configured" });
  }

  try {
    const lang = req.acceptsLanguages([config.locale]) || config.locale;

    await notificationService.notify(
      `${APP_NAME} ${t("notifications.testTitle", undefined, lang)}`,
      t("notifications.testBody", undefined, lang),
      "info",
    );
  } catch (err) {
    return res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
  }

  const response: ApiSuccess = { success: true };

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

router.get("/services/:id/files", async (req, res) => {
  const service = db.getService(req.params.id);

  if (!service) return res.status(404).json({ error: "Service not found" });

  if (service.source !== ServiceSource.DOCKER) {
    return res.status(400).json({ error: "Not a Docker service" });
  }

  const rawPath = typeof req.query.path === "string" ? req.query.path : "/";

  if (!rawPath.startsWith("/") || rawPath.includes("\0") || rawPath.length > 4096) {
    return res.status(400).json({ error: "Invalid path" });
  }

  const dockerHostId = service.metadata?.dockerHostId as string | undefined;
  const resolvedHost = dockerHostId ? dockerService.resolveHost(dockerHostId) : undefined;
  const containerId = service.metadata?.containerId as string | undefined;

  if (!resolvedHost || !containerId) {
    return res.status(400).json({ error: "Container metadata not available" });
  }

  try {
    const entries = await dockerService.listFiles(resolvedHost, containerId, rawPath);

    res.json({ path: rawPath, entries });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
