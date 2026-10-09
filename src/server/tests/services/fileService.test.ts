import { DOCKER_STREAM_HEADER_SIZE } from "@server/services/containerRuntime/dockerRuntime.js";
import { fileService } from "@server/services/fileService.js";
import { PassThrough, Readable } from "stream";
import tar, { type Headers } from "tar-stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const readOptions = { maxBytes: 1024, timeoutMs: 1000 };

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
  const getArchive = vi.fn().mockImplementation(async () => {
    const archive = tar.pack();

    archive.entry({ name: "file", mode: 0o640, uid: 1001, gid: 1002 }, "old content");
    archive.finalize();

    return archive;
  });

  return {
    container: { inspect, exec, putArchive, getArchive } as never,
    inspect,
    exec,
    start,
    putArchive,
    getArchive,
  };
}

async function extractFile(archive: Buffer): Promise<{ header: Headers; content: string }> {
  const extract = tar.extract();
  let result!: { header: Headers; content: string };

  await new Promise<void>((resolve, reject) => {
    extract.on("entry", (header, stream, next) => {
      const chunks: Buffer[] = [];

      stream.on("data", (chunk) => chunks.push(chunk));
      stream.on("end", () => {
        result = { header, content: Buffer.concat(chunks).toString("utf8") };
        next();
      });
    });
    extract.on("finish", resolve);
    extract.on("error", reject);
    Readable.from(archive).pipe(extract);
  });

  return result;
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
    const populated = mockContainer();

    populated.getArchive.mockImplementationOnce(async () => {
      const archive = tar.pack();

      archive.entry({ name: "a" }, "hello\n");
      archive.finalize();

      return archive;
    });

    await expect(fileService.readFile(populated.container, "/tmp/a", readOptions)).resolves.toEqual(
      {
        path: "/tmp/a",
        content: "hello\n",
      },
    );

    const empty = mockContainer();

    empty.getArchive.mockImplementationOnce(async () => {
      const archive = tar.pack();

      archive.entry({ name: "empty" }, "");
      archive.finalize();

      return archive;
    });

    await expect(fileService.readFile(empty.container, "/tmp/empty", readOptions)).resolves.toEqual(
      {
        path: "/tmp/empty",
        content: "",
      },
    );
  });

  it("rejects operations against stopped containers", async () => {
    const { container, inspect } = mockContainer();

    inspect.mockResolvedValue({ State: { Running: false } });
    await expect(fileService.listFiles(container, "/")).rejects.toThrow("Container is not running");
  });

  it("rejects malformed Docker streams", async () => {
    const stream = new PassThrough();
    const { container, getArchive } = mockContainer();

    getArchive.mockResolvedValue(stream);
    setImmediate(() => stream.destroy(new Error("stream failed")));
    await expect(fileService.readFile(container, "/tmp/a", readOptions)).rejects.toThrow(
      "stream failed",
    );
  });

  it("rejects an oversized archive entry before buffering its content", async () => {
    const { container, getArchive, exec } = mockContainer();
    const archive = tar.pack();

    archive.entry({ name: "large", size: readOptions.maxBytes + 1 });
    getArchive.mockResolvedValue(archive);
    await expect(fileService.readFile(container, "/large", readOptions)).rejects.toMatchObject({
      status: 413,
    });
    expect(archive.destroyed).toBe(true);
    expect(exec).not.toHaveBeenCalled();
  });

  it.each(["fifo", "character-device", "directory", "symlink"] as const)(
    "rejects %s targets",
    async (type) => {
      const { container, getArchive } = mockContainer();
      const archive = tar.pack();

      archive.entry({ name: "special", type, linkname: type === "symlink" ? "target" : undefined });
      archive.finalize();
      getArchive.mockResolvedValue(archive);
      await expect(fileService.readFile(container, "/special", readOptions)).rejects.toMatchObject({
        status: 400,
      });
      expect(archive.destroyed).toBe(true);
    },
  );

  it("times out stalled archives and closes their streams", async () => {
    const { container, getArchive } = mockContainer();
    const stream = new PassThrough();

    getArchive.mockResolvedValue(stream);
    await expect(
      fileService.readFile(container, "/stalled", { ...readOptions, timeoutMs: 10 }),
    ).rejects.toMatchObject({ status: 504 });
    expect(stream.destroyed).toBe(true);
  });

  it("closes an archive that arrives after cancellation during setup", async () => {
    const { container, getArchive } = mockContainer();
    const controller = new AbortController();
    const stream = new PassThrough();
    let release!: (stream: PassThrough) => void;
    let started!: () => void;
    const setup = new Promise<void>((resolve) => {
      started = resolve;
    });

    getArchive.mockImplementationOnce(() => {
      started();

      return new Promise((resolve) => {
        release = resolve;
      });
    });
    const result = fileService.readFile(container, "/late", {
      ...readOptions,
      signal: controller.signal,
    });
    const assertion = expect(result).rejects.toMatchObject({ status: 499 });

    await setup;
    controller.abort();
    await assertion;
    release(stream);
    await vi.waitFor(() => expect(stream.destroyed).toBe(true));
  });

  it("writes a valid tar archive to the containing directory", async () => {
    const { container, putArchive } = mockContainer();
    let archive = Buffer.alloc(0);

    putArchive.mockImplementation(
      (input: Readable, options: { path: string }, callback: (error: Error | null) => void) => {
        expect(options).toEqual({ path: "/etc/app", copyUIDGID: true, noOverwriteDirNonDir: true });
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
    expect((await extractFile(archive)).header).toMatchObject({
      mode: 0o640,
      uid: 1001,
      gid: 1002,
    });
  });

  it("sanitizes archive upload errors", async () => {
    const { container, putArchive } = mockContainer();

    putArchive.mockImplementation(
      (_input: Readable, _options: unknown, callback: (error: Error) => void) =>
        callback(new Error("socket /var/run/docker.sock failed")),
    );

    await expect(fileService.writeFile(container, "/config", "x")).rejects.toThrow();
  });

  it.each(["x".repeat(114), "é".repeat(80)])(
    "preserves long filenames and existing metadata: %s",
    async (filename) => {
      const { container, putArchive, getArchive } = mockContainer();
      let archive = Buffer.alloc(0);

      getArchive.mockImplementationOnce(async () => {
        const source = tar.pack();

        source.entry({ name: filename, mode: 0o750, uid: 1234, gid: 2345 }, "old");
        source.finalize();

        return source;
      });
      putArchive.mockImplementation(
        (input: Readable, _options: unknown, callback: (error: Error | null) => void) => {
          input.on("data", (chunk) => {
            archive = Buffer.concat([archive, chunk]);
          });
          input.on("end", () => callback(null));
        },
      );

      await fileService.writeFile(container, `/app/${filename}`, "updated ✓");
      const extracted = await extractFile(archive);

      expect(extracted.header).toMatchObject({ name: filename, mode: 0o750, uid: 1234, gid: 2345 });
      expect(extracted.content).toBe("updated ✓");
    },
  );

  it("does not upload when existing metadata cannot be read", async () => {
    const { container, getArchive, putArchive } = mockContainer();

    getArchive.mockRejectedValue(new Error("permission denied"));
    await expect(fileService.writeFile(container, "/private", "x")).rejects.toThrow(
      "permission denied",
    );
    expect(putArchive).not.toHaveBeenCalled();
  });

  it("rejects non-regular files instead of replacing them", async () => {
    const { container, getArchive, putArchive } = mockContainer();

    getArchive.mockImplementationOnce(async () => {
      const archive = tar.pack();

      archive.entry({ name: "link", type: "symlink", linkname: "target" });
      archive.finalize();

      return archive;
    });
    await expect(fileService.writeFile(container, "/link", "x")).rejects.toThrow(
      "Only regular files can be edited",
    );
    expect(putArchive).not.toHaveBeenCalled();
  });
});
