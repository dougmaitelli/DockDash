import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockAxios = vi.hoisted(() => ({
  post: vi.fn(),
  isAxiosError: vi.fn().mockReturnValue(false),
}));

vi.mock("axios", () => ({ default: mockAxios }));

const { notificationService } = await import("@server/services/notificationService.js");

describe("NotificationService", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    mockAxios.isAxiosError.mockReturnValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
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

    const result = expect(notificationService.notify("title", "body")).rejects.toThrow(
      'HTTP 502: "bad gateway"',
    );

    await vi.runAllTimersAsync();
    await result;
    expect(mockAxios.post).toHaveBeenCalledTimes(3);
  });

  it("rethrows non-axios errors too", async () => {
    process.env.APPRISE_URL = "http://apprise/notify";
    mockAxios.post.mockRejectedValue(new Error("network failure"));

    const result = expect(notificationService.notify("title", "body")).rejects.toThrow(
      "network failure",
    );

    await vi.runAllTimersAsync();
    await result;
    expect(mockAxios.post).toHaveBeenCalledTimes(3);
  });

  it.each([408, 424, 429, 503, undefined])(
    "retries a transient failure (%s) with backoff and preserves the recovery payload",
    async (status) => {
      process.env.APPRISE_URL = "http://apprise/notify";
      process.env.APPRISE_URLS = "tgram://target/";
      process.env.APPRISE_TAGS = "health";
      mockAxios.isAxiosError.mockReturnValue(true);
      mockAxios.post
        .mockRejectedValueOnce({ response: status ? { status, data: "unavailable" } : undefined })
        .mockRejectedValueOnce(new Error("connection reset"))
        .mockResolvedValue({ status: 200 });

      const delivery = notificationService.notify(
        "Service Recovered",
        "web is back online",
        "success",
      );

      await vi.advanceTimersByTimeAsync(999);
      expect(mockAxios.post).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(mockAxios.post).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(2999);
      expect(mockAxios.post).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1);
      await delivery;
      expect(mockAxios.post).toHaveBeenCalledTimes(3);
      expect(mockAxios.post.mock.calls[1]).toEqual(mockAxios.post.mock.calls[0]);
      expect(mockAxios.post.mock.calls[2]).toEqual(mockAxios.post.mock.calls[0]);
      expect(mockAxios.post.mock.calls[2][1]).toMatchObject({
        body: "web is back online",
        type: "success",
        urls: ["tgram://target/"],
        tag: ["health"],
      });
    },
  );

  it.each([400, 401, 403, 404])("does not retry permanent HTTP %s errors", async (status) => {
    process.env.APPRISE_URL = "http://apprise/notify";
    mockAxios.isAxiosError.mockReturnValue(true);
    mockAxios.post.mockRejectedValue({ response: { status, data: "invalid request" } });

    await expect(notificationService.notify("title", "body")).rejects.toThrow(`HTTP ${status}`);
    expect(mockAxios.post).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
