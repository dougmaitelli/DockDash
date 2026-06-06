import { createHash } from "crypto";
import Docker from "dockerode";
import { v4 as uuidv4 } from "uuid";
import { Service, ServiceSource, ServiceStatus } from "@shared";
import type { FileEntry } from "@shared/api";
import { config } from "../lib/config.js";
import { DOCKER_LATEST_TAG } from "../lib/constants.js";

export type ContainerStateMap = Map<
  string,
  { containerId: string; state: string; imageTag: string; imageDigest: string | undefined }
>;

export const DOCKER_CONTAINER_STATE = {
  RUNNING: "running",
  EXITED: "exited",
  DEAD: "dead",
  STOPPED: "stopped",
} as const;

export const DOCKER_CONTAINER_DOWN_STATES: string[] = [
  DOCKER_CONTAINER_STATE.EXITED,
  DOCKER_CONTAINER_STATE.DEAD,
  DOCKER_CONTAINER_STATE.STOPPED,
];

export class DockerService {
  private readonly clients: Map<string, Docker>;

  constructor() {
    this.clients = new Map(config.dockerHosts.map((host) => [host, this.buildClient(host)]));
  }

  static hostId(host: string): string {
    return createHash("sha256").update(host).digest("hex").slice(0, 16);
  }

  resolveHost(dockerHostId: string): string | undefined {
    return config.dockerHosts.find((host) => DockerService.hostId(host) === dockerHostId);
  }

  private buildClient(host: string): Docker {
    if (host.startsWith("unix://")) {
      return new Docker({ socketPath: host.replace("unix://", "") });
    }

    const url = new URL(host.startsWith("tcp://") ? host : `tcp://${host}`);

    return new Docker({ host: url.hostname, port: parseInt(url.port, 10) || 2375 });
  }

  createDockerClientForHost(host: string): Docker {
    const client = this.clients.get(host);

    if (!client) throw new Error(`Docker host not configured: ${host}`);

    return client;
  }

  createDockerClients(): { host: string; docker: Docker }[] {
    return [...this.clients.entries()].map(([host, docker]) => ({ host, docker }));
  }

  async *scanDockerContainers(docker: Docker, dockerHost: string): AsyncGenerator<Service> {
    const containers = await docker.listContainers({ all: true });
    const now = new Date().toISOString();

    for (const container of containers) {
      if (!container.Id || !container.Names) continue;

      const name = this.normalizeContainerName(container.Names[0]);

      const containerObj = docker.getContainer(container.Id);
      const inspect = await containerObj.inspect();

      const containerPorts = container.Ports || [];
      // Docker emits one entry per IP family (IPv4 + IPv6) for each binding,
      // so deduplicate by PrivatePort — one PublicPort per unique container port.
      const seenPrivate = new Set<number>();
      const hostPorts = containerPorts
        .filter(
          (p) => p.PublicPort && !seenPrivate.has(p.PrivatePort) && seenPrivate.add(p.PrivatePort),
        )
        .map((p) => p.PublicPort!)
        .sort((a, b) => a - b);

      const boundPort = containerPorts.find((p) => p.PublicPort);
      const host = boundPort?.IP || "localhost";

      const networks = inspect.NetworkSettings?.Networks || {};
      const networkNames = Object.keys(networks);
      const { image, tag: imageTag } = this.parseImage(container.Image);
      const imageDigest = await this.fetchImageDigest(docker, inspect.Image);

      yield {
        id: `docker-${uuidv4()}`,
        name,
        host,
        ports: hostPorts,
        checkPort: hostPorts[0],
        source: ServiceSource.DOCKER,
        status:
          container.State === DOCKER_CONTAINER_STATE.RUNNING
            ? ServiceStatus.UP
            : container.State === DOCKER_CONTAINER_STATE.EXITED
              ? ServiceStatus.DOWN
              : ServiceStatus.UNKNOWN,
        metadata: {
          dockerHostId: DockerService.hostId(dockerHost),
          containerId: container.Id,
          containerName: name,
          image,
          imageTag,
          imageDigest,
          networkNames: networkNames,
        },
        createdAt: now,
        updatedAt: now,
      };
    }
  }

  async getContainersStateMap(docker: Docker): Promise<ContainerStateMap> {
    const containers = await docker.listContainers({ all: true });

    const digestByImageId = new Map<string, string | undefined>();

    for (const c of containers) {
      if (!digestByImageId.has(c.ImageID)) {
        digestByImageId.set(c.ImageID, await this.fetchImageDigest(docker, c.ImageID));
      }
    }

    const map: ContainerStateMap = new Map();

    for (const c of containers) {
      const { tag: imageTag } = this.parseImage(c.Image);
      const entry = {
        containerId: c.Id,
        state: c.State,
        imageTag,
        imageDigest: digestByImageId.get(c.ImageID),
      };

      for (const name of c.Names ?? []) {
        map.set(this.normalizeContainerName(name), entry);
      }
    }

    return map;
  }

  private async fetchImageDigest(docker: Docker, imageId: string): Promise<string | undefined> {
    try {
      const imageInfo = await docker.getImage(imageId).inspect();
      const repoDigests: string[] = imageInfo.RepoDigests ?? [];

      return repoDigests[0]?.split("@")[1] ?? undefined;
    } catch {
      return undefined;
    }
  }

  private normalizeContainerName(name: string): string {
    return name.replace(/^\//, "");
  }

  private parseImage(image: string): { image: string; tag: string } {
    // Strip digest (sha256:...) if present
    const withoutDigest = image.split("@")[0];
    // Reconstruct the path segments, splitting the tag off the last segment only
    const segments = withoutDigest.split("/");
    const lastSegment = segments[segments.length - 1];
    const colonIdx = lastSegment.lastIndexOf(":");

    if (colonIdx >= 0) {
      segments[segments.length - 1] = lastSegment.slice(0, colonIdx);

      return { image: segments.join("/"), tag: lastSegment.slice(colonIdx + 1) };
    }

    return { image: withoutDigest, tag: DOCKER_LATEST_TAG };
  }

  async listFiles(resolvedHost: string, containerId: string, path: string): Promise<FileEntry[]> {
    const docker = this.createDockerClientForHost(resolvedHost);
    const container = docker.getContainer(containerId);

    const info = await container.inspect();

    if (!info.State?.Running) {
      throw new Error("Container is not running");
    }

    const exec = await container.exec({
      Cmd: ["ls", "-la", "--", path],
      AttachStdout: true,
      AttachStderr: true,
      Tty: false,
    });

    const stream = await exec.start({ hijack: true, stdin: false });

    const { stdout, stderr } = await new Promise<{ stdout: string; stderr: string }>(
      (resolve, reject) => {
        let buf = Buffer.alloc(0);

        stream.on("data", (chunk: Buffer) => {
          buf = Buffer.concat([buf, chunk]);
        });

        stream.on("end", () => {
          let remaining = buf;
          const stdoutParts: string[] = [];
          const stderrParts: string[] = [];

          while (remaining.length >= 8) {
            const size = remaining.readUInt32BE(4);

            if (remaining.length < 8 + size) break;

            const type = remaining[0];
            const payload = remaining.slice(8, 8 + size);

            if (type === 1) stdoutParts.push(payload.toString("utf8"));
            else if (type === 2) stderrParts.push(payload.toString("utf8"));

            remaining = remaining.slice(8 + size);
          }

          resolve({ stdout: stdoutParts.join(""), stderr: stderrParts.join("") });
        });

        stream.on("error", reject);
      },
    );

    if (!stdout.trim() && stderr.trim()) {
      throw new Error(stderr.trim());
    }

    return this.parseLsOutput(stdout);
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

export const dockerService = new DockerService();
