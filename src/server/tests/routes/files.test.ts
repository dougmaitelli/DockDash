import { errorHandler } from "@server/middleware/errorHandler.js";
import requestBody from "@server/middleware/requestBody.js";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockConfig = vi.hoisted(() => ({ fileExplorerEnabled: true }));
const mockDockerService = vi.hoisted(() => ({
  getContainerForServiceId: vi.fn(),
  listFiles: vi.fn((_service, path) => mockFileService.listFiles({}, path)),
  readFile: vi.fn((_service, path) => mockFileService.readFile({}, path)),
  writeFile: vi.fn((_service, path, content) => mockFileService.writeFile({}, path, content)),
}));
const mockFileService = vi.hoisted(() => ({
  listFiles: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));
const mockServiceRepository = vi.hoisted(() => ({
  requireService: vi.fn((id: string) => ({ id, source: "docker" })),
}));

vi.mock("@server/lib/config.js", () => ({ config: mockConfig }));
vi.mock("@server/db/serviceRepository.js", () => ({ serviceRepository: mockServiceRepository }));
vi.mock("@server/services/containerRuntime/dockerRuntime.js", () => ({
  dockerRuntime: mockDockerService,
}));
vi.mock("@server/services/fileService.js", () => ({ fileService: mockFileService }));

const { default: filesRouter } = await import("@server/routes/files.js");
const app = express();

app.use(requestBody);
app.use("/api", filesRouter);
app.use(errorHandler);

describe("file routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig.fileExplorerEnabled = true;
    mockDockerService.getContainerForServiceId.mockReturnValue({});
  });

  it("blocks file operations when the feature is disabled", async () => {
    mockConfig.fileExplorerEnabled = false;

    const list = await request(app).get("/api/services/svc/files");
    const read = await request(app).get("/api/services/svc/files/content?path=/tmp/a");
    const write = await request(app)
      .put("/api/services/svc/files/content")
      .send({ path: "/tmp/a", content: "x" });

    expect([list.status, read.status, write.status]).toEqual([403, 403, 403]);
  });

  it("rejects unsafe paths", async () => {
    const list = await request(app).get("/api/services/svc/files?path=../../etc");
    const read = await request(app).get("/api/services/svc/files/content?path=relative");
    const write = await request(app)
      .put("/api/services/svc/files/content")
      .send({ path: "/tmp/\0bad", content: "x" });

    expect([list.status, read.status, write.status]).toEqual([400, 400, 400]);
  });

  it("lists, reads, and writes files", async () => {
    const entries = [
      { name: "a", type: "file", size: 1, permissions: "-rw-r--r--", modified: "now" },
    ];

    mockFileService.listFiles.mockResolvedValue(entries);
    mockFileService.readFile.mockResolvedValue({ path: "/tmp/a", content: "a" });
    mockFileService.writeFile.mockResolvedValue(undefined);

    const list = await request(app).get("/api/services/svc/files?path=/tmp");
    const read = await request(app).get("/api/services/svc/files/content?path=/tmp/a");
    const write = await request(app)
      .put("/api/services/svc/files/content")
      .send({ path: "/tmp/a", content: "updated" });

    expect(list.body).toEqual({ path: "/tmp", entries });
    expect(read.body).toEqual({ path: "/tmp/a", content: "a" });
    expect(write.body).toEqual({ success: true });
    expect(mockFileService.writeFile).toHaveBeenCalledWith({}, "/tmp/a", "updated");
  });

  it("returns service failures without leaking non-Error values", async () => {
    mockFileService.listFiles.mockRejectedValue("failed");
    mockFileService.readFile.mockRejectedValue(new Error("cannot read"));
    mockFileService.writeFile.mockRejectedValue(new Error("cannot write"));

    const list = await request(app).get("/api/services/svc/files?path=/");
    const read = await request(app).get("/api/services/svc/files/content?path=/tmp/a");
    const write = await request(app)
      .put("/api/services/svc/files/content")
      .send({ path: "/tmp/a", content: "x" });

    expect(list.body).toEqual({ error: "failed" });
    expect(read.body).toEqual({ error: "cannot read" });
    expect(write.body).toEqual({ error: "cannot write" });
  });

  it("validates write request bodies", async () => {
    const response = await request(app)
      .put("/api/services/svc/files/content")
      .send({ path: "/tmp/a" });

    expect(response.status).toBe(400);
    expect(mockFileService.writeFile).not.toHaveBeenCalled();
  });

  it("saves file content larger than the general API limit", async () => {
    const content = "x".repeat(200 * 1024);

    mockFileService.writeFile.mockResolvedValue(undefined);
    const response = await request(app)
      .put("/api/services/svc/files/content")
      .send({ path: "/tmp/large", content });

    expect(response.status).toBe(200);
    expect(mockFileService.writeFile).toHaveBeenCalledWith({}, "/tmp/large", content);
  });

  it("rejects file saves exceeding 10 MB with HTTP 413", async () => {
    const response = await request(app)
      .put("/api/services/svc/files/content")
      .send({ path: "/tmp/large", content: "x".repeat(10 * 1024 * 1024) });

    expect(response.status).toBe(413);
    expect(response.body).toEqual({ error: "request entity too large" });
    expect(mockFileService.writeFile).not.toHaveBeenCalled();
  });

  it("returns HTTP 400 for malformed JSON without attempting a write", async () => {
    const response = await request(app)
      .put("/api/services/svc/files/content")
      .set("Content-Type", "application/json")
      .send('{"path":');

    expect(response.status).toBe(400);
    expect(response.body.error).toEqual(expect.any(String));
    expect(mockFileService.writeFile).not.toHaveBeenCalled();
  });
});
