import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAxios = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("axios", () => ({ default: mockAxios }));
vi.mock("@server/lib/logService.js", () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

const { DockerHubProvider } = await import("@server/services/registry/dockerHubProvider.js");

const ref = { registry: "registry-1.docker.io", repository: "library/nginx", tag: "1.25" };

describe("DockerHubProvider.scanRepositoryTags", () => {
  let provider: InstanceType<typeof DockerHubProvider>;

  beforeEach(() => {
    mockAxios.get.mockReset();
    provider = new DockerHubProvider();
  });

  it("returns all tags when they fit in a single page (count ≤ 100)", async () => {
    mockAxios.get.mockResolvedValueOnce({
      status: 200,
      data: { count: 3, results: [{ name: "1.25" }, { name: "1.26" }, { name: "1.27" }] },
    });

    expect(await provider.scanRepositoryTags(ref, "")).toEqual({
      tags: ["1.25", "1.26", "1.27"],
      complete: true,
    });
    expect(mockAxios.get).toHaveBeenCalledOnce();
  });

  it("fetches successive pages when count > 100 and deduplicates overlaps", async () => {
    const firstPage = Array.from({ length: 100 }, (_, i) => ({ name: `1.${i}` }));

    mockAxios.get
      .mockResolvedValueOnce({ status: 200, data: { count: 105, results: firstPage } })
      .mockResolvedValueOnce({
        status: 200,
        data: { count: 105, results: [{ name: "1.99" }, { name: "1.103" }, { name: "1.104" }] },
      });

    const { tags, complete } = await provider.scanRepositoryTags({ ...ref, tag: "1.99" }, "");

    expect(complete).toBe(true);
    expect(mockAxios.get).toHaveBeenCalledTimes(2);
    expect(tags).toContain("1.104");
    // "1.99" appears in both pages — should only appear once
    expect(tags.filter((t) => t === "1.99")).toHaveLength(1);
  });

  it("returns [] when the first request returns a non-200 status", async () => {
    mockAxios.get.mockResolvedValueOnce({ status: 404, data: {} });
    expect(await provider.scanRepositoryTags(ref, "")).toEqual({
      tags: [],
      complete: false,
      failed: true,
    });
  });

  it("returns first-page tags when a later page request fails", async () => {
    mockAxios.get
      .mockResolvedValueOnce({
        status: 200,
        data: { count: 200, results: [{ name: "1.0" }, { name: "1.1" }] },
      })
      .mockResolvedValueOnce({ status: 500, data: {} });

    const result = await provider.scanRepositoryTags(ref, "");

    expect(result).toEqual({ tags: ["1.0", "1.1"], complete: false, failed: true });
  });

  it("includes a higher version from the middle page and requests explicit ordering", async () => {
    mockAxios.get
      .mockResolvedValueOnce({
        status: 200,
        data: { count: 201, results: [{ name: "9.0-cuda" }, { name: "1.25.0" }] },
      })
      .mockResolvedValueOnce({ status: 200, data: { count: 201, results: [{ name: "3.0" }] } })
      .mockResolvedValueOnce({ status: 200, data: { count: 201, results: [{ name: "2.0" }] } });

    const result = await provider.scanRepositoryTags(ref, "");

    expect(result).toEqual({ tags: ["9.0-cuda", "1.25.0", "3.0"], complete: false });
    expect(mockAxios.get).toHaveBeenCalledTimes(2);
    expect(mockAxios.get).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("ordering=last_updated"),
      expect.any(Object),
    );
    expect(mockAxios.get).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("page=2"),
      expect.any(Object),
    );
  });

  it("does not filter out unprefixed versions when the current prefix is v", async () => {
    mockAxios.get.mockResolvedValueOnce({
      status: 200,
      data: { count: 1, results: [{ name: "1.26.0" }] },
    });

    expect(await provider.scanRepositoryTags(ref, "v")).toEqual({
      tags: ["1.26.0"],
      complete: true,
    });
    expect(mockAxios.get.mock.calls[0][0]).not.toContain("&name=");
  });

  it("does not declare a response without a valid total count complete", async () => {
    mockAxios.get.mockResolvedValueOnce({ status: 200, data: { results: [{ name: "1.26" }] } });

    expect(await provider.scanRepositoryTags(ref, "")).toMatchObject({
      complete: false,
      failed: true,
    });
  });

  it("passes the prefix as a name filter query param", async () => {
    mockAxios.get.mockResolvedValueOnce({
      status: 200,
      data: { count: 1, results: [{ name: "1.25-alpine" }] },
    });

    await provider.scanRepositoryTags(ref, "1.25");

    expect(mockAxios.get).toHaveBeenCalledWith(
      expect.stringContaining("name=1.25"),
      expect.any(Object),
    );
  });
});
