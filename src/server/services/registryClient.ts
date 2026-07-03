import axios from "axios";

import { DOCKER_LATEST_TAG } from "../lib/constants.js";
import { logger } from "../lib/logService.js";
import { fetchRegistryToken } from "./registry/auth.js";
import { getProvider, Registry } from "./registry/providers.js";
import type { ImageRef } from "./registry/types.js";
import { MANIFEST_ACCEPT, REQUEST_TIMEOUT } from "./registry/types.js";

export type { ImageRef };

export class RegistryClient {
  /**
   * Parses a full image string (e.g. "nginx:latest", "ghcr.io/user/app:v1.0")
   * into its registry, repository, and tag components.
   *
   * Docker Hub short-names are expanded:
   *   "nginx"      → DOCKER_HUB_REGISTRY / library/nginx
   *   "user/app"   → DOCKER_HUB_REGISTRY / user/app
   */
  parseImageRef(image: string): ImageRef {
    // Drop digest suffix (sha256:...)
    const withoutDigest = image.split("@")[0];

    // Split tag off the last path segment
    const segments = withoutDigest.split("/");
    const lastSegment = segments[segments.length - 1];
    const colonIdx = lastSegment.lastIndexOf(":");

    let tag = DOCKER_LATEST_TAG;

    if (colonIdx >= 0) {
      segments[segments.length - 1] = lastSegment.slice(0, colonIdx);
      tag = lastSegment.slice(colonIdx + 1);
    }

    const nameWithoutTag = segments.join("/");
    const firstSegment = segments[0];

    // A segment containing a dot or colon (port) is a registry hostname
    const isExplicitRegistry = firstSegment.includes(".") || firstSegment.includes(":");

    if (!isExplicitRegistry) {
      const repository = segments.length === 1 ? `library/${nameWithoutTag}` : nameWithoutTag;

      return { registry: Registry.DOCKER_HUB.url, repository, tag };
    }

    const registry = firstSegment;
    const repository = segments.slice(1).join("/");

    return { registry, repository, tag };
  }

  /**
   * Returns the manifest digest (e.g. "sha256:abc123") for the given image
   * ref, or null if it cannot be determined.
   */
  async getManifestDigest(ref: ImageRef): Promise<string | null> {
    try {
      const token = await fetchRegistryToken(ref.registry, ref.repository);
      const url = `https://${ref.registry}/v2/${ref.repository}/manifests/${ref.tag}`;
      const headers: Record<string, string> = { Accept: MANIFEST_ACCEPT };

      if (token) headers["Authorization"] = `Bearer ${token}`;

      // Prefer HEAD to avoid downloading the manifest body
      try {
        const resp = await axios.head(url, {
          headers,
          timeout: REQUEST_TIMEOUT,
          validateStatus: (s) => s < 500,
        });

        if (resp.status === 200) {
          return (resp.headers["docker-content-digest"] as string) ?? null;
        }
      } catch {
        // Some registries don't support HEAD — fall through to GET
      }

      const resp = await axios.get(url, {
        headers,
        timeout: REQUEST_TIMEOUT,
        validateStatus: (s) => s < 500,
      });

      if (resp.status !== 200) return null;

      return (resp.headers["docker-content-digest"] as string) ?? null;
    } catch (err) {
      logger.warn(
        `Registry: failed to fetch manifest digest for ${ref.registry}/${ref.repository}:${ref.tag} — ${err instanceof Error ? err.message : String(err)}`,
      );

      return null;
    }
  }

  /**
   * Returns tags for the given repository relevant to the given tag prefix.
   * Delegates to the appropriate provider based on the registry hostname.
   */
  async getRepositoryTags(ref: ImageRef, prefix = ""): Promise<string[]> {
    try {
      return await getProvider(ref.registry).getRepositoryTags(ref, prefix);
    } catch (err) {
      logger.warn(
        `Registry: failed to fetch tags for ${ref.registry}/${ref.repository} — ${err instanceof Error ? err.message : String(err)}`,
      );

      return [];
    }
  }
}

export const registryClient = new RegistryClient();
