import { EventEmitter } from "events";
import express, { type RequestHandler } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockConfig = vi.hoisted(() => ({ terminalEnabled: true }));
const mockDockerService = vi.hoisted(() => ({ getContainerForServiceId: vi.fn() }));
const mockTerminalService = vi.hoisted(() => ({
  openSession: vi.fn(),
  closeSession: vi.fn(),
  touch: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock("@server/lib/config.js", () => ({ config: mockConfig }));
vi.mock("@server/services/dockerService.js", () => ({ dockerService: mockDockerService }));
vi.mock("@server/services/terminalService.js", () => ({ terminalService: mockTerminalService }));

const { default: terminalRouter } = await import("@server/routes/terminal.js");
const app = express();

app.use(express.json());
app.use(((req, _res, next) => {
  Object.defineProperty(req, "sessionID", { value: "owner" });
  next();
}) as RequestHandler);
app.use("/api", terminalRouter);

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
});
