import type Docker from "dockerode";
import { Readable } from "stream";

import type { FileContentResponse, FileEntry } from "@shared/responseSchemas.js";

import { sanitizeDockerError } from "../lib/errors.js";
import { DOCKER_STREAM_HEADER_SIZE } from "./dockerService.js";

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
      const tarBuffer = this.createTarBuffer(filename, contentBuffer);

      await new Promise<void>((resolve, reject) => {
        container.putArchive(Readable.from(tarBuffer), { path: dir }, (err: Error | null) => {
          if (err) reject(err);
          else resolve();
        });
      });
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

  private createTarBuffer(filename: string, content: Buffer): Buffer {
    const header = Buffer.alloc(512, 0);

    Buffer.from(filename).copy(header, 0);
    Buffer.from("0000644\0").copy(header, 100); // mode
    Buffer.from("0000000\0").copy(header, 108); // uid
    Buffer.from("0000000\0").copy(header, 116); // gid
    Buffer.from(content.length.toString(8).padStart(11, "0") + "\0").copy(header, 124); // size
    Buffer.from(
      Math.floor(Date.now() / 1000)
        .toString(8)
        .padStart(11, "0") + "\0",
    ).copy(header, 136); // mtime
    header[156] = 0x30; // type: regular file
    Buffer.from("ustar\0").copy(header, 257); // magic
    Buffer.from("00").copy(header, 263); // version

    // Checksum: sum of all bytes with checksum field treated as spaces
    Buffer.from("        ").copy(header, 148);
    let sum = 0;

    for (let i = 0; i < 512; i++) sum += header[i];

    Buffer.from(sum.toString(8).padStart(6, "0") + "\0 ").copy(header, 148);

    const paddedSize = Math.ceil(content.length / 512) * 512;
    const contentPadded = Buffer.alloc(paddedSize, 0);

    content.copy(contentPadded);

    return Buffer.concat([header, contentPadded, Buffer.alloc(1024, 0)]);
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
