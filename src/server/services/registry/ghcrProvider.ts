import axios from "axios";

import { config } from "../../lib/config.js";
import { logger } from "../../lib/logService.js";
import { GenericRegistryProvider } from "./genericProvider.js";
import type { ImageRef } from "./types.js";
import { REQUEST_TIMEOUT } from "./types.js";

export class GhcrProvider extends GenericRegistryProvider {
  /**
   * Uses the GitHub Packages REST API when a token is available — it groups all
   * tags for a manifest into one version entry and returns versions newest-first,
   * so recent release tags appear in the first few pages regardless of how many
   * git-hash tags exist.
   *
   * Falls back to the generic Registry v2 pagination when no token is configured.
   */
  async getRepositoryTags(ref: ImageRef, prefix: string): Promise<string[]> {
    if (config.githubToken) {
      logger.debug(`Registry [ghcr]: using GitHub Packages API for ${ref.repository}`);

      return this.getTagsViaGitHubApi(ref.repository);
    }

    logger.debug(
      `Registry [ghcr]: no token, falling back to generic registry API for ${ref.repository}`,
    );

    return super.getRepositoryTags(ref, prefix);
  }

  private async getTagsViaGitHubApi(repository: string): Promise<string[]> {
    const [owner, ...rest] = repository.split("/");
    // Slashes in the package name must be percent-encoded for the GitHub API.
    const packageName = encodeURIComponent(rest.join("/"));

    const headers = {
      Authorization: `Bearer ${config.githubToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };

    type GhVersion = { metadata?: { container?: { tags?: string[] } } };

    const fetchPages = async (ownerType: "orgs" | "users"): Promise<string[] | null> => {
      const base = `https://api.github.com/${ownerType}/${owner}/packages/container/${packageName}/versions`;
      const allTags: string[] = [];
      const MAX_PAGES = 100; // 100 × 100 = 10 000 versions

      let page = 1;

      for (; page <= MAX_PAGES; page++) {
        logger.debug(
          `Registry [ghcr]: fetching page ${page} via GitHub Packages API (${ownerType}) for ${repository}`,
        );

        const resp = await axios.get<GhVersion[]>(base, {
          headers,
          params: { per_page: 100, page },
          timeout: REQUEST_TIMEOUT,
          validateStatus: (s) => s < 500,
        });

        if (resp.status === 404) return null; // Wrong owner type

        if (resp.status !== 200) {
          logger.warn(`GitHub Packages API: ${base} returned HTTP ${resp.status}`);

          return null;
        }

        for (const version of resp.data) {
          allTags.push(...(version.metadata?.container?.tags ?? []));
        }

        if (resp.data.length < 100) break; // Last page
      }

      logger.debug(
        `Registry [ghcr]: fetched ${page} page(s) via GitHub Packages API for ${repository}, ${allTags.length} tags`,
      );

      return allTags;
    };

    const orgTags = await fetchPages("orgs");

    if (orgTags !== null) return orgTags;

    const userTags = await fetchPages("users");

    if (userTags !== null) return userTags;

    // Both endpoints failed — fall back to Registry API v2
    logger.warn(
      `GitHub Packages API: could not resolve ${repository}, falling back to registry API`,
    );

    return [];
  }
}
