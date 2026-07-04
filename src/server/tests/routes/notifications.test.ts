import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockNotificationService = vi.hoisted(() => ({
  configured: false,
  notify: vi.fn(),
}));

const mockConfig = vi.hoisted(() => ({
  locale: "en",
}));

const mockT = vi.hoisted(() => vi.fn((key: string) => key));

const mockConstants = vi.hoisted(() => ({
  APP_NAME: "DockDash",
}));

vi.mock("@server/services/notificationService.js", () => ({
  notificationService: mockNotificationService,
}));
vi.mock("@server/lib/config.js", () => ({ config: mockConfig }));
vi.mock("@server/i18n/index.js", () => ({ t: mockT }));
vi.mock("@server/lib/constants.js", () => mockConstants);

const routerModule = await import("@server/routes/notifications.js");

const app = express();

app.use(express.json());
app.use("/api", routerModule.default);

describe("POST /api/notifications/test", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNotificationService.configured = false;
  });

  it("returns 400 when notificationService.configured is false", async () => {
    mockNotificationService.configured = false;

    const res = await request(app).post("/api/notifications/test");

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 200 when configured and notify succeeds", async () => {
    mockNotificationService.configured = true;
    mockNotificationService.notify.mockResolvedValue(undefined);

    const res = await request(app).post("/api/notifications/test");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });

  it("returns 502 when notify throws", async () => {
    mockNotificationService.configured = true;
    mockNotificationService.notify.mockRejectedValue(new Error("Apprise failed"));

    const res = await request(app).post("/api/notifications/test");

    expect(res.status).toBe(502);
    expect(res.body).toHaveProperty("error");
  });
});
