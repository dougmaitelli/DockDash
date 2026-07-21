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

  it("stops future executions", async () => {
    const job = new TestJob();

    job.run.mockResolvedValue(undefined);
    job.start();
    await job.stop();
    await vi.advanceTimersByTimeAsync(2000);
    expect(job.run).not.toHaveBeenCalled();
  });

  it("waits for an active execution to finish when stopped", async () => {
    let finishRun: (() => void) | undefined;
    const job = new ImmediateJob();

    job.run.mockImplementation(() => new Promise<void>((resolve) => (finishRun = resolve)));
    job.start();
    const stopped = job.stop();
    let stopFinished = false;

    void stopped.then(() => (stopFinished = true));
    await Promise.resolve();
    expect(stopFinished).toBe(false);

    finishRun?.();
    await stopped;
    expect(stopFinished).toBe(true);
  });

  it("does not start duplicate schedules", async () => {
    const job = new TestJob();

    job.run.mockResolvedValue(undefined);
    job.start();
    job.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(job.run).toHaveBeenCalledOnce();
  });
});
