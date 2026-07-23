import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockConfig = vi.hoisted(() => ({ fileExplorerEnabled: true }));
const mockDockerService = vi.hoisted(() => ({ getContainerForServiceId: vi.fn() }));
const mockFileService = vi.hoisted(() => ({
  listFiles: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock("@server/lib/config.js", () => ({ config: mockConfig }));
vi.mock("@server/services/dockerService.js", () => ({ dockerService: mockDockerService }));
vi.mock("@server/services/fileService.js", () => ({ fileService: mockFileService }));

const { default: filesRouter } = await import("@server/routes/files.js");
const app = express();

app.use(express.json());
app.use("/api", filesRouter);

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
});
