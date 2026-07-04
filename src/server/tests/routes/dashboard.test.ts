import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = vi.hoisted(() => ({
  getDashboardData: vi.fn(),
}));

const mockHealthCheckService = vi.hoisted(() => ({
  checkAllServices: vi.fn(),
}));

const mockLogger = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));

vi.mock("@server/db/databaseService.js", () => ({ db: mockDb }));
vi.mock("@server/services/healthCheckService.js", () => ({
  healthCheckService: mockHealthCheckService,
}));
vi.mock("@server/lib/logService.js", () => ({ logger: mockLogger }));

const routerModule = await import("@server/routes/dashboard.js");

const app = express();

app.use(express.json());
app.use("/api", routerModule.default);

describe("GET /api/dashboard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 with dashboard data", async () => {
    const dashboardData = { services: [], links: [] };

    mockDb.getDashboardData.mockReturnValue(dashboardData);

    const res = await request(app).get("/api/dashboard");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(dashboardData);
  });
});

describe("POST /api/checkAllServices", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 with { status: 'running' } (fire-and-forget)", async () => {
    mockHealthCheckService.checkAllServices.mockResolvedValue({ updated: 0, errors: 0 });

    const res = await request(app).post("/api/checkAllServices");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "running" });
  });
});
