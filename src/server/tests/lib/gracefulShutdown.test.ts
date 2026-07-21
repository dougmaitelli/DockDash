import { beforeEach, describe, expect, it, vi } from "vitest";

const mockLogger = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
}));

vi.mock("@server/lib/logService.js", () => ({ logger: mockLogger }));

const { createGracefulShutdown } = await import("@server/lib/gracefulShutdown.js");

describe("createGracefulShutdown", () => {
  beforeEach(() => vi.clearAllMocks());

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
    vi.useRealTimers();
  });
});
