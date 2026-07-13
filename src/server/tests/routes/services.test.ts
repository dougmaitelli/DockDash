import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ServiceSource, ServiceStatus } from "@shared";

const mockDb = vi.hoisted(() => ({
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
  getHealthHistory: vi.fn(),
}));

const mockHealthCheckService = vi.hoisted(() => ({
  checkSingleService: vi.fn(),
}));

const mockChangelogService = vi.hoisted(() => ({
  fetchChangelog: vi.fn(),
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
vi.mock("@server/db/databaseService.js", () => ({ db: mockDb }));
vi.mock("@server/services/healthCheckService.js", () => ({
  healthCheckService: mockHealthCheckService,
}));
vi.mock("@server/services/changelogService.js", () => ({
  changelogService: mockChangelogService,
}));
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

    mockDb.getServices.mockReturnValue(services);

    const res = await request(app).get("/api/services");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(services);
  });
});

describe("GET /api/serviceStatuses", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 with service statuses", async () => {
    const statuses = [{ id: "svc-1", status: ServiceStatus.UP, metadata: {} }];

    mockDb.getServiceStatuses.mockReturnValue(statuses);

    const res = await request(app).get("/api/serviceStatuses");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(statuses);
  });

  it("passes resourceMonitorEnabled flag to getServiceStatuses", async () => {
    mockDb.getServiceStatuses.mockReturnValue([]);
    mockConfig.resourceMonitorEnabled = true;

    await request(app).get("/api/serviceStatuses");
    expect(mockDb.getServiceStatuses).toHaveBeenCalledWith(true);

    mockConfig.resourceMonitorEnabled = false;
    await request(app).get("/api/serviceStatuses");
    expect(mockDb.getServiceStatuses).toHaveBeenCalledWith(false);
  });
});

describe("GET /api/services/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 when service found", async () => {
    const service = makeService();

    mockDb.getServices.mockReturnValue([service]);

    const res = await request(app).get("/api/services/svc-1");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(service);
  });

  it("returns 404 when service not found", async () => {
    mockDb.getServices.mockReturnValue([]);

    const res = await request(app).get("/api/services/nonexistent");

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error");
  });
});

describe("POST /api/services", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 201 with valid body { name, host }", async () => {
    const saved = makeService({ name: "New Service", host: "10.0.0.1" });

    mockDb.saveService.mockReturnValue(saved);
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

    mockDb.updateService.mockReturnValue(updated);
    mockHealthCheckService.checkSingleService.mockResolvedValue(undefined);

    const res = await request(app).put("/api/services/svc-1").send({ name: "Updated" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(updated);
  });

  it("returns 404 when service not found (db.updateService throws)", async () => {
    mockDb.updateService.mockImplementation(() => {
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
    mockDb.deleteService.mockReturnValue(undefined);

    const res = await request(app).delete("/api/services/svc-1");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });
});

describe("POST /api/services/:id/dashboard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 when service exists", async () => {
    mockDb.getService.mockReturnValue(makeService());
    mockDb.addServiceToDashboard.mockReturnValue(undefined);

    const res = await request(app).post("/api/services/svc-1/dashboard");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });

  it("returns 404 when service not found", async () => {
    mockDb.getService.mockReturnValue(undefined);

    const res = await request(app).post("/api/services/nonexistent/dashboard");

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error");
  });
});

describe("DELETE /api/services/:id/dashboard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200", async () => {
    mockDb.removeServiceFromDashboard.mockReturnValue(undefined);

    const res = await request(app).delete("/api/services/svc-1/dashboard");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });
});

describe("POST /api/positions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 with valid positions array", async () => {
    mockDb.saveServicePosition.mockReturnValue(undefined);
    mockDb.getServicePositions.mockReturnValue([{ serviceId: "svc-1", x: 10, y: 20 }]);

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
    mockDb.getHealthHistory.mockReturnValue([]);

    const res = await request(app).get("/api/services/svc-1/health-history");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe("GET /api/services/:id/changelog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 when service found", async () => {
    mockDb.getService.mockReturnValue(makeService());
    mockChangelogService.fetchChangelog.mockResolvedValue({ available: false, reason: "No repo" });

    const res = await request(app).get("/api/services/svc-1/changelog");

    expect(res.status).toBe(200);
  });

  it("returns 404 when service not found", async () => {
    mockDb.getService.mockReturnValue(undefined);

    const res = await request(app).get("/api/services/nonexistent/changelog");

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error");
  });
});
