import { beforeEach, describe, expect, it, vi } from "vitest";

const mockHealthCheckService = vi.hoisted(() => ({
  checkAllServices: vi.fn(),
}));

const mockConfig = vi.hoisted(() => ({
  healthCheckInterval: 30000,
}));

const mockLogger = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));

vi.mock("@server/services/healthCheckService.js", () => ({
  healthCheckService: mockHealthCheckService,
}));

vi.mock("@server/lib/config.js", () => ({ config: mockConfig }));

vi.mock("@server/lib/logService.js", () => ({ logger: mockLogger }));

const { HealthCheckJob } = await import("@server/jobs/HealthCheckJob.js");

describe("HealthCheckJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls healthCheckService.checkAllServices() when run()", async () => {
    mockHealthCheckService.checkAllServices.mockResolvedValue({ updated: 0, errors: 0 });
    const job = new HealthCheckJob();

    await job.run();

    expect(mockHealthCheckService.checkAllServices).toHaveBeenCalledOnce();
  });

  it("logs when updated > 0", async () => {
    mockHealthCheckService.checkAllServices.mockResolvedValue({ updated: 3, errors: 0 });
    const job = new HealthCheckJob();

    await job.run();

    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining("3 updated"));
  });

  it("logs when errors > 0", async () => {
    mockHealthCheckService.checkAllServices.mockResolvedValue({ updated: 0, errors: 2 });
    const job = new HealthCheckJob();

    await job.run();

    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining("2 errors"));
  });

  it("does not log when both updated and errors are 0", async () => {
    mockHealthCheckService.checkAllServices.mockResolvedValue({ updated: 0, errors: 0 });
    const job = new HealthCheckJob();

    await job.run();

    expect(mockLogger.info).not.toHaveBeenCalled();
  });
});
