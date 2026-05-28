import type Docker from "dockerode";
import { db } from "../lib/database.js";
import { ServiceSource } from "@shared";
import { createDockerClientForHost } from "./dockerService.js";
import { parseImageRef, getManifestDigest, getRepositoryTags } from "./registryClient.js";

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

function extractSemVer(tag: string): ParsedTag | null {
  const match = SEMVER_RE.exec(tag);

  if (!match) return null;

  const version = match[1];
  const prefix = tag.slice(0, match.index);
  const suffix = tag.slice(match.index + version.length);
  const parts = version.split(".").map(Number);

  return { version, prefix, suffix, parts };
}

function compareSemVer(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);

    if (diff !== 0) return diff;
  }

  return 0;
}

// ---------------------------------------------------------------------------
// Local image digest
// ---------------------------------------------------------------------------

/**
 * Returns the registry-push digest (sha256:...) for the image currently
 * running in the given container, or null if it cannot be determined (e.g.
 * locally built images that were never pushed).
 */
async function getLocalImageDigest(docker: Docker, containerId: string): Promise<string | null> {
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

// ---------------------------------------------------------------------------
// Per-service check
// ---------------------------------------------------------------------------

type Service = ReturnType<typeof db.getServices>[number];

async function checkServiceForUpdate(service: Service, docker: Docker): Promise<void> {
  const containerId = service.metadata?.containerId as string | undefined;
  const image = service.metadata?.image as string | undefined;
  const imageTag = service.metadata?.imageTag as string | undefined;

  if (!containerId || !image || !imageTag) return;

  const ref = parseImageRef(`${image}:${imageTag}`);

  let hasUpdate = false;
  let latestVersion: string | undefined;

  try {
    if (imageTag === "latest") {
      const [localDigest, registryDigest] = await Promise.all([
        getLocalImageDigest(docker, containerId),
        getManifestDigest(ref),
      ]);

      if (!localDigest || !registryDigest) return;

      hasUpdate = localDigest !== registryDigest;

      if (hasUpdate) {
        // Show just the short digest for display
        latestVersion = `newer digest (${registryDigest.slice(7, 19)}…)`;
      }
    } else {
      const parsed = extractSemVer(imageTag);

      if (!parsed) return; // Non-SemVer tag, nothing to compare

      const allTags = await getRepositoryTags(ref, parsed.prefix);

      if (allTags.length === 0) return; // Can't determine — preserve existing status

      let highestParts = parsed.parts;
      let highestTag: string | undefined;

      for (const tag of allTags) {
        if (!tag.startsWith(parsed.prefix) || !tag.endsWith(parsed.suffix)) continue;

        const candidate = extractSemVer(tag);

        if (!candidate) continue;

        // Ensure prefix and suffix match exactly (not just startsWith/endsWith)
        if (candidate.prefix !== parsed.prefix || candidate.suffix !== parsed.suffix) continue;

        if (compareSemVer(candidate.parts, highestParts) > 0) {
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

  db.updateServiceMetadata(service.id || "", {
    hasUpdate,
    ...(latestVersion !== undefined ? { latestVersion } : {}),
    updateCheckedAt: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------------
// Batch entry point
// ---------------------------------------------------------------------------

export async function checkAllServicesForUpdates(): Promise<void> {
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
    const docker = createDockerClientForHost(host);

    for (const service of hostServices) {
      await checkServiceForUpdate(service, docker);
    }
  }
}
