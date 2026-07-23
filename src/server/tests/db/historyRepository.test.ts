import type { HistoryRepository } from "@server/db/historyRepository.js";
import type { ServiceRepository } from "@server/db/serviceRepository.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ServiceSource, ServiceStatus } from "@shared";

let svcRepo: ServiceRepository;
let histRepo: HistoryRepository;
let connSqlite: { close(): void };

beforeEach(async () => {
  vi.resetModules();
  process.env.DB_PATH = ":memory:";
  // Import connection first so the in-memory DB is created before the
  // repositories bind to it, then capture the sqlite handle for cleanup.
  const connMod = await import("@server/db/connection.js");

  connSqlite = connMod.sqlite;
  svcRepo = (await import("@server/db/serviceRepository.js")).serviceRepository;
  histRepo = (await import("@server/db/historyRepository.js")).historyRepository;
});

afterEach(() => {
  try {
    // Close in-memory database so the next test gets a fresh one
    connSqlite.close();
  } catch {}
  delete process.env.DB_PATH;
});

describe("addHealthHistory / getHealthHistory", () => {
  it("returns only empty buckets when no history exists", () => {
    expect(histRepo.getHealthHistory("missing", 1, 4)).toEqual([null, null, null, null]);
  });

  it("returns a non-null bucket after adding history", () => {
    const svc = svcRepo.saveService({
      name: "s",
      host: "h",
      ports: [],
      source: ServiceSource.NETWORK,
    });

    histRepo.addHealthHistory(svc.id!, ServiceStatus.UP);

    const buckets = histRepo.getHealthHistory(svc.id!, 1, 90);

    expect(buckets.some((b) => b !== null)).toBe(true);
  });

  it("mixed UP and DOWN in the same bucket yields 'mixed'", () => {
    const svc = svcRepo.saveService({
      name: "s",
      host: "h",
      ports: [],
      source: ServiceSource.NETWORK,
    });

    histRepo.addHealthHistory(svc.id!, ServiceStatus.UP);
    histRepo.addHealthHistory(svc.id!, ServiceStatus.DOWN);

    // Use a single bucket so both records land in it
    const buckets = histRepo.getHealthHistory(svc.id!, 1, 1);

    expect(buckets[0]).toBe("mixed");
  });

  it("preserves UNKNOWN-only buckets", () => {
    const svc = svcRepo.saveService({
      name: "s",
      host: "h",
      ports: [],
      source: ServiceSource.NETWORK,
    });

    histRepo.addHealthHistory(svc.id!, ServiceStatus.UNKNOWN);

    expect(histRepo.getHealthHistory(svc.id!, 1, 1)).toEqual([ServiceStatus.UNKNOWN]);
  });
});

describe("addResourceStatsHistory / getResourceHistory", () => {
  it("returns only empty buckets when no resource history exists", () => {
    expect(histRepo.getResourceHistory("missing", 1, 3)).toEqual([null, null, null]);
  });

  it("returns a non-null bucket after adding resource stats", () => {
    const svc = svcRepo.saveService({
      name: "s",
      host: "h",
      ports: [],
      source: ServiceSource.NETWORK,
    });

    histRepo.addResourceStatsHistory(svc.id!, 50, 60);

    const buckets = histRepo.getResourceHistory(svc.id!, 1, 90);

    expect(buckets.some((b) => b !== null)).toBe(true);
  });

  it("averages multiple samples within the same display bucket", () => {
    const svc = svcRepo.saveService({
      name: "s",
      host: "h",
      ports: [],
      source: ServiceSource.NETWORK,
    });

    histRepo.addResourceStatsHistory(svc.id!, 40, 60);
    histRepo.addResourceStatsHistory(svc.id!, 60, 80);

    // Both records land in the last bucket → average: (40+60)/2=50 cpu, (60+80)/2=70 mem
    const buckets = histRepo.getResourceHistory(svc.id!, 1, 1);

    expect(buckets[0]).toMatchObject({ cpuPercent: 50, memoryPercent: 70 });
  });
});

describe("cleanOldHistory", () => {
  it("removes raw records older than the TTL", async () => {
    const svc = svcRepo.saveService({
      name: "s",
      host: "h",
      ports: [],
      source: ServiceSource.NETWORK,
    });

    histRepo.addHealthHistory(svc.id!, ServiceStatus.UP);
    histRepo.addResourceStatsHistory(svc.id!, 10, 20);

    // Ensure the records' timestamps are strictly before the cutoff (Date.now())
    await new Promise((r) => setTimeout(r, 5));

    const deleted = histRepo.cleanOldHistory(0);

    expect(deleted).toBeGreaterThanOrEqual(2);
  });

  it("preserves records within the TTL", () => {
    const svc = svcRepo.saveService({
      name: "s",
      host: "h",
      ports: [],
      source: ServiceSource.NETWORK,
    });

    histRepo.addHealthHistory(svc.id!, ServiceStatus.UP);
    histRepo.addResourceStatsHistory(svc.id!, 10, 20);

    // 30-day TTL — the records we just added are within the window
    const deleted = histRepo.cleanOldHistory(30);

    expect(deleted).toBe(0);
  });

  it("TTLs rollup rows as well as any stray raw records", async () => {
    const svc = svcRepo.saveService({
      name: "s",
      host: "h",
      ports: [],
      source: ServiceSource.NETWORK,
    });

    histRepo.addHealthHistory(svc.id!, ServiceStatus.UP);
    histRepo.addResourceStatsHistory(svc.id!, 10, 20);
    await new Promise((r) => setTimeout(r, 5));

    histRepo.rollupHistory(); // moves records to rollup tables
    await new Promise((r) => setTimeout(r, 5));

    const deleted = histRepo.cleanOldHistory(0); // TTL = 0 days → everything is expired

    expect(deleted).toBeGreaterThanOrEqual(2); // at least one health rollup + one resource rollup row
  });
});

describe("rollupHistory", () => {
  it("compacts raw health records older than the current bucket into rollup rows", () => {
    const svc = svcRepo.saveService({
      name: "s",
      host: "h",
      ports: [],
      source: ServiceSource.NETWORK,
    });

    histRepo.addHealthHistory(svc.id!, ServiceStatus.UP);

    // Advance simulated time by 6 minutes so the record falls in a past bucket
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 6 * 60_000);

    try {
      const { health } = histRepo.rollupHistory();

      expect(health).toBe(1);

      // Record was deleted from raw but still visible via rollup
      const buckets = histRepo.getHealthHistory(svc.id!, 1, 1);

      expect(buckets[0]).toBe(ServiceStatus.UP);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not roll up records in the current open 5-minute bucket", () => {
    const svc = svcRepo.saveService({
      name: "s",
      host: "h",
      ports: [],
      source: ServiceSource.NETWORK,
    });

    histRepo.addHealthHistory(svc.id!, ServiceStatus.UP);

    // cutoff = floor(now / 5min) * 5min — record's checkedAt is NOW, which
    // equals the cutoff exactly, so it must stay in raw
    const { health } = histRepo.rollupHistory();

    expect(health).toBe(0);
  });

  it("compacts raw resource records and deletes them", () => {
    const svc = svcRepo.saveService({
      name: "s",
      host: "h",
      ports: [],
      source: ServiceSource.NETWORK,
    });

    histRepo.addResourceStatsHistory(svc.id!, 50, 60);

    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 6 * 60_000);

    try {
      const { resource } = histRepo.rollupHistory();

      expect(resource).toBe(1);

      // Record deleted from raw but still visible via rollup
      const buckets = histRepo.getResourceHistory(svc.id!, 1, 1);
      const filled = buckets.find((b) => b !== null);

      expect(filled).toBeDefined();
      expect(filled!.cpuPercent).toBe(50);
      expect(filled!.memoryPercent).toBe(60);
    } finally {
      vi.useRealTimers();
    }
  });

  it("accumulates counts correctly when two health records land in the same rollup bucket", async () => {
    const svc = svcRepo.saveService({
      name: "s",
      host: "h",
      ports: [],
      source: ServiceSource.NETWORK,
    });

    histRepo.addHealthHistory(svc.id!, ServiceStatus.UP);
    histRepo.addHealthHistory(svc.id!, ServiceStatus.DOWN);
    await new Promise((r) => setTimeout(r, 5));

    histRepo.rollupHistory();

    const buckets = histRepo.getHealthHistory(svc.id!, 1, 1);

    expect(buckets[0]).toBe("mixed");
  });

  it("rolls up UNKNOWN health records", () => {
    const svc = svcRepo.saveService({
      name: "s",
      host: "h",
      ports: [],
      source: ServiceSource.NETWORK,
    });
    const now = Date.now();

    vi.useFakeTimers();

    try {
      vi.setSystemTime(now - 6 * 60_000);
      histRepo.addHealthHistory(svc.id!, ServiceStatus.UNKNOWN);
      vi.setSystemTime(now);

      expect(histRepo.rollupHistory().health).toBe(1);
      expect(histRepo.getHealthHistory(svc.id!, 1, 1)).toEqual([ServiceStatus.UNKNOWN]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("accumulates multiple resource samples in one rollup bucket", () => {
    const svc = svcRepo.saveService({
      name: "s",
      host: "h",
      ports: [],
      source: ServiceSource.NETWORK,
    });
    const now = Date.now();

    vi.useFakeTimers();

    try {
      vi.setSystemTime(now - 6 * 60_000);
      histRepo.addResourceStatsHistory(svc.id!, 20, 40);
      histRepo.addResourceStatsHistory(svc.id!, 60, 80);
      vi.setSystemTime(now);

      expect(histRepo.rollupHistory().resource).toBe(2);
      expect(histRepo.getResourceHistory(svc.id!, 1, 1)).toEqual([
        { cpuPercent: 40, memoryPercent: 60 },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("getHealthHistory returns data from both rollup rows and the unrolled raw tail", () => {
    const svc = svcRepo.saveService({
      name: "s",
      host: "h",
      ports: [],
      source: ServiceSource.NETWORK,
    });

    const now = Date.now();

    vi.useFakeTimers();

    try {
      // Write UP record 20 minutes ago so it lands in an earlier display bucket
      vi.setSystemTime(now - 20 * 60_000);
      histRepo.addHealthHistory(svc.id!, ServiceStatus.UP);

      // Advance to "now" and roll up — the record is safely in a past 5-min bucket
      vi.setSystemTime(now);
      histRepo.rollupHistory();

      // Write DOWN record now (current open bucket — stays in raw)
      histRepo.addHealthHistory(svc.id!, ServiceStatus.DOWN);

      // 1 day / 90 buckets → 16 min per display bucket
      // UP rollup (bucketStart ≈ now - 20min) → idx ≈ 88
      // DOWN raw  (checkedAt  = now)           → idx = 89 (last)
      const buckets = histRepo.getHealthHistory(svc.id!, 1, 90);

      expect(buckets[88]).toBe(ServiceStatus.UP); // from rollup table
      expect(buckets[89]).toBe(ServiceStatus.DOWN); // from raw table
    } finally {
      vi.useRealTimers();
    }
  });

  it("getResourceHistory returns data from both rollup rows and the unrolled raw tail", () => {
    const svc = svcRepo.saveService({
      name: "s",
      host: "h",
      ports: [],
      source: ServiceSource.NETWORK,
    });

    const now = Date.now();

    vi.useFakeTimers();

    try {
      vi.setSystemTime(now - 20 * 60_000);
      histRepo.addResourceStatsHistory(svc.id!, 50, 60);

      vi.setSystemTime(now);
      histRepo.rollupHistory();

      histRepo.addResourceStatsHistory(svc.id!, 80, 90);

      const buckets = histRepo.getResourceHistory(svc.id!, 1, 90);

      expect(buckets[88]).toMatchObject({ cpuPercent: 50, memoryPercent: 60 }); // from rollup
      expect(buckets[89]).toMatchObject({ cpuPercent: 80, memoryPercent: 90 }); // from raw
    } finally {
      vi.useRealTimers();
    }
  });
});
