import { Router } from "express";

import { fileContentRequestSchema } from "@shared/requestSchemas.js";
import type { ApiSuccess, FileContentResponse } from "@shared/responseSchemas.js";

import { serviceRepository } from "../db/serviceRepository.js";
import { config } from "../lib/config.js";
import { isValidContainerPath } from "../lib/validate.js";
import { validateBody } from "../middleware/validateRequest.js";
import { containerRuntimeService } from "../services/containerRuntime/containerRuntimeService.js";

const router = Router();

router.get("/services/:id/files", async (req, res) => {
  if (!config.fileExplorerEnabled) {
    return res.status(403).json({ error: "File explorer is disabled" });
  }

  const rawPath = typeof req.query.path === "string" ? req.query.path : "/";

  if (!isValidContainerPath(rawPath)) {
    return res.status(400).json({ error: "Invalid path" });
  }

  try {
    const service = serviceRepository.requireService(String(req.params.id));
    const entries = await containerRuntimeService.getRuntime(service).listFiles(service, rawPath);

    res.json({ path: rawPath, entries });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.get("/services/:id/files/content", async (req, res) => {
  if (!config.fileExplorerEnabled) {
    return res.status(403).json({ error: "File explorer is disabled" });
  }

  const rawPath = typeof req.query.path === "string" ? req.query.path : "";

  if (!isValidContainerPath(rawPath)) {
    return res.status(400).json({ error: "Invalid path" });
  }

  const controller = new AbortController();
  const cancel = () => controller.abort();

  res.once("close", cancel);

  try {
    const service = serviceRepository.requireService(req.params.id);
    const result: FileContentResponse = await containerRuntimeService
      .getRuntime(service)
      .readFile(service, rawPath, {
        maxBytes: 8 * 1024 * 1024,
        timeoutMs: 15_000,
        signal: controller.signal,
      });

    if (!controller.signal.aborted) res.json(result);
  } catch (err) {
    if (!controller.signal.aborted) {
      const status =
        err instanceof Error &&
        "status" in err &&
        typeof err.status === "number" &&
        [400, 413, 504].includes(err.status)
          ? err.status
          : 500;

      res.status(status).json({ error: err instanceof Error ? err.message : String(err) });
    }
  } finally {
    res.off("close", cancel);
  }
});

router.put(
  "/services/:id/files/content",
  (_req, res, next) => {
    if (!config.fileExplorerEnabled) {
      res.status(403).json({ error: "File explorer is disabled" });

      return;
    }

    next();
  },
  validateBody(fileContentRequestSchema),
  async (req, res) => {
    const { path: filePath, content } = req.body as { path: string; content: string };

    if (!isValidContainerPath(filePath)) {
      return res.status(400).json({ error: "Invalid path" });
    }

    try {
      const service = serviceRepository.requireService(String(req.params.id));

      await containerRuntimeService.getRuntime(service).writeFile(service, filePath, content);

      const response: ApiSuccess = { success: true };

      res.json(response);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  },
);

export default router;
