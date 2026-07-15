import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "path";
import { v4 as uuidv4 } from "uuid";

import { ServiceSource, ServiceStatus } from "@shared";

import { overrideConnection, sqlite } from "../../db/connection.js";
import { serviceRepository } from "../../db/serviceRepository.js";
import { DockerService } from "../dockerService.js";
import { MOCK_CONTAINER_IDS, MOCK_CONTAINERS } from "./mockDockerService.js";

const MOCK_HOST = "unix:///var/run/docker.sock";
const MOCK_HOST_ID = DockerService.hostId(MOCK_HOST);

function vary(base: number, variance: number, timeMs: number, phase: number): number {
  const trend = Math.sin(timeMs / (4 * 60 * 60_000) + phase) * (variance * 0.3);
  const noise = (Math.random() - 0.5) * (variance * 0.7);

  return Math.max(0, Math.min(100, Math.round((base + trend + noise) * 10) / 10));
}

function seedMockDatabase(): void {
  // -----------------------------------------------------------------------
  // Services + dashboard positions
  // -----------------------------------------------------------------------
  const COL_GAP = 280;
  const ROW_GAP = 200;
  const COLS = 3;

  const serviceIds: string[] = [];

  for (let i = 0; i < MOCK_CONTAINERS.length; i++) {
    const c = MOCK_CONTAINERS[i];
    const svc = serviceRepository.saveService({
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

    serviceRepository.saveServicePosition({
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

      // Spike state: once entered, persists until randomly exited
      let spikeTarget = 0;
      let inSpike = false;

      for (let t = start; t <= now; t += INTERVAL_MS) {
        const ts = new Date(t).toISOString();

        // ~0.5% chance of a DOWN event per interval, then recover next tick
        const status = Math.random() < 0.005 ? ServiceStatus.DOWN : ServiceStatus.UP;

        insertHealth.run(uuidv4(), serviceId, status, ts);

        // Spike state machine: 2% chance to start, 20% chance to end each interval
        // Average spike duration ~5 intervals (~2.5 hrs), ~1-2 spikes per day
        if (inSpike) {
          if (Math.random() < 0.2) inSpike = false;
        } else if (Math.random() < 0.02) {
          inSpike = true;
          spikeTarget = 80 + Math.random() * 20;
        }

        const cpu = inSpike
          ? spikeTarget + (Math.random() - 0.5) * 10
          : vary(c.cpuBase, 20, t, phase);

        insertStats.run(uuidv4(), serviceId, cpu, vary(c.memBase, 20, t, phase), ts);
      }
    }
  })();
}

export function setupMockDatabase(): void {
  const inMemorySqlite = new Database(":memory:");

  inMemorySqlite.pragma("journal_mode = WAL");
  inMemorySqlite.pragma("foreign_keys = ON");
  migrate(drizzle(inMemorySqlite), { migrationsFolder: path.join(process.cwd(), "drizzle") });

  overrideConnection(inMemorySqlite);
  seedMockDatabase();
}
