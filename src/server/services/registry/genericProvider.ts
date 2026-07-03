import axios from "axios";

import { logger } from "../../lib/logService.js";
import { fetchRegistryToken } from "./auth.js";
import type { ImageRef, RegistryProvider } from "./types.js";
import { REQUEST_TIMEOUT } from "./types.js";

export class GenericRegistryProvider implements RegistryProvider {
  // 50 pages × 1 000 tags covers repos that bury version tags behind tens of
  // thousands of git-hash tags (e.g. GHCR without a token).
  protected static readonly MAX_PAGES = 50;

  async getRepositoryTags(ref: ImageRef, _prefix: string): Promise<string[]> {
    const token = await fetchRegistryToken(ref.registry, ref.repository);
    const headers: Record<string, string> = {};

    if (token) headers["Authorization"] = `Bearer ${token}`;

    const allTags: string[] = [];
    let path = `/v2/${ref.repository}/tags/list?n=1000`;
    let page = 0;

    for (; page < GenericRegistryProvider.MAX_PAGES; page++) {
      logger.debug(
        `Registry [generic]: fetching page ${page + 1} for ${ref.registry}/${ref.repository}`,
      );

      const resp = await axios.get(`https://${ref.registry}${path}`, {
        headers,
        timeout: REQUEST_TIMEOUT,
        validateStatus: (s) => s < 500,
      });

      if (resp.status !== 200) {
        logger.warn(
          `Registry: tags list for ${ref.registry}/${ref.repository} returned HTTP ${resp.status}`,
        );

        break;
      }

      allTags.push(...((resp.data?.tags as string[]) ?? []));

      // Follow Link header to next page: </v2/repo/tags/list?last=xxx&n=1000>; rel="next"
      const linkHeader = resp.headers["link"] as string | undefined;
      const nextMatch = linkHeader?.match(/<([^>]+)>;\s*rel="next"/);

      if (!nextMatch) break;

      path = nextMatch[1];
    }

    logger.debug(
      `Registry [generic]: fetched ${page + 1} page(s), ${allTags.length} tags for ${ref.registry}/${ref.repository}`,
    );

    return allTags;
  }
}
