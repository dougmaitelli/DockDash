import { Router } from "express";
import { dockerService } from "../services/dockerService.js";
import { networkScanner } from "../services/networkScanner.js";
import { config } from "../lib/config.js";
import type {
  DockerHostHealth,
  DashboardConfig,
  SseScanDonePayload,
  SseScanErrorPayload,
} from "@shared/api";
import { SSE_EVENT } from "@shared/api";

const router = Router();

// Docker hosts health
router.get("/docker/health", async (_req, res) => {
  const clients = dockerService.createDockerClients();

  const results: DockerHostHealth[] = await Promise.all(
    clients.map(async ({ host, docker }): Promise<DockerHostHealth> => {
      try {
        const info = await docker.info();

        return {
          host,
          connected: true,
          containers: info.Containers,
          containersRunning: info.ContainersRunning,
          containersPaused: info.ContainersPaused,
          containersStopped: info.ContainersStopped,
          serverVersion: info.ServerVersion,
        };
      } catch (err) {
        return { host, connected: false, error: err instanceof Error ? err.message : String(err) };
      }
    }),
  );

  res.json(results);
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
    for (const { host, docker } of dockerService.createDockerClients()) {
      if (closed) break;

      for await (const service of dockerService.scanDockerContainers(docker, host)) {
        if (closed) break;

        res.write(`data: ${JSON.stringify(service)}\n\n`);
        count++;
      }
    }
  } catch (err) {
    if (!closed) {
      const errorPayload: SseScanErrorPayload = {
        message: err instanceof Error ? err.message : String(err),
      };

      res.write(`event: ${SSE_EVENT.SCAN_ERROR}\ndata: ${JSON.stringify(errorPayload)}\n\n`);
    }
  }

  if (!closed) {
    const donePayload: SseScanDonePayload = { count };

    res.write(`event: ${SSE_EVENT.DONE}\ndata: ${JSON.stringify(donePayload)}\n\n`);
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
  const config = networkScanner.parseCIDRConfig();
  const cidrList = cidrParam?.split(",").filter(Boolean) ?? config.map((c) => c.cidr);
  const portList =
    portsParam
      ?.split(",")
      .map(Number)
      .filter((n) => !isNaN(n)) ??
    config[0]?.ports ??
    [];

  let closed = false;

  req.on("close", () => {
    closed = true;
  });

  let count = 0;

  try {
    for (const cidr of cidrList) {
      if (closed) break;

      for await (const services of networkScanner.scanNetworkStream(cidr, portList)) {
        if (closed) break;

        for (const svc of services) {
          res.write(`data: ${JSON.stringify(svc)}\n\n`);
          count++;
        }
      }
    }
  } catch (err) {
    if (!closed) {
      const errorPayload: SseScanErrorPayload = {
        message: err instanceof Error ? err.message : String(err),
      };

      res.write(`event: ${SSE_EVENT.SCAN_ERROR}\ndata: ${JSON.stringify(errorPayload)}\n\n`);
    }
  }

  if (!closed) {
    const donePayload: SseScanDonePayload = { count };

    res.write(`event: ${SSE_EVENT.DONE}\ndata: ${JSON.stringify(donePayload)}\n\n`);
    res.end();
  }
});

// Get configuration
router.get("/config", (_req, res) => {
  const cfg: DashboardConfig = {
    dockerHosts: config.dockerHosts,
    networkCidrs: config.networkCidrs,
    scanPorts: config.scanPorts,
    refreshInterval: config.refreshInterval,
    healthCheckInterval: config.healthCheckInterval,
    updateCheckInterval: config.updateCheckInterval,
    appriseConfigured: config.appriseConfigured,
    containerControlsEnabled: config.containerControlsEnabled,
    fileExplorerEnabled: config.fileExplorerEnabled,
    terminalEnabled: config.terminalEnabled,
  };

  res.json(cfg);
});

export default router;
