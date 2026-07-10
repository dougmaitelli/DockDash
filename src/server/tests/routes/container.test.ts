import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockConfig = vi.hoisted(() => ({
  containerControlsEnabled: true,
  resourceMonitorEnabled: true,
}));

const mockContainer = vi.hoisted(() => ({
  stop: vi.fn(),
  start: vi.fn(),
  restart: vi.fn(),
}));

const mockDockerService = vi.hoisted(() => ({
  getContainerForServiceId: vi.fn(),
  getContainerStats: vi.fn(),
  openLogStream: vi.fn(),
}));

const mockHealthCheckService = vi.hoisted(() => ({
  checkSingleService: vi.fn(),
}));

const mockLogger = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));

vi.mock("@server/lib/config.js", () => ({ config: mockConfig }));
vi.mock("@server/services/dockerService.js", () => ({
  dockerService: mockDockerService,
}));
vi.mock("@server/services/healthCheckService.js", () => ({
  healthCheckService: mockHealthCheckService,
}));
vi.mock("@server/lib/logService.js", () => ({ logger: mockLogger }));

const routerModule = await import("@server/routes/container.js");

const app = express();

app.use(express.json());
app.use("/api", routerModule.default);

describe("POST /api/services/:id/container/:action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig.containerControlsEnabled = true;
    mockDockerService.getContainerForServiceId.mockReturnValue(mockContainer);
    mockHealthCheckService.checkSingleService.mockResolvedValue(undefined);
  });

  it("returns 403 when containerControlsEnabled is false", async () => {
    mockConfig.containerControlsEnabled = false;

    const res = await request(app).post("/api/services/svc-1/container/stop");

    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 400 when action is invalid", async () => {
    const res = await request(app).post("/api/services/svc-1/container/invalid-action");

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 200 when valid stop action", async () => {
    mockContainer.stop.mockResolvedValue(undefined);

    const res = await request(app).post("/api/services/svc-1/container/stop");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(mockContainer.stop).toHaveBeenCalledOnce();
  });

  it("returns 200 when valid start action", async () => {
    mockContainer.start.mockResolvedValue(undefined);

    const res = await request(app).post("/api/services/svc-1/container/start");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(mockContainer.start).toHaveBeenCalledOnce();
  });

  it("returns 200 when valid restart action", async () => {
    mockContainer.restart.mockResolvedValue(undefined);

    const res = await request(app).post("/api/services/svc-1/container/restart");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(mockContainer.restart).toHaveBeenCalledOnce();
  });

  it("returns 400 when container.stop throws", async () => {
    mockContainer.stop.mockRejectedValue(new Error("Container not running"));

    const res = await request(app).post("/api/services/svc-1/container/stop");

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});

describe("GET /api/services/:id/stats", () => {
  const MOCK_STATS = {
    cpuPercent: 12.5,
    memoryUsed: 134_217_728,
    memoryLimit: 8_589_934_592,
    memoryPercent: 1.6,
    networkRx: 1_048_576,
    networkTx: 524_288,
    blockRead: 2_097_152,
    blockWrite: 1_048_576,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig.resourceMonitorEnabled = true;
    mockDockerService.getContainerForServiceId.mockReturnValue(mockContainer);
    mockDockerService.getContainerStats.mockResolvedValue(MOCK_STATS);
  });

  it("returns 403 when resourceMonitorEnabled is false", async () => {
    mockConfig.resourceMonitorEnabled = false;

    const res = await request(app).get("/api/services/svc-1/stats");

    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 200 with parsed stats", async () => {
    const res = await request(app).get("/api/services/svc-1/stats");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(MOCK_STATS);
    expect(mockDockerService.getContainerForServiceId).toHaveBeenCalledWith("svc-1");
    expect(mockDockerService.getContainerStats).toHaveBeenCalledWith(mockContainer);
  });

  it("returns 400 when the service has no container metadata", async () => {
    mockDockerService.getContainerForServiceId.mockImplementation(() => {
      throw new Error("Container metadata not available");
    });

    const res = await request(app).get("/api/services/unknown/stats");

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 400 when getContainerStats rejects", async () => {
    mockDockerService.getContainerStats.mockRejectedValue(new Error("Docker daemon unreachable"));

    const res = await request(app).get("/api/services/svc-1/stats");

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});
