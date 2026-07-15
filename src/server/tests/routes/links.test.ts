import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ServiceLinkType, ServiceProtocol } from "@shared";

const mockDb = vi.hoisted(() => ({
  saveLink: vi.fn(),
  updateLink: vi.fn(),
  deleteLink: vi.fn(),
}));

const mockLogger = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));

vi.mock("@server/db/serviceRepository.js", () => ({ serviceRepository: mockDb }));
vi.mock("@server/lib/logService.js", () => ({ logger: mockLogger }));

const routerModule = await import("@server/routes/links.js");

const app = express();

app.use(express.json());
app.use("/api", routerModule.default);

const makeLink = (overrides = {}) => ({
  id: "link-1",
  sourceId: "svc-a",
  targetId: "svc-b",
  type: ServiceLinkType.COMMUNICATION,
  label: undefined,
  description: undefined,
  targetPort: undefined,
  protocol: null,
  createdAt: new Date().toISOString(),
  ...overrides,
});

describe("POST /api/links", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 201 with valid { sourceId, targetId }", async () => {
    const link = makeLink();

    mockDb.saveLink.mockReturnValue(link);

    const res = await request(app)
      .post("/api/links")
      .send({ sourceId: "svc-a", targetId: "svc-b" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(link);
  });

  it("returns 400 when sourceId missing", async () => {
    const res = await request(app).post("/api/links").send({ targetId: "svc-b" });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 400 when targetId missing", async () => {
    const res = await request(app).post("/api/links").send({ sourceId: "svc-a" });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 400 when sourceId === targetId", async () => {
    const res = await request(app)
      .post("/api/links")
      .send({ sourceId: "svc-a", targetId: "svc-a" });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 400 when protocol is invalid enum value", async () => {
    const res = await request(app)
      .post("/api/links")
      .send({ sourceId: "svc-a", targetId: "svc-b", protocol: "invalid-proto" });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 409 when db.saveLink throws (duplicate)", async () => {
    mockDb.saveLink.mockImplementation(() => {
      throw new Error("A link between these two services already exists");
    });

    const res = await request(app)
      .post("/api/links")
      .send({ sourceId: "svc-a", targetId: "svc-b" });

    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty("error");
  });
});

describe("PUT /api/links/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 on valid update", async () => {
    const link = makeLink({ label: "Updated label" });

    mockDb.updateLink.mockReturnValue(link);

    const res = await request(app).put("/api/links/link-1").send({ label: "Updated label" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(link);
  });

  it("returns 404 when db.updateLink throws", async () => {
    mockDb.updateLink.mockImplementation(() => {
      throw new Error("Link not found");
    });

    const res = await request(app).put("/api/links/nonexistent").send({ label: "X" });

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 400 when type is invalid enum value", async () => {
    const res = await request(app).put("/api/links/link-1").send({ type: "not-a-valid-type" });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});

describe("DELETE /api/links/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200", async () => {
    mockDb.deleteLink.mockReturnValue(undefined);

    const res = await request(app).delete("/api/links/link-1");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });
});

// Keep ServiceProtocol in scope so it's not tree-shaken
void ServiceProtocol;
