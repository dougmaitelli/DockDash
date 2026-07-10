import { PassThrough } from "stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ServiceSource, ServiceStatus } from "@shared";

// ── Mock objects ──

const mockContainerObj = vi.hoisted(() => ({
  inspect: vi.fn(),
  logs: vi.fn(),
  stats: vi.fn(),
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

describe("DockerService.getContainerStats", () => {
  const BASE_RAW = {
    cpu_stats: {
      cpu_usage: { total_usage: 1_000_000, percpu_usage: [500_000, 500_000] },
      system_cpu_usage: 10_000_000,
      online_cpus: 2,
    },
    precpu_stats: {
      cpu_usage: { total_usage: 900_000 },
      system_cpu_usage: 9_000_000,
    },
    memory_stats: {
      usage: 150_000_000,
      limit: 8_000_000_000,
      stats: { cache: 10_000_000 },
    },
    networks: {
      eth0: { rx_bytes: 1_000_000, tx_bytes: 500_000 },
      eth1: { rx_bytes: 2_000_000, tx_bytes: 1_000_000 },
    },
    blkio_stats: {
      io_service_bytes_recursive: [
        { op: "Read", value: 500_000 },
        { op: "Write", value: 250_000 },
      ],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockContainerObj.stats.mockResolvedValue(BASE_RAW);
  });

  // CPU

  it("calculates CPU percent from delta / system_delta * num_cpus", async () => {
    // cpu_delta = 100_000, system_delta = 1_000_000, num_cpus = 2 → 20.0%
    const svc = new DockerService();
    const result = await svc.getContainerStats(mockContainerObj as never);

    expect(result.cpuPercent).toBe(20.0);
  });

  it("returns 0% CPU when system_delta is zero (container just started)", async () => {
    mockContainerObj.stats.mockResolvedValue({
      ...BASE_RAW,
      cpu_stats: { ...BASE_RAW.cpu_stats, system_cpu_usage: 5_000_000 },
      precpu_stats: { cpu_usage: { total_usage: 900_000 }, system_cpu_usage: 5_000_000 },
    });

    const svc = new DockerService();
    const result = await svc.getContainerStats(mockContainerObj as never);

    expect(result.cpuPercent).toBe(0);
  });

  it("clamps CPU percent to 100 * num_cpus when delta exceeds system delta", async () => {
    mockContainerObj.stats.mockResolvedValue({
      ...BASE_RAW,
      cpu_stats: {
        cpu_usage: { total_usage: 10_000_000, percpu_usage: [5_000_000, 5_000_000] },
        system_cpu_usage: 10_000_001, // tiny system delta → huge ratio
        online_cpus: 2,
      },
      precpu_stats: {
        cpu_usage: { total_usage: 0 },
        system_cpu_usage: 0,
      },
    });

    const svc = new DockerService();
    const result = await svc.getContainerStats(mockContainerObj as never);

    expect(result.cpuPercent).toBeLessThanOrEqual(200); // 100 * 2 cpus
  });

  it("falls back to percpu_usage length when online_cpus is absent", async () => {
    mockContainerObj.stats.mockResolvedValue({
      ...BASE_RAW,
      cpu_stats: {
        cpu_usage: { total_usage: 1_000_000, percpu_usage: [250_000, 250_000, 250_000, 250_000] },
        system_cpu_usage: 10_000_000,
        // no online_cpus
      },
      precpu_stats: {
        cpu_usage: { total_usage: 900_000 },
        system_cpu_usage: 9_000_000,
      },
    });

    const svc = new DockerService();
    const result = await svc.getContainerStats(mockContainerObj as never);

    // cpu_delta=100k, system_delta=1M, num_cpus=4 → 40%
    expect(result.cpuPercent).toBe(40.0);
  });

  // Memory

  it("subtracts cgroup v1 cache from memory usage and computes memoryPercent", async () => {
    const svc = new DockerService();
    const result = await svc.getContainerStats(mockContainerObj as never);

    expect(result.memoryUsed).toBe(140_000_000); // 150M - 10M cache
    expect(result.memoryLimit).toBe(8_000_000_000);
    expect(result.memoryPercent).toBe(1.8); // 140M / 8000M
  });

  it("subtracts cgroup v2 inactive_file when cache is absent and computes memoryPercent", async () => {
    mockContainerObj.stats.mockResolvedValue({
      ...BASE_RAW,
      memory_stats: {
        usage: 150_000_000,
        limit: 8_000_000_000,
        stats: { inactive_file: 20_000_000 },
      },
    });

    const svc = new DockerService();
    const result = await svc.getContainerStats(mockContainerObj as never);

    expect(result.memoryUsed).toBe(130_000_000); // 150M - 20M inactive_file
    expect(result.memoryPercent).toBe(1.6); // 130M / 8000M
  });

  it("returns memoryPercent 0 when memoryLimit is 0", async () => {
    mockContainerObj.stats.mockResolvedValue({
      ...BASE_RAW,
      memory_stats: { usage: 100_000_000, limit: 0, stats: {} },
    });

    const svc = new DockerService();
    const result = await svc.getContainerStats(mockContainerObj as never);

    expect(result.memoryPercent).toBe(0);
  });

  // Network and disk

  it("sums rx_bytes and tx_bytes across all network interfaces", async () => {
    const svc = new DockerService();
    const result = await svc.getContainerStats(mockContainerObj as never);

    expect(result.networkRx).toBe(3_000_000); // eth0 + eth1
    expect(result.networkTx).toBe(1_500_000);
  });

  it("returns zero network totals when networks is absent", async () => {
    mockContainerObj.stats.mockResolvedValue({ ...BASE_RAW, networks: undefined });

    const svc = new DockerService();
    const result = await svc.getContainerStats(mockContainerObj as never);

    expect(result.networkRx).toBe(0);
    expect(result.networkTx).toBe(0);
  });

  it("sums Read and Write blkio entries (case-insensitive op)", async () => {
    mockContainerObj.stats.mockResolvedValue({
      ...BASE_RAW,
      blkio_stats: {
        io_service_bytes_recursive: [
          { op: "read", value: 300_000 },
          { op: "Read", value: 200_000 },
          { op: "write", value: 100_000 },
          { op: "Write", value: 150_000 },
          { op: "Sync", value: 999 }, // should be ignored
        ],
      },
    });

    const svc = new DockerService();
    const result = await svc.getContainerStats(mockContainerObj as never);

    expect(result.blockRead).toBe(500_000);
    expect(result.blockWrite).toBe(250_000);
  });

  it("returns zero block I/O when io_service_bytes_recursive is absent", async () => {
    mockContainerObj.stats.mockResolvedValue({
      ...BASE_RAW,
      blkio_stats: { io_service_bytes_recursive: null },
    });

    const svc = new DockerService();
    const result = await svc.getContainerStats(mockContainerObj as never);

    expect(result.blockRead).toBe(0);
    expect(result.blockWrite).toBe(0);
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
