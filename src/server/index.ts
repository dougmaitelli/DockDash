import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import discoveryRoutes from "./routes/discovery.js";
import serviceRoutes from "./routes/services.js";
import { config } from "./lib/config.js";
import { APP_NAME } from "./lib/constants.js";
import { HealthCheckJob } from "./jobs/HealthCheckJob.js";
import { UpdateCheckJob } from "./jobs/UpdateCheckJob.js";
import { HistoryCleanupJob } from "./jobs/HistoryCleanupJob.js";
import { db } from "./db/databaseService.js";
import { DockerService } from "./services/dockerService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// TODO: remove once all persisted services have been re-scanned with dockerHostId
for (const service of db.getServices()) {
  const legacyHost = service.metadata?.["dockerHost"] as string | undefined;

  if (legacyHost && !service.metadata?.dockerHostId) {
    db.updateServiceMetadata(service.id!, { dockerHostId: DockerService.hostId(legacyHost) });
  }
}

const app = express();
const PORT = config.port;

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

const server = app.listen(PORT, () => {
  console.log(`${APP_NAME} server running on http://localhost:${PORT}`);
  console.log(`Docker hosts: ${config.dockerHosts.join(", ")}`);
  console.log(`Network CIDRs: ${config.networkCidrs.join(",")}`);
  console.log(`Health check interval: ${config.healthCheckInterval}ms`);
  console.log(`Update check interval: ${config.updateCheckInterval}ms`);

  new HealthCheckJob().start();
  new UpdateCheckJob().start();
  new HistoryCleanupJob().start();
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(`[${APP_NAME}] Port ${PORT} is already in use. Run: fuser -k ${PORT}/tcp`);
    process.exit(1);
  }

  throw err;
});

export default app;
