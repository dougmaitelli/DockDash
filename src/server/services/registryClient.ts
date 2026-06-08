import axios from "axios";

import { DOCKER_LATEST_TAG } from "../lib/constants.js";

// Accept header that prefers manifest lists (multi-arch) over single-platform manifests.
// The digest from a manifest list is the stable "pull digest" shown by `docker pull`.
const MANIFEST_ACCEPT = [
  "application/vnd.oci.image.index.v1+json",
  "application/vnd.docker.distribution.manifest.list.v2+json",
  "application/vnd.docker.distribution.manifest.v2+json",
  "application/vnd.oci.image.manifest.v1+json",
].join(",");

const REQUEST_TIMEOUT = 8_000;

export interface ImageRef {
  registry: string;
  repository: string;
  tag: string;
}

export class RegistryClient {
  /**
   * Parses a full image string (e.g. "nginx:latest", "ghcr.io/user/app:v1.0")
   * into its registry, repository, and tag components.
   *
   * Docker Hub short-names are expanded:
   *   "nginx"      → registry-1.docker.io / library/nginx
   *   "user/app"   → registry-1.docker.io / user/app
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

      return { registry: "registry-1.docker.io", repository, tag };
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
      const token = await this.fetchToken(ref.registry, ref.repository);
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
    } catch {
      return null;
    }
  }

  /**
   * Returns tags for the given repository relevant to the given tag prefix.
   *
   * - Docker Hub (`registry-1.docker.io`): uses the hub.docker.com API with a
   *   `name` prefix filter, fetching the first and last pages to cover both ends
   *   of the ascending last_updated ordering.
   * - Other registries: uses the standard Registry API v2 tags/list endpoint,
   *   paginating via Link headers (1 000 tags per page, up to 10 pages).
   */
  async getRepositoryTags(ref: ImageRef, prefix = ""): Promise<string[]> {
    try {
      if (ref.registry === "registry-1.docker.io") {
        return await this.getDockerHubTags(ref.repository, prefix);
      }

      // Generic Registry API v2 — paginate with 1 000 tags per page via Link headers.
      const token = await this.fetchToken(ref.registry, ref.repository);
      const headers: Record<string, string> = {};

      if (token) headers["Authorization"] = `Bearer ${token}`;

      const allTags: string[] = [];
      const MAX_PAGES = 10;
      let path = `/v2/${ref.repository}/tags/list?n=1000`;

      for (let page = 0; page < MAX_PAGES; page++) {
        const resp = await axios.get(`https://${ref.registry}${path}`, {
          headers,
          timeout: REQUEST_TIMEOUT,
          validateStatus: (s) => s < 500,
        });

        if (resp.status !== 200) break;

        allTags.push(...((resp.data?.tags as string[]) ?? []));

        // Follow Link header to next page: </v2/repo/tags/list?last=xxx&n=1000>; rel="next"
        const linkHeader = resp.headers["link"] as string | undefined;
        const nextMatch = linkHeader?.match(/<([^>]+)>;\s*rel="next"/);

        if (!nextMatch) break;

        path = nextMatch[1];
      }

      return allTags;
    } catch {
      return [];
    }
  }

  private parseWwwAuthenticate(
    header: string,
  ): { realm: string; params: Record<string, string> } | null {
    const match = header.match(/Bearer\s+(.+)/i);

    if (!match) return null;

    const params: Record<string, string> = {};
    let realm = "";

    for (const kv of match[1].matchAll(/(\w+)="([^"]+)"/g)) {
      if (kv[1] === "realm") {
        realm = kv[2];
      } else {
        params[kv[1]] = kv[2];
      }
    }

    return realm ? { realm, params } : null;
  }

  private async fetchToken(registry: string, repository: string): Promise<string | null> {
    try {
      if (registry === "registry-1.docker.io") {
        const resp = await axios.get(
          `https://auth.docker.io/token?service=registry.docker.io&scope=repository:${repository}:pull`,
          { timeout: REQUEST_TIMEOUT },
        );

        return (resp.data?.token as string) ?? null;
      }

      // Generic: ping /v2/ to get a WWW-Authenticate challenge
      const ping = await axios.get(`https://${registry}/v2/`, {
        timeout: REQUEST_TIMEOUT,
        validateStatus: (s) => s === 200 || s === 401,
      });

      if (ping.status === 200) return null; // No auth needed

      const wwwAuth = ping.headers["www-authenticate"] as string | undefined;

      if (!wwwAuth) return null;

      const parsed = this.parseWwwAuthenticate(wwwAuth);

      if (!parsed) return null;

      const tokenResp = await axios.get(parsed.realm, {
        params: { ...parsed.params, scope: `repository:${repository}:pull` },
        timeout: REQUEST_TIMEOUT,
      });

      return (tokenResp.data?.token ?? tokenResp.data?.access_token ?? null) as string | null;
    } catch {
      return null;
    }
  }

  /**
   * Fetches tags from the Docker Hub Hub API (hub.docker.com) for a repository,
   * optionally filtered by name prefix.
   *
   * The Hub API returns tags in ascending `last_updated` order (oldest first), so
   * for repos with more than 100 matching tags we fetch both the first page (for
   * the total count) and the last page (newest pushes) and combine them.
   */
  private async getDockerHubTags(repository: string, prefix: string): Promise<string[]> {
    const nameParam = prefix ? `&name=${encodeURIComponent(prefix)}` : "";
    const baseUrl = `https://hub.docker.com/v2/repositories/${repository}/tags?page_size=100${nameParam}`;

    const firstResp = await axios.get(baseUrl, {
      timeout: REQUEST_TIMEOUT,
      validateStatus: (s) => s < 500,
    });

    if (firstResp.status !== 200) return [];

    const count: number = (firstResp.data?.count as number) ?? 0;
    const firstTags =
      (firstResp.data?.results as Array<{ name: string }>)?.map((r) => r.name) ?? [];

    // If everything fits in one page we're done.
    if (count <= 100) return firstTags;

    // Fetch the last page: the Hub API returns ascending by last_updated, so the
    // last page holds the most-recently-pushed tags — the ones most likely to
    // be the newest semantic versions.
    const lastPage = Math.ceil(count / 100);
    const lastResp = await axios.get(`${baseUrl}&page=${lastPage}`, {
      timeout: REQUEST_TIMEOUT,
      validateStatus: (s) => s < 500,
    });

    if (lastResp.status !== 200) return firstTags;

    const lastTags = (lastResp.data?.results as Array<{ name: string }>)?.map((r) => r.name) ?? [];

    // Combine both ends so we see both the historical range and the newest pushes.
    return [...new Set([...firstTags, ...lastTags])];
  }
}

export const registryClient = new RegistryClient();
