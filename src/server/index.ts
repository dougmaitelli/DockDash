import express from "express";
import session from "express-session";
import path from "path";
import { fileURLToPath } from "url";

import { HealthCheckJob } from "./jobs/HealthCheckJob.js";
import { HistoryCleanupJob } from "./jobs/HistoryCleanupJob.js";
import { UpdateCheckJob } from "./jobs/UpdateCheckJob.js";
import { config } from "./lib/config.js";
import { APP_NAME } from "./lib/constants.js";
import { requireAuth } from "./middleware/auth.js";
import authRoutes from "./routes/auth.js";
import containerRoutes from "./routes/container.js";
import dashboardRoutes from "./routes/dashboard.js";
import discoveryRoutes from "./routes/discovery.js";
import fileRoutes from "./routes/files.js";
import linkRoutes from "./routes/links.js";
import notificationRoutes from "./routes/notifications.js";
import serviceRoutes from "./routes/services.js";
import systemRoutes from "./routes/system.js";
import terminalRoutes from "./routes/terminal.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = config.port;

// Trust reverse-proxy headers so req.protocol reflects X-Forwarded-Proto
app.set("trust proxy", config.trustProxy);

// Middleware
app.use(express.json({ limit: "100kb" }));
app.use(
  session({
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

// Health check (no auth required — used by container orchestrators)
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
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
  console.log(
    `Auth: ${config.oidcEnabled ? `OIDC (${config.oidcIssuer})` : "disabled (unsecured)"}`,
  );

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
