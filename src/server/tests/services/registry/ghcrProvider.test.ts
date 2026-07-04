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

describe("GhcrProvider.getRepositoryTags", () => {
  let provider: InstanceType<typeof GhcrProvider>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig.githubToken = undefined;
    provider = new GhcrProvider();
  });

  it("delegates to GenericRegistryProvider when no GitHub token is configured", async () => {
    // No token → super.getRepositoryTags() is called. Verify delegation by confirming
    // the GitHub Packages API is NOT used — internal generic-provider behavior is
    // tested in genericProvider.test.ts.
    mockAxios.get.mockResolvedValueOnce({ status: 200, headers: {}, data: { tags: ["v1.0.0"] } });

    const tags = await provider.getRepositoryTags(ref, "");

    expect(tags).toContain("v1.0.0");
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

    const tags = await provider.getRepositoryTags(ref, "");

    expect(tags).toContain("v1.1.0");
    expect(tags).toContain("v1.0.0");
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

    const tags = await provider.getRepositoryTags(ref, "");

    expect(tags).toContain("v2.0.0");
    expect(mockAxios.get).toHaveBeenCalledWith(
      expect.stringContaining("users/owner"),
      expect.any(Object),
    );
  });

  it("returns [] when both orgs and users endpoints return 404", async () => {
    mockConfig.githubToken = "ghp_token";
    mockAxios.get.mockResolvedValue({ status: 404, data: [] });

    expect(await provider.getRepositoryTags(ref, "")).toEqual([]);
  });

  it("paginates until the last page (data.length < 100)", async () => {
    mockConfig.githubToken = "ghp_token";
    const page1 = Array.from({ length: 100 }, (_, i) => ({
      metadata: { container: { tags: [`v1.${i}`] } },
    }));

    mockAxios.get.mockResolvedValueOnce({ status: 200, data: page1 }).mockResolvedValueOnce({
      status: 200,
      data: [{ metadata: { container: { tags: ["v1.100"] } } }],
    });

    const tags = await provider.getRepositoryTags(ref, "");

    expect(tags).toContain("v1.100");
    expect(mockAxios.get).toHaveBeenCalledTimes(2);
  });
});
