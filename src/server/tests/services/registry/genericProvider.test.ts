import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAxios = vi.hoisted(() => ({ get: vi.fn() }));
const warn = vi.hoisted(() => vi.fn());

vi.mock("axios", () => ({ default: mockAxios }));
vi.mock("@server/lib/logService.js", () => ({
  logger: { debug: vi.fn(), warn, info: vi.fn(), error: vi.fn() },
}));
vi.mock("@server/services/registry/auth.js", () => ({
  fetchRegistryToken: vi.fn().mockResolvedValue(null),
}));

const { GenericRegistryProvider } = await import("@server/services/registry/genericProvider.js");

const ref = { registry: "registry.example.com", repository: "owner/my-app", tag: "v1.0.0" };

describe("GenericRegistryProvider.scanRepositoryTags", () => {
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

    expect(await provider.scanRepositoryTags(ref, "")).toEqual({
      tags: ["v1.0.0", "v1.1.0", "v2.0.0"],
      complete: true,
    });
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

    const result = await provider.scanRepositoryTags(ref, "");

    expect(result).toEqual({ tags: ["v1.0.0", "v1.1.0", "v2.0.0"], complete: true });
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

    await provider.scanRepositoryTags(ref, "");

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

    expect(await provider.scanRepositoryTags(ref, "")).toEqual({
      tags: ["v1.0.0"],
      complete: false,
      failed: true,
    });
  });

  it.each([
    "</v2/owner/my-app/tags/list?last=v1.0.0>; rel=next",
    "</v2/owner/my-app/tags/list?last=v1.0.0>; extension; Rel=Next",
    '</v2/owner/my-app/tags/list?last=v1.0.0>; title="more, tags; here"; rel="next"',
    '</v2/owner/my-app/tags/list>; rel=prev, </v2/owner/my-app/tags/list?last=v1.0.0>; rel="next alternate"',
  ])("follows valid Link syntax: %s", async (link) => {
    mockAxios.get
      .mockResolvedValueOnce({ status: 200, headers: { link }, data: { tags: ["v1.0.0"] } })
      .mockResolvedValueOnce({ status: 200, headers: {}, data: { tags: ["v2.0.0"] } });

    expect(await provider.scanRepositoryTags(ref, "")).toEqual({
      tags: ["v1.0.0", "v2.0.0"],
      complete: true,
    });
    expect(mockAxios.get).toHaveBeenCalledTimes(2);
  });

  it("does not treat a malformed Link header as the end of the list", async () => {
    mockAxios.get.mockResolvedValueOnce({
      status: 200,
      headers: { link: '<broken; rel="next"' },
      data: { tags: ["v1.0.0"] },
    });

    expect(await provider.scanRepositoryTags(ref, "")).toMatchObject({
      complete: false,
      failed: true,
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("INVALID_LINK_HEADER"));
  });

  it("returns an empty array when the first request returns a non-200 status", async () => {
    mockAxios.get.mockResolvedValueOnce({ status: 404, headers: {}, data: {} });

    expect(await provider.scanRepositoryTags(ref, "")).toEqual({
      tags: [],
      complete: false,
      failed: true,
    });
  });
});
