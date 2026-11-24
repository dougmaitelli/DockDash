import { beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.hoisted(() => vi.fn());
const warn = vi.hoisted(() => vi.fn());

vi.mock("axios", () => ({ default: { get } }));
vi.mock("@server/lib/logService.js", () => ({ logger: { debug: vi.fn(), warn } }));

const { scanTagPages } = await import("@server/services/registry/tagScan.js");
const first = "https://registry.example/v2/app/tags/list?n=1000";
const parse = (data: unknown) => data as { tags: string[]; next?: string };

beforeEach(() => {
  get.mockReset();
  warn.mockClear();
});

describe("registry pagination", () => {
  it("caps unordered scans at 50 pages, even when an early page contains newer tags", async () => {
    let page = 0;

    get.mockImplementation(async () => ({
      status: 200,
      data: { tags: ["v2.0"], next: `${first}&page=${++page}` },
    }));
    expect(await scanTagPages(first, {}, parse)).toEqual({ tags: ["v2.0"], complete: false });
    expect(get).toHaveBeenCalledTimes(50);
  });

  it("does not log Axios error objects or request credentials", async () => {
    const secret = "synthetic-token-do-not-log";

    get.mockRejectedValue(
      Object.assign(new Error(secret), {
        code: "ECONNABORTED",
        config: { headers: { Authorization: secret } },
      }),
    );
    expect(await scanTagPages(first, { Authorization: secret }, parse)).toMatchObject({
      complete: false,
      failed: true,
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("ECONNABORTED"));
    expect(JSON.stringify(warn.mock.calls)).not.toContain(secret);
  });

  it.each(["https://other.example/v2/app/tags/list", "https://registry.example/private"])(
    "rejects an unsafe next link: %s",
    async (next) => {
      get.mockResolvedValueOnce({ status: 200, data: { tags: [], next } });
      expect(await scanTagPages(first, { Authorization: "Bearer secret" }, parse)).toMatchObject({
        complete: false,
        failed: true,
      });
      expect(get).toHaveBeenCalledOnce();
    },
  );

  it("rejects an unsafe redirect before forwarding authorization", async () => {
    get.mockResolvedValueOnce({
      status: 302,
      headers: { location: "https://other.example/v2/app/tags/list" },
    });
    expect(await scanTagPages(first, { Authorization: "Bearer secret" }, parse)).toMatchObject({
      failed: true,
    });
    expect(get).toHaveBeenCalledOnce();
  });

  it("limits even a same-endpoint chain of distinct redirects", async () => {
    let hop = 0;

    get.mockImplementation(async () => ({ status: 307, headers: { location: `?hop=${++hop}` } }));
    expect(await scanTagPages(first, {}, parse)).toMatchObject({ complete: false, failed: true });
    expect(get).toHaveBeenCalledTimes(6);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("REDIRECT_LIMIT"));
  });

  it("follows a safe same-endpoint redirect", async () => {
    get
      .mockResolvedValueOnce({ status: 302, headers: { location: "?canonical=1" } })
      .mockResolvedValueOnce({ status: 200, data: { tags: ["v1.0"] } });
    expect(await scanTagPages(first, {}, parse)).toEqual({ tags: ["v1.0"], complete: true });
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("stops a repeated cursor", async () => {
    get.mockResolvedValue({ status: 200, data: { tags: [], next: first } });
    expect(await scanTagPages(first, {}, parse)).toMatchObject({ failed: true });
    expect(get).toHaveBeenCalledOnce();
  });
});
