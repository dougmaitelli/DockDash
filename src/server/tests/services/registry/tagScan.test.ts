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

  it("stops a repeated cursor", async () => {
    get.mockResolvedValue({ status: 200, data: { tags: [], next: first } });
    expect(await scanTagPages(first, {}, parse)).toMatchObject({ failed: true });
    expect(get).toHaveBeenCalledOnce();
  });
});
