import { beforeEach, describe, expect, it, vi } from "vitest";

const mockConfig = vi.hoisted(() => ({ resourceMonitorInterval: 12_345 }));
const mockResourceStatsService = vi.hoisted(() => ({ fetchAndCacheAllStats: vi.fn() }));

vi.mock("@server/lib/config.js", () => ({ config: mockConfig }));
vi.mock("@server/services/resourceStatsService.js", () => ({
  resourceStatsService: mockResourceStatsService,
}));

const { ResourceStatsJob } = await import("@server/jobs/ResourceStatsJob.js");

describe("ResourceStatsJob", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the configured resource-monitor interval", () => {
    const job = new ResourceStatsJob();

    expect(job.name).toBe("ResourceStatsJob");
    expect(job.intervalMs).toBe(12_345);
    expect(job.runImmediately).toBe(false);
  });

  it("waits for resource statistics collection", async () => {
    let resolveCollection!: () => void;
    const collection = new Promise<void>((resolve) => {
      resolveCollection = resolve;
    });

    mockResourceStatsService.fetchAndCacheAllStats.mockReturnValue(collection);
    const job = new ResourceStatsJob();
    const run = job.run();

    expect(mockResourceStatsService.fetchAndCacheAllStats).toHaveBeenCalledOnce();
    let settled = false;

    void run.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    resolveCollection();
    await run;
    expect(settled).toBe(true);
  });

  it("propagates collection failures to BackgroundJob", async () => {
    mockResourceStatsService.fetchAndCacheAllStats.mockRejectedValue(new Error("stats failed"));
    const job = new ResourceStatsJob();

    await expect(job.run()).rejects.toThrow("stats failed");
  });
});
