import type Docker from "dockerode";
import { db } from "../db/databaseService.js";
import { ServiceSource } from "@shared";
import { dockerService } from "./dockerService.js";
import { registryClient } from "./registryClient.js";
import { notificationService } from "./notificationService.js";

// ---------------------------------------------------------------------------
// SemVer helpers
// ---------------------------------------------------------------------------

// Matches the first X.Y.Z (or X.Y.Z.W) substring in a tag string.
const SEMVER_RE = /(\d+\.\d+\.\d+(?:\.\d+)?)/;

interface ParsedTag {
  version: string;
  prefix: string;
  suffix: string;
  parts: number[];
}

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

  private extractSemVer(tag: string): ParsedTag | null {
    const match = SEMVER_RE.exec(tag);

    if (!match) return null;

    const version = match[1];
    const prefix = tag.slice(0, match.index);
    const suffix = tag.slice(match.index + version.length);
    const parts = version.split(".").map(Number);

    return { version, prefix, suffix, parts };
  }

  private compareSemVer(a: number[], b: number[]): number {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const diff = (a[i] ?? 0) - (b[i] ?? 0);

      if (diff !== 0) return diff;
    }

    return 0;
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
      if (imageTag === "latest") {
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
        const parsed = this.extractSemVer(imageTag);

        if (!parsed) return; // Non-SemVer tag, nothing to compare

        const allTags = await registryClient.getRepositoryTags(ref, parsed.prefix);

        if (allTags.length === 0) return; // Can't determine — preserve existing status

        let highestParts = parsed.parts;
        let highestTag: string | undefined;

        for (const tag of allTags) {
          if (!tag.startsWith(parsed.prefix) || !tag.endsWith(parsed.suffix)) continue;

          const candidate = this.extractSemVer(tag);

          if (!candidate) continue;

          // Ensure prefix and suffix match exactly (not just startsWith/endsWith)
          if (candidate.prefix !== parsed.prefix || candidate.suffix !== parsed.suffix) continue;

          if (this.compareSemVer(candidate.parts, highestParts) > 0) {
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

      notificationService.notify(`Update Available: ${service.name}`, msg, "warning").catch(() => {});
    }
  }
}

export const updateCheckerService = new UpdateCheckerService();
