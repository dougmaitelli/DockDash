import axios from "axios";

import { logger } from "../../lib/logService.js";
import type { ImageRef, RegistryProvider } from "./types.js";
import { REQUEST_TIMEOUT } from "./types.js";

const DOCKER_HUB_API_BASE = "https://hub.docker.com/v2/repositories";

export class DockerHubProvider implements RegistryProvider {
  async getRepositoryTags(ref: ImageRef, prefix: string): Promise<string[]> {
    return this.getDockerHubTags(ref.repository, prefix);
  }

  /**
   * Fetches tags from the Docker Hub API, optionally filtered by name prefix.
   *
   * The Hub API returns tags in ascending `last_updated` order (oldest first), so
   * for repos with more than 100 matching tags we fetch both the first page (for
   * the total count) and the last page (newest pushes) and combine them.
   */
  private async getDockerHubTags(repository: string, prefix: string): Promise<string[]> {
    const nameParam = prefix ? `&name=${encodeURIComponent(prefix)}` : "";
    const baseUrl = `${DOCKER_HUB_API_BASE}/${repository}/tags?page_size=100${nameParam}`;

    const firstResp = await axios.get(baseUrl, {
      timeout: REQUEST_TIMEOUT,
      validateStatus: (s) => s < 500,
    });

    if (firstResp.status !== 200) return [];

    const count: number = (firstResp.data?.count as number) ?? 0;
    const firstTags =
      (firstResp.data?.results as Array<{ name: string }>)?.map((r) => r.name) ?? [];

    logger.debug(`Registry [dockerhub]: ${count} total tags for ${repository}, prefix="${prefix}"`);

    // If everything fits in one page we're done.
    if (count <= 100) return firstTags;

    // Fetch the last page: the Hub API returns ascending by last_updated, so the
    // last page holds the most-recently-pushed tags — the ones most likely to
    // be the newest semantic versions.
    const lastPage = Math.ceil(count / 100);

    logger.debug(
      `Registry [dockerhub]: fetching last page ${lastPage} (${count} total tags) for ${repository}`,
    );

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
