import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

const mockConfig = vi.hoisted(() => ({ oidcEnabled: false }));

vi.mock("@server/lib/config.js", () => ({ config: mockConfig }));

const { requireAuth } = await import("@server/middleware/auth.js");

function makeReqRes(sessionUser?: unknown) {
  const req = {
    session: sessionUser !== undefined ? { user: sessionUser } : {},
  } as Request;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  const next = vi.fn() as unknown as NextFunction;

  return { req, res, next };
}

describe("requireAuth", () => {
  it("calls next() when OIDC is disabled regardless of session state", () => {
    mockConfig.oidcEnabled = false;
    const { req, res, next } = makeReqRes();

    requireAuth(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("calls next() when OIDC is enabled and the session has a user", () => {
    mockConfig.oidcEnabled = true;
    const { req, res, next } = makeReqRes({ sub: "user-1", email: "user@example.com" });

    requireAuth(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 401 when OIDC is enabled but there is no session user", () => {
    mockConfig.oidcEnabled = true;
    const { req, res, next } = makeReqRes();

    requireAuth(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
  });
});
