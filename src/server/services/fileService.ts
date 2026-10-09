import type Docker from "dockerode";
import { Readable } from "stream";
import tar, { type Headers } from "tar-stream";

import type { FileContentResponse, FileEntry } from "@shared/responseSchemas.js";

import { sanitizeDockerError } from "../lib/errors.js";

const DOCKER_STREAM_HEADER_SIZE = 8;

class FileService {
  async listFiles(container: Docker.Container, path: string): Promise<FileEntry[]> {
    try {
      await this.assertRunning(container);

      const exec = await container.exec({
        Cmd: ["ls", "-la", "--", path],
        AttachStdout: true,
        AttachStderr: true,
        Tty: false,
      });

      const stream = await exec.start({ hijack: true, stdin: false });

      const { stdout, stderr } = await this.demuxStream(stream);

      if (!stdout.trim() && stderr.trim()) {
        throw new Error(stderr.trim());
      }

      return this.parseLsOutput(stdout);
    } catch (err) {
      throw new Error(sanitizeDockerError(err));
    }
  }

  async readFile(container: Docker.Container, filePath: string): Promise<FileContentResponse> {
    try {
      await this.assertRunning(container);

      const exec = await container.exec({
        Cmd: ["cat", "--", filePath],
        AttachStdout: true,
        AttachStderr: true,
        Tty: false,
      });

      const stream = await exec.start({ hijack: true, stdin: false });

      const { stdout, stderr } = await this.demuxStream(stream);

      if (!stdout && stderr.trim()) throw new Error(stderr.trim());

      return { path: filePath, content: stdout };
    } catch (err) {
      throw new Error(sanitizeDockerError(err));
    }
  }

  async writeFile(container: Docker.Container, filePath: string, content: string): Promise<void> {
    try {
      await this.assertRunning(container);

      const contentBuffer = Buffer.from(content, "utf8");
      const lastSlash = filePath.lastIndexOf("/");
      const filename = filePath.slice(lastSlash + 1);
      const dir = lastSlash > 0 ? filePath.slice(0, lastSlash) : "/";
      const metadata = await this.getFileMetadata(container, filePath);
      const archive = tar.pack();

      archive.entry(
        {
          name: filename,
          type: "file",
          mode: metadata.mode,
          uid: metadata.uid,
          gid: metadata.gid,
          mtime: new Date(),
        },
        contentBuffer,
      );
      archive.finalize();

      try {
        await new Promise<void>((resolve, reject) => {
          archive.once("error", reject);
          container.putArchive(
            archive,
            { path: dir, copyUIDGID: true, noOverwriteDirNonDir: true },
            (err: Error | null) => {
              if (err) reject(err);
              else resolve();
            },
          );
        });
      } finally {
        archive.destroy();
      }
    } catch (err) {
      throw new Error(sanitizeDockerError(err));
    }
  }

  private async assertRunning(container: Docker.Container): Promise<void> {
    const info = await container.inspect();

    if (!info.State?.Running) throw new Error("Container is not running");
  }

  private demuxStream(stream: NodeJS.ReadableStream): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      let buf = Buffer.alloc(0);

      stream.on("data", (chunk: Buffer) => {
        buf = Buffer.concat([buf, chunk]);
      });

      stream.on("end", () => {
        let remaining = buf;
        const stdoutParts: Buffer[] = [];
        const stderrParts: string[] = [];

        while (remaining.length >= DOCKER_STREAM_HEADER_SIZE) {
          const size = remaining.readUInt32BE(4);

          if (remaining.length < DOCKER_STREAM_HEADER_SIZE + size) break;

          const type = remaining[0];
          const payload = remaining.subarray(
            DOCKER_STREAM_HEADER_SIZE,
            DOCKER_STREAM_HEADER_SIZE + size,
          );

          if (type === 1) stdoutParts.push(payload);
          else if (type === 2) stderrParts.push(payload.toString("utf8"));

          remaining = remaining.subarray(DOCKER_STREAM_HEADER_SIZE + size);
        }

        resolve({
          stdout: Buffer.concat(stdoutParts).toString("utf8"),
          stderr: stderrParts.join(""),
        });
      });

      stream.on("error", reject);
    });
  }

  private async getFileMetadata(container: Docker.Container, filePath: string): Promise<Headers> {
    const source = await container.getArchive({ path: filePath });
    const extract = tar.extract();

    try {
      return await new Promise<Headers>((resolve, reject) => {
        source.once("error", reject);
        extract.once("error", reject);
        extract.once("finish", () => reject(new Error("File metadata missing from archive")));
        extract.once("entry", (header) => {
          if (header.type !== "file") {
            reject(new Error("Only regular files can be edited"));

            return;
          }

          resolve(header);
        });
        source.pipe(extract);
      });
    } finally {
      (source as Readable).destroy();
      extract.destroy();
    }
  }

  private parseLsOutput(output: string): FileEntry[] {
    const entries: FileEntry[] = [];

    for (const line of output.split("\n")) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("total ")) continue;

      // Format: perms links owner group size month day time/year name...
      const parts = trimmed.split(/\s+/);

      if (parts.length < 9) continue;

      const permissions = parts[0];
      const size = parseInt(parts[4], 10);
      const modified = `${parts[5]} ${parts[6]} ${parts[7]}`;
      const fullName = parts.slice(8).join(" ");

      if (fullName === "." || fullName === "..") continue;

      const firstChar = permissions[0];
      let type: FileEntry["type"];
      let name = fullName;

      if (firstChar === "d") {
        type = "directory";
      } else if (firstChar === "l") {
        type = "symlink";
        name = fullName.split(" -> ")[0];
      } else if (firstChar === "-") {
        type = "file";
      } else {
        type = "other";
      }

      entries.push({ name, type, size: isNaN(size) ? 0 : size, permissions, modified });
    }

    return entries;
  }
}

export const fileService = new FileService();
