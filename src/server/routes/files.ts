import express, { Router } from "express";

import { fileContentRequestSchema } from "@shared/requestSchemas.js";
import type { ApiSuccess, FileContentResponse } from "@shared/responseSchemas.js";

import { config } from "../lib/config.js";
import { isValidContainerPath } from "../lib/validate.js";
import { validateBody } from "../middleware/validateRequest.js";
import { dockerService } from "../services/dockerService.js";
import { fileService } from "../services/fileService.js";

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
    const container = dockerService.getContainerForServiceId(String(req.params.id));
    const entries = await fileService.listFiles(container, rawPath);

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

  try {
    const container = dockerService.getContainerForServiceId(req.params.id);
    const result: FileContentResponse = await fileService.readFile(container, rawPath);

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.put(
  "/services/:id/files/content",
  express.json({ limit: "10mb" }),
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
      const container = dockerService.getContainerForServiceId(String(req.params.id));

      await fileService.writeFile(container, filePath, content);

      const response: ApiSuccess = { success: true };

      res.json(response);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  },
);

export default router;
