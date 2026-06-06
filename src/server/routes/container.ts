import { Router } from "express";
import { dockerService } from "../services/dockerService.js";
import { healthCheckService } from "../services/healthCheckService.js";
import { ContainerAction } from "@shared";
import { config } from "../lib/config.js";
import { SSE_EVENT } from "@shared/api";
import type { ApiSuccess } from "@shared/api";

const router = Router();

router.post("/services/:id/container/:action", async (req, res) => {
  if (!config.containerControlsEnabled) {
    return res.status(403).json({ error: "Container controls are disabled" });
  }

  const action = req.params.action as ContainerAction;

  if (!Object.values(ContainerAction).includes(action)) {
    return res.status(400).json({ error: "Invalid action" });
  }

  try {
    const container = dockerService.getContainerForServiceId(req.params.id);

    if (action === ContainerAction.STOP) await container.stop();
    else if (action === ContainerAction.START) await container.start();
    else await container.restart();

    healthCheckService.checkSingleService(req.params.id);

    const response: ApiSuccess = { success: true };

    res.json(response);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
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

  let closed = false;
  let logStream: (NodeJS.ReadableStream & { destroy: () => void }) | null = null;

  req.on("close", () => {
    closed = true;
    logStream?.destroy();
  });

  try {
    const container = dockerService.getContainerForServiceId(req.params.id);

    logStream = await dockerService.openLogStream(container);

    logStream.on("data", (chunk: Buffer) => {
      if (!closed) res.write(`data: ${chunk.toString("utf8")}\n\n`);
    });

    logStream.on("end", () => {
      if (!closed) res.end();
    });

    logStream.on("error", (err) => {
      if (!closed) sendError(err.message);
    });
  } catch (err) {
    if (!closed) sendError(err instanceof Error ? err.message : String(err));
  }
});

export default router;
