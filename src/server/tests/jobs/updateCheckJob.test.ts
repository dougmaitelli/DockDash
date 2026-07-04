import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUpdateCheckerService = vi.hoisted(() => ({
  checkAllServicesForUpdates: vi.fn(),
}));

const mockConfig = vi.hoisted(() => ({
  updateCheckInterval: 3600000,
}));

const mockLogger = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));

vi.mock("@server/services/updateCheckerService.js", () => ({
  updateCheckerService: mockUpdateCheckerService,
}));

vi.mock("@server/lib/config.js", () => ({ config: mockConfig }));

vi.mock("@server/lib/logService.js", () => ({ logger: mockLogger }));

const { UpdateCheckJob } = await import("@server/jobs/UpdateCheckJob.js");

describe("UpdateCheckJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("has runImmediately = true", () => {
    const job = new UpdateCheckJob();

    expect(job.runImmediately).toBe(true);
  });

  it("calls updateCheckerService.checkAllServicesForUpdates() when run()", async () => {
    mockUpdateCheckerService.checkAllServicesForUpdates.mockResolvedValue(undefined);
    const job = new UpdateCheckJob();

    await job.run();

    expect(mockUpdateCheckerService.checkAllServicesForUpdates).toHaveBeenCalledOnce();
  });

  it("logs start and done messages", async () => {
    mockUpdateCheckerService.checkAllServicesForUpdates.mockResolvedValue(undefined);
    const job = new UpdateCheckJob();

    await job.run();

    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining("starting"));
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining("done"));
  });
});
