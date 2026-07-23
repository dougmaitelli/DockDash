import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockLogger = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
}));

vi.mock("@server/lib/logService.js", () => ({ logger: mockLogger }));

const { createGracefulShutdown } = await import("@server/lib/gracefulShutdown.js");

describe("createGracefulShutdown", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });

  afterEach(() => {
    vi.useRealTimers();
    process.exitCode = undefined;
  });

  it("stops work, closes resources, then closes the database", async () => {
    const stop = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn((callback: (error?: Error) => void) => callback());
    const closeIdleConnections = vi.fn();
    const closeActiveResources = vi.fn();
    const closeDatabase = vi.fn();
    const shutdown = createGracefulShutdown({
      server: { close, closeIdleConnections } as never,
      jobs: [{ stop }] as never,
      closeActiveResources,
      closeDatabase,
    });

    const first = shutdown("SIGTERM");
    const second = shutdown("SIGINT");

    expect(second).toBe(first);
    await first;
    expect(stop).toHaveBeenCalledOnce();
    expect(closeActiveResources).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(closeIdleConnections).toHaveBeenCalledOnce();
    expect(closeDatabase).toHaveBeenCalledOnce();
  });

  it("logs active-resource and HTTP-close errors but still drains and closes the database", async () => {
    const resourceError = new Error("resource close failed");
    const serverError = new Error("server close failed");
    const closeDatabase = vi.fn();
    const shutdown = createGracefulShutdown({
      server: {
        close: vi.fn((callback: (error?: Error) => void) => callback(serverError)),
        closeIdleConnections: vi.fn(),
      } as never,
      jobs: [],
      startupTasks: [Promise.reject(new Error("startup failed"))],
      closeActiveResources: () => {
        throw resourceError;
      },
      closeDatabase,
    });

    await shutdown("SIGTERM");

    expect(mockLogger.error).toHaveBeenCalledWith(
      "[Shutdown] Failed to close active resources:",
      resourceError,
    );
    expect(mockLogger.error).toHaveBeenCalledWith(
      "[Shutdown] HTTP server close failed:",
      serverError,
    );
    expect(closeDatabase).toHaveBeenCalledOnce();
    expect(process.exitCode).toBeUndefined();
  });

  it("forces open connections closed after the grace period", async () => {
    vi.useFakeTimers();
    const closeAllConnections = vi.fn();
    const closeDatabase = vi.fn();
    const shutdown = createGracefulShutdown({
      server: {
        close: vi.fn(),
        closeAllConnections,
      } as never,
      jobs: [],
      closeActiveResources: vi.fn(),
      closeDatabase,
      timeoutMs: 100,
    });

    const result = shutdown("SIGTERM");

    await vi.advanceTimersByTimeAsync(100);
    await result;
    expect(closeAllConnections).toHaveBeenCalledOnce();
    expect(closeDatabase).toHaveBeenCalledOnce();
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining("100ms"));
  });

  it("marks shutdown failed when final database close throws", async () => {
    const databaseError = new Error("database close failed");
    const closeDatabase = vi.fn(() => {
      throw databaseError;
    });
    const shutdown = createGracefulShutdown({
      server: {
        close: vi.fn((callback: (error?: Error) => void) => callback()),
      } as never,
      jobs: [],
      closeActiveResources: vi.fn(),
      closeDatabase,
    });

    await shutdown("SIGTERM");

    expect(process.exitCode).toBe(1);
    expect(closeDatabase).toHaveBeenCalledTimes(2);
    expect(mockLogger.error).toHaveBeenCalledWith("[Shutdown] Failed:", databaseError);
    expect(mockLogger.error).toHaveBeenCalledWith(
      "[Shutdown] Database close failed:",
      databaseError,
    );
  });
});
