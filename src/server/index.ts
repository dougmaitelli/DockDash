import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import discoveryRoutes from "./routes/discovery.js";
import serviceRoutes from "./routes/services.js";
import { healthCheckService } from "./services/healthCheckService.js";
import { updateCheckerService } from "./services/updateCheckerService.js";
import { db } from "./db/databaseService.js";
import { config } from "./lib/config.js";
import { APP_NAME } from "./lib/constants.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = config.port;
const HEALTH_CHECK_INTERVAL = config.healthCheckInterval;
const UPDATE_CHECK_INTERVAL = config.updateCheckInterval;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.use("/api", discoveryRoutes);
app.use("/api", serviceRoutes);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Serve static files from Vite build
app.use(express.static(path.join(__dirname, "../client")));

// Catch-all: serve index.html for SPA routing
app.get("/{*path}", (_req, res) => {
  res.sendFile(path.join(__dirname, "../client/index.html"));
});

// Error handler
app.use(
  (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("Server error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal server error" });
  },
);

app.listen(PORT, () => {
  console.log(`${APP_NAME} server running on http://localhost:${PORT}`);
  console.log(`Docker hosts: ${config.dockerHosts.join(", ")}`);
  console.log(`Network CIDRs: ${config.networkCidrs.join(",")}`);
  console.log(`Health check interval: ${HEALTH_CHECK_INTERVAL}ms`);
  console.log(`Update check interval: ${UPDATE_CHECK_INTERVAL}ms`);

  // Background health check job
  const healthCheckInterval = setInterval(async () => {
    try {
      const result = await healthCheckService.checkAllServices();

      if (result.updated > 0 || result.errors > 0) {
        console.log(`Health check: ${result.updated} updated, ${result.errors} errors`);
      }
    } catch (err) {
      console.error("Health check failed:", err instanceof Error ? err.message : String(err));
    }
  }, HEALTH_CHECK_INTERVAL);

  healthCheckInterval.unref();

  // Background update check job (also runs once immediately at startup)
  const runUpdateCheck = async () => {
    try {
      console.log("Update check: starting…");
      await updateCheckerService.checkAllServicesForUpdates();
      console.log("Update check: done");
    } catch (err) {
      console.error("Update check failed:", err instanceof Error ? err.message : String(err));
    }
  };

  const updateCheckInterval = setInterval(runUpdateCheck, UPDATE_CHECK_INTERVAL);

  updateCheckInterval.unref();
  runUpdateCheck();

  // Daily cleanup of old health history
  const historyCleanupInterval = setInterval(() => {
    try {
      const removed = db.cleanOldHistory(config.healthHistoryTtlDays);

      if (removed > 0) {
        console.log(`Health history cleanup: removed ${removed} old entries`);
      }
    } catch (err) {
      console.error(
        "Health history cleanup failed:",
        err instanceof Error ? err.message : String(err),
      );
    }
  }, ONE_DAY_MS);

  historyCleanupInterval.unref();
});

export default app;
