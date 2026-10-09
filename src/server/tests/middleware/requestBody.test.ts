import { errorHandler } from "@server/middleware/errorHandler.js";
import requestBody from "@server/middleware/requestBody.js";
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

vi.mock("@server/lib/logService.js", () => ({ logger: { error: vi.fn() } }));

const app = express();

app.use(requestBody);
app.post("/api/services", (req, res) => res.json(req.body));
app.post("/api/services/:id/files/content", (req, res) => res.json(req.body));
app.get("/error", () => {
  throw new Error("unexpected failure");
});
app.use(errorHandler);

describe("request body middleware", () => {
  it("parses ordinary API requests", async () => {
    const response = await request(app).post("/api/services").send({ name: "test" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ name: "test" });
  });

  it.each(["/api/services", "/api/services/svc/files/content"])(
    "keeps the 100 KB limit for POST %s",
    async (path) => {
      const response = await request(app)
        .post(path)
        .send({ content: "x".repeat(200 * 1024) });

      expect(response.status).toBe(413);
      expect(response.body).toEqual({ error: "request entity too large" });
    },
  );

  it("continues returning HTTP 500 for unexpected errors", async () => {
    const response = await request(app).get("/error");

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: "unexpected failure" });
  });
});
