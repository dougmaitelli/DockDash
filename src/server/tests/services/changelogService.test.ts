import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Service } from "@shared";
import { ServiceSource, ServiceStatus } from "@shared";

// ── Mocks ──

const mockAxios = vi.hoisted(() => ({
  get: vi.fn(),
  isAxiosError: vi.fn().mockReturnValue(false),
}));

const mockDockerClient = vi.hoisted(() => ({
  getContainer: vi.fn(),
  getImage: vi.fn(),
}));

const mockDockerService = vi.hoisted(() => ({
  resolveHost: vi.fn(),
  createDockerClientForHost: vi.fn().mockReturnValue(mockDockerClient),
}));

vi.mock("axios", () => ({ default: mockAxios }));
vi.mock("@server/services/dockerService.js", () => ({ dockerService: mockDockerService }));

const { changelogService } = await import("@server/services/changelogService.js");

// ── Helpers ──

let serviceCounter = 0;

function makeService(overrides: Partial<Service> = {}): Service {
  return {
    id: `svc-changelog-${++serviceCounter}`,
    name: "my-app",
    host: "localhost",
    ports: [],
    source: ServiceSource.DOCKER,
    status: ServiceStatus.UP,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: {
      image: "owner/my-app",
      imageTag: "v1.0.0",
      dockerHostId: "testhostid",
      containerId: "container123",
    },
    ...overrides,
  };
}

function mockGithubRelease(tagName: string) {
  return {
    tag_name: tagName,
    published_at: "2024-01-01T00:00:00Z",
    body: "## What's new\n- Feature A",
    html_url: `https://github.com/owner/repo/releases/tag/${tagName}`,
  };
}

// ── Tests ──

describe("ChangelogService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAxios.isAxiosError.mockReturnValue(false);

    // Default Docker inspection returns no OCI source label
    const containerInspect = { Image: "sha256:imageabc", Config: {} };
    const imageInspect = { Config: { Labels: {} } };

    mockDockerClient.getContainer.mockReturnValue({
      inspect: vi.fn().mockResolvedValue(containerInspect),
    });
    mockDockerClient.getImage.mockReturnValue({ inspect: vi.fn().mockResolvedValue(imageInspect) });
    mockDockerService.resolveHost.mockReturnValue("tcp://docker-host:2375");
  });

  afterEach(() => vi.clearAllMocks());

  describe("GitHub repository resolution", () => {
    it("resolves from the org.opencontainers.image.source OCI label", async () => {
      const containerInspect = { Image: "sha256:abc", Config: {} };
      const imageInspect = {
        Config: {
          Labels: { "org.opencontainers.image.source": "https://github.com/owner/my-app" },
        },
      };

      mockDockerClient.getContainer.mockReturnValue({
        inspect: vi.fn().mockResolvedValue(containerInspect),
      });
      mockDockerClient.getImage.mockReturnValue({
        inspect: vi.fn().mockResolvedValue(imageInspect),
      });

      const svc = makeService();

      // First attempt: tag "v1.0.0" → GitHub API call returns 200
      mockAxios.get.mockResolvedValueOnce({ data: mockGithubRelease("v1.0.0") });

      const result = await changelogService.fetchChangelog(svc);

      expect(result.available).toBe(true);

      if (!result.available) throw new Error("Expected available changelog");

      expect(result.release.version).toBe("v1.0.0");
    });

    it("resolves from a GHCR image name when no OCI label is present", async () => {
      const svc = makeService({ metadata: { image: "ghcr.io/owner/my-app", imageTag: "v1.0.0" } });

      mockAxios.get.mockResolvedValueOnce({ data: mockGithubRelease("v1.0.0") });

      const result = await changelogService.fetchChangelog(svc);

      expect(result.available).toBe(true);
      expect(mockAxios.get).toHaveBeenCalledWith(
        expect.stringContaining("owner/my-app"),
        expect.any(Object),
      );
    });

    it("resolves from a Docker Hub owner/image when no OCI label is present", async () => {
      const svc = makeService({ metadata: { image: "owner/my-app", imageTag: "v1.0.0" } });

      mockAxios.get.mockResolvedValueOnce({ data: mockGithubRelease("v1.0.0") });

      const result = await changelogService.fetchChangelog(svc);

      expect(result.available).toBe(true);
    });

    it("returns available:false when no GitHub repo can be resolved", async () => {
      const svc = makeService({ metadata: { image: "nginx", imageTag: "1.25" } });

      // Bare library image — no owner/repo to try as GitHub
      const result = await changelogService.fetchChangelog(svc);

      expect(result.available).toBe(false);

      if (result.available) throw new Error("Expected unavailable changelog");

      expect(result.reason).toContain("Could not resolve");
    });
  });

  describe("release tag variants", () => {
    it("tries the tag with a 'v' prefix when the bare tag returns 404", async () => {
      const svc = makeService({ metadata: { image: "owner/my-app", imageTag: "1.0.0" } });

      // Bare tag "1.0.0" → 404
      const notFound = Object.assign(new Error("Not Found"), { response: { status: 404 } });

      mockAxios.isAxiosError.mockReturnValue(true);
      mockAxios.get
        .mockRejectedValueOnce(notFound)
        .mockResolvedValueOnce({ data: mockGithubRelease("v1.0.0") });

      const result = await changelogService.fetchChangelog(svc);

      expect(result.available).toBe(true);

      if (!result.available) throw new Error("Expected available changelog");

      expect(result.release.version).toBe("v1.0.0");
      expect(mockAxios.get).toHaveBeenCalledTimes(2);
      // Verify the second attempt used the "v"-prefixed tag in the URL
      expect(mockAxios.get).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining("/tags/v1.0.0"),
        expect.any(Object),
      );
    });

    it("falls back to the shorter form when a trailing-.0 tag returns 404 (1.4.0 → 1.4)", async () => {
      // The update checker always stores the longest available form (e.g. "1.4.0").
      // If GitHub only tags the shorter form ("1.4"), the changelog service must fall back.
      const svc = makeService({ metadata: { image: "owner/my-app", imageTag: "1.4.0" } });

      const notFound = Object.assign(new Error("Not Found"), { response: { status: 404 } });

      mockAxios.isAxiosError.mockReturnValue(true);
      // Exact form "1.4.0" tried first, then "v1.4.0", then fallback "1.4" succeeds
      mockAxios.get
        .mockRejectedValueOnce(notFound)
        .mockRejectedValueOnce(notFound)
        .mockResolvedValueOnce({ data: mockGithubRelease("1.4") });

      const result = await changelogService.fetchChangelog(svc);

      expect(result.available).toBe(true);

      if (!result.available) throw new Error("Expected available changelog");

      expect(result.release.version).toBe("1.4");
      expect(mockAxios.get).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining("/tags/1.4.0"),
        expect.any(Object),
      );
      expect(mockAxios.get).toHaveBeenCalledWith(
        expect.stringContaining("/tags/1.4"),
        expect.any(Object),
      );
    });

    it("strips trailing .0 parts iteratively: 1.2.0.0 → 1.2.0 → 1.2", async () => {
      const svc = makeService({ metadata: { image: "owner/my-app", imageTag: "1.2.0.0" } });

      const notFound = Object.assign(new Error("Not Found"), { response: { status: 404 } });

      mockAxios.isAxiosError.mockReturnValue(true);
      mockAxios.get
        .mockRejectedValueOnce(notFound) // "1.2.0.0"
        .mockRejectedValueOnce(notFound) // "v1.2.0.0"
        .mockRejectedValueOnce(notFound) // "1.2.0"
        .mockRejectedValueOnce(notFound) // "v1.2.0"
        .mockResolvedValueOnce({ data: mockGithubRelease("1.2") }); // final fallback

      const result = await changelogService.fetchChangelog(svc);

      expect(result.available).toBe(true);

      if (!result.available) throw new Error("Expected available changelog");

      expect(result.release.version).toBe("1.2");
      expect(mockAxios.get).toHaveBeenCalledTimes(5);
    });

    it("returns available:false when all tag variants return 404", async () => {
      const svc = makeService({ metadata: { image: "owner/my-app", imageTag: "v2.0.0" } });

      const notFound = Object.assign(new Error("Not Found"), { response: { status: 404 } });

      mockAxios.isAxiosError.mockReturnValue(true);
      mockAxios.get.mockRejectedValue(notFound);

      const result = await changelogService.fetchChangelog(svc);

      expect(result.available).toBe(false);

      if (result.available) throw new Error("Expected unavailable changelog");

      expect(result.reason).toContain("No release found");
    });
  });

  describe("rate limiting", () => {
    it("returns available:false when the GitHub API returns 403 (rate limit)", async () => {
      const svc = makeService({ metadata: { image: "owner/my-app", imageTag: "v1.0.0" } });

      const rateLimitErr = Object.assign(new Error("Forbidden"), { response: { status: 403 } });

      mockAxios.isAxiosError.mockReturnValue(true);
      mockAxios.get.mockRejectedValue(rateLimitErr);

      const result = await changelogService.fetchChangelog(svc);

      expect(result.available).toBe(false);
    });

    it("returns available:false when the GitHub API returns 429 (rate limit)", async () => {
      const svc = makeService({ metadata: { image: "owner/my-app", imageTag: "v1.0.0" } });

      const rateLimitErr = Object.assign(new Error("Too Many Requests"), {
        response: { status: 429 },
      });

      mockAxios.isAxiosError.mockReturnValue(true);
      mockAxios.get.mockRejectedValue(rateLimitErr);

      const result = await changelogService.fetchChangelog(svc);

      expect(result.available).toBe(false);
    });
  });

  describe("caching", () => {
    it("caches a successful result so the GitHub API is only called once", async () => {
      const svc = makeService({ metadata: { image: "owner/my-app", imageTag: "v1.0.0" } });

      mockAxios.get.mockResolvedValue({ data: mockGithubRelease("v1.0.0") });

      const result1 = await changelogService.fetchChangelog(svc);
      const result2 = await changelogService.fetchChangelog(svc);

      expect(result1).toEqual(result2);
      // Only one HTTP call — the second hit the cache
      expect(mockAxios.get).toHaveBeenCalledTimes(1);
    });
  });

  describe("no image tag", () => {
    it("returns available:false when the service has no imageTag", async () => {
      const svc = makeService({ metadata: {} });
      const result = await changelogService.fetchChangelog(svc);

      expect(result.available).toBe(false);
    });
  });
});
