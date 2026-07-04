import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAxios = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("axios", () => ({ default: mockAxios }));
vi.mock("@server/lib/logService.js", () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));
vi.mock("@server/services/registry/auth.js", () => ({
  fetchRegistryToken: vi.fn().mockResolvedValue(null),
}));

const { GenericRegistryProvider } = await import("@server/services/registry/genericProvider.js");

const ref = { registry: "registry.example.com", repository: "owner/my-app", tag: "v1.0.0" };

describe("GenericRegistryProvider.getRepositoryTags", () => {
  let provider: InstanceType<typeof GenericRegistryProvider>;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new GenericRegistryProvider();
  });

  it("returns tags from a single-page response", async () => {
    mockAxios.get.mockResolvedValueOnce({
      status: 200,
      headers: {},
      data: { tags: ["v1.0.0", "v1.1.0", "v2.0.0"] },
    });

    expect(await provider.getRepositoryTags(ref, "")).toEqual(["v1.0.0", "v1.1.0", "v2.0.0"]);
    expect(mockAxios.get).toHaveBeenCalledOnce();
    expect(mockAxios.get).toHaveBeenCalledWith(
      expect.stringContaining("/v2/owner/my-app/tags/list"),
      expect.any(Object),
    );
  });

  it("follows Link headers to paginate across multiple pages", async () => {
    mockAxios.get
      .mockResolvedValueOnce({
        status: 200,
        headers: { link: '</v2/owner/my-app/tags/list?last=v1.1.0&n=1000>; rel="next"' },
        data: { tags: ["v1.0.0", "v1.1.0"] },
      })
      .mockResolvedValueOnce({
        status: 200,
        headers: {},
        data: { tags: ["v2.0.0"] },
      });

    const tags = await provider.getRepositoryTags(ref, "");

    expect(tags).toEqual(["v1.0.0", "v1.1.0", "v2.0.0"]);
    expect(mockAxios.get).toHaveBeenCalledTimes(2);
    // Second call must use the path from the Link header
    expect(mockAxios.get).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("last=v1.1.0"),
      expect.any(Object),
    );
  });

  it("injects the Bearer token when fetchRegistryToken returns one", async () => {
    const { fetchRegistryToken } = await import("@server/services/registry/auth.js");

    vi.mocked(fetchRegistryToken).mockResolvedValueOnce("mytoken");

    mockAxios.get.mockResolvedValueOnce({ status: 200, headers: {}, data: { tags: ["v1.0.0"] } });

    await provider.getRepositoryTags(ref, "");

    expect(mockAxios.get).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ headers: { Authorization: "Bearer mytoken" } }),
    );
  });

  it("stops paginating and returns collected tags when a non-200 response is received", async () => {
    mockAxios.get
      .mockResolvedValueOnce({
        status: 200,
        headers: { link: '</v2/owner/my-app/tags/list?last=v1.0.0&n=1000>; rel="next"' },
        data: { tags: ["v1.0.0"] },
      })
      .mockResolvedValueOnce({ status: 401, headers: {}, data: {} });

    expect(await provider.getRepositoryTags(ref, "")).toEqual(["v1.0.0"]);
  });

  it("returns an empty array when the first request returns a non-200 status", async () => {
    mockAxios.get.mockResolvedValueOnce({ status: 404, headers: {}, data: {} });

    expect(await provider.getRepositoryTags(ref, "")).toEqual([]);
  });
});
