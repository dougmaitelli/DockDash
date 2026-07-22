import { Router } from "express";

import type {
  DockerHostHealth,
  SseScanDonePayload,
  SseScanErrorPayload,
} from "@shared/responseSchemas.js";
import { SSE_EVENT } from "@shared/types.js";

import { validateNetworkCidr } from "../lib/validate.js";
import { dockerService } from "../services/dockerService.js";
import { networkScanner } from "../services/networkScanner.js";

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
  const cidrParam = typeof req.query.cidrs === "string" ? req.query.cidrs : undefined;
  const requestedCidrs = (cidrParam?.split(",") ?? []).map((cidr) => cidr.trim()).filter(Boolean);
  const cidrList =
    requestedCidrs.length > 0
      ? requestedCidrs
      : networkScanner.parseCIDRConfig().map((config) => config.cidr);

  for (const cidr of cidrList) {
    const error = validateNetworkCidr(cidr);

    if (error) return res.status(400).json({ error: `${cidr}: ${error}` });
  }

  const abortController = new AbortController();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const deepScan = req.query.deepScan === "true";

  let closed = false;

  req.on("close", () => {
    closed = true;
    abortController.abort();
  });

  let count = 0;

  try {
    for (const cidr of cidrList) {
      if (closed) break;

      for await (const services of networkScanner.scanNetworkStream(
        cidr,
        deepScan,
        abortController.signal,
      )) {
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

export default router;
