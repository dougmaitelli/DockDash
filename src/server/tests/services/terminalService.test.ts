import { PassThrough } from "stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockUuid = vi.hoisted(() => vi.fn(() => "terminal-id"));

vi.mock("uuid", () => ({ v4: mockUuid }));

async function freshService() {
  vi.resetModules();

  return (await import("@server/services/terminalService.js")).terminalService;
}

describe("TerminalService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens a shell with the requested terminal dimensions", async () => {
    const stream = new PassThrough();
    const start = vi.fn().mockResolvedValue(stream);
    const exec = vi.fn().mockResolvedValue({ start });
    const service = await freshService();

    await expect(service.openSession("owner", { exec } as never, 120, 40)).resolves.toMatchObject({
      sessionId: "terminal-id",
      stream,
    });
    expect(exec).toHaveBeenCalledWith(
      expect.objectContaining({
        Tty: true,
        Env: ["COLUMNS=120", "LINES=40"],
      }),
    );
    expect(service.getSession("owner", "terminal-id")?.stream).toBe(stream);
    expect(service.getSession("other", "terminal-id")).toBeUndefined();
    service.shutdown();
  });

  it("sanitizes errors while opening a shell", async () => {
    const service = await freshService();
    const container = { exec: vi.fn().mockRejectedValue(new Error("docker socket failed")) };

    await expect(service.openSession("owner", container as never, 80, 24)).rejects.toThrow();
    service.shutdown();
  });

  it("touches, closes, and expires owned sessions", async () => {
    const firstStream = new PassThrough();
    const secondStream = new PassThrough();
    const streams = [firstStream, secondStream];
    const exec = vi.fn().mockImplementation(async () => ({
      start: vi.fn().mockResolvedValue(streams.shift()),
    }));
    const service = await freshService();

    mockUuid.mockReturnValueOnce("first").mockReturnValueOnce("second");
    await service.openSession("owner", { exec } as never, 80, 24);
    await vi.advanceTimersByTimeAsync(9 * 60_000);
    service.touch("first");
    await service.openSession("owner", { exec } as never, 80, 24);
    await vi.advanceTimersByTimeAsync(2 * 60_000);

    expect(service.getSession("owner", "first")).toBeDefined();
    expect(service.getSession("owner", "second")).toBeDefined();

    service.closeSession("first");
    expect(service.getSession("owner", "first")).toBeUndefined();
    await vi.advanceTimersByTimeAsync(9 * 60_000);
    expect(service.getSession("owner", "second")).toBeUndefined();
    service.shutdown();
  });

  it("shutdown closes every active stream", async () => {
    const streams = [new PassThrough(), new PassThrough()];
    const endSpies = streams.map((stream) => vi.spyOn(stream, "end"));
    const exec = vi.fn().mockImplementation(async () => ({
      start: vi.fn().mockResolvedValue(streams.shift()),
    }));
    const service = await freshService();

    mockUuid.mockReturnValueOnce("one").mockReturnValueOnce("two");
    await service.openSession("owner", { exec } as never, 80, 24);
    await service.openSession("owner", { exec } as never, 80, 24);
    service.shutdown();

    endSpies.forEach((spy) => expect(spy).toHaveBeenCalled());
  });
});
