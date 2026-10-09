import type { ErrorRequestHandler } from "express";

import { logger } from "../lib/logService.js";

export const errorHandler: ErrorRequestHandler = (err: unknown, _req, res, _next) => {
  logger.error("Server error:", err);
  const status =
    err instanceof Error &&
    "status" in err &&
    typeof err.status === "number" &&
    Number.isInteger(err.status) &&
    err.status >= 400 &&
    err.status <= 599
      ? err.status
      : 500;

  res.status(status).json({ error: err instanceof Error ? err.message : "Internal server error" });
};
