import { HttpFailureCode, HttpOperationError } from "../../lib/httpRequest.js";
import { fetchRegistryToken } from "./auth.js";
import { scanTagPages } from "./tagScan.js";
import type { ImageRef, RegistryProvider, TagScanResult } from "./types.js";

export class GenericRegistryProvider implements RegistryProvider {
  async scanRepositoryTags(ref: ImageRef, _prefix: string): Promise<TagScanResult> {
    const token = await fetchRegistryToken(ref.registry, ref.repository);
    const headers: Record<string, string> = {};

    if (token) headers["Authorization"] = `Bearer ${token}`;

    // Follow Registry v2 Link cursors rather than assuming any tag ordering.
    return scanTagPages(
      `https://${ref.registry}/v2/${ref.repository}/tags/list?n=1000`,
      headers,
      (data, responseHeaders) => {
        const tags = (data as { tags?: unknown } | null)?.tags;

        if (
          tags !== null &&
          (!Array.isArray(tags) || !tags.every((tag) => typeof tag === "string"))
        ) {
          throw new HttpOperationError(HttpFailureCode.INVALID_RESPONSE);
        }

        const link = responseHeaders.link as string | undefined;

        return { tags: tags ?? [], next: link?.match(/<([^>]+)>;\s*rel="next"/)?.[1] };
      },
    );
  }
}
