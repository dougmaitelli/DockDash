import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ServiceSource, ServiceStatus } from "@shared";

const mockDb = vi.hoisted(() => ({
  getServices: vi.fn(),
  updateServiceMetadata: vi.fn(),
}));

const mockRegistryClient = vi.hoisted(() => ({
  parseImageRef: vi.fn(),
  getManifestDigest: vi.fn(),
  getRepositoryTags: vi.fn(),
}));

const mockNotificationService = vi.hoisted(() => ({
  notify: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@server/db/serviceRepository.js", () => ({ serviceRepository: mockDb }));
vi.mock("@server/services/registryClient.js", () => ({ registryClient: mockRegistryClient }));
vi.mock("@server/services/notificationService.js", () => ({
  notificationService: mockNotificationService,
}));
vi.mock("@server/i18n/index.js", () => ({ t: vi.fn((key: string) => key) }));

const { updateCheckerService } = await import("@server/services/updateCheckerService.js");

function makeDockerService(overrides: Record<string, unknown> = {}) {
  return {
    id: "svc-1",
    name: "my-app",
    host: "localhost",
    ports: [],
    source: ServiceSource.DOCKER,
    status: ServiceStatus.UP,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: {
      image: "nginx",
      imageTag: "1.25",
      imageDigest: "sha256:olddigest",
      hasUpdate: false,
    },
    ...overrides,
  };
}

describe("UpdateCheckerService.checkAllServicesForUpdates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNotificationService.notify.mockResolvedValue(undefined);
    // Default: parseImageRef returns a valid ref
    mockRegistryClient.parseImageRef.mockReturnValue({
      registry: "registry-1.docker.io",
      repository: "library/nginx",
      tag: "1.25",
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("latest tag", () => {
    it("sets hasUpdate when the registry digest differs from the local digest", async () => {
      const svc = makeDockerService({
        metadata: {
          image: "nginx",
          imageTag: "latest",
          imageDigest: "sha256:old",
          hasUpdate: false,
        },
      });

      mockDb.getServices.mockReturnValue([svc]);
      mockRegistryClient.parseImageRef.mockReturnValue({
        registry: "registry-1.docker.io",
        repository: "library/nginx",
        tag: "latest",
      });
      mockRegistryClient.getManifestDigest.mockResolvedValue("sha256:new");

      await updateCheckerService.checkAllServicesForUpdates();

      // latestVersion is stored as a truncated digest: sha256:<12-chars>…
      expect(mockDb.updateServiceMetadata).toHaveBeenCalledWith(
        "svc-1",
        expect.objectContaining({ hasUpdate: true, latestVersion: expect.stringContaining("new") }),
      );
    });

    it("does not set hasUpdate when the digest is unchanged", async () => {
      const svc = makeDockerService({
        metadata: {
          image: "nginx",
          imageTag: "latest",
          imageDigest: "sha256:same",
          hasUpdate: false,
        },
      });

      mockDb.getServices.mockReturnValue([svc]);
      mockRegistryClient.parseImageRef.mockReturnValue({
        registry: "registry-1.docker.io",
        repository: "library/nginx",
        tag: "latest",
      });
      mockRegistryClient.getManifestDigest.mockResolvedValue("sha256:same");

      await updateCheckerService.checkAllServicesForUpdates();

      expect(mockDb.updateServiceMetadata).toHaveBeenCalledWith(
        "svc-1",
        expect.objectContaining({ hasUpdate: false }),
      );
      expect(mockNotificationService.notify).not.toHaveBeenCalled();
    });

    it("skips the update check when no local digest is stored (e.g. locally built image)", async () => {
      // imageDigest is undefined for images with no RepoDigests (locally built or
      // images whose registry inspect failed). The checker must skip rather than
      // falsely mark such services as having an update.
      const svc = makeDockerService({
        metadata: { image: "nginx", imageTag: "latest", imageDigest: undefined, hasUpdate: false },
      });

      mockDb.getServices.mockReturnValue([svc]);
      mockRegistryClient.parseImageRef.mockReturnValue({
        registry: "registry-1.docker.io",
        repository: "library/nginx",
        tag: "latest",
      });
      mockRegistryClient.getManifestDigest.mockResolvedValue("sha256:new");

      await updateCheckerService.checkAllServicesForUpdates();

      expect(mockDb.updateServiceMetadata).not.toHaveBeenCalled();
    });
  });

  describe("semver tag", () => {
    beforeEach(() => {
      mockRegistryClient.parseImageRef.mockReturnValue({
        registry: "registry-1.docker.io",
        repository: "library/nginx",
        tag: "1.25",
      });
    });

    it("sets hasUpdate when a newer semver tag exists", async () => {
      const svc = makeDockerService();

      mockDb.getServices.mockReturnValue([svc]);
      mockRegistryClient.getRepositoryTags.mockResolvedValue(["1.25", "1.26", "1.27"]);

      await updateCheckerService.checkAllServicesForUpdates();

      expect(mockDb.updateServiceMetadata).toHaveBeenCalledWith(
        "svc-1",
        expect.objectContaining({ hasUpdate: true, latestVersion: "1.27" }),
      );
    });

    it("stores the longer tag form when semver-equal tags coexist (prefers 1.27.0 over 1.27)", async () => {
      const svc = makeDockerService();

      mockDb.getServices.mockReturnValue([svc]);
      // Registry has both short and long forms; should store the more specific one
      mockRegistryClient.getRepositoryTags.mockResolvedValue(["1.25", "1.26", "1.27", "1.27.0"]);

      await updateCheckerService.checkAllServicesForUpdates();

      expect(mockDb.updateServiceMetadata).toHaveBeenCalledWith(
        "svc-1",
        expect.objectContaining({ hasUpdate: true, latestVersion: "1.27.0" }),
      );
    });

    it("does not set hasUpdate when already at the latest tag", async () => {
      const svc = makeDockerService();

      mockDb.getServices.mockReturnValue([svc]);
      mockRegistryClient.getRepositoryTags.mockResolvedValue(["1.23", "1.24", "1.25"]);

      await updateCheckerService.checkAllServicesForUpdates();

      expect(mockDb.updateServiceMetadata).toHaveBeenCalledWith(
        "svc-1",
        expect.objectContaining({ hasUpdate: false }),
      );
    });

    it("skips update check when tag cannot be parsed as semver but has no local digest", async () => {
      // Non-semver tags fall through to digest comparison; without a local digest stored,
      // there is nothing to compare against so the check is skipped entirely.
      const svc = makeDockerService({
        metadata: { image: "nginx", imageTag: "main", imageDigest: undefined, hasUpdate: false },
      });

      mockDb.getServices.mockReturnValue([svc]);
      mockRegistryClient.getManifestDigest.mockResolvedValue("sha256:newdigest");

      await updateCheckerService.checkAllServicesForUpdates();

      expect(mockRegistryClient.getRepositoryTags).not.toHaveBeenCalled();
      expect(mockDb.updateServiceMetadata).not.toHaveBeenCalled();
    });

    it("skips the service when getRepositoryTags returns an empty array", async () => {
      const svc = makeDockerService();

      mockDb.getServices.mockReturnValue([svc]);
      mockRegistryClient.getRepositoryTags.mockResolvedValue([]);

      await updateCheckerService.checkAllServicesForUpdates();

      expect(mockDb.updateServiceMetadata).not.toHaveBeenCalled();
    });
  });

  describe("non-semver floating tag (e.g. 'dev', 'stable')", () => {
    it("detects an update via digest comparison when the registry digest differs", async () => {
      const svc = makeDockerService({
        metadata: {
          image: "ghcr.io/org/app",
          imageTag: "dev",
          imageDigest: "sha256:04219006c1a38fd2bb961554718c1c684e4c6442d7871619bfc1d1665288c33a",
          hasUpdate: false,
        },
      });

      mockDb.getServices.mockReturnValue([svc]);
      mockRegistryClient.parseImageRef.mockReturnValue({
        registry: "ghcr.io",
        repository: "org/app",
        tag: "dev",
      });
      mockRegistryClient.getManifestDigest.mockResolvedValue("sha256:newdigest999newdigest999");

      await updateCheckerService.checkAllServicesForUpdates();

      expect(mockRegistryClient.getRepositoryTags).not.toHaveBeenCalled();
      expect(mockDb.updateServiceMetadata).toHaveBeenCalledWith(
        "svc-1",
        expect.objectContaining({ hasUpdate: true }),
      );
    });

    it("does not set hasUpdate when the digest is unchanged", async () => {
      const digest = "sha256:04219006c1a38fd2bb961554718c1c684e4c6442d7871619bfc1d1665288c33a";
      const svc = makeDockerService({
        metadata: {
          image: "ghcr.io/org/app",
          imageTag: "dev",
          imageDigest: digest,
          hasUpdate: false,
        },
      });

      mockDb.getServices.mockReturnValue([svc]);
      mockRegistryClient.parseImageRef.mockReturnValue({
        registry: "ghcr.io",
        repository: "org/app",
        tag: "dev",
      });
      mockRegistryClient.getManifestDigest.mockResolvedValue(digest);

      await updateCheckerService.checkAllServicesForUpdates();

      expect(mockDb.updateServiceMetadata).toHaveBeenCalledWith(
        "svc-1",
        expect.objectContaining({ hasUpdate: false }),
      );
      expect(mockNotificationService.notify).not.toHaveBeenCalled();
    });
  });

  describe("notification gating", () => {
    it("sends a notification for a newly discovered update", async () => {
      const svc = makeDockerService();

      mockDb.getServices.mockReturnValue([svc]);
      mockRegistryClient.getRepositoryTags.mockResolvedValue(["1.25", "1.26"]);

      await updateCheckerService.checkAllServicesForUpdates();

      expect(mockNotificationService.notify).toHaveBeenCalledTimes(1);
    });

    it("does not send a duplicate notification when update was already known", async () => {
      const svc = makeDockerService({
        metadata: { image: "nginx", imageTag: "1.25", hasUpdate: true, latestVersion: "1.26" },
      });

      mockDb.getServices.mockReturnValue([svc]);
      mockRegistryClient.getRepositoryTags.mockResolvedValue(["1.25", "1.26"]);

      await updateCheckerService.checkAllServicesForUpdates();

      expect(mockNotificationService.notify).not.toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("logs the error and continues without throwing when the registry call fails", async () => {
      const svc = makeDockerService();

      mockDb.getServices.mockReturnValue([svc]);
      mockRegistryClient.getRepositoryTags.mockRejectedValue(new Error("registry timeout"));

      await expect(updateCheckerService.checkAllServicesForUpdates()).resolves.not.toThrow();
    });

    it("skips non-Docker services", async () => {
      const networkSvc = {
        id: "net-1",
        name: "proxy",
        host: "192.168.1.1",
        ports: [80],
        source: ServiceSource.NETWORK,
        status: ServiceStatus.UP,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      mockDb.getServices.mockReturnValue([networkSvc]);

      await updateCheckerService.checkAllServicesForUpdates();

      expect(mockRegistryClient.getRepositoryTags).not.toHaveBeenCalled();
      expect(mockDb.updateServiceMetadata).not.toHaveBeenCalled();
    });
  });

  it("limits concurrent registry update checks", async () => {
    const services = Array.from({ length: 6 }, (_, i) =>
      makeDockerService({ id: `svc-${i}`, name: `service-${i}` }),
    );
    let active = 0;
    let maxActive = 0;
    let release: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    mockDb.getServices.mockReturnValue(services);
    mockRegistryClient.getRepositoryTags.mockImplementation(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await gate;
      active--;

      return ["1.25"];
    });

    const check = updateCheckerService.checkAllServicesForUpdates();

    await expect.poll(() => active).toBe(5);
    expect(mockRegistryClient.getRepositoryTags).toHaveBeenCalledTimes(5);
    release!();
    await check;

    expect(maxActive).toBe(5);
    expect(mockRegistryClient.getRepositoryTags).toHaveBeenCalledTimes(6);
  });
});
