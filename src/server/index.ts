import express from "express";
import session from "express-session";
import path from "path";
import { fileURLToPath } from "url";

import { closeConnection, createSessionStore } from "./db/connection.js";
import type { BackgroundJob } from "./jobs/BackgroundJob.js";
import { HealthCheckJob } from "./jobs/HealthCheckJob.js";
import { HistoryCleanupJob } from "./jobs/HistoryCleanupJob.js";
import { HistoryRollupJob } from "./jobs/HistoryRollupJob.js";
import { ResourceStatsJob } from "./jobs/ResourceStatsJob.js";
import { UpdateCheckJob } from "./jobs/UpdateCheckJob.js";
import { config } from "./lib/config.js";
import { APP_NAME } from "./lib/constants.js";
import { createGracefulShutdown } from "./lib/gracefulShutdown.js";
import { logger } from "./lib/logService.js";
import { serverHealth } from "./lib/serverHealth.js";
import { requireAuth } from "./middleware/auth.js";
import authRoutes from "./routes/auth.js";
import containerRoutes from "./routes/container.js";
import dashboardRoutes from "./routes/dashboard.js";
import discoveryRoutes from "./routes/discovery.js";
import fileRoutes from "./routes/files.js";
import healthRoutes from "./routes/health.js";
import linkRoutes from "./routes/links.js";
import notificationRoutes from "./routes/notifications.js";
import serviceRoutes from "./routes/services.js";
import systemRoutes from "./routes/system.js";
import terminalRoutes from "./routes/terminal.js";
import { dockerService } from "./services/dockerService.js";
import { healthCheckService } from "./services/healthCheckService.js";
import { networkScanner } from "./services/networkScanner.js";
import { resourceStatsService } from "./services/resourceStatsService.js";
import { terminalService } from "./services/terminalService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = config.port;
const jobs: BackgroundJob[] = [
  new HealthCheckJob(),
  new HistoryCleanupJob(),
  new HistoryRollupJob(),
  new ResourceStatsJob(),
];
const updateCheckJob = new UpdateCheckJob();

jobs.push(updateCheckJob);
const startupTasks: Promise<unknown>[] = [];
let shuttingDown = false;

// Trust reverse-proxy headers so req.protocol reflects X-Forwarded-Proto
const trustProxy = config.trustProxy;

app.set("trust proxy", trustProxy === "true" ? true : trustProxy);

// Middleware
app.use(express.json({ limit: "100kb" }));
app.use(
  session({
    store: createSessionStore(),
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      maxAge: config.sessionMaxAge,
      secure: config.secureCookies,
    },
  }),
);

// Auth routes (no auth required)
app.use("/auth", authRoutes);

// Health checks (no auth required — used by container orchestrators)
app.use("/api", healthRoutes);

// CSRF defense: reject browser requests initiated from a different site so
// cross-origin GETs with side effects (e.g. opening a terminal/log SSE stream)
// can't piggyback on an admin's session. Modern browsers are caught by
// Sec-Fetch-Site; legacy browsers without that header are caught by the
// Origin check below. Non-browser clients send neither header and pass
// through — they have no ambient cookie to abuse anyway.
app.use("/api", (req, res, next) => {
  const site = req.get("sec-fetch-site");

  if (site === "cross-site") {
    res.status(403).json({ error: "Cross-site request blocked" });

    return;
  }

  if (site === undefined) {
    const origin = req.get("origin");

    if (origin !== undefined) {
      const expectedHost = req.get("x-forwarded-host") ?? req.get("host");
      const expected = `${req.protocol}://${expectedHost}`;

      if (origin !== expected) {
        res.status(403).json({ error: "Cross-origin request blocked" });

        return;
      }
    }
  }

  next();
});

// Protect all other API routes
app.use("/api", requireAuth);

// API Routes
app.use("/api", systemRoutes);
app.use("/api", discoveryRoutes);
app.use("/api", serviceRoutes);
app.use("/api", linkRoutes);
app.use("/api", dashboardRoutes);
app.use("/api", containerRoutes);
app.use("/api", fileRoutes);
app.use("/api", terminalRoutes);
app.use("/api", notificationRoutes);

// Serve static files from Vite build
app.use(express.static(path.join(__dirname, "../client")));

// Catch-all: serve index.html for SPA routing
app.get("/{*path}", (_req, res) => {
  res.sendFile(path.join(__dirname, "../client/index.html"));
});

// Error handler
app.use(
  (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error("Server error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal server error" });
  },
);

const server = app.listen(PORT, () => {
  if (shuttingDown) return;

  serverHealth.markReady();
  logger.info(`${APP_NAME} server running on http://localhost:${PORT}`);
  logger.info(`Docker hosts: ${config.dockerHosts.join(", ")}`);
  logger.info(`Network CIDRs: ${config.networkCidrs.join(",")}`);
  logger.info(`Health check interval: ${config.healthCheckInterval}ms`);
  logger.info(`Resource monitor interval: ${config.resourceMonitorInterval}ms`);
  logger.info(`Update check interval: ${config.updateCheckInterval}ms`);
  logger.info(`Auth: ${config.oidcEnabled ? "OIDC enabled" : "disabled (unsecured)"}`);

  jobs.slice(0, -1).forEach((job) => job.start());

  // Run one health check immediately so Docker metadata (imageTag, imageDigest) is
  // synced before the update checker fires. Without this, a container updated between
  // restarts would still carry the old imageTag in the DB and trigger a false
  // "update available" notification on startup.
  const initialHealthCheck = healthCheckService
    .checkAllServices()
    .finally(() => !shuttingDown && updateCheckJob.start());

  startupTasks.push(initialHealthCheck, resourceStatsService.fetchAndCacheAllStats());
});

const shutdown = createGracefulShutdown({
  server,
  jobs,
  startupTasks,
  closeActiveResources: () => {
    networkScanner.shutdown();
    dockerService.closeLogStreams();
    terminalService.shutdown();
  },
  closeDatabase: closeConnection,
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    shuttingDown = true;
    serverHealth.markNotReady();
    void shutdown(signal);
  });
}

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    logger.error(`[${APP_NAME}] Port ${PORT} is already in use. Run: fuser -k ${PORT}/tcp`);
    process.exit(1);
  }

  throw err;
});

export default app;
