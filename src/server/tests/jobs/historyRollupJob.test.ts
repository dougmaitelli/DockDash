import { beforeEach, describe, expect, it, vi } from "vitest";

const mockHistoryRepository = vi.hoisted(() => ({ rollupHistory: vi.fn() }));
const mockLogger = vi.hoisted(() => ({ debug: vi.fn() }));

vi.mock("@server/db/historyRepository.js", () => ({
  historyRepository: mockHistoryRepository,
}));
vi.mock("@server/lib/logService.js", () => ({ logger: mockLogger }));

const { HistoryRollupJob } = await import("@server/jobs/HistoryRollupJob.js");

describe("HistoryRollupJob", () => {
  beforeEach(() => vi.clearAllMocks());

  it("runs immediately every two minutes", () => {
    const job = new HistoryRollupJob();

    expect(job.name).toBe("HistoryRollupJob");
    expect(job.intervalMs).toBe(2 * 60_000);
    expect(job.runImmediately).toBe(true);
  });

  it("delegates history compaction to the repository", () => {
    mockHistoryRepository.rollupHistory.mockReturnValue({ health: 0, resource: 0 });
    const job = new HistoryRollupJob();

    job.run();

    expect(mockHistoryRepository.rollupHistory).toHaveBeenCalledOnce();
  });

  it.each([
    [{ health: 2, resource: 0 }, "2 health, 0 resource"],
    [{ health: 0, resource: 3 }, "0 health, 3 resource"],
    [{ health: 2, resource: 3 }, "2 health, 3 resource"],
  ])("logs non-empty rollup results", (result, message) => {
    mockHistoryRepository.rollupHistory.mockReturnValue(result);
    const job = new HistoryRollupJob();

    job.run();

    expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining(message));
  });

  it("does not log an empty rollup", () => {
    mockHistoryRepository.rollupHistory.mockReturnValue({ health: 0, resource: 0 });
    const job = new HistoryRollupJob();

    job.run();

    expect(mockLogger.debug).not.toHaveBeenCalled();
  });
});
