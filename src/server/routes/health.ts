import { Router } from "express";

import { isConnectionHealthy } from "../db/connection.js";
import { serverHealth } from "../lib/serverHealth.js";

const router = Router();

router.get("/health/live", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

router.get(["/health", "/health/ready"], (_req, res) => {
  const databaseHealthy = isConnectionHealthy();
  const ready = serverHealth.isReady() && databaseHealthy;

  res.status(ready ? 200 : 503).json({
    status: ready ? "ready" : "not_ready",
    checks: { database: databaseHealthy ? "up" : "down" },
    timestamp: new Date().toISOString(),
  });
});

export default router;
