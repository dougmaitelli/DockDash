import { Router } from "express";
import { db } from "../db/databaseService.js";
import { healthCheckService } from "../services/healthCheckService.js";
import { dockerService } from "../services/dockerService.js";
import { notificationService } from "../services/notificationService.js";
import { changelogService } from "../services/changelogService.js";
import { ServiceSource, ServiceStatus, ServiceLinkType, ContainerAction } from "@shared";
import { APP_NAME } from "../lib/constants.js";
import { t } from "../i18n/index.js";
import { config } from "../lib/config.js";
import type {
  ApiSuccess,
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

// Import / upsert service manually
router.post("/services", (req, res) => {
  const { name, host, ports, checkPort, source, status, metadata } = req.body;

  if (!name || !host) {
    return res.status(400).json({ error: "name and host are required" });
  }

  const now = new Date().toISOString();
  const service = db.upsertService({
    name,
    host,
    ports: Array.isArray(ports) ? ports : [],
    checkPort,
    source: source || ServiceSource.NETWORK,
    status: status || ServiceStatus.UNKNOWN,
    metadata: metadata || {},
    createdAt: now,
    updatedAt: now,
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
  const { sourceId, targetId, label, type, description, targetPort, protocol } = req.body;

  if (!sourceId || !targetId) {
    return res.status(400).json({ error: "source and target are required" });
  }

  if (sourceId === targetId) {
    return res.status(400).json({ error: "source and target cannot be the same" });
  }

  try {
    const link = db.saveLink({
      sourceId,
      targetId,
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
    db.saveServicePosition(p.serviceId, p.x, p.y, p.parentId, p.w, p.h);
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
  const dockerHost = service.metadata?.dockerHost as string | undefined;

  if (!containerId || !dockerHost) {
    return res.status(400).json({ error: "Container metadata not available" });
  }

  const docker = dockerService.createDockerClientForHost(dockerHost);
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

  const containerName = service.metadata?.containerName as string | undefined;
  const dockerHost = service.metadata?.dockerHost as string | undefined;

  if (!containerName || !dockerHost) {
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
    const docker = dockerService.createDockerClientForHost(dockerHost);
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

export default router;
