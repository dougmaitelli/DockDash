import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAxios = vi.hoisted(() => ({ get: vi.fn() }));
const mockConfig = vi.hoisted(() => ({ githubToken: undefined as string | undefined }));

vi.mock("axios", () => ({ default: mockAxios }));
vi.mock("@server/lib/config.js", () => ({ config: mockConfig }));
vi.mock("@server/lib/logService.js", () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));
vi.mock("@server/services/registry/auth.js", () => ({
  fetchRegistryToken: vi.fn().mockResolvedValue(null),
}));

const { GhcrProvider } = await import("@server/services/registry/ghcrProvider.js");

const ref = { registry: "ghcr.io", repository: "owner/my-app", tag: "v1.0.0" };

describe("GhcrProvider.scanRepositoryTags", () => {
  let provider: InstanceType<typeof GhcrProvider>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig.githubToken = undefined;
    provider = new GhcrProvider();
  });

  it("delegates to GenericRegistryProvider when no GitHub token is configured", async () => {
    // No token → super.scanRepositoryTags() is called. Verify delegation by confirming
    // the GitHub Packages API is NOT used — internal generic-provider behavior is
    // tested in genericProvider.test.ts.
    mockAxios.get.mockResolvedValueOnce({ status: 200, headers: {}, data: { tags: ["v1.0.0"] } });

    const result = await provider.scanRepositoryTags(ref, "");

    expect(result).toEqual({ tags: ["v1.0.0"], complete: true });
    expect(mockAxios.get).not.toHaveBeenCalledWith(
      expect.stringContaining("api.github.com"),
      expect.any(Object),
    );
  });

  it("uses the GitHub Packages API (orgs) when a token is configured", async () => {
    mockConfig.githubToken = "ghp_token";
    mockAxios.get.mockResolvedValueOnce({
      status: 200,
      data: [
        { metadata: { container: { tags: ["v1.1.0", "latest"] } } },
        { metadata: { container: { tags: ["v1.0.0"] } } },
      ],
    });

    const result = await provider.scanRepositoryTags(ref, "");

    expect(result).toEqual({ tags: ["v1.1.0", "latest", "v1.0.0"], complete: true });
    expect(mockAxios.get).toHaveBeenCalledWith(
      expect.stringContaining("orgs/owner"),
      expect.any(Object),
    );
  });

  it("falls back to the users endpoint when the orgs endpoint returns 404", async () => {
    mockConfig.githubToken = "ghp_token";
    mockAxios.get.mockResolvedValueOnce({ status: 404, data: [] }).mockResolvedValueOnce({
      status: 200,
      data: [{ metadata: { container: { tags: ["v2.0.0"] } } }],
    });

    const result = await provider.scanRepositoryTags(ref, "");

    expect(result).toEqual({ tags: ["v2.0.0"], complete: true });
    expect(mockAxios.get).toHaveBeenCalledWith(
      expect.stringContaining("users/owner"),
      expect.any(Object),
    );
  });

  it.each([401, 403, 404, 429])(
    "falls back to the registry when both Packages endpoints return HTTP %s",
    async (status) => {
      mockConfig.githubToken = "ghp_token";
      mockAxios.get
        .mockResolvedValueOnce({ status, data: [] })
        .mockResolvedValueOnce({ status, data: [] })
        .mockResolvedValueOnce({ status: 200, headers: {}, data: { tags: ["v1.1.0"] } });

      expect(await provider.scanRepositoryTags(ref, "v")).toEqual({
        tags: ["v1.1.0"],
        complete: true,
      });
      expect(mockAxios.get).toHaveBeenNthCalledWith(
        3,
        "https://ghcr.io/v2/owner/my-app/tags/list?n=1000",
        expect.any(Object),
      );
    },
  );

  it("falls back to the registry when the Packages request throws", async () => {
    mockConfig.githubToken = "ghp_token";
    mockAxios.get
      .mockRejectedValueOnce(new Error("Request timed out"))
      .mockRejectedValueOnce(new Error("Request timed out"))
      .mockResolvedValueOnce({ status: 200, headers: {}, data: { tags: ["v1.1.0"] } });

    expect(await provider.scanRepositoryTags(ref, "")).toEqual({
      tags: ["v1.1.0"],
      complete: true,
    });
    expect(mockAxios.get).toHaveBeenLastCalledWith(
      "https://ghcr.io/v2/owner/my-app/tags/list?n=1000",
      expect.any(Object),
    );
  });

  it("reports failure when a later Packages page and the fallback fail", async () => {
    mockConfig.githubToken = "ghp_token";
    const page = Array.from({ length: 100 }, () => ({
      metadata: { container: { tags: ["v2.0.0-cuda"] } },
    }));

    mockAxios.get
      .mockResolvedValueOnce({ status: 200, data: page })
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce({ status: 404 })
      .mockResolvedValueOnce({ status: 403 });

    const result = await provider.scanRepositoryTags(ref, "");

    expect(result.tags).toEqual([]);
    expect(result.complete).toBe(false);
    expect(result.failed).toBe(true);
  });

  it("retries Packages from the beginning on the next check after a fallback", async () => {
    mockConfig.githubToken = "ghp_token";
    mockAxios.get
      .mockResolvedValueOnce({ status: 403 })
      .mockResolvedValueOnce({ status: 403 })
      .mockResolvedValueOnce({ status: 200, headers: {}, data: { tags: ["v2.0.0"] } })
      .mockResolvedValueOnce({
        status: 200,
        data: [{ metadata: { container: { tags: ["v3.0.0"] } } }],
      });

    expect(await provider.scanRepositoryTags(ref, "")).toEqual({
      tags: ["v2.0.0"],
      complete: true,
    });
    expect(await provider.scanRepositoryTags(ref, "")).toEqual({
      tags: ["v3.0.0"],
      complete: true,
    });
    expect(mockAxios.get).toHaveBeenLastCalledWith(
      expect.stringContaining("/orgs/owner/packages/container/my-app/versions?per_page=100&page=1"),
      expect.any(Object),
    );
  });

  it("caps Packages traversal at 100 pages without treating the cap as failure or completion", async () => {
    mockConfig.githubToken = "ghp_token";
    mockAxios.get.mockResolvedValue({
      status: 200,
      data: Array.from({ length: 100 }, () => ({ metadata: { container: { tags: ["nightly"] } } })),
    });
    expect(await provider.scanRepositoryTags(ref, "")).toEqual({
      tags: ["nightly"],
      complete: false,
    });
    expect(mockAxios.get).toHaveBeenCalledTimes(100);
  });

  it("does not fall back for a successful empty Packages response", async () => {
    mockConfig.githubToken = "ghp_token";
    mockAxios.get.mockResolvedValueOnce({ status: 200, data: [] });

    expect(await provider.scanRepositoryTags(ref, "")).toEqual({ tags: [], complete: true });
    expect(mockAxios.get).toHaveBeenCalledTimes(1);
  });

  it("fetches subsequent full Packages pages until the listing ends", async () => {
    mockConfig.githubToken = "ghp_token";
    const page1 = Array.from({ length: 100 }, (_, i) => ({
      metadata: { container: { tags: [`v1.${i}`] } },
    }));

    mockAxios.get.mockResolvedValueOnce({ status: 200, data: page1 }).mockResolvedValueOnce({
      status: 200,
      data: [{ metadata: { container: { tags: ["v1.100"] } } }],
    });

    const result = await provider.scanRepositoryTags(ref, "");

    expect(result.tags).toContain("v1.99");
    expect(result.tags).toContain("v1.100");
    expect(result.complete).toBe(true);
    expect(mockAxios.get).toHaveBeenCalledTimes(2);
  });
});
