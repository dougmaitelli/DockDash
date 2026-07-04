import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAxios = vi.hoisted(() => ({ get: vi.fn() }));
const mockConfig = vi.hoisted(() => ({
  appRepo: "owner/dockdash" as string | undefined,
  appVersion: "1.0.0",
  githubToken: undefined as string | undefined,
  updateCheckInterval: 3_600_000,
}));

vi.mock("axios", () => ({ default: mockAxios }));
vi.mock("@server/lib/config.js", () => ({ config: mockConfig }));

import type { appUpdateService as AppUpdateServiceType } from "@server/services/appUpdateService.js";

// Reset the module between tests to clear the in-memory cache
let appUpdateService: typeof AppUpdateServiceType;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  mockConfig.appRepo = "owner/dockdash";
  mockConfig.appVersion = "1.0.0";
  mockConfig.githubToken = undefined;
  appUpdateService = (await import("@server/services/appUpdateService.js")).appUpdateService;
});

function makeRelease(tagName: string) {
  return {
    tag_name: tagName,
    published_at: "2024-01-01T00:00:00Z",
    body: "release notes",
    html_url: `https://github.com/owner/dockdash/releases/tag/${tagName}`,
  };
}

describe("AppUpdateService.check", () => {
  it("returns null when appRepo is not configured", async () => {
    mockConfig.appRepo = undefined;
    expect(await appUpdateService.check()).toBeNull();
    expect(mockAxios.get).not.toHaveBeenCalled();
  });

  it("returns null when appVersion is 'dev'", async () => {
    mockConfig.appVersion = "dev";
    expect(await appUpdateService.check()).toBeNull();
    expect(mockAxios.get).not.toHaveBeenCalled();
  });

  it("returns hasUpdate:true when a newer release exists", async () => {
    mockAxios.get.mockResolvedValue({ data: makeRelease("v2.0.0") });

    const result = await appUpdateService.check();

    expect(result?.hasUpdate).toBe(true);
    expect(result?.release?.version).toBe("v2.0.0");
  });

  it("returns hasUpdate:false when already at the latest version", async () => {
    mockAxios.get.mockResolvedValue({ data: makeRelease("v1.0.0") });

    const result = await appUpdateService.check();

    expect(result?.hasUpdate).toBe(false);
  });

  it("caches the result so the GitHub API is only called once within the interval", async () => {
    mockAxios.get.mockResolvedValue({ data: makeRelease("v2.0.0") });

    await appUpdateService.check();
    await appUpdateService.check();

    expect(mockAxios.get).toHaveBeenCalledOnce();
  });

  it("returns null without throwing when the GitHub API request fails", async () => {
    mockAxios.get.mockRejectedValue(new Error("network error"));
    expect(await appUpdateService.check()).toBeNull();
  });

  it("includes the Authorization header when a GitHub token is configured", async () => {
    mockConfig.githubToken = "ghp_token123";
    mockAxios.get.mockResolvedValue({ data: makeRelease("v1.0.0") });

    await appUpdateService.check();

    expect(mockAxios.get).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: { Authorization: "Bearer ghp_token123" },
      }),
    );
  });

  it("hits the GitHub releases/latest endpoint for the configured repo", async () => {
    mockAxios.get.mockResolvedValue({ data: makeRelease("v1.0.0") });

    await appUpdateService.check();

    expect(mockAxios.get).toHaveBeenCalledWith(
      expect.stringContaining("repos/owner/dockdash/releases/latest"),
      expect.any(Object),
    );
  });
});
