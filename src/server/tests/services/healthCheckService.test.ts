import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ServiceSource, ServiceStatus } from "@shared";

// ── Mock objects created before vi.mock() factories so factories can reference them ──

const mockDb = vi.hoisted(() => ({
  getService: vi.fn(),
  getServices: vi.fn().mockReturnValue([]),
  updateServiceStatus: vi.fn(),
  updateServiceMetadata: vi.fn(),
  addHealthHistory: vi.fn(),
  addResourceStatsHistory: vi.fn(),
}));

const mockDockerService = vi.hoisted(() => ({
  resolveHost: vi.fn(),
  createDockerClientForHost: vi.fn(),
  getContainersStateMap: vi.fn(),
  getContainerForServiceId: vi.fn(),
  getContainerStats: vi.fn(),
}));

const mockNotificationService = vi.hoisted(() => ({
  notify: vi.fn().mockResolvedValue(undefined),
  configured: true,
}));

const mockConfig = vi.hoisted(() => ({
  healthHistoryEnabled: true,
  resourceMonitorEnabled: true,
  cpuSpikeThreshold: 90,
  memorySpikeThreshold: 90,
  spikeDurationThreshold: 0,
}));

const mockSocketObj = vi.hoisted(() => ({
  once: vi.fn(),
  connect: vi.fn(),
  destroy: vi.fn(),
  removeAllListeners: vi.fn(),
}));

const mockAxios = vi.hoisted(() => ({
  get: vi.fn(),
}));

// ── Module mocks (hoisted before any import) ──

vi.mock("axios", () => ({ default: mockAxios }));

vi.mock("net", () => ({
  default: {
    Socket: vi.fn(function () {
      return mockSocketObj;
    }),
  },
}));

vi.mock("@server/lib/config.js", () => ({ config: mockConfig }));
vi.mock("@server/db/serviceRepository.js", () => ({ serviceRepository: mockDb }));
vi.mock("@server/db/historyRepository.js", () => ({ historyRepository: mockDb }));

vi.mock("@server/services/dockerService.js", () => ({
  dockerService: mockDockerService,
  DOCKER_CONTAINER_STATE: {
    RUNNING: "running",
    EXITED: "exited",
    DEAD: "dead",
    STOPPED: "stopped",
  },
  DOCKER_CONTAINER_DOWN_STATES: ["exited", "dead", "stopped"],
}));

vi.mock("@server/services/notificationService.js", () => ({
  notificationService: mockNotificationService,
}));

vi.mock("@server/i18n/index.js", () => ({ t: vi.fn((key: string) => key) }));

const { healthCheckService } = await import("@server/services/healthCheckService.js");

// ── Helpers ──

function makeNetworkService(overrides: Record<string, unknown> = {}) {
  return {
    id: "svc-net",
    name: "web",
    host: "192.168.1.10",
    ports: [80],
    checkPort: 80,
    source: ServiceSource.NETWORK,
    status: ServiceStatus.UNKNOWN,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeDockerSvc(containerState: string, overrides: Record<string, unknown> = {}) {
  return {
    id: "svc-docker",
    name: "nginx",
    host: "localhost",
    ports: [],
    source: ServiceSource.DOCKER,
    status: ServiceStatus.UNKNOWN,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: {
      dockerHostId: "testhostid",
      containerName: "nginx",
      imageTag: "1.25",
      ...overrides,
    },
  };
}

// ── Tests ──

describe("HealthCheckService — network service checks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNotificationService.notify.mockResolvedValue(undefined);
  });

  afterEach(() => vi.clearAllMocks());

  it("returns UP when HTTP probe succeeds (2xx)", async () => {
    const svc = makeNetworkService();

    mockDb.getService.mockReturnValue(svc);
    mockAxios.get.mockResolvedValue({ status: 200 });

    const result = await healthCheckService.checkSingleService("svc-net");

    expect(result).toBe(ServiceStatus.UP);
    expect(mockDb.updateServiceStatus).toHaveBeenCalledWith("svc-net", ServiceStatus.UP);
  });

  it("returns UP when HTTP probe succeeds with a 3xx status (< 500)", async () => {
    const svc = makeNetworkService();

    mockDb.getService.mockReturnValue(svc);
    mockAxios.get.mockResolvedValue({ status: 301 });

    const result = await healthCheckService.checkSingleService("svc-net");

    expect(result).toBe(ServiceStatus.UP);
  });

  it("falls back to TCP and returns UP when HTTP probe fails but TCP connects", async () => {
    const svc = makeNetworkService({ checkPort: 80 });

    mockDb.getService.mockReturnValue(svc);
    mockAxios.get.mockRejectedValue(new Error("connection refused"));

    // TCP socket: trigger "connect" event
    let connectCb: (() => void) | null = null;

    mockSocketObj.once.mockImplementation((event: string, cb: () => void) => {
      if (event === "connect") connectCb = cb;
    });
    mockSocketObj.connect.mockImplementation(() => {
      Promise.resolve().then(() => connectCb?.());
    });

    const result = await healthCheckService.checkSingleService("svc-net");

    expect(result).toBe(ServiceStatus.UP);
  });

  it("returns DOWN when HTTP probe fails and TCP also fails", async () => {
    const svc = makeNetworkService({ checkPort: 80 });

    mockDb.getService.mockReturnValue(svc);
    mockAxios.get.mockRejectedValue(new Error("refused"));

    // TCP socket: trigger "error" event
    let errorCb: (() => void) | null = null;

    mockSocketObj.once.mockImplementation((event: string, cb: () => void) => {
      if (event === "error") errorCb = cb;
    });
    mockSocketObj.connect.mockImplementation(() => {
      Promise.resolve().then(() => errorCb?.());
    });

    const result = await healthCheckService.checkSingleService("svc-net");

    expect(result).toBe(ServiceStatus.DOWN);
  });

  it("returns UNKNOWN when checkPort is not set", async () => {
    const svc = makeNetworkService({ checkPort: undefined, ports: [] });

    mockDb.getService.mockReturnValue(svc);

    const result = await healthCheckService.checkSingleService("svc-net");

    expect(result).toBe(ServiceStatus.UNKNOWN);
  });

  it("returns null when the service ID is not found", async () => {
    mockDb.getService.mockReturnValue(undefined);

    const result = await healthCheckService.checkSingleService("nonexistent");

    expect(result).toBeNull();
  });
});

describe("HealthCheckService — Docker service checks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNotificationService.notify.mockResolvedValue(undefined);
    mockDockerService.resolveHost.mockReturnValue("tcp://docker-host:2375");
    mockDockerService.createDockerClientForHost.mockReturnValue({});
  });

  afterEach(() => vi.clearAllMocks());

  it("returns UP when the container is in 'running' state", async () => {
    const svc = makeDockerSvc("running");

    mockDb.getService.mockReturnValue(svc);
    mockDockerService.getContainersStateMap.mockResolvedValue(
      new Map([
        [
          "nginx",
          { containerId: "c1", state: "running", imageTag: "1.25", imageDigest: undefined },
        ],
      ]),
    );

    const result = await healthCheckService.checkSingleService("svc-docker");

    expect(result).toBe(ServiceStatus.UP);
    expect(mockDb.updateServiceStatus).toHaveBeenCalledWith("svc-docker", ServiceStatus.UP);
  });

  it("returns DOWN when the container is in 'exited' state", async () => {
    const svc = makeDockerSvc("exited");

    mockDb.getService.mockReturnValue(svc);
    mockDockerService.getContainersStateMap.mockResolvedValue(
      new Map([
        ["nginx", { containerId: "c1", state: "exited", imageTag: "1.25", imageDigest: undefined }],
      ]),
    );

    const result = await healthCheckService.checkSingleService("svc-docker");

    expect(result).toBe(ServiceStatus.DOWN);
  });

  it("returns DOWN when the container is not found in the state map", async () => {
    const svc = makeDockerSvc("running");

    mockDb.getService.mockReturnValue(svc);
    mockDockerService.getContainersStateMap.mockResolvedValue(new Map());

    const result = await healthCheckService.checkSingleService("svc-docker");

    expect(result).toBe(ServiceStatus.DOWN);
  });

  it("returns UNKNOWN when dockerHostId or containerName is not set", async () => {
    const svc = makeDockerSvc("running", { dockerHostId: undefined, containerName: undefined });

    mockDb.getService.mockReturnValue(svc);
    mockDockerService.resolveHost.mockReturnValue(undefined);

    const result = await healthCheckService.checkSingleService("svc-docker");

    expect(result).toBe(ServiceStatus.UNKNOWN);
  });

  it("returns UNKNOWN (not DOWN) when the Docker host is unreachable", async () => {
    const svc = makeDockerSvc("running");

    mockDb.getService.mockReturnValue(svc);
    mockDockerService.getContainersStateMap.mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await healthCheckService.checkSingleService("svc-docker");

    expect(result).toBe(ServiceStatus.UNKNOWN);
    expect(mockDb.updateServiceStatus).toHaveBeenCalledWith("svc-docker", ServiceStatus.UNKNOWN);
  });

  it("clears hasUpdate flag when the running image tag matches the latest version", async () => {
    const svc = {
      ...makeDockerSvc("running"),
      metadata: {
        dockerHostId: "testhostid",
        containerName: "nginx",
        imageTag: "1.25",
        hasUpdate: true,
        latestVersion: "1.26",
      },
    };

    mockDb.getService.mockReturnValue(svc);
    mockDockerService.getContainersStateMap.mockResolvedValue(
      new Map([
        [
          "nginx",
          { containerId: "c1", state: "running", imageTag: "1.26", imageDigest: undefined },
        ],
      ]),
    );

    await healthCheckService.checkSingleService("svc-docker");

    expect(mockDb.updateServiceMetadata).toHaveBeenCalledWith(
      "svc-docker",
      expect.objectContaining({ hasUpdate: false }),
    );
  });
});

describe("HealthCheckService — status-change notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNotificationService.notify.mockResolvedValue(undefined);
    mockAxios.get.mockResolvedValue({ status: 200 });
  });

  it("sends a 'down' notification when status transitions from UP to DOWN", async () => {
    const svc = makeNetworkService({ status: ServiceStatus.UP });

    mockDb.getService.mockReturnValue(svc);
    mockAxios.get.mockResolvedValue({ status: 503 });

    // TCP also fails
    let errorCb: (() => void) | null = null;

    mockSocketObj.once.mockImplementation((event: string, cb: () => void) => {
      if (event === "error") errorCb = cb;
    });
    mockSocketObj.connect.mockImplementation(() => {
      Promise.resolve().then(() => errorCb?.());
    });

    await healthCheckService.checkSingleService("svc-net");

    expect(mockNotificationService.notify).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      "failure",
    );
    expect(mockDb.updateServiceStatus).toHaveBeenCalledWith("svc-net", ServiceStatus.DOWN);
  });

  it("sends a 'recovered' notification when status transitions from DOWN to UP", async () => {
    const svc = makeNetworkService({ status: ServiceStatus.DOWN });

    mockDb.getService.mockReturnValue(svc);
    mockAxios.get.mockResolvedValue({ status: 200 });

    await healthCheckService.checkSingleService("svc-net");

    expect(mockNotificationService.notify).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      "success",
    );
    expect(mockDb.updateServiceStatus).toHaveBeenCalledWith("svc-net", ServiceStatus.UP);
  });

  it("does not send a notification when the status is unchanged", async () => {
    const svc = makeNetworkService({ status: ServiceStatus.UP });

    mockDb.getService.mockReturnValue(svc);
    mockAxios.get.mockResolvedValue({ status: 200 });

    await healthCheckService.checkSingleService("svc-net");

    expect(mockNotificationService.notify).not.toHaveBeenCalled();
    expect(mockDb.updateServiceStatus).toHaveBeenCalledWith("svc-net", ServiceStatus.UP);
  });
});

describe("HealthCheckService.checkAllServices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig.healthHistoryEnabled = true;
    mockConfig.resourceMonitorEnabled = true;
    mockNotificationService.notify.mockResolvedValue(undefined);
  });

  it("returns { updated, errors } counts after checking all services", async () => {
    const svc1 = makeNetworkService({ id: "s1", status: ServiceStatus.DOWN });
    const svc2 = makeNetworkService({ id: "s2", host: "10.0.0.1", status: ServiceStatus.UP });

    mockDb.getServices.mockReturnValue([svc1, svc2]);
    mockDb.getService.mockImplementation((id: string) => [svc1, svc2].find((s) => s.id === id));

    mockAxios.get.mockResolvedValue({ status: 200 });

    const result = await healthCheckService.checkAllServices();

    // svc1 was DOWN, now UP → updated++; svc2 stays UP → no change
    expect(result.updated).toBeGreaterThanOrEqual(1);
    expect(result.errors).toBe(0);
  });

  it("populates latestStats cache for Docker services after fetching resource stats", async () => {
    const svc = makeDockerSvc("running");

    svc.id = "cache-test-svc";
    mockDb.getServices.mockReturnValue([svc]);
    mockDockerService.resolveHost.mockReturnValue("tcp://host:2375");
    mockDockerService.createDockerClientForHost.mockReturnValue({});
    mockDockerService.getContainersStateMap.mockResolvedValue(
      new Map([["nginx", { state: "running" }]]),
    );
    mockDockerService.getContainerForServiceId.mockReturnValue({});
    mockDockerService.getContainerStats.mockResolvedValue({
      cpuPercent: 42,
      memoryPercent: 55,
      memoryUsed: 0,
      memoryLimit: 1_000_000_000,
      networkRx: 0,
      networkTx: 0,
      blockRead: 0,
      blockWrite: 0,
    });

    await healthCheckService.checkAllServices();

    expect(healthCheckService.getLatestStats().get("cache-test-svc")).toMatchObject({
      cpuPercent: 42,
      memoryPercent: 55,
    });
  });
});

describe("HealthCheckService — resource spike monitoring", () => {
  const BASE_STATS = {
    cpuPercent: 50,
    memoryUsed: 0,
    memoryLimit: 1_000_000_000,
    memoryPercent: 50,
    networkRx: 0,
    networkTx: 0,
    blockRead: 0,
    blockWrite: 0,
  };
  const CPU_SPIKE_STATS = { ...BASE_STATS, cpuPercent: 95 };
  const MEM_SPIKE_STATS = { ...BASE_STATS, memoryPercent: 95 };
  const NORMAL_STATS = BASE_STATS;

  function makeDockerSvcWithId(id: string) {
    return {
      ...makeDockerSvc("running"),
      id,
    };
  }

  function setupDockerEnv(svc: ReturnType<typeof makeDockerSvc>) {
    mockDb.getServices.mockReturnValue([svc]);
    mockDb.getService.mockReturnValue(svc);
    mockDockerService.resolveHost.mockReturnValue("tcp://host:2375");
    mockDockerService.createDockerClientForHost.mockReturnValue({});
    mockDockerService.getContainersStateMap.mockResolvedValue(
      new Map([["nginx", { state: "running" }]]),
    );
    mockDockerService.getContainerForServiceId.mockReturnValue({});
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig.resourceMonitorEnabled = true;
    mockConfig.cpuSpikeThreshold = 90;
    mockConfig.memorySpikeThreshold = 90;
    mockConfig.spikeDurationThreshold = 0;
    mockNotificationService.configured = true;
    mockNotificationService.notify.mockResolvedValue(undefined);
  });

  it("skips resource checks and notifications when resourceMonitorEnabled is false", async () => {
    mockConfig.resourceMonitorEnabled = false;
    const svc = makeDockerSvcWithId("res-skip-disabled");

    setupDockerEnv(svc);

    await healthCheckService.checkAllServices();

    expect(mockDockerService.getContainerStats).not.toHaveBeenCalled();
    expect(mockNotificationService.notify).not.toHaveBeenCalled();
  });

  it("skips CPU spike notifications when CPU threshold is 0", async () => {
    mockConfig.cpuSpikeThreshold = 0;
    const svc = makeDockerSvcWithId("cpu-threshold-zero");

    setupDockerEnv(svc);
    mockDockerService.getContainerStats.mockResolvedValue(CPU_SPIKE_STATS);

    await healthCheckService.checkAllServices();

    expect(mockNotificationService.notify).not.toHaveBeenCalled();
  });

  it("skips memory spike notifications when memory threshold is 0", async () => {
    mockConfig.memorySpikeThreshold = 0;
    const svc = makeDockerSvcWithId("mem-threshold-zero");

    setupDockerEnv(svc);
    mockDockerService.getContainerStats.mockResolvedValue(MEM_SPIKE_STATS);

    await healthCheckService.checkAllServices();

    expect(mockNotificationService.notify).not.toHaveBeenCalled();
  });

  it("skips spike notifications when Apprise is not configured", async () => {
    mockNotificationService.configured = false;
    const svc = makeDockerSvcWithId("res-skip-apprise");

    setupDockerEnv(svc);
    mockDockerService.getContainerStats.mockResolvedValue(CPU_SPIKE_STATS);

    await healthCheckService.checkAllServices();

    expect(mockDockerService.getContainerStats).toHaveBeenCalled();
    expect(mockNotificationService.notify).not.toHaveBeenCalled();
  });

  it("CPU: sends warning on spike, suppresses while sustained, sends recovery when resolved", async () => {
    const svc = makeDockerSvcWithId("cpu-lifecycle");

    setupDockerEnv(svc);

    // Run 1: CPU normal → no notification
    mockDockerService.getContainerStats.mockResolvedValue(NORMAL_STATS);
    await healthCheckService.checkAllServices();
    expect(mockNotificationService.notify).not.toHaveBeenCalled();

    // Run 2: CPU spikes → warning
    mockDockerService.getContainerStats.mockResolvedValue(CPU_SPIKE_STATS);
    await healthCheckService.checkAllServices();
    expect(mockNotificationService.notify).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      "warning",
    );

    vi.clearAllMocks();
    mockNotificationService.notify.mockResolvedValue(undefined);

    // Run 3: CPU still spiking → no repeat notification
    await healthCheckService.checkAllServices();
    expect(mockNotificationService.notify).not.toHaveBeenCalled();

    // Run 4: CPU recovers → recovery notification
    mockDockerService.getContainerStats.mockResolvedValue(NORMAL_STATS);
    await healthCheckService.checkAllServices();
    expect(mockNotificationService.notify).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      "success",
    );
  });

  it("Memory: sends warning on spike, suppresses while sustained, sends recovery when resolved", async () => {
    const svc = makeDockerSvcWithId("mem-lifecycle");

    setupDockerEnv(svc);

    // Run 1: memory normal → no notification
    mockDockerService.getContainerStats.mockResolvedValue(NORMAL_STATS);
    await healthCheckService.checkAllServices();
    expect(mockNotificationService.notify).not.toHaveBeenCalled();

    // Run 2: memory spikes → warning
    mockDockerService.getContainerStats.mockResolvedValue(MEM_SPIKE_STATS);
    await healthCheckService.checkAllServices();
    expect(mockNotificationService.notify).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      "warning",
    );

    vi.clearAllMocks();
    mockNotificationService.notify.mockResolvedValue(undefined);

    // Run 3: memory still spiking → no repeat notification
    await healthCheckService.checkAllServices();
    expect(mockNotificationService.notify).not.toHaveBeenCalled();

    // Run 4: memory recovers → recovery notification
    mockDockerService.getContainerStats.mockResolvedValue(NORMAL_STATS);
    await healthCheckService.checkAllServices();
    expect(mockNotificationService.notify).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      "success",
    );
  });

  it("CPU: suppresses alert until threshold is exceeded for the configured duration", async () => {
    mockConfig.spikeDurationThreshold = 300; // 300 s debounce
    const svc = makeDockerSvcWithId("cpu-duration-debounce");

    setupDockerEnv(svc);
    vi.useFakeTimers();

    try {
      // Run 1: CPU spikes but duration has not elapsed → no alert
      mockDockerService.getContainerStats.mockResolvedValue(CPU_SPIKE_STATS);
      await healthCheckService.checkAllServices();
      expect(mockNotificationService.notify).not.toHaveBeenCalled();

      // Run 2: CPU still spiking, only 60 s elapsed → still no alert
      vi.advanceTimersByTime(60_000);
      await healthCheckService.checkAllServices();
      expect(mockNotificationService.notify).not.toHaveBeenCalled();

      // Run 3: 300 s elapsed → alert fires
      vi.advanceTimersByTime(240_000);
      await healthCheckService.checkAllServices();
      expect(mockNotificationService.notify).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        "warning",
      );

      vi.clearAllMocks();
      mockNotificationService.notify.mockResolvedValue(undefined);

      // Run 4: CPU recovers → brief spike that never reached threshold mid-debounce is cleared
      mockDockerService.getContainerStats.mockResolvedValue(NORMAL_STATS);
      await healthCheckService.checkAllServices();
      expect(mockNotificationService.notify).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        "success",
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("CPU: a brief spike that drops before the duration elapses sends no alert and no recovery", async () => {
    mockConfig.spikeDurationThreshold = 300;
    const svc = makeDockerSvcWithId("cpu-brief-spike");

    setupDockerEnv(svc);
    vi.useFakeTimers();

    try {
      // Spike detected
      mockDockerService.getContainerStats.mockResolvedValue(CPU_SPIKE_STATS);
      await healthCheckService.checkAllServices();
      expect(mockNotificationService.notify).not.toHaveBeenCalled();

      // Drops before duration elapses (only 10 s in)
      vi.advanceTimersByTime(10_000);
      mockDockerService.getContainerStats.mockResolvedValue(NORMAL_STATS);
      await healthCheckService.checkAllServices();

      // No alert and no recovery sent
      expect(mockNotificationService.notify).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("HealthCheckService — flag interaction scenarios", () => {
  const SPIKE_STATS = {
    cpuPercent: 95,
    memoryUsed: 0,
    memoryLimit: 1_000_000_000,
    memoryPercent: 95,
    networkRx: 0,
    networkTx: 0,
    blockRead: 0,
    blockWrite: 0,
  };

  // Docker service that is currently DOWN so DOWN→UP triggers a status notification.
  function makeDownDockerSvc(id: string) {
    return {
      id,
      name: "nginx",
      host: "localhost",
      ports: [],
      source: ServiceSource.DOCKER,
      status: ServiceStatus.DOWN,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: { dockerHostId: "testhostid", containerName: "nginx", imageTag: "1.25" },
    };
  }

  function setupDockerEnv(svc: ReturnType<typeof makeDownDockerSvc>) {
    mockDb.getServices.mockReturnValue([svc]);
    mockDb.getService.mockReturnValue(svc);
    mockDockerService.resolveHost.mockReturnValue("tcp://host:2375");
    mockDockerService.createDockerClientForHost.mockReturnValue({});
    mockDockerService.getContainersStateMap.mockResolvedValue(
      new Map([["nginx", { state: "running" }]]),
    );
    mockDockerService.getContainerForServiceId.mockReturnValue({});
    mockDockerService.getContainerStats.mockResolvedValue(SPIKE_STATS);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig.healthHistoryEnabled = true;
    mockConfig.resourceMonitorEnabled = true;
    mockConfig.cpuSpikeThreshold = 90;
    mockConfig.memorySpikeThreshold = 90;
    mockConfig.spikeDurationThreshold = 0;
    mockNotificationService.configured = true;
    mockNotificationService.notify.mockResolvedValue(undefined);
  });

  it("persists health history and resource stats independently when Apprise is disabled", async () => {
    mockNotificationService.configured = false;
    const svc = makeDownDockerSvc("flag-apprise-disabled-history");

    setupDockerEnv(svc);

    await healthCheckService.checkAllServices();

    expect(mockDb.addHealthHistory).toHaveBeenCalledWith(svc.id, ServiceStatus.UP);
    expect(mockDb.addResourceStatsHistory).toHaveBeenCalledWith(
      svc.id,
      SPIKE_STATS.cpuPercent,
      SPIKE_STATS.memoryPercent,
    );
  });

  it("persists health history but not resource stats when resource monitoring is disabled", async () => {
    mockConfig.resourceMonitorEnabled = false;
    const svc = makeDownDockerSvc("flag-resmon-disabled-history");

    setupDockerEnv(svc);

    await healthCheckService.checkAllServices();

    expect(mockDb.addHealthHistory).toHaveBeenCalledWith(svc.id, ServiceStatus.UP);
    expect(mockDb.addResourceStatsHistory).not.toHaveBeenCalled();
  });

  it("skips all notifications when Apprise is disabled, even when status and stats would trigger them", async () => {
    mockNotificationService.configured = false;
    const svc = makeDownDockerSvc("flag-apprise-disabled-no-notify");

    setupDockerEnv(svc);

    await healthCheckService.checkAllServices();

    expect(mockNotificationService.notify).not.toHaveBeenCalled();
  });

  it("emits status notification but not spike notification when resource monitoring is disabled", async () => {
    mockConfig.resourceMonitorEnabled = false;
    const svc = makeDownDockerSvc("flag-resmon-disabled-notify");

    setupDockerEnv(svc);

    await healthCheckService.checkAllServices();

    expect(mockNotificationService.notify).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      "success",
    );
    expect(mockNotificationService.notify).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      "warning",
    );
  });

  it("fires both status and spike notifications when health history is disabled", async () => {
    mockConfig.healthHistoryEnabled = false;
    const svc = makeDownDockerSvc("flag-history-disabled-notify");

    setupDockerEnv(svc);

    await healthCheckService.checkAllServices();

    expect(mockNotificationService.notify).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      "success",
    );
    expect(mockNotificationService.notify).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      "warning",
    );
    expect(mockDb.addHealthHistory).not.toHaveBeenCalled();
  });
});
