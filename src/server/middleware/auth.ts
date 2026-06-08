import type { NextFunction, Request, Response } from "express";

import { config } from "../lib/config.js";

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!config.oidcEnabled) {
    next();

    return;
  }

  if (req.session?.user) {
    next();

    return;
  }

  res.status(401).json({ error: "Unauthorized" });
}
