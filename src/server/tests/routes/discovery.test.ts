import express from "express";
import { EventEmitter } from "stream";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDockerService = vi.hoisted(() => ({
  createDockerClients: vi.fn(),
  scanDockerContainers: vi.fn(),
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

type RouteHandler = (req: unknown, res: unknown) => Promise<void>;

const dockerScanHandler = (
  routerModule.default as unknown as {
    stack: { route?: { path: string; stack: { handle: RouteHandler }[] } }[];
  }
).stack.find((layer) => layer.route?.path === "/docker/scan/stream")!.route!.stack[0].handle;
const networkScanHandler = (
  routerModule.default as unknown as {
    stack: { route?: { path: string; stack: { handle: RouteHandler }[] } }[];
  }
).stack.find((layer) => layer.route?.path === "/network/scan/stream")!.route!.stack[0].handle;

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

describe("GET /api/docker/scan/stream", () => {
  function createRequestAndResponse() {
    const req = new EventEmitter();
    const res = {
      setHeader: vi.fn(),
      flushHeaders: vi.fn(),
      write: vi.fn(),
      end: vi.fn(),
    };

    return { req, res };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockDockerService.createDockerClients.mockReturnValue([]);
    mockDockerService.scanDockerContainers.mockImplementation(async function* () {});
  });

  it("sets SSE headers and sends an empty completion event", async () => {
    const { req, res } = createRequestAndResponse();

    await dockerScanHandler(req, res);

    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "text/event-stream");
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-cache");
    expect(res.setHeader).toHaveBeenCalledWith("Connection", "keep-alive");
    expect(res.flushHeaders).toHaveBeenCalledOnce();
    expect(res.write).toHaveBeenCalledWith('event: done\ndata: {"count":0}\n\n');
    expect(res.end).toHaveBeenCalledOnce();
  });

  it("streams services from every Docker host and reports the total count", async () => {
    const clients = [
      { host: "docker-a", docker: { id: "a" } },
      { host: "docker-b", docker: { id: "b" } },
    ];

    mockDockerService.createDockerClients.mockReturnValue(clients);
    mockDockerService.scanDockerContainers.mockImplementation(async function* (
      _docker: unknown,
      host: string,
    ) {
      yield { id: `${host}-1`, name: "service" };

      if (host === "docker-a") yield { id: `${host}-2`, name: "another" };
    });

    const { req, res } = createRequestAndResponse();

    await dockerScanHandler(req, res);

    expect(mockDockerService.scanDockerContainers).toHaveBeenNthCalledWith(
      1,
      clients[0].docker,
      "docker-a",
    );
    expect(mockDockerService.scanDockerContainers).toHaveBeenNthCalledWith(
      2,
      clients[1].docker,
      "docker-b",
    );
    expect(res.write).toHaveBeenCalledWith('data: {"id":"docker-a-1","name":"service"}\n\n');
    expect(res.write).toHaveBeenCalledWith('event: done\ndata: {"count":3}\n\n');
    expect(res.end).toHaveBeenCalledOnce();
  });

  it.each([
    [new Error("Docker scan failed"), "Docker scan failed"],
    ["unknown failure", "unknown failure"],
  ])("sends an error event and still completes when scanning fails", async (failure, message) => {
    mockDockerService.createDockerClients.mockReturnValue([{ host: "docker-a", docker: {} }]);
    mockDockerService.scanDockerContainers.mockImplementation(async function* () {
      throw failure;
    });

    const { req, res } = createRequestAndResponse();

    await dockerScanHandler(req, res);

    expect(res.write).toHaveBeenCalledWith(
      `event: scan-error\ndata: ${JSON.stringify({ message })}\n\n`,
    );
    expect(res.write).toHaveBeenCalledWith('event: done\ndata: {"count":0}\n\n');
    expect(res.end).toHaveBeenCalledOnce();
  });

  it("stops scanning and suppresses completion after the client disconnects", async () => {
    let req: EventEmitter;

    mockDockerService.createDockerClients.mockReturnValue([
      { host: "docker-a", docker: {} },
      { host: "docker-b", docker: {} },
    ]);
    mockDockerService.scanDockerContainers.mockImplementation(async function* () {
      req.emit("close");
      yield { id: "late-service" };
    });

    const context = createRequestAndResponse();

    req = context.req;
    await dockerScanHandler(context.req, context.res);

    expect(mockDockerService.scanDockerContainers).toHaveBeenCalledTimes(1);
    expect(context.res.write).not.toHaveBeenCalled();
    expect(context.res.end).not.toHaveBeenCalled();
  });
});

describe("GET /api/network/scan/stream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNetworkScanner.parseCIDRConfig.mockReturnValue([{ cidr: "192.168.1.0/24" }]);
    mockNetworkScanner.scanNetworkStream.mockImplementation(async function* () {});
  });

  it("rejects malformed scan targets before starting a scan", async () => {
    const res = await request(app).get("/api/network/scan/stream?cidrs=--script=unsafe/24");

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid IPv4 CIDR");
    expect(mockNetworkScanner.scanNetworkStream).not.toHaveBeenCalled();
  });

  it("accepts large but syntactically valid scan targets", async () => {
    const res = await request(app).get("/api/network/scan/stream?cidrs=10.0.0.0/8");

    expect(res.status).toBe(200);
    expect(mockNetworkScanner.scanNetworkStream).toHaveBeenCalledWith(
      "10.0.0.0/8",
      false,
      expect.any(AbortSignal),
    );
  });

  it("uses configured CIDRs when the request does not provide any", async () => {
    const res = await request(app).get("/api/network/scan/stream?cidrs=");

    expect(res.status).toBe(200);
    expect(mockNetworkScanner.scanNetworkStream).toHaveBeenCalledWith(
      "192.168.1.0/24",
      false,
      expect.any(AbortSignal),
    );
  });

  it("passes a cancellation signal to valid scans", async () => {
    const res = await request(app).get("/api/network/scan/stream?cidrs=192.168.1.0/24");

    expect(res.status).toBe(200);
    expect(mockNetworkScanner.scanNetworkStream).toHaveBeenCalledWith(
      "192.168.1.0/24",
      false,
      expect.any(AbortSignal),
    );
  });

  it("streams batches across multiple CIDRs with deep scan and reports the total", async () => {
    mockNetworkScanner.scanNetworkStream.mockImplementation(async function* (cidr: string) {
      yield [
        { id: `${cidr}-1`, host: "10.0.0.1" },
        { id: `${cidr}-2`, host: "10.0.0.2" },
      ];
    });

    const req = Object.assign(new EventEmitter(), {
      query: { cidrs: "10.0.0.0/24, 10.0.1.0/24", deepScan: "true" },
    });
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      setHeader: vi.fn(),
      flushHeaders: vi.fn(),
      write: vi.fn(),
      end: vi.fn(),
    };

    await networkScanHandler(req, res);

    expect(mockNetworkScanner.scanNetworkStream).toHaveBeenNthCalledWith(
      1,
      "10.0.0.0/24",
      true,
      expect.any(AbortSignal),
    );
    expect(mockNetworkScanner.scanNetworkStream).toHaveBeenNthCalledWith(
      2,
      "10.0.1.0/24",
      true,
      expect.any(AbortSignal),
    );
    expect(res.write).toHaveBeenCalledWith('data: {"id":"10.0.0.0/24-1","host":"10.0.0.1"}\n\n');
    expect(res.write).toHaveBeenCalledWith('event: done\ndata: {"count":4}\n\n');
    expect(res.end).toHaveBeenCalledOnce();
  });

  it.each([
    [new Error("network scan failed"), "network scan failed"],
    ["unknown failure", "unknown failure"],
  ])("sends an SSE error and completion when scanning fails", async (failure, message) => {
    mockNetworkScanner.scanNetworkStream.mockImplementation(async function* () {
      throw failure;
    });

    const req = Object.assign(new EventEmitter(), {
      query: { cidrs: "10.0.0.0/24" },
    });
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      setHeader: vi.fn(),
      flushHeaders: vi.fn(),
      write: vi.fn(),
      end: vi.fn(),
    };

    await networkScanHandler(req, res);

    expect(res.write).toHaveBeenCalledWith(
      `event: scan-error\ndata: ${JSON.stringify({ message })}\n\n`,
    );
    expect(res.write).toHaveBeenCalledWith('event: done\ndata: {"count":0}\n\n');
    expect(res.end).toHaveBeenCalledOnce();
  });

  it("aborts the active scan and suppresses late events after disconnect", async () => {
    let req: EventEmitter & { query: { cidrs: string } };
    let receivedSignal: AbortSignal | undefined;

    mockNetworkScanner.scanNetworkStream.mockImplementation(async function* (
      _cidr: string,
      _deepScan: boolean,
      signal: AbortSignal,
    ) {
      receivedSignal = signal;
      req.emit("close");
      yield [{ id: "late-service" }];
    });

    req = Object.assign(new EventEmitter(), {
      query: { cidrs: "10.0.0.0/24,10.0.1.0/24" },
    });
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      setHeader: vi.fn(),
      flushHeaders: vi.fn(),
      write: vi.fn(),
      end: vi.fn(),
    };

    await networkScanHandler(req, res);

    expect(receivedSignal?.aborted).toBe(true);
    expect(mockNetworkScanner.scanNetworkStream).toHaveBeenCalledTimes(1);
    expect(res.write).not.toHaveBeenCalled();
    expect(res.end).not.toHaveBeenCalled();
  });
});
