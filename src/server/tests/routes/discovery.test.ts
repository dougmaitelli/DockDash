import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDockerService = vi.hoisted(() => ({
  createDockerClients: vi.fn(),
}));

const mockNetworkScanner = vi.hoisted(() => ({
  parseCIDRConfig: vi.fn(),
  scanNetworkStream: vi.fn(),
}));

const mockLogger = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));

vi.mock("@server/services/dockerService.js", () => ({
  dockerService: mockDockerService,
}));
vi.mock("@server/services/networkScanner.js", () => ({
  networkScanner: mockNetworkScanner,
}));
vi.mock("@server/lib/logService.js", () => ({ logger: mockLogger }));

const routerModule = await import("@server/routes/discovery.js");

const app = express();

app.use(express.json());
app.use("/api", routerModule.default);

describe("GET /api/docker/health", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 with array of host health objects when connected", async () => {
    const mockDockerInfo = {
      Containers: 5,
      ContainersRunning: 3,
      ContainersPaused: 0,
      ContainersStopped: 2,
      ServerVersion: "24.0.0",
    };
    const mockDocker = { info: vi.fn().mockResolvedValue(mockDockerInfo) };

    mockDockerService.createDockerClients.mockReturnValue([
      { host: "unix:///var/run/docker.sock", docker: mockDocker },
    ]);

    const res = await request(app).get("/api/docker/health");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toMatchObject({
      host: "unix:///var/run/docker.sock",
      connected: true,
      containers: 5,
      containersRunning: 3,
    });
  });

  it("returns 200 with connected: false when docker.info() throws", async () => {
    const mockDocker = { info: vi.fn().mockRejectedValue(new Error("Connection refused")) };

    mockDockerService.createDockerClients.mockReturnValue([
      { host: "unix:///var/run/docker.sock", docker: mockDocker },
    ]);

    const res = await request(app).get("/api/docker/health");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toMatchObject({
      host: "unix:///var/run/docker.sock",
      connected: false,
      error: "Connection refused",
    });
  });

  it("returns 200 with empty array when no docker clients configured", async () => {
    mockDockerService.createDockerClients.mockReturnValue([]);

    const res = await request(app).get("/api/docker/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
