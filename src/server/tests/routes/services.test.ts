import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ServiceSource, ServiceStatus } from "@shared";

const mockSvcRepo = vi.hoisted(() => ({
  getServices: vi.fn(),
  getService: vi.fn(),
  getServiceStatuses: vi.fn(),
  saveService: vi.fn(),
  updateService: vi.fn(),
  deleteService: vi.fn(),
  addServiceToDashboard: vi.fn(),
  removeServiceFromDashboard: vi.fn(),
  saveServicePosition: vi.fn(),
  getServicePositions: vi.fn(),
}));

const mockHistRepo = vi.hoisted(() => ({
  getHealthHistory: vi.fn(),
}));

const mockHealthCheckService = vi.hoisted(() => ({
  checkSingleService: vi.fn(),
}));

const mockChangelogService = vi.hoisted(() => ({
  fetchChangelog: vi.fn(),
}));

const mockDockerService = vi.hoisted(() => ({
  getContainerForServiceId: vi.fn(),
  getContainerStats: vi.fn(),
}));

const mockConfig = vi.hoisted(() => ({
  healthHistoryEnabled: true,
  resourceMonitorEnabled: true,
}));

const mockLogger = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));

vi.mock("@server/lib/config.js", () => ({ config: mockConfig }));
vi.mock("@server/db/serviceRepository.js", () => ({ serviceRepository: mockSvcRepo }));
vi.mock("@server/db/historyRepository.js", () => ({ historyRepository: mockHistRepo }));
vi.mock("@server/services/healthCheckService.js", () => ({
  healthCheckService: mockHealthCheckService,
}));
vi.mock("@server/services/changelogService.js", () => ({
  changelogService: mockChangelogService,
}));
vi.mock("@server/services/dockerService.js", () => ({ dockerService: mockDockerService }));
vi.mock("@server/lib/logService.js", () => ({ logger: mockLogger }));

const routerModule = await import("@server/routes/services.js");

const app = express();

app.use(express.json());
app.use("/api", routerModule.default);

const makeService = (overrides = {}) => ({
  id: "svc-1",
  name: "My Service",
  host: "192.168.1.1",
  ports: [80],
  checkPort: null,
  source: ServiceSource.NETWORK,
  status: ServiceStatus.UNKNOWN,
  metadata: {},
  onDashboard: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

describe("GET /api/services", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 with array from db.getServices()", async () => {
    const services = [makeService()];

    mockSvcRepo.getServices.mockReturnValue(services);

    const res = await request(app).get("/api/services");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(services);
  });
});

describe("GET /api/serviceStatuses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig.resourceMonitorEnabled = false;
  });

  it("returns 200 with base statuses when resourceMonitorEnabled is false", async () => {
    const statuses = [{ id: "svc-1", status: ServiceStatus.UP, metadata: {} }];

    mockSvcRepo.getServiceStatuses.mockReturnValue(statuses);

    const res = await request(app).get("/api/serviceStatuses");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(statuses);
    expect(mockDockerService.getContainerForServiceId).not.toHaveBeenCalled();
  });

  it("fetches live Docker stats and merges them when resourceMonitorEnabled is true", async () => {
    const statuses = [{ id: "svc-1", status: ServiceStatus.UP, metadata: {} }];
    const mockContainer = {};

    mockSvcRepo.getServiceStatuses.mockReturnValue(statuses);
    mockDockerService.getContainerForServiceId.mockReturnValue(mockContainer);
    mockDockerService.getContainerStats.mockResolvedValue({ cpuPercent: 30, memoryPercent: 50 });
    mockConfig.resourceMonitorEnabled = true;

    const res = await request(app).get("/api/serviceStatuses");

    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({ id: "svc-1", cpuPercent: 30, memoryPercent: 50 });
  });

  it("omits resource fields for services where Docker stat fetch fails", async () => {
    const statuses = [{ id: "svc-1", status: ServiceStatus.UP, metadata: {} }];

    mockSvcRepo.getServiceStatuses.mockReturnValue(statuses);
    mockDockerService.getContainerForServiceId.mockImplementation(() => {
      throw new Error("Not a Docker service");
    });
    mockConfig.resourceMonitorEnabled = true;

    const res = await request(app).get("/api/serviceStatuses");

    expect(res.status).toBe(200);
    expect(res.body[0].cpuPercent).toBeUndefined();
    expect(res.body[0].memoryPercent).toBeUndefined();
  });
});

describe("GET /api/services/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 when service found", async () => {
    const service = makeService();

    mockSvcRepo.getServices.mockReturnValue([service]);

    const res = await request(app).get("/api/services/svc-1");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(service);
  });

  it("returns 404 when service not found", async () => {
    mockSvcRepo.getServices.mockReturnValue([]);

    const res = await request(app).get("/api/services/nonexistent");

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error");
  });
});

describe("POST /api/services", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 201 with valid body { name, host }", async () => {
    const saved = makeService({ name: "New Service", host: "10.0.0.1" });

    mockSvcRepo.saveService.mockReturnValue(saved);
    mockHealthCheckService.checkSingleService.mockResolvedValue(undefined);

    const res = await request(app)
      .post("/api/services")
      .send({ name: "New Service", host: "10.0.0.1" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(saved);
  });

  it("returns 400 when name missing", async () => {
    const res = await request(app).post("/api/services").send({ host: "10.0.0.1" });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 400 when host missing", async () => {
    const res = await request(app).post("/api/services").send({ name: "Svc" });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 400 when ports contains invalid value", async () => {
    const res = await request(app)
      .post("/api/services")
      .send({ name: "Svc", host: "10.0.0.1", ports: [99999] });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 400 when checkPort is invalid", async () => {
    const res = await request(app)
      .post("/api/services")
      .send({ name: "Svc", host: "10.0.0.1", checkPort: 0 });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});

describe("PUT /api/services/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 with valid update", async () => {
    const updated = makeService({ name: "Updated" });

    mockSvcRepo.updateService.mockReturnValue(updated);
    mockHealthCheckService.checkSingleService.mockResolvedValue(undefined);

    const res = await request(app).put("/api/services/svc-1").send({ name: "Updated" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(updated);
  });

  it("returns 404 when service not found (db.updateService throws)", async () => {
    mockSvcRepo.updateService.mockImplementation(() => {
      throw new Error("Service not found");
    });

    const res = await request(app).put("/api/services/nonexistent").send({ name: "X" });

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 400 when name is empty string", async () => {
    const res = await request(app).put("/api/services/svc-1").send({ name: "" });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});

describe("DELETE /api/services/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200", async () => {
    mockSvcRepo.deleteService.mockReturnValue(undefined);

    const res = await request(app).delete("/api/services/svc-1");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });
});

describe("POST /api/services/:id/dashboard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 when service exists", async () => {
    mockSvcRepo.getService.mockReturnValue(makeService());
    mockSvcRepo.addServiceToDashboard.mockReturnValue(undefined);

    const res = await request(app).post("/api/services/svc-1/dashboard");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });

  it("returns 404 when service not found", async () => {
    mockSvcRepo.getService.mockReturnValue(undefined);

    const res = await request(app).post("/api/services/nonexistent/dashboard");

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error");
  });
});

describe("DELETE /api/services/:id/dashboard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200", async () => {
    mockSvcRepo.removeServiceFromDashboard.mockReturnValue(undefined);

    const res = await request(app).delete("/api/services/svc-1/dashboard");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });
});

describe("POST /api/positions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 with valid positions array", async () => {
    mockSvcRepo.saveServicePosition.mockReturnValue(undefined);
    mockSvcRepo.getServicePositions.mockReturnValue([{ serviceId: "svc-1", x: 10, y: 20 }]);

    const res = await request(app)
      .post("/api/positions")
      .send({ positions: [{ serviceId: "svc-1", x: 10, y: 20 }] });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("positions");
  });

  it("returns 400 when positions is not an array", async () => {
    const res = await request(app).post("/api/positions").send({ positions: "invalid" });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});

describe("GET /api/services/:id/health-history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig.healthHistoryEnabled = true;
  });

  it("returns 403 when healthHistoryEnabled is false", async () => {
    mockConfig.healthHistoryEnabled = false;

    const res = await request(app).get("/api/services/svc-1/health-history");

    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 200", async () => {
    mockHistRepo.getHealthHistory.mockReturnValue([]);

    const res = await request(app).get("/api/services/svc-1/health-history");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe("GET /api/services/:id/changelog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 when service found", async () => {
    mockSvcRepo.getService.mockReturnValue(makeService());
    mockChangelogService.fetchChangelog.mockResolvedValue({ available: false, reason: "No repo" });

    const res = await request(app).get("/api/services/svc-1/changelog");

    expect(res.status).toBe(200);
  });

  it("returns 404 when service not found", async () => {
    mockSvcRepo.getService.mockReturnValue(undefined);

    const res = await request(app).get("/api/services/nonexistent/changelog");

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error");
  });
});
