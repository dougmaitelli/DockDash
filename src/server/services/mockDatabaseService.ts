import Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";

import { ServiceSource, ServiceStatus } from "@shared";

import { DatabaseService } from "../db/databaseService.js";
import { DockerService } from "./dockerService.js";
import { MOCK_CONTAINER_IDS, MOCK_CONTAINERS } from "./mockDockerService.js";

const MOCK_HOST = "unix:///var/run/docker.sock";
const MOCK_HOST_ID = DockerService.hostId(MOCK_HOST);

function vary(base: number, variance: number, timeMs: number, phase: number): number {
  const trend = Math.sin(timeMs / (4 * 60 * 60_000) + phase) * (variance * 0.3);
  const noise = (Math.random() - 0.5) * (variance * 0.7);

  return Math.max(0, Math.min(100, Math.round((base + trend + noise) * 10) / 10));
}

function varyCpu(base: number): number {
  const spike = Math.random() < 0.15 ? Math.random() * 55 : 0;
  const noise = (Math.random() - 0.5) * 40;

  return Math.max(0, Math.min(100, Math.round((base + noise + spike) * 10) / 10));
}

export class MockDatabaseService extends DatabaseService {
  constructor() {
    // Temporarily clear the singleton guard so we can create a second instance
    // (the real one was already created at module load time).
    (DatabaseService as unknown as { instance: null }).instance = null;

    // Redirect to :memory: for the duration of super() so no file is created.
    const prevDbPath = process.env.DB_PATH;

    process.env.DB_PATH = ":memory:";

    super();

    process.env.DB_PATH = prevDbPath;
  }

  seed(): void {
    const sqlite = (this as unknown as { sqlite: Database.Database }).sqlite;

    // -----------------------------------------------------------------------
    // Services + dashboard positions
    // -----------------------------------------------------------------------
    const COL_GAP = 280;
    const ROW_GAP = 200;
    const COLS = 3;

    const serviceIds: string[] = [];

    for (let i = 0; i < MOCK_CONTAINERS.length; i++) {
      const c = MOCK_CONTAINERS[i];
      const svc = this.saveService({
        name: c.name,
        host: "localhost",
        ports: c.ports,
        checkPort: c.ports[0],
        source: ServiceSource.DOCKER,
        metadata: {
          dockerHostId: MOCK_HOST_ID,
          containerId: MOCK_CONTAINER_IDS.get(c.name)!,
          containerName: c.name,
          image: c.image,
          imageTag: c.imageTag,
          networkNames: ["bridge"],
        },
      });

      serviceIds.push(svc.id!);

      this.saveServicePosition({
        serviceId: svc.id!,
        x: (i % COLS) * COL_GAP + 100,
        y: Math.floor(i / COLS) * ROW_GAP + 80,
      });
    }

    // -----------------------------------------------------------------------
    // Health + resource history: 30-min intervals over 30 days
    // -----------------------------------------------------------------------
    const INTERVAL_MS = 30 * 60_000;
    const DAYS = 30;
    const now = Date.now();
    const start = now - DAYS * 24 * 60 * 60_000;

    const insertHealth = sqlite.prepare(
      "INSERT INTO service_health_history (id, service_id, status, checked_at) VALUES (?, ?, ?, ?)",
    );
    const insertStats = sqlite.prepare(
      "INSERT INTO service_resource_history (id, service_id, cpu_percent, memory_percent, checked_at) VALUES (?, ?, ?, ?, ?)",
    );

    sqlite.transaction(() => {
      for (let i = 0; i < MOCK_CONTAINERS.length; i++) {
        const c = MOCK_CONTAINERS[i];
        const serviceId = serviceIds[i];
        // Spread phases evenly so each container has a distinct graph shape
        const phase = (i / MOCK_CONTAINERS.length) * 2 * Math.PI;

        for (let t = start; t <= now; t += INTERVAL_MS) {
          const ts = new Date(t).toISOString();

          // ~0.5% chance of a DOWN event per interval, then recover next tick
          const status = Math.random() < 0.005 ? ServiceStatus.DOWN : ServiceStatus.UP;

          insertHealth.run(uuidv4(), serviceId, status, ts);

          insertStats.run(
            uuidv4(),
            serviceId,
            varyCpu(c.cpuBase),
            vary(c.memBase, 20, t, phase),
            ts,
          );
        }
      }
    })();
  }
}
