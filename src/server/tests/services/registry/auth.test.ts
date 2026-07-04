import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAxios = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("axios", () => ({ default: mockAxios }));
vi.mock("@server/lib/logService.js", () => ({
  logger: { warn: vi.fn(), debug: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

const { fetchRegistryToken } = await import("@server/services/registry/auth.js");

describe("fetchRegistryToken", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns null when the registry ping responds with 200 (no auth required)", async () => {
    mockAxios.get.mockResolvedValue({ status: 200, headers: {} });
    expect(await fetchRegistryToken("registry.example.com", "owner/repo")).toBeNull();
    expect(mockAxios.get).toHaveBeenCalledOnce();
  });

  it("returns null when the 401 response has no www-authenticate header", async () => {
    mockAxios.get.mockResolvedValue({ status: 401, headers: {} });
    expect(await fetchRegistryToken("registry.example.com", "owner/repo")).toBeNull();
  });

  it("returns null when the www-authenticate header is not a Bearer challenge", async () => {
    mockAxios.get.mockResolvedValue({
      status: 401,
      headers: { "www-authenticate": "Basic realm=registry" },
    });
    expect(await fetchRegistryToken("registry.example.com", "owner/repo")).toBeNull();
  });

  it("fetches a token from the realm in the www-authenticate header", async () => {
    mockAxios.get
      .mockResolvedValueOnce({
        status: 401,
        headers: {
          "www-authenticate":
            'Bearer realm="https://auth.example.com/token",service="registry.example.com"',
        },
      })
      .mockResolvedValueOnce({ data: { token: "mytoken123" } });

    expect(await fetchRegistryToken("registry.example.com", "owner/repo")).toBe("mytoken123");
    expect(mockAxios.get).toHaveBeenNthCalledWith(
      2,
      "https://auth.example.com/token",
      expect.objectContaining({
        params: expect.objectContaining({ scope: "repository:owner/repo:pull" }),
      }),
    );
  });

  it("also accepts access_token as the token field name", async () => {
    mockAxios.get
      .mockResolvedValueOnce({
        status: 401,
        headers: { "www-authenticate": 'Bearer realm="https://auth.example.com/token"' },
      })
      .mockResolvedValueOnce({ data: { access_token: "at123" } });

    expect(await fetchRegistryToken("registry.example.com", "owner/repo")).toBe("at123");
  });

  it("passes basicAuth credentials to the token exchange request", async () => {
    mockAxios.get
      .mockResolvedValueOnce({
        status: 401,
        headers: { "www-authenticate": 'Bearer realm="https://auth.example.com/token"' },
      })
      .mockResolvedValueOnce({ data: { token: "t" } });

    await fetchRegistryToken("registry.example.com", "owner/repo", {
      username: "user",
      password: "pass",
    });

    expect(mockAxios.get).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      expect.objectContaining({ auth: { username: "user", password: "pass" } }),
    );
  });

  it("returns null and does not throw when axios throws", async () => {
    mockAxios.get.mockRejectedValue(new Error("network error"));
    expect(await fetchRegistryToken("registry.example.com", "owner/repo")).toBeNull();
  });
});
