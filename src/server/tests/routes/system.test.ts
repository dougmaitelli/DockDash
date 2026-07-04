import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockConfig = vi.hoisted(() => ({
  appVersion: "1.0.0",
  dockerHosts: ["unix:///var/run/docker.sock"],
  networkCidrs: ["192.168.0.0/24"],
  healthCheckInterval: 30000,
  updateCheckInterval: 3600000,
  healthHistoryTtlDays: 30,
  appriseConfigured: false,
  containerControlsEnabled: true,
  fileExplorerEnabled: true,
  terminalEnabled: true,
}));

const mockAppUpdateService = vi.hoisted(() => ({
  check: vi.fn(),
}));

vi.mock("@server/lib/config.js", () => ({ config: mockConfig }));
vi.mock("@server/services/appUpdateService.js", () => ({
  appUpdateService: mockAppUpdateService,
}));

const routerModule = await import("@server/routes/system.js");

const app = express();

app.use(express.json());
app.use("/api", routerModule.default);

describe("GET /api/config", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 with config shape", async () => {
    const res = await request(app).get("/api/config");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      version: mockConfig.appVersion,
      healthCheckInterval: mockConfig.healthCheckInterval,
      updateCheckInterval: mockConfig.updateCheckInterval,
      healthHistoryTtlDays: mockConfig.healthHistoryTtlDays,
      appriseConfigured: mockConfig.appriseConfigured,
      containerControlsEnabled: mockConfig.containerControlsEnabled,
      fileExplorerEnabled: mockConfig.fileExplorerEnabled,
      terminalEnabled: mockConfig.terminalEnabled,
    });
  });
});

describe("GET /api/app-update", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 with { hasUpdate: false } when no update", async () => {
    mockAppUpdateService.check.mockResolvedValue(null);

    const res = await request(app).get("/api/app-update");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ hasUpdate: false });
  });

  it("returns 200 with { hasUpdate: true, release: {...} } when update available", async () => {
    const release = {
      version: "2.0.0",
      publishedAt: "2025-01-01T00:00:00Z",
      body: "Release notes",
      htmlUrl: "https://github.com/example/releases/tag/v2.0.0",
    };

    mockAppUpdateService.check.mockResolvedValue({ hasUpdate: true, release });

    const res = await request(app).get("/api/app-update");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ hasUpdate: true, release });
  });
});
