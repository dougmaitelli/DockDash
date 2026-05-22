import { Router } from "express";
import {
  createDockerClient,
  scanDockerContainers,
  scanDockerNetworks,
} from "../services/dockerService.js";
import {
  scanNetwork,
  convertToServices,
  parseCIDRConfig,
  NetworkHost,
} from "../services/networkScanner.js";
import { db } from "../lib/database.js";

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

// Scan Docker containers
router.post("/docker/scan", async (_req, res) => {
  try {
    const docker = await createDockerClient();
    const containers = await scanDockerContainers(docker);

    // Upsert all discovered containers
    for (const container of containers) {
      db.upsertService(container);
    }

    res.json({
      discovered: containers.length,
      services: containers,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
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

// Scan network
router.post("/network/scan", async (req, res) => {
  try {
    const { cidrs, ports } = req.body as { cidrs?: string[]; ports?: number[] };
    const config = parseCIDRConfig();
    const cidrList = cidrs?.length ? cidrs : config.map((c) => c.cidr);
    const portList = ports?.length ? ports : (config[0]?.ports ?? []);

    const allResults: { cidr: string; hosts: NetworkHost[] }[] = [];

    for (const cidr of cidrList) {
      const hosts = await scanNetwork(cidr, portList);

      allResults.push({ cidr, hosts });
    }

    const services = convertToServices(allResults.flatMap((r) => r.hosts.map((h) => h)));

    // Upsert discovered network services
    for (const svc of services) {
      db.upsertService(svc);
    }

    res.json({
      discovered: services.length,
      cidrs: allResults,
      services,
    });
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
