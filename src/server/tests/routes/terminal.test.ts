import { EventEmitter } from "events";
import express, { type RequestHandler } from "express";
import session from "express-session";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockConfig = vi.hoisted(() => ({ terminalEnabled: true }));
const mockDockerService = vi.hoisted(() => ({
  getContainerForServiceId: vi.fn(),
  openTerminal: vi.fn((owner, _service, cols, rows) =>
    mockTerminalService.openSession(owner, {}, cols, rows),
  ),
}));
const mockTerminalService = vi.hoisted(() => ({
  openSession: vi.fn(),
  closeSession: vi.fn(),
  touch: vi.fn(),
  getSession: vi.fn(),
}));
const mockServiceRepository = vi.hoisted(() => ({
  requireService: vi.fn((id: string) => ({ id, source: "docker" })),
}));

vi.mock("@server/lib/config.js", () => ({ config: mockConfig }));
vi.mock("@server/db/serviceRepository.js", () => ({ serviceRepository: mockServiceRepository }));
vi.mock("@server/services/containerRuntime/dockerRuntime.js", () => ({
  dockerRuntime: mockDockerService,
}));
vi.mock("@server/services/terminalService.js", () => ({ terminalService: mockTerminalService }));

const { default: terminalRouter } = await import("@server/routes/terminal.js");
const app = express();

app.use(express.json());
app.use(((req, _res, next) => {
  Object.defineProperty(req, "sessionID", { value: "owner" });
  Object.defineProperty(req, "session", {
    value: { terminalInitialized: true, save: vi.fn((callback) => callback()) },
  });
  next();
}) as RequestHandler);
app.use("/api", terminalRouter);

type RouteHandler = (req: unknown, res: unknown) => Promise<void>;
const streamHandler = (
  terminalRouter as unknown as {
    stack: { route?: { path: string; stack: { handle: RouteHandler }[] } }[];
  }
).stack.find((layer) => layer.route?.path === "/services/:id/terminal/stream")!.route!.stack[0]
  .handle;

describe("terminal routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTerminalService.openSession.mockReset();
    mockTerminalService.closeSession.mockReset();
    mockTerminalService.touch.mockReset();
    mockTerminalService.getSession.mockReset();
    mockConfig.terminalEnabled = true;
    mockDockerService.getContainerForServiceId.mockReturnValue({});
  });

  it("blocks terminal operations when disabled", async () => {
    mockConfig.terminalEnabled = false;

    const stream = await request(app).get("/api/services/svc/terminal/stream");
    const input = await request(app)
      .post("/api/services/svc/terminal/input")
      .send({ sessionId: "id", data: "ls\n" });

    expect([stream.status, input.status]).toEqual([403, 403]);
  });

  it("persists anonymous ownership before streaming and rejects another browser", async () => {
    const anonymousApp = express();

    anonymousApp.use(express.json());
    anonymousApp.use(
      session({ secret: "terminal-test-secret", resave: false, saveUninitialized: false }),
    );
    anonymousApp.use("/api", terminalRouter);
    const browser = request.agent(anonymousApp);
    const write = vi.fn();
    let owner: string;

    mockTerminalService.openSession.mockImplementation(async (ownerId) => {
      owner = ownerId;
      const stream = new EventEmitter();

      setTimeout(() => stream.emit("end"), 10);

      return { sessionId: "id", stream };
    });
    mockTerminalService.getSession.mockImplementation((ownerId) =>
      ownerId === owner ? { stream: { write } } : undefined,
    );

    const opened = await browser.get("/api/services/svc/terminal/stream");

    expect(opened.headers["set-cookie"]).toBeDefined();
    expect(opened.text).toContain("event: terminal-session");
    const input = await browser
      .post("/api/services/svc/terminal/input")
      .send({ sessionId: "id", data: "ls\n" });
    const stranger = await request(anonymousApp)
      .post("/api/services/svc/terminal/input")
      .send({ sessionId: "id", data: "bad" });

    expect(input.status).toBe(200);
    expect(stranger.status).toBe(404);
    expect(write).toHaveBeenCalledExactlyOnceWith("ls\n");
  });

  it("does not open a terminal when the browser session cannot be saved", async () => {
    const store = new session.MemoryStore();

    vi.spyOn(store, "set").mockImplementation((_id, _data, callback) =>
      callback?.(new Error("store unavailable")),
    );
    const failingApp = express();

    failingApp.use(
      session({ store, secret: "terminal-test-secret", resave: false, saveUninitialized: false }),
    );
    failingApp.use("/api", terminalRouter);

    const response = await request(failingApp).get("/api/services/svc/terminal/stream");

    expect(response.status).toBe(500);
    expect(response.body.error).toBe("Unable to initialize terminal session");
    expect(mockTerminalService.openSession).not.toHaveBeenCalled();
  });

  it("writes input only to an owned live session", async () => {
    const write = vi.fn();

    mockTerminalService.getSession.mockReturnValue({ stream: { write } });
    const response = await request(app)
      .post("/api/services/svc/terminal/input")
      .send({ sessionId: "id", data: "ls\n" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });
    expect(mockTerminalService.getSession).toHaveBeenCalledWith("owner", "id");
    expect(mockTerminalService.touch).toHaveBeenCalledWith("id");
    expect(write).toHaveBeenCalledWith("ls\n");
  });

  it("rejects missing, malformed, and closed terminal sessions", async () => {
    mockTerminalService.getSession.mockReturnValue(undefined);
    const missing = await request(app)
      .post("/api/services/svc/terminal/input")
      .send({ sessionId: "id", data: "x" });
    const malformed = await request(app)
      .post("/api/services/svc/terminal/input")
      .send({ sessionId: "id" });

    mockTerminalService.getSession.mockReturnValue({
      stream: { write: () => void 0 },
    });
    mockTerminalService.touch.mockImplementation(() => {
      throw new Error("closed");
    });
    const closed = await request(app)
      .post("/api/services/svc/terminal/input")
      .send({ sessionId: "id", data: "x" });

    expect([missing.status, malformed.status, closed.status]).toEqual([404, 400, 410]);
  });

  it("streams terminal session, data, and completion events", async () => {
    const stream = new EventEmitter();

    mockTerminalService.openSession.mockImplementation(async () => {
      setTimeout(() => {
        stream.emit("data", Buffer.from("hello"));
        stream.emit("end");
      }, 10);

      return { sessionId: "id", stream };
    });

    const response = await request(app).get("/api/services/svc/terminal/stream?cols=100&rows=30");

    expect(response.status).toBe(200);
    expect(response.text).toContain("event: terminal-session");
    expect(response.text).toContain(Buffer.from("hello").toString("base64"));
    expect(response.text).toContain("event: done");
    expect(mockTerminalService.openSession).toHaveBeenCalledWith("owner", {}, 100, 30);
    expect(mockTerminalService.closeSession).toHaveBeenCalledOnce();
  });

  it("emits terminal errors when opening a session fails", async () => {
    mockTerminalService.openSession.mockRejectedValue(new Error("cannot exec"));

    const response = await request(app).get("/api/services/svc/terminal/stream");

    expect(response.status).toBe(200);
    expect(response.text).toContain("event: terminal-error");
    expect(response.text).toContain("cannot exec");
  });

  it("pauses terminal output until drain and cleans up on response disconnect", async () => {
    const stream = Object.assign(new EventEmitter(), { pause: vi.fn(), resume: vi.fn() });
    const req = {
      params: { id: "svc" },
      query: {},
      sessionID: "owner",
      session: { terminalInitialized: true },
    };
    const res = Object.assign(new EventEmitter(), {
      setHeader: vi.fn(),
      flushHeaders: vi.fn(),
      writableLength: 0,
      write: vi.fn(() => true),
      end: vi.fn(),
      destroy: vi.fn(),
    });

    mockTerminalService.openSession.mockResolvedValue({ sessionId: "id", stream });
    await streamHandler(req, res);
    res.write.mockReturnValue(false);
    stream.emit("data", Buffer.from("hello"));
    expect(stream.pause).toHaveBeenCalledOnce();
    expect(stream.resume).not.toHaveBeenCalled();
    res.emit("drain");
    expect(stream.resume).toHaveBeenCalledOnce();
    res.emit("close");
    res.emit("close");
    expect(mockTerminalService.closeSession).toHaveBeenCalledOnce();
    expect(res.listenerCount("drain")).toBe(0);
  });

  it("closes a terminal that opens after its response disconnects", async () => {
    let resolveSession!: (session: { sessionId: string; stream: EventEmitter }) => void;

    mockTerminalService.openSession.mockReturnValue(
      new Promise((resolve) => {
        resolveSession = resolve;
      }),
    );
    const req = {
      params: { id: "svc" },
      query: {},
      sessionID: "owner",
      session: { terminalInitialized: true },
    };
    const res = Object.assign(new EventEmitter(), {
      setHeader: vi.fn(),
      flushHeaders: vi.fn(),
      write: vi.fn(),
    });
    const handling = streamHandler(req, res);

    res.emit("close");
    resolveSession({ sessionId: "id", stream: new EventEmitter() });
    await handling;
    expect(mockTerminalService.closeSession).toHaveBeenCalledOnce();
    expect(res.write).not.toHaveBeenCalled();
  });
});
