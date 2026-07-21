import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ServiceSource, ServiceStatus } from "@shared";

const mockDb = vi.hoisted(() => ({
  getServices: vi.fn(),
  addResourceStatsHistory: vi.fn(),
}));

const mockDockerService = vi.hoisted(() => ({
  getContainerForServiceId: vi.fn(),
  getContainerStats: vi.fn(),
}));

const mockNotificationService = vi.hoisted(() => ({
  notify: vi.fn().mockResolvedValue(undefined),
  configured: true,
}));

const mockConfig = vi.hoisted(() => ({
  resourceMonitorEnabled: true,
  cpuSpikeThreshold: 90,
  memorySpikeThreshold: 90,
  spikeDurationThreshold: 0,
}));

vi.mock("@server/lib/config.js", () => ({ config: mockConfig }));
vi.mock("@server/db/serviceRepository.js", () => ({ serviceRepository: mockDb }));
vi.mock("@server/db/historyRepository.js", () => ({ historyRepository: mockDb }));
vi.mock("@server/services/dockerService.js", () => ({ dockerService: mockDockerService }));
vi.mock("@server/services/notificationService.js", () => ({
  notificationService: mockNotificationService,
}));
vi.mock("@server/i18n/index.js", () => ({ t: vi.fn((key: string) => key) }));

const { resourceStatsService } = await import("@server/services/resourceStatsService.js");

const BASE_STATS = {
  cpuPercent: 50,
  memoryUsed: 0,
  memoryLimit: 1_000_000_000,
  memoryPercent: 50,
  networkRx: 0,
  networkTx: 0,
  blockRead: 0,
  blockWrite: 0,
};
const CPU_SPIKE_STATS = { ...BASE_STATS, cpuPercent: 95 };
const MEM_SPIKE_STATS = { ...BASE_STATS, memoryPercent: 95 };
const NORMAL_STATS = BASE_STATS;

function makeDockerSvc(id: string) {
  return {
    id,
    name: "nginx",
    host: "localhost",
    ports: [],
    source: ServiceSource.DOCKER,
    status: ServiceStatus.UP,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: { containerName: "nginx", imageTag: "1.25" },
  };
}

function setupDockerEnv(svc: ReturnType<typeof makeDockerSvc>) {
  mockDb.getServices.mockReturnValue([svc]);
  mockDockerService.getContainerForServiceId.mockReturnValue({});
}

describe("ResourceStatsService.fetchAndCacheAllStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig.resourceMonitorEnabled = true;
    mockConfig.cpuSpikeThreshold = 90;
    mockConfig.memorySpikeThreshold = 90;
    mockConfig.spikeDurationThreshold = 0;
    mockNotificationService.configured = true;
    mockNotificationService.notify.mockResolvedValue(undefined);
  });

  afterEach(() => vi.clearAllMocks());

  it("returns early without fetching stats when resourceMonitorEnabled is false", async () => {
    mockConfig.resourceMonitorEnabled = false;
    setupDockerEnv(makeDockerSvc("svc-disabled"));

    await resourceStatsService.fetchAndCacheAllStats();

    expect(mockDockerService.getContainerStats).not.toHaveBeenCalled();
    expect(mockDb.addResourceStatsHistory).not.toHaveBeenCalled();
  });

  it("populates latestStats cache and writes resource history", async () => {
    const svc = makeDockerSvc("svc-cache");

    setupDockerEnv(svc);
    mockDockerService.getContainerStats.mockResolvedValue({
      ...NORMAL_STATS,
      cpuPercent: 42,
      memoryPercent: 55,
    });

    await resourceStatsService.fetchAndCacheAllStats();

    expect(resourceStatsService.getLatestStats().get("svc-cache")).toMatchObject({
      cpuPercent: 42,
      memoryPercent: 55,
    });
    expect(mockDb.addResourceStatsHistory).toHaveBeenCalledWith("svc-cache", 42, 55);
  });

  it("fetches container stats concurrently so one slow container cannot delay the rest", async () => {
    const first = makeDockerSvc("svc-slow");
    const second = makeDockerSvc("svc-fast");
    let resolveSlow: ((stats: typeof NORMAL_STATS) => void) | undefined;

    mockDb.getServices.mockReturnValue([first, second]);
    mockDockerService.getContainerForServiceId.mockImplementation((id: string) => ({ id }));
    mockDockerService.getContainerStats.mockImplementation(({ id }: { id: string }) => {
      if (id === "svc-slow") {
        return new Promise((resolve) => {
          resolveSlow = resolve;
        });
      }

      return Promise.resolve({ ...NORMAL_STATS, cpuPercent: 75 });
    });

    const refresh = resourceStatsService.fetchAndCacheAllStats();

    await vi.waitFor(() => {
      expect(resourceStatsService.getLatestStats().get("svc-fast")?.cpuPercent).toBe(75);
    });

    resolveSlow?.(NORMAL_STATS);
    await refresh;
  });

  it("skips non-Docker services", async () => {
    mockDb.getServices.mockReturnValue([
      {
        id: "net-1",
        source: ServiceSource.NETWORK,
        name: "proxy",
        host: "192.168.1.1",
        ports: [80],
        status: ServiceStatus.UP,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);

    await resourceStatsService.fetchAndCacheAllStats();

    expect(mockDockerService.getContainerStats).not.toHaveBeenCalled();
  });

  it("logs and continues when getContainerStats throws", async () => {
    setupDockerEnv(makeDockerSvc("svc-err"));
    mockDockerService.getContainerStats.mockRejectedValue(new Error("Docker unavailable"));

    await expect(resourceStatsService.fetchAndCacheAllStats()).resolves.not.toThrow();
    expect(mockDb.addResourceStatsHistory).not.toHaveBeenCalled();
  });

  it("skips spike notifications when Apprise is not configured", async () => {
    mockNotificationService.configured = false;
    const svc = makeDockerSvc("svc-no-apprise");

    setupDockerEnv(svc);
    mockDockerService.getContainerStats.mockResolvedValue(CPU_SPIKE_STATS);

    await resourceStatsService.fetchAndCacheAllStats();

    expect(mockDockerService.getContainerStats).toHaveBeenCalled();
    expect(mockNotificationService.notify).not.toHaveBeenCalled();
  });

  it("skips CPU spike notifications when CPU threshold is 0", async () => {
    mockConfig.cpuSpikeThreshold = 0;
    const svc = makeDockerSvc("cpu-threshold-zero");

    setupDockerEnv(svc);
    mockDockerService.getContainerStats.mockResolvedValue(CPU_SPIKE_STATS);

    await resourceStatsService.fetchAndCacheAllStats();

    expect(mockNotificationService.notify).not.toHaveBeenCalled();
  });

  it("skips memory spike notifications when memory threshold is 0", async () => {
    mockConfig.memorySpikeThreshold = 0;
    const svc = makeDockerSvc("mem-threshold-zero");

    setupDockerEnv(svc);
    mockDockerService.getContainerStats.mockResolvedValue(MEM_SPIKE_STATS);

    await resourceStatsService.fetchAndCacheAllStats();

    expect(mockNotificationService.notify).not.toHaveBeenCalled();
  });

  it("CPU: sends warning on spike, suppresses while sustained, sends recovery when resolved", async () => {
    const svc = makeDockerSvc("cpu-lifecycle");

    setupDockerEnv(svc);

    // Run 1: CPU normal → no notification
    mockDockerService.getContainerStats.mockResolvedValue(NORMAL_STATS);
    await resourceStatsService.fetchAndCacheAllStats();
    expect(mockNotificationService.notify).not.toHaveBeenCalled();

    // Run 2: CPU spikes → warning
    mockDockerService.getContainerStats.mockResolvedValue(CPU_SPIKE_STATS);
    await resourceStatsService.fetchAndCacheAllStats();
    expect(mockNotificationService.notify).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      "warning",
    );

    vi.clearAllMocks();
    mockNotificationService.notify.mockResolvedValue(undefined);

    // Run 3: CPU still spiking → no repeat notification
    await resourceStatsService.fetchAndCacheAllStats();
    expect(mockNotificationService.notify).not.toHaveBeenCalled();

    // Run 4: CPU recovers → recovery notification
    mockDockerService.getContainerStats.mockResolvedValue(NORMAL_STATS);
    await resourceStatsService.fetchAndCacheAllStats();
    expect(mockNotificationService.notify).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      "success",
    );
  });

  it("Memory: sends warning on spike, suppresses while sustained, sends recovery when resolved", async () => {
    const svc = makeDockerSvc("mem-lifecycle");

    setupDockerEnv(svc);

    // Run 1: memory normal → no notification
    mockDockerService.getContainerStats.mockResolvedValue(NORMAL_STATS);
    await resourceStatsService.fetchAndCacheAllStats();
    expect(mockNotificationService.notify).not.toHaveBeenCalled();

    // Run 2: memory spikes → warning
    mockDockerService.getContainerStats.mockResolvedValue(MEM_SPIKE_STATS);
    await resourceStatsService.fetchAndCacheAllStats();
    expect(mockNotificationService.notify).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      "warning",
    );

    vi.clearAllMocks();
    mockNotificationService.notify.mockResolvedValue(undefined);

    // Run 3: memory still spiking → no repeat notification
    await resourceStatsService.fetchAndCacheAllStats();
    expect(mockNotificationService.notify).not.toHaveBeenCalled();

    // Run 4: memory recovers → recovery notification
    mockDockerService.getContainerStats.mockResolvedValue(NORMAL_STATS);
    await resourceStatsService.fetchAndCacheAllStats();
    expect(mockNotificationService.notify).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      "success",
    );
  });

  it("CPU: suppresses alert until threshold is exceeded for the configured duration", async () => {
    mockConfig.spikeDurationThreshold = 300; // 300 s debounce
    const svc = makeDockerSvc("cpu-duration-debounce");

    setupDockerEnv(svc);
    vi.useFakeTimers();

    try {
      // Run 1: CPU spikes but duration has not elapsed → no alert
      mockDockerService.getContainerStats.mockResolvedValue(CPU_SPIKE_STATS);
      await resourceStatsService.fetchAndCacheAllStats();
      expect(mockNotificationService.notify).not.toHaveBeenCalled();

      // Run 2: CPU still spiking, only 60 s elapsed → still no alert
      vi.advanceTimersByTime(60_000);
      await resourceStatsService.fetchAndCacheAllStats();
      expect(mockNotificationService.notify).not.toHaveBeenCalled();

      // Run 3: 300 s elapsed → alert fires
      vi.advanceTimersByTime(240_000);
      await resourceStatsService.fetchAndCacheAllStats();
      expect(mockNotificationService.notify).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        "warning",
      );

      vi.clearAllMocks();
      mockNotificationService.notify.mockResolvedValue(undefined);

      // Run 4: CPU recovers → recovery notification
      mockDockerService.getContainerStats.mockResolvedValue(NORMAL_STATS);
      await resourceStatsService.fetchAndCacheAllStats();
      expect(mockNotificationService.notify).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        "success",
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("CPU: a brief spike that drops before the duration elapses sends no alert and no recovery", async () => {
    mockConfig.spikeDurationThreshold = 300;
    const svc = makeDockerSvc("cpu-brief-spike");

    setupDockerEnv(svc);
    vi.useFakeTimers();

    try {
      // Spike detected
      mockDockerService.getContainerStats.mockResolvedValue(CPU_SPIKE_STATS);
      await resourceStatsService.fetchAndCacheAllStats();
      expect(mockNotificationService.notify).not.toHaveBeenCalled();

      // Drops before duration elapses (only 10 s in)
      vi.advanceTimersByTime(10_000);
      mockDockerService.getContainerStats.mockResolvedValue(NORMAL_STATS);
      await resourceStatsService.fetchAndCacheAllStats();

      // No alert and no recovery sent
      expect(mockNotificationService.notify).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
