import { PassThrough } from "stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ServiceSource, ServiceStatus } from "@shared";

// ── Mock objects ──

const mockContainerObj = vi.hoisted(() => ({
  inspect: vi.fn(),
  logs: vi.fn(),
}));

const mockImageObj = vi.hoisted(() => ({
  inspect: vi.fn(),
}));

const mockDocker = vi.hoisted(() => ({
  listContainers: vi.fn(),
  getContainer: vi.fn(),
  getImage: vi.fn(),
}));

vi.mock("dockerode", () => ({
  default: vi.fn(function () {
    return mockDocker;
  }),
}));

vi.mock("@server/db/databaseService.js", () => ({
  db: { getService: vi.fn() },
}));

const { DockerService, DOCKER_STREAM_HEADER_SIZE } =
  await import("@server/services/dockerService.js");

// ── Fixtures ──

const CONTAINER_LIST = [
  {
    Id: "abc123",
    Names: ["/my-app"],
    Image: "nginx:1.25",
    State: "running",
    Ports: [
      { IP: "0.0.0.0", PrivatePort: 80, PublicPort: 8080, Type: "tcp" },
      { IP: "::", PrivatePort: 80, PublicPort: 8080, Type: "tcp" }, // IPv6 duplicate
    ],
    ImageID: "sha256:imageabc",
  },
];

const INSPECT_RESULT = {
  State: { Status: "running" },
  Config: { Tty: false },
  Image: "sha256:imageabc",
  NetworkSettings: { Networks: { bridge: { IPAddress: "172.17.0.2" } } },
};

const IMAGE_INSPECT = {
  RepoDigests: ["nginx@sha256:digestabc"],
  Config: { Labels: {} },
};

// ── Tests ──

describe("DockerService.parseImage (via scanDockerContainers)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DOCKER_HOSTS = "tcp://test-docker:2375";

    mockDocker.getContainer.mockReturnValue(mockContainerObj);
    mockDocker.getImage.mockReturnValue(mockImageObj);
    mockContainerObj.inspect.mockResolvedValue(INSPECT_RESULT);
    mockImageObj.inspect.mockResolvedValue(IMAGE_INSPECT);
  });

  afterEach(() => {
    delete process.env.DOCKER_HOSTS;
  });

  it("scanDockerContainers yields one service per container with correct fields", async () => {
    mockDocker.listContainers.mockResolvedValue(CONTAINER_LIST);

    const svc = new DockerService();
    const results: unknown[] = [];

    for await (const service of svc.scanDockerContainers(
      mockDocker as never,
      "tcp://test-docker:2375",
    )) {
      results.push(service);
    }

    expect(results).toHaveLength(1);

    const service = results[0] as ReturnType<typeof Object.assign>;

    expect(service.name).toBe("my-app");
    expect(service.source).toBe(ServiceSource.DOCKER);
    expect(service.status).toBe(ServiceStatus.UP);
    expect(service.metadata?.imageTag).toBe("1.25");
    expect(service.metadata?.image).toBe("nginx");
  });

  it("deduplicates IPv4/IPv6 port bindings — only one entry per PrivatePort", async () => {
    mockDocker.listContainers.mockResolvedValue(CONTAINER_LIST);

    const svc = new DockerService();
    const results: unknown[] = [];

    for await (const service of svc.scanDockerContainers(
      mockDocker as never,
      "tcp://test-docker:2375",
    )) {
      results.push(service);
    }

    const service = results[0] as { ports: number[] };

    // The container has two entries for port 80→8080 (IPv4 + IPv6). After dedup, only one 8080.
    expect(service.ports.filter((p) => p === 8080)).toHaveLength(1);
  });

  it("strips the leading slash from container names", async () => {
    mockDocker.listContainers.mockResolvedValue([
      { ...CONTAINER_LIST[0], Names: ["/prefix/my-app"] },
    ]);

    const svc = new DockerService();
    const results: unknown[] = [];

    for await (const service of svc.scanDockerContainers(
      mockDocker as never,
      "tcp://test-docker:2375",
    )) {
      results.push(service);
    }

    const service = results[0] as { name: string };

    expect(service.name).toBe("prefix/my-app");
  });

  it("marks exited containers as DOWN", async () => {
    mockDocker.listContainers.mockResolvedValue([{ ...CONTAINER_LIST[0], State: "exited" }]);
    mockContainerObj.inspect.mockResolvedValue({ ...INSPECT_RESULT, State: { Status: "exited" } });

    const svc = new DockerService();
    const results: unknown[] = [];

    for await (const service of svc.scanDockerContainers(
      mockDocker as never,
      "tcp://test-docker:2375",
    )) {
      results.push(service);
    }

    expect((results[0] as { status: ServiceStatus }).status).toBe(ServiceStatus.DOWN);
  });
});

describe("DockerService.getContainersStateMap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DOCKER_HOSTS = "tcp://test-docker:2375";
    mockDocker.getImage.mockReturnValue(mockImageObj);
    mockImageObj.inspect.mockResolvedValue(IMAGE_INSPECT);
  });

  afterEach(() => {
    delete process.env.DOCKER_HOSTS;
  });

  it("maps container names (without leading slash) to their state entries", async () => {
    mockDocker.listContainers.mockResolvedValue([
      { ...CONTAINER_LIST[0], State: "running", Names: ["/app", "/alias"] },
    ]);

    const svc = new DockerService();
    const map = await svc.getContainersStateMap(mockDocker as never);

    expect(map.has("app")).toBe(true);
    expect(map.has("alias")).toBe(true);
    expect(map.get("app")?.state).toBe("running");
  });

  it("includes the image digest when available", async () => {
    mockDocker.listContainers.mockResolvedValue(CONTAINER_LIST);

    const svc = new DockerService();
    const map = await svc.getContainersStateMap(mockDocker as never);

    expect(map.get("my-app")?.imageDigest).toBe("sha256:digestabc");
  });
});

describe("DockerService.hostId", () => {
  it("returns a 16-character hex string", () => {
    const id = DockerService.hostId("tcp://docker-host:2375");

    expect(id).toHaveLength(16);
    expect(id).toMatch(/^[0-9a-f]+$/);
  });

  it("is deterministic for the same input", () => {
    expect(DockerService.hostId("unix:///var/run/docker.sock")).toBe(
      DockerService.hostId("unix:///var/run/docker.sock"),
    );
  });

  it("produces different IDs for different hosts", () => {
    expect(DockerService.hostId("tcp://host-a:2375")).not.toBe(
      DockerService.hostId("tcp://host-b:2375"),
    );
  });
});

describe("DockerService.openLogStream — multiplexed (non-TTY) demux", () => {
  it("extracts stdout (type=1) and stderr (type=2) payload lines", async () => {
    const inspect = { Config: { Tty: false } };

    mockContainerObj.inspect.mockResolvedValue(inspect);

    function makeFrame(type: number, payload: string): Buffer {
      const payloadBuf = Buffer.from(payload);
      const header = Buffer.alloc(DOCKER_STREAM_HEADER_SIZE);

      header[0] = type;
      header.writeUInt32BE(payloadBuf.length, 4);

      return Buffer.concat([header, payloadBuf]);
    }

    const stdoutFrame = makeFrame(1, "stdout line\n");
    const stderrFrame = makeFrame(2, "stderr line\n");

    mockContainerObj.logs.mockImplementation(
      (_opts: unknown, cb: (err: null, stream: PassThrough) => void) => {
        const stream = new PassThrough();

        cb(null, stream);
        stream.write(Buffer.concat([stdoutFrame, stderrFrame]));
        stream.end();
      },
    );

    const svc = new DockerService();
    const output = await svc.openLogStream(mockContainerObj as never);

    const lines: string[] = [];

    await new Promise<void>((resolve) => {
      output.on("data", (chunk: Buffer) => lines.push(chunk.toString()));
      output.on("end", resolve);
    });

    expect(lines.some((l) => l.includes("stdout line"))).toBe(true);
    expect(lines.some((l) => l.includes("stderr line"))).toBe(true);
  });

  it("passes TTY streams through without demuxing", async () => {
    const inspect = { Config: { Tty: true } };

    mockContainerObj.inspect.mockResolvedValue(inspect);

    mockContainerObj.logs.mockImplementation(
      (_opts: unknown, cb: (err: null, stream: PassThrough) => void) => {
        const stream = new PassThrough();

        cb(null, stream);
        stream.write("raw tty output\n");
        stream.end();
      },
    );

    const svc = new DockerService();
    const output = await svc.openLogStream(mockContainerObj as never);

    const lines: string[] = [];

    await new Promise<void>((resolve) => {
      output.on("data", (chunk: Buffer) => lines.push(chunk.toString()));
      output.on("end", resolve);
    });

    expect(lines.some((l) => l.includes("raw tty output"))).toBe(true);
  });
});
