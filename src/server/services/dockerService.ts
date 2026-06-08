import { createHash } from "crypto";
import Docker from "dockerode";
import { PassThrough } from "stream";
import { v4 as uuidv4 } from "uuid";

import { Service, ServiceSource, ServiceStatus } from "@shared";
import type { FileContentResponse, FileEntry } from "@shared/api";

import { db } from "../db/databaseService.js";
import { config } from "../lib/config.js";
import { DOCKER_LATEST_TAG } from "../lib/constants.js";
import { fileService } from "./fileService.js";
import { terminalService } from "./terminalService.js";

// Docker multiplexed stream header: 1 byte type + 3 bytes padding + 4 bytes payload length
export const DOCKER_STREAM_HEADER_SIZE = 8;

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

  getContainerForServiceId(serviceId: string): Docker.Container {
    const service = db.getService(serviceId);

    if (!service) throw new Error("Service not found");

    if (service.source !== ServiceSource.DOCKER) throw new Error("Not a Docker service");

    const dockerHostId = service.metadata?.dockerHostId as string | undefined;
    const resolvedHost = dockerHostId ? this.resolveHost(dockerHostId) : undefined;
    const containerId = service.metadata?.containerId as string | undefined;

    if (!resolvedHost || !containerId) throw new Error("Container metadata not available");

    return this.createDockerClientForHost(resolvedHost).getContainer(containerId);
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

  async listFiles(container: Docker.Container, path: string): Promise<FileEntry[]> {
    const info = await container.inspect();

    if (!info.State?.Running) throw new Error("Container is not running");

    return fileService.listFiles(container, path);
  }

  async readFile(container: Docker.Container, filePath: string): Promise<FileContentResponse> {
    const info = await container.inspect();

    if (!info.State?.Running) throw new Error("Container is not running");

    return fileService.readFile(container, filePath);
  }

  async writeFile(container: Docker.Container, filePath: string, content: string): Promise<void> {
    const info = await container.inspect();

    if (!info.State?.Running) throw new Error("Container is not running");

    return fileService.writeFile(container, filePath, content);
  }

  async openLogStream(
    container: Docker.Container,
  ): Promise<NodeJS.ReadableStream & { destroy: () => void }> {
    const inspect = await container.inspect();
    const isTty = inspect.Config?.Tty ?? false;
    const output = new PassThrough();

    container.logs(
      { follow: true, stdout: true, stderr: true, tail: 100, timestamps: true },
      (err, stream) => {
        if (err || !stream) {
          output.destroy(err ?? new Error("Stream unavailable"));

          return;
        }

        const emitLines = (chunk: Buffer) =>
          chunk
            .toString("utf8")
            .split("\n")
            .filter(Boolean)
            .forEach((line) => output.write(line));

        if (isTty) {
          stream.on("data", emitLines);
        } else {
          let buf = Buffer.alloc(0);

          stream.on("data", (chunk: Buffer) => {
            buf = Buffer.concat([buf, chunk]);

            while (buf.length >= DOCKER_STREAM_HEADER_SIZE) {
              const size = buf.readUInt32BE(4);

              if (buf.length < DOCKER_STREAM_HEADER_SIZE + size) break;

              const type = buf[0];
              const payload = buf.subarray(
                DOCKER_STREAM_HEADER_SIZE,
                DOCKER_STREAM_HEADER_SIZE + size,
              );

              if (type === 1 || type === 2) emitLines(payload);

              buf = buf.subarray(DOCKER_STREAM_HEADER_SIZE + size);
            }
          });
        }

        stream.on("end", () => output.end());
        stream.on("error", (e) => output.destroy(e));
      },
    );

    return output;
  }

  async openTerminal(
    container: Docker.Container,
    cols: number,
    rows: number,
  ): Promise<{ sessionId: string; stream: NodeJS.ReadWriteStream }> {
    return terminalService.openSession(container, cols, rows);
  }
}

export const dockerService = new DockerService();
