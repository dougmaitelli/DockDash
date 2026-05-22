import { Router } from "express";
import {
  createDockerClient,
  scanDockerContainers,
  scanDockerNetworks,
} from "../services/dockerService.js";
import { scanNetworkStream, parseCIDRConfig } from "../services/networkScanner.js";

const router = Router();

// Docker socket health
router.get("/docker/health", async (_req, res) => {
  try {
    const docker = await createDockerClient();
    const info = await docker.info();

    res.json({
      connected: true,
      containers: info.Containers,
      containersRunning: info.ContainersRunning,
      containersPaused: info.ContainersPaused,
      containersStopped: info.ContainersStopped,
      serverVersion: info.ServerVersion,
    });
  } catch (err) {
    res.json({ connected: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// Stream Docker container scan results via SSE
router.get("/docker/scan/stream", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  let closed = false;

  req.on("close", () => {
    closed = true;
  });

  let count = 0;

  try {
    const docker = await createDockerClient();

    for await (const service of scanDockerContainers(docker)) {
      if (closed) break;

      res.write(`data: ${JSON.stringify(service)}\n\n`);
      count++;
    }
  } catch (err) {
    if (!closed) {
      res.write(
        `event: scan-error\ndata: ${JSON.stringify({ message: err instanceof Error ? err.message : String(err) })}\n\n`,
      );
    }
  }

  if (!closed) {
    res.write(`event: done\ndata: ${JSON.stringify({ count })}\n\n`);
    res.end();
  }
});

// Stream network scan results via SSE
router.get("/network/scan/stream", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const cidrParam = req.query.cidrs as string | undefined;
  const portsParam = req.query.ports as string | undefined;
  const config = parseCIDRConfig();
  const cidrList = cidrParam?.split(",").filter(Boolean) ?? config.map((c) => c.cidr);
  const portList =
    portsParam
      ?.split(",")
      .map(Number)
      .filter((n) => !isNaN(n)) ?? config[0]?.ports ?? [];

  let closed = false;

  req.on("close", () => {
    closed = true;
  });

  let count = 0;

  try {
    for (const cidr of cidrList) {
      if (closed) break;

      for await (const services of scanNetworkStream(cidr, portList)) {
        if (closed) break;

        for (const svc of services) {
          res.write(`data: ${JSON.stringify(svc)}\n\n`);
          count++;
        }
      }
    }
  } catch (err) {
    if (!closed) {
      res.write(
        `event: scan-error\ndata: ${JSON.stringify({ message: err instanceof Error ? err.message : String(err) })}\n\n`,
      );
    }
  }

  if (!closed) {
    res.write(`event: done\ndata: ${JSON.stringify({ count })}\n\n`);
    res.end();
  }
});


// Get Docker networks
router.get("/docker/networks", async (_req, res) => {
  try {
    const docker = await createDockerClient();
    const networks = await scanDockerNetworks(docker);

    res.json(networks);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Get configuration
router.get("/config", (_req, res) => {
  res.json({
    dockerHost: process.env.DOCKER_HOST || "unix:///var/run/docker.sock",
    networkCidrs: (process.env.NETWORK_CIDRS || "192.168.1.0/24").split(","),
    scanPorts: (process.env.SCAN_PORTS || "80,443,3000,3001,5432,6379,8080,8443,9090,27017,22,3306")
      .split(",")
      .map(Number),
    refreshInterval: parseInt(process.env.REFRESH_INTERVAL || "30000", 10),
  });
});

export default router;
