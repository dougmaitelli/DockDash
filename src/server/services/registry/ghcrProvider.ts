import { config } from "../../lib/config.js";
import { HttpFailureCode, HttpOperationError } from "../../lib/httpRequest.js";
import { logger } from "../../lib/logService.js";
import { GenericRegistryProvider } from "./genericProvider.js";
import { scanTagPages } from "./tagScan.js";
import type { ImageRef, TagScanResult } from "./types.js";

const VERSIONS_PER_PAGE = 100;

export class GhcrProvider extends GenericRegistryProvider {
  /**
   * GitHub Packages groups tags by manifest and returns recent versions first.
   * This is not semantic-version ordering: older release branches can be rebuilt.
   * Fall back to Registry v2 when no token is configured or Packages fails.
   */
  override async scanRepositoryTags(
    ref: ImageRef,
    prefix: string,
    signal?: AbortSignal,
  ): Promise<TagScanResult> {
    if (!config.githubToken) return super.scanRepositoryTags(ref, prefix, signal);

    const [owner, ...rest] = ref.repository.split("/");
    // Slashes in the package name must be percent-encoded for the GitHub API.
    const packageName = encodeURIComponent(rest.join("/"));
    const headers = {
      Authorization: `Bearer ${config.githubToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    const ownerTypes = ["orgs", "users"];

    for (const ownerType of ownerTypes) {
      const result = await scanTagPages(
        `https://api.github.com/${ownerType}/${owner}/packages/container/${packageName}/versions?per_page=${VERSIONS_PER_PAGE}&page=1`,
        headers,
        (data, _headers, url) => {
          const versions = data as { metadata?: { container?: { tags?: string[] } } }[];

          if (
            !Array.isArray(versions) ||
            !versions.every((version) => {
              const tags = version?.metadata?.container?.tags;

              return (
                version &&
                typeof version === "object" &&
                (tags === undefined ||
                  (Array.isArray(tags) && tags.every((tag) => typeof tag === "string")))
              );
            })
          )
            throw new HttpOperationError(HttpFailureCode.INVALID_RESPONSE);

          const next = new URL(url);

          next.searchParams.set("page", String(Number(url.searchParams.get("page")) + 1));

          return {
            tags: versions.flatMap((version) => version.metadata?.container?.tags ?? []),
            next: versions.length === VERSIONS_PER_PAGE ? next.toString() : undefined,
          };
        },
        ref.tag,
        signal,
      );

      if (signal?.aborted || !result.failed) return result;
    }

    logger.warn(
      `GitHub Packages API: could not resolve ${ref.repository}, falling back to registry API`,
    );

    return super.scanRepositoryTags(ref, prefix, signal);
  }
}
