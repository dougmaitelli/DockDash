import type Docker from "dockerode";
import { PassThrough } from "stream";
import { v4 as uuidv4 } from "uuid";

import type { ContainerStats } from "@shared";
import { Service, ServiceSource, ServiceStatus } from "@shared";

import { db } from "../../db/databaseService.js";
import { type ContainerStateMap, DOCKER_CONTAINER_STATE, DockerService } from "../dockerService.js";

// ---------------------------------------------------------------------------
// Fake container definitions
// ---------------------------------------------------------------------------

const MOCK_HOST = "unix:///var/run/docker.sock";
const MOCK_HOST_ID = DockerService.hostId(MOCK_HOST);

export interface MockContainerDef {
  name: string;
  image: string;
  imageTag: string;
  ports: number[];
  cpuBase: number; // approximate CPU % baseline
  memBase: number; // approximate memory % baseline
  memLimitMb: number;
}

export const MOCK_CONTAINERS: MockContainerDef[] = [
  {
    name: "traefik",
    image: "traefik",
    imageTag: "v3.0",
    ports: [80, 8080],
    cpuBase: 8,
    memBase: 15,
    memLimitMb: 128,
  },
  {
    name: "nginx",
    image: "nginx",
    imageTag: "1.25",
    ports: [80, 443],
    cpuBase: 5,
    memBase: 12,
    memLimitMb: 128,
  },
  {
    name: "postgres",
    image: "postgres",
    imageTag: "16",
    ports: [5432],
    cpuBase: 20,
    memBase: 45,
    memLimitMb: 512,
  },
  {
    name: "redis",
    image: "redis",
    imageTag: "7-alpine",
    ports: [6379],
    cpuBase: 3,
    memBase: 20,
    memLimitMb: 256,
  },
  {
    name: "grafana",
    image: "grafana/grafana",
    imageTag: "10.2.0",
    ports: [3000],
    cpuBase: 12,
    memBase: 35,
    memLimitMb: 512,
  },
  {
    name: "dockdash",
    image: "dockdash",
    imageTag: "dev",
    ports: [3001],
    cpuBase: 6,
    memBase: 25,
    memLimitMb: 256,
  },
];

// Stable container IDs for the lifetime of the process
export const MOCK_CONTAINER_IDS = new Map(MOCK_CONTAINERS.map((c) => [c.name, uuidv4()]));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function vary(base: number, variance: number): number {
  const trend = Math.sin(Date.now() / 15_000) * (variance * 0.3);
  const noise = (Math.random() - 0.5) * (variance * 0.7);

  return Math.max(0, Math.min(100, Math.round((base + trend + noise) * 10) / 10));
}

function varyCpu(base: number): number {
  const r = Math.random();
  // 15% high spike, 25% elevated, 60% normal — each expressed as a target value
  const target =
    r < 0.15 ? 80 + Math.random() * 20 : r < 0.4 ? base + 20 + Math.random() * 35 : base;
  const noise = (Math.random() - 0.5) * 30;

  return Math.max(0, Math.min(100, Math.round((target + noise) * 10) / 10));
}

// Stub Docker client — info() returns plausible data; everything else rejects
const stubDockerClient = new Proxy({} as Docker, {
  get(_target, prop: string) {
    if (prop === "info") {
      return () =>
        Promise.resolve({
          Containers: MOCK_CONTAINERS.length,
          ContainersRunning: MOCK_CONTAINERS.length,
          ContainersPaused: 0,
          ContainersStopped: 0,
          ServerVersion: "27.0.0-mock",
        });
    }

    return () => Promise.reject(new Error(`Docker.${prop}() not available in mock mode`));
  },
});

// Proxy-stub for Docker.Container — stores the service ID so getContainerStats
// can look up the per-container CPU/memory profile.
function stubContainer(serviceId: string): Docker.Container {
  const target = { _mockServiceId: serviceId };

  return new Proxy(target, {
    get(obj, prop: string | symbol) {
      if (prop in obj) return obj[prop as keyof typeof obj];

      return () =>
        Promise.reject(
          new Error(`Container operation not available in mock mode (MOCK_DATA=true)`),
        );
    },
  }) as unknown as Docker.Container;
}

const MOCK_LOG_LINES = [
  "GET /healthz 200 1ms",
  "GET /api/data 200 12ms",
  "POST /auth/token 200 45ms",
  "Connection from 172.17.0.1:54321",
  "Cache miss for key user:session:abc123",
  "Scheduled job completed in 23ms",
  "TLS handshake complete",
  "Replication lag: 0ms",
];

// ---------------------------------------------------------------------------
// MockDockerService — extends DockerService to guarantee interface compatibility
// ---------------------------------------------------------------------------

export class MockDockerService extends DockerService {
  override resolveHost(dockerHostId: string): string | undefined {
    return dockerHostId === MOCK_HOST_ID ? MOCK_HOST : undefined;
  }

  override getContainerForServiceId(serviceId: string): Docker.Container {
    return stubContainer(serviceId);
  }

  override createDockerClientForHost(_host: string): Docker {
    return stubDockerClient;
  }

  override createDockerClients(): { host: string; docker: Docker }[] {
    return [{ host: MOCK_HOST, docker: stubDockerClient }];
  }

  override async *scanDockerContainers(
    _docker: Docker,
    _dockerHost: string,
  ): AsyncGenerator<Service> {
    const now = new Date().toISOString();

    for (const c of MOCK_CONTAINERS) {
      yield {
        id: `docker-${uuidv4()}`,
        name: c.name,
        host: "localhost",
        ports: c.ports,
        checkPort: c.ports[0],
        source: ServiceSource.DOCKER,
        status: ServiceStatus.UP,
        metadata: {
          dockerHostId: MOCK_HOST_ID,
          containerId: MOCK_CONTAINER_IDS.get(c.name)!,
          containerName: c.name,
          image: c.image,
          imageTag: c.imageTag,
          networkNames: ["bridge"],
        },
        createdAt: now,
        updatedAt: now,
      };
    }
  }

  override async getContainersStateMap(_docker: Docker): Promise<ContainerStateMap> {
    const map: ContainerStateMap = new Map();

    for (const c of MOCK_CONTAINERS) {
      map.set(c.name, {
        containerId: MOCK_CONTAINER_IDS.get(c.name)!,
        state: DOCKER_CONTAINER_STATE.RUNNING,
        imageTag: c.imageTag,
        imageDigest: undefined,
      });
    }

    return map;
  }

  override async getContainerStats(container: Docker.Container): Promise<ContainerStats> {
    // Resolve the per-container profile via the service ID stored in the stub
    const serviceId = (container as unknown as Record<string, string>)["_mockServiceId"];
    const svc = serviceId ? db.getService(serviceId) : undefined;
    const def = MOCK_CONTAINERS.find((c) => c.name === svc?.metadata?.containerName);

    const cpuBase = def?.cpuBase ?? 10;
    const memBase = def?.memBase ?? 25;
    const memLimitBytes = (def?.memLimitMb ?? 256) * 1024 * 1024;
    const memPercent = vary(memBase, 20);

    return {
      cpuPercent: varyCpu(cpuBase),
      memoryUsed: Math.floor((memPercent / 100) * memLimitBytes),
      memoryLimit: memLimitBytes,
      memoryPercent: memPercent,
      networkRx: Math.floor(Math.random() * 500 * 1024 * 1024),
      networkTx: Math.floor(Math.random() * 200 * 1024 * 1024),
      blockRead: Math.floor(Math.random() * 2 * 1024 * 1024 * 1024),
      blockWrite: Math.floor(Math.random() * 1024 * 1024 * 1024),
    };
  }

  override async openLogStream(
    _container: Docker.Container,
  ): Promise<NodeJS.ReadableStream & { destroy: () => void }> {
    const stream = new PassThrough();

    // Emit a burst of "historical" lines immediately
    for (let i = 20; i > 0; i--) {
      const ts = new Date(Date.now() - i * 3_000).toISOString();
      const line = MOCK_LOG_LINES[Math.floor(Math.random() * MOCK_LOG_LINES.length)];

      stream.write(`${ts} ${line}\n`);
    }

    // Then drip new lines periodically
    const timer = setInterval(() => {
      if (stream.destroyed) {
        clearInterval(timer);

        return;
      }

      const line = MOCK_LOG_LINES[Math.floor(Math.random() * MOCK_LOG_LINES.length)];

      stream.write(`${new Date().toISOString()} ${line}\n`);
    }, 2_000);

    stream.on("close", () => clearInterval(timer));

    return stream as NodeJS.ReadableStream & { destroy: () => void };
  }
}

export const mockDockerService = new MockDockerService();
