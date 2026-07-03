import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockAxios = vi.hoisted(() => ({
  post: vi.fn(),
  isAxiosError: vi.fn().mockReturnValue(false),
}));

vi.mock("axios", () => ({ default: mockAxios }));

const { notificationService } = await import("@server/services/notificationService.js");

describe("NotificationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAxios.isAxiosError.mockReturnValue(false);
  });

  afterEach(() => {
    delete process.env.APPRISE_URL;
    delete process.env.APPRISE_URLS;
    delete process.env.APPRISE_TAGS;
  });

  it("is a no-op when APPRISE_URL is not set", async () => {
    delete process.env.APPRISE_URL;
    await notificationService.notify("title", "body", "info");
    expect(mockAxios.post).not.toHaveBeenCalled();
  });

  it("posts to APPRISE_URL with APP_NAME-prefixed title and correct type", async () => {
    process.env.APPRISE_URL = "http://apprise/notify";
    mockAxios.post.mockResolvedValue({ status: 200 });

    await notificationService.notify("Alert", "Something happened", "warning");

    expect(mockAxios.post).toHaveBeenCalledWith(
      "http://apprise/notify",
      expect.objectContaining({
        title: expect.stringContaining("Alert"),
        body: "Something happened",
        type: "warning",
      }),
      expect.objectContaining({ timeout: 5000 }),
    );
  });

  it("configured getter reflects APPRISE_URL presence", () => {
    delete process.env.APPRISE_URL;
    expect(notificationService.configured).toBe(false);

    process.env.APPRISE_URL = "http://apprise/notify";
    expect(notificationService.configured).toBe(true);
  });

  it("includes APPRISE_URLS and APPRISE_TAGS in the payload when set", async () => {
    process.env.APPRISE_URL = "http://apprise/notify";
    process.env.APPRISE_URLS = "http://url1/,http://url2/";
    process.env.APPRISE_TAGS = "tag1,tag2";
    mockAxios.post.mockResolvedValue({ status: 200 });

    await notificationService.notify("title", "body");

    expect(mockAxios.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        urls: ["http://url1/", "http://url2/"],
        tag: ["tag1", "tag2"],
      }),
      expect.any(Object),
    );
  });

  it("omits urls and tag keys when APPRISE_URLS/TAGS are not set", async () => {
    process.env.APPRISE_URL = "http://apprise/notify";
    mockAxios.post.mockResolvedValue({ status: 200 });

    await notificationService.notify("title", "body");

    const payload = mockAxios.post.mock.calls[0][1] as Record<string, unknown>;

    expect(payload).not.toHaveProperty("urls");
    expect(payload).not.toHaveProperty("tag");
  });

  it("logs and rethrows on HTTP error from Apprise", async () => {
    process.env.APPRISE_URL = "http://apprise/notify";

    const axiosErr = Object.assign(new Error("Bad Gateway"), {
      response: { status: 502, data: "bad gateway" },
    });

    mockAxios.post.mockRejectedValue(axiosErr);
    mockAxios.isAxiosError.mockReturnValue(true);

    await expect(notificationService.notify("title", "body")).rejects.toThrow();
  });

  it("rethrows non-axios errors too", async () => {
    process.env.APPRISE_URL = "http://apprise/notify";
    mockAxios.post.mockRejectedValue(new Error("network failure"));

    await expect(notificationService.notify("title", "body")).rejects.toThrow("network failure");
  });
});
