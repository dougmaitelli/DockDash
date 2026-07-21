import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isConnectionHealthy: vi.fn(),
  isReady: vi.fn(),
}));

vi.mock("@server/db/connection.js", () => ({
  isConnectionHealthy: mocks.isConnectionHealthy,
}));
vi.mock("@server/lib/serverHealth.js", () => ({
  serverHealth: { isReady: mocks.isReady },
}));

const { default: healthRoutes } = await import("@server/routes/health.js");
const app = express();

app.use("/api", healthRoutes);

describe("health routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isReady.mockReturnValue(true);
    mocks.isConnectionHealthy.mockReturnValue(true);
  });

  it("reports liveness without checking dependencies", async () => {
    const res = await request(app).get("/api/health/live");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(mocks.isConnectionHealthy).not.toHaveBeenCalled();
  });

  it.each(["/api/health", "/api/health/ready"])("reports readiness at %s", async (url) => {
    const res = await request(app).get(url);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ready", checks: { database: "up" } });
  });

  it("returns 503 while the server is not ready", async () => {
    mocks.isReady.mockReturnValue(false);

    const res = await request(app).get("/api/health/ready");

    expect(res.status).toBe(503);
    expect(res.body.status).toBe("not_ready");
  });

  it("returns 503 when SQLite is unavailable", async () => {
    mocks.isConnectionHealthy.mockReturnValue(false);

    const res = await request(app).get("/api/health/ready");

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: "not_ready", checks: { database: "down" } });
  });
});
