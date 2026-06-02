import type Docker from "dockerode";
import { db } from "../db/databaseService.js";
import { ServiceSource } from "@shared";
import { dockerService } from "./dockerService.js";
import { registryClient } from "./registryClient.js";
import { notificationService } from "./notificationService.js";
import { DOCKER_LATEST_TAG } from "../lib/constants.js";
import { TagParser } from "../lib/tagParser.js";

type Service = ReturnType<typeof db.getServices>[number];

export class UpdateCheckerService {
  async checkAllServicesForUpdates(): Promise<void> {
    const services = db.getServices();
    const dockerServices = services.filter((s) => s.source === ServiceSource.DOCKER);

    // Group by Docker host to reuse one client per host
    const servicesByHost = new Map<string, typeof dockerServices>();

    for (const service of dockerServices) {
      const host = service.metadata?.dockerHost as string | undefined;

      if (!host) continue;

      if (!servicesByHost.has(host)) servicesByHost.set(host, []);

      servicesByHost.get(host)!.push(service);
    }

    for (const [host, hostServices] of servicesByHost) {
      const docker = dockerService.createDockerClientForHost(host);

      for (const service of hostServices) {
        await this.checkServiceForUpdate(service, docker);
      }
    }
  }

  /**
   * Returns the registry-push digest (sha256:...) for the image currently
   * running in the given container, or null if it cannot be determined (e.g.
   * locally built images that were never pushed).
   */
  private async getLocalImageDigest(docker: Docker, containerId: string): Promise<string | null> {
    try {
      const info = await docker.getContainer(containerId).inspect();
      const imageInfo = await docker.getImage(info.Image).inspect();
      const repoDigests: string[] = imageInfo.RepoDigests ?? [];

      if (repoDigests.length === 0) return null;

      // Format: "nginx@sha256:abc123" → "sha256:abc123"
      return repoDigests[0].split("@")[1] ?? null;
    } catch {
      return null;
    }
  }

  private async checkServiceForUpdate(service: Service, docker: Docker): Promise<void> {
    const containerId = service.metadata?.containerId as string | undefined;
    const image = service.metadata?.image as string | undefined;
    const imageTag = service.metadata?.imageTag as string | undefined;

    if (!containerId || !image || !imageTag) return;

    const ref = registryClient.parseImageRef(`${image}:${imageTag}`);

    let hasUpdate = false;
    let latestVersion: string | undefined;

    try {
      if (imageTag === DOCKER_LATEST_TAG) {
        const [localDigest, registryDigest] = await Promise.all([
          this.getLocalImageDigest(docker, containerId),
          registryClient.getManifestDigest(ref),
        ]);

        if (!localDigest || !registryDigest) return;

        hasUpdate = localDigest !== registryDigest;

        if (hasUpdate) {
          // Show just the short digest for display
          latestVersion = `newer digest (${registryDigest.slice(7, 19)}…)`;
        }
      } else {
        const parsed = TagParser.extractSemVer(imageTag);

        if (!parsed) return; // Non-SemVer tag, nothing to compare

        const allTags = await registryClient.getRepositoryTags(ref, parsed.prefix);

        if (allTags.length === 0) return; // Can't determine — preserve existing status

        let highestParts = parsed.parts;
        let highestTag: string | undefined;

        for (const tag of allTags) {
          if (!tag.startsWith(parsed.prefix) || !tag.endsWith(parsed.suffix)) continue;

          const candidate = TagParser.extractSemVer(tag);

          if (!candidate) continue;

          // Ensure prefix and suffix match exactly (not just startsWith/endsWith)
          if (candidate.prefix !== parsed.prefix || candidate.suffix !== parsed.suffix) continue;

          if (TagParser.compareSemVer(candidate.parts, highestParts) > 0) {
            highestParts = candidate.parts;
            highestTag = tag;
          }
        }

        if (highestTag) {
          hasUpdate = true;
          latestVersion = highestTag;
        }
      }
    } catch (err) {
      console.error(
        `Update check failed for service "${service.name}":`,
        err instanceof Error ? err.message : String(err),
      );

      return;
    }

    const previousHasUpdate = service.metadata?.hasUpdate as boolean | undefined;

    db.updateServiceMetadata(service.id || "", {
      hasUpdate,
      ...(latestVersion !== undefined ? { latestVersion } : {}),
      updateCheckedAt: new Date().toISOString(),
    });

    if (hasUpdate && !previousHasUpdate) {
      const msg = latestVersion
        ? `A newer version is available: ${latestVersion}`
        : "A newer image digest is available.";

      notificationService
        .notify(`Update Available: ${service.name}`, msg, "warning")
        .catch(() => {});
    }
  }
}

export const updateCheckerService = new UpdateCheckerService();
