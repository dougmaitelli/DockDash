import { DOCKER_STREAM_HEADER_SIZE } from "@server/services/dockerService.js";
import { fileService } from "@server/services/fileService.js";
import { PassThrough, Readable } from "stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

function dockerFrame(type: 1 | 2, text: string): Buffer {
  const payload = Buffer.from(text);
  const header = Buffer.alloc(DOCKER_STREAM_HEADER_SIZE);

  header[0] = type;
  header.writeUInt32BE(payload.length, 4);

  return Buffer.concat([header, payload]);
}

function streamFrom(...chunks: Buffer[]): PassThrough {
  const stream = new PassThrough();

  queueMicrotask(() => {
    chunks.forEach((chunk) => stream.write(chunk));
    stream.end();
  });

  return stream;
}

function mockContainer(stream?: PassThrough) {
  const start = vi.fn().mockResolvedValue(stream);
  const exec = vi.fn().mockResolvedValue({ start });
  const inspect = vi.fn().mockResolvedValue({ State: { Running: true } });
  const putArchive = vi.fn();

  return { container: { inspect, exec, putArchive } as never, inspect, exec, start, putArchive };
}

describe("FileService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists and classifies files from multiplexed Docker output", async () => {
    const output = [
      "total 12",
      "drwxr-xr-x 2 root root 4096 Jul 22 12:00 .",
      "drwxr-xr-x 1 root root 4096 Jul 22 12:00 ..",
      "drwxr-xr-x 2 root root 4096 Jul 22 12:00 config dir",
      "-rw-r--r-- 1 root root 12 Jul 22 12:01 app config.yml",
      "lrwxrwxrwx 1 root root 8 Jul 22 12:02 current -> releases/v2",
      "prw-r--r-- 1 root root nope Jul 22 12:03 pipe",
      "malformed",
      "",
    ].join("\n");
    const { container, exec } = mockContainer(streamFrom(dockerFrame(1, output)));

    await expect(fileService.listFiles(container, "/app")).resolves.toEqual([
      expect.objectContaining({ name: "config dir", type: "directory", size: 4096 }),
      expect.objectContaining({ name: "app config.yml", type: "file", size: 12 }),
      expect.objectContaining({ name: "current", type: "symlink", size: 8 }),
      expect.objectContaining({ name: "pipe", type: "other", size: 0 }),
    ]);
    expect(exec).toHaveBeenCalledWith(
      expect.objectContaining({ Cmd: ["ls", "-la", "--", "/app"] }),
    );
  });

  it("surfaces stderr when listing fails", async () => {
    const { container } = mockContainer(streamFrom(dockerFrame(2, "permission denied\n")));

    await expect(fileService.listFiles(container, "/root")).rejects.toThrow("permission denied");
  });

  it("reads empty and non-empty files", async () => {
    const populated = mockContainer(streamFrom(dockerFrame(1, "hello\n")));

    await expect(fileService.readFile(populated.container, "/tmp/a")).resolves.toEqual({
      path: "/tmp/a",
      content: "hello\n",
    });

    const empty = mockContainer(streamFrom(dockerFrame(1, "")));

    await expect(fileService.readFile(empty.container, "/tmp/empty")).resolves.toEqual({
      path: "/tmp/empty",
      content: "",
    });
  });

  it("rejects operations against stopped containers", async () => {
    const { container, inspect } = mockContainer();

    inspect.mockResolvedValue({ State: { Running: false } });
    await expect(fileService.listFiles(container, "/")).rejects.toThrow("Container is not running");
  });

  it("rejects malformed Docker streams", async () => {
    const stream = new PassThrough();
    const { container } = mockContainer(stream);

    queueMicrotask(() => stream.destroy(new Error("stream failed")));
    await expect(fileService.readFile(container, "/tmp/a")).rejects.toThrow("stream failed");
  });

  it("writes a valid tar archive to the containing directory", async () => {
    const { container, putArchive } = mockContainer();
    let archive = Buffer.alloc(0);

    putArchive.mockImplementation(
      (input: Readable, options: { path: string }, callback: (error: Error | null) => void) => {
        expect(options).toEqual({ path: "/etc/app" });
        input.on("data", (chunk) => {
          archive = Buffer.concat([archive, chunk]);
        });
        input.on("end", () => callback(null));
      },
    );

    await fileService.writeFile(container, "/etc/app/config.yml", "enabled: true\n");

    expect(archive.subarray(0, 100).toString("utf8")).toContain("config.yml");
    expect(archive.subarray(257, 263).toString("utf8")).toBe("ustar\0");
    expect(archive.length % 512).toBe(0);
    expect(archive.toString("utf8")).toContain("enabled: true");
  });

  it("sanitizes archive upload errors", async () => {
    const { container, putArchive } = mockContainer();

    putArchive.mockImplementation(
      (_input: Readable, _options: unknown, callback: (error: Error) => void) =>
        callback(new Error("socket /var/run/docker.sock failed")),
    );

    await expect(fileService.writeFile(container, "/config", "x")).rejects.toThrow();
  });
});
