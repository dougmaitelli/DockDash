import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockLogger = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));

vi.mock("@server/lib/logService.js", () => ({ logger: mockLogger }));

const { BackgroundJob } = await import("@server/jobs/BackgroundJob.js");

class TestJob extends BackgroundJob {
  readonly name = "TestJob";
  readonly intervalMs = 1000;
  readonly run = vi.fn();
}

class ImmediateJob extends BackgroundJob {
  readonly name = "ImmediateJob";
  readonly intervalMs = 1000;
  override readonly runImmediately = true;
  readonly run = vi.fn();
}

describe("BackgroundJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => vi.useRealTimers());

  it("does not run immediately when runImmediately is false", () => {
    const job = new TestJob();

    job.start();
    expect(job.run).not.toHaveBeenCalled();
  });

  it("runs after the interval elapses", async () => {
    const job = new TestJob();

    job.run.mockResolvedValue(undefined);
    job.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(job.run).toHaveBeenCalledOnce();
  });

  it("runs immediately when runImmediately is true", () => {
    // execute() calls run() synchronously before the first await, so no timer
    // advancement is needed — the call is observable right after start().
    const job = new ImmediateJob();

    job.run.mockReturnValue(undefined);
    job.start();
    expect(job.run).toHaveBeenCalledOnce();
  });

  it("reschedules itself after each execution", async () => {
    const job = new TestJob();

    job.run.mockResolvedValue(undefined);
    job.start();
    await vi.advanceTimersByTimeAsync(2100);
    expect(job.run).toHaveBeenCalledTimes(2);
  });

  it("logs the error and does not throw when run() rejects", async () => {
    const job = new TestJob();

    job.run.mockRejectedValue(new Error("boom"));
    job.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining("boom"));
  });

  it("continues scheduling after a failed execution", async () => {
    const job = new TestJob();

    job.run.mockRejectedValueOnce(new Error("first failure")).mockResolvedValue(undefined);
    job.start();
    await vi.advanceTimersByTimeAsync(2100);
    expect(job.run).toHaveBeenCalledTimes(2);
  });
});
