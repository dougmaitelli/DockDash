import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAxios = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("axios", () => ({ default: mockAxios }));
vi.mock("@server/lib/logService.js", () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

const { DockerHubProvider } = await import("@server/services/registry/dockerHubProvider.js");

const ref = { registry: "registry-1.docker.io", repository: "library/nginx", tag: "1.25" };

describe("DockerHubProvider.getRepositoryTags", () => {
  let provider: InstanceType<typeof DockerHubProvider>;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new DockerHubProvider();
  });

  it("returns all tags when they fit in a single page (count ≤ 100)", async () => {
    mockAxios.get.mockResolvedValueOnce({
      status: 200,
      data: { count: 3, results: [{ name: "1.25" }, { name: "1.26" }, { name: "1.27" }] },
    });

    expect(await provider.getRepositoryTags(ref, "")).toEqual(["1.25", "1.26", "1.27"]);
    expect(mockAxios.get).toHaveBeenCalledOnce();
  });

  it("fetches first and last page when count > 100 and deduplicates overlaps", async () => {
    const firstPage = Array.from({ length: 100 }, (_, i) => ({ name: `1.${i}` }));

    mockAxios.get
      .mockResolvedValueOnce({ status: 200, data: { count: 105, results: firstPage } })
      .mockResolvedValueOnce({
        status: 200,
        data: { count: 105, results: [{ name: "1.99" }, { name: "1.103" }, { name: "1.104" }] },
      });

    const tags = await provider.getRepositoryTags(ref, "");

    expect(mockAxios.get).toHaveBeenCalledTimes(2);
    expect(tags).toContain("1.104");
    // "1.99" appears in both pages — should only appear once
    expect(tags.filter((t) => t === "1.99")).toHaveLength(1);
  });

  it("returns [] when the first request returns a non-200 status", async () => {
    mockAxios.get.mockResolvedValueOnce({ status: 404, data: {} });
    expect(await provider.getRepositoryTags(ref, "")).toEqual([]);
  });

  it("returns first-page tags when the last-page request fails", async () => {
    mockAxios.get
      .mockResolvedValueOnce({
        status: 200,
        data: { count: 200, results: [{ name: "1.0" }, { name: "1.1" }] },
      })
      .mockResolvedValueOnce({ status: 500, data: {} });

    const tags = await provider.getRepositoryTags(ref, "");

    expect(tags).toEqual(["1.0", "1.1"]);
  });

  it("passes the prefix as a name filter query param", async () => {
    mockAxios.get.mockResolvedValueOnce({
      status: 200,
      data: { count: 1, results: [{ name: "1.25-alpine" }] },
    });

    await provider.getRepositoryTags(ref, "1.25");

    expect(mockAxios.get).toHaveBeenCalledWith(
      expect.stringContaining("name=1.25"),
      expect.any(Object),
    );
  });
});
