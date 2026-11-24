import axios from "axios";

import { httpErrorSummary } from "../../lib/httpRequest.js";
import { logger } from "../../lib/logService.js";
import { TagParser } from "../../lib/tagParser.js";
import type { TagScanResult } from "./types.js";
import { REQUEST_TIMEOUT } from "./types.js";

interface Page {
  tags: string[];
  next?: string;
}

export function containsUpdate(tags: string[], runningTag: string): boolean {
  const current = TagParser.extractSemVer(runningTag);

  if (!current) return false;

  return tags.some((tag) => {
    const candidate = TagParser.extractSemVer(tag);

    return (
      candidate &&
      TagParser.sameFamily(candidate, current) &&
      TagParser.compareSemVer(candidate, current) > 0
    );
  });
}

export async function scanTagPages(
  firstUrl: string,
  headers: Record<string, string>,
  parsePage: (data: unknown, headers: Record<string, unknown>, url: URL) => Page,
  maxPages = 50,
): Promise<TagScanResult> {
  const first = new URL(firstUrl);
  let cursor = first.toString();
  const tags = new Set<string>();

  for (let page = 1; page <= maxPages; page++) {
    try {
      logger.debug(`Registry scan: ${first.host}${first.pathname}, page ${page}`);
      const response = await axios.get(cursor, {
        headers,
        timeout: REQUEST_TIMEOUT,
        validateStatus: (status) => status < 500,
      });

      if (response.status !== 200)
        throw Object.assign(new Error("HTTP request failed"), { status: response.status });

      const result = parsePage(response.data, response.headers ?? {}, new URL(cursor));

      for (const tag of result.tags) tags.add(tag);

      if (!result.next) return { tags: [...tags], complete: true };

      const next = new URL(result.next, cursor);

      if (next.origin !== first.origin) throw new Error("Invalid pagination origin");

      cursor = next.toString();
    } catch (error) {
      logger.warn(
        `Registry scan: incomplete ${first.host}${first.pathname} — ${httpErrorSummary(error)}`,
      );

      return { tags: [...tags], complete: false, failed: true };
    }
  }

  return { tags: [...tags], complete: false };
}
