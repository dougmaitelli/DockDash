import { HttpFailureCode, HttpOperationError } from "../../lib/httpRequest.js";
import { scanTagPages } from "./tagScan.js";
import type { ImageRef, RegistryProvider, TagScanResult } from "./types.js";

const DOCKER_HUB_API_BASE = "https://hub.docker.com/v2/repositories";

export class DockerHubProvider implements RegistryProvider {
  /**
   * Hub returns most recently updated tags first with ordering=last_updated.
   * Update time is not semantic-version order: rebuilds move existing tags too.
   * Check successive pages until finding an available update (not necessarily the highest ever published).
   */
  async scanRepositoryTags(ref: ImageRef, prefix: string): Promise<TagScanResult> {
    // "v" and the empty prefix are equivalent for version matching. Filtering by
    // "v" would hide valid unprefixed releases when publishers change spelling.
    const nameParam = prefix && prefix !== "v" ? `&name=${encodeURIComponent(prefix)}` : "";
    const first = `${DOCKER_HUB_API_BASE}/${ref.repository}/tags?page_size=100&ordering=last_updated${nameParam}`;

    return scanTagPages(
      first,
      {},
      (data, _headers, url) => {
        const page = data as { count: number; results: { name: string }[] };

        if (
          !page ||
          !Number.isSafeInteger(page.count) ||
          page.count < 0 ||
          !Array.isArray(page.results) ||
          !page.results.every((tag) => typeof tag?.name === "string")
        ) {
          throw new HttpOperationError(HttpFailureCode.INVALID_RESPONSE);
        }

        const pageNumber = Number(url.searchParams.get("page") ?? 1);
        const next = new URL(url);

        next.searchParams.set("page", String(pageNumber + 1));

        return {
          tags: page.results.map((tag) => tag.name),
          next: pageNumber * 100 < page.count ? next.toString() : undefined,
        };
      },
      ref.tag,
    );
  }
}
