import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = vi.hoisted(() => ({
  cleanOldHistory: vi.fn(),
}));

const mockConfig = vi.hoisted(() => ({
  healthHistoryTtlDays: 30,
}));

const mockLogger = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));

vi.mock("@server/db/historyRepository.js", () => ({ historyRepository: mockDb }));

vi.mock("@server/lib/config.js", () => ({ config: mockConfig }));

vi.mock("@server/lib/logService.js", () => ({ logger: mockLogger }));

const { HistoryCleanupJob } = await import("@server/jobs/HistoryCleanupJob.js");

describe("HistoryCleanupJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls db.cleanOldHistory with config.healthHistoryTtlDays when run()", () => {
    mockDb.cleanOldHistory.mockReturnValue(0);
    const job = new HistoryCleanupJob();

    job.run();

    expect(mockDb.cleanOldHistory).toHaveBeenCalledWith(mockConfig.healthHistoryTtlDays);
  });

  it("logs when removed > 0", () => {
    mockDb.cleanOldHistory.mockReturnValue(5);
    const job = new HistoryCleanupJob();

    job.run();

    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining("5 old entries"));
  });

  it("does not log when removed === 0", () => {
    mockDb.cleanOldHistory.mockReturnValue(0);
    const job = new HistoryCleanupJob();

    job.run();

    expect(mockLogger.info).not.toHaveBeenCalled();
  });
});
