import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import discoveryRoutes from "./routes/discovery.js";
import serviceRoutes from "./routes/services.js";
import { checkAllServices } from "./services/healthCheck.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = parseInt(process.env.PORT || "3001", 10);
const HEALTH_CHECK_INTERVAL = parseInt(process.env.HEALTH_CHECK_INTERVAL || "30000", 10);

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
  console.log(`DockDash server running on http://localhost:${PORT}`);
  console.log(`Docker host: ${process.env.DOCKER_HOST || "unix:///var/run/docker.sock"}`);
  console.log(`Network CIDRs: ${process.env.NETWORK_CIDRS || "192.168.1.0/24"}`);
  console.log(`Health check interval: ${HEALTH_CHECK_INTERVAL}ms`);

  // Background health check job
  const healthCheckInterval = setInterval(async () => {
    try {
      const result = await checkAllServices();
      if (result.updated > 0 || result.errors > 0) {
        console.log(`Health check: ${result.updated} updated, ${result.errors} errors`);
      }
    } catch (err) {
      console.error("Health check failed:", err instanceof Error ? err.message : String(err));
    }
  }, HEALTH_CHECK_INTERVAL);

  healthCheckInterval.unref();
});

export default app;
