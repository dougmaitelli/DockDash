import axios from "axios";

import { httpErrorSummary, HttpFailureCode, HttpOperationError } from "../../lib/httpRequest.js";
import { logger } from "../../lib/logService.js";
import { TagParser } from "../../lib/tagParser.js";
import type { TagScanResult } from "./types.js";
import { REQUEST_TIMEOUT } from "./types.js";

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 5;

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

const MAX_PAGES = 50;

/** Only recent-first providers pass a running tag to enable early exit. */
export async function scanTagPages(
  firstUrl: string,
  headers: Record<string, string>,
  parsePage: (data: unknown, headers: Record<string, unknown>, url: URL) => Page,
  runningTag?: string,
): Promise<TagScanResult> {
  const first = new URL(firstUrl);
  const validUrl = (value: string, base: string, code: HttpFailureCode) => {
    let url: URL;

    try {
      url = new URL(value, base);
    } catch {
      throw new HttpOperationError(code);
    }

    // Never forward registry credentials outside this endpoint, either through
    // pagination or redirects. Credentials/fragments in continuation URLs are invalid.
    if (
      url.origin !== first.origin ||
      url.pathname !== first.pathname ||
      url.username ||
      url.password ||
      url.hash
    ) {
      throw new HttpOperationError(code);
    }

    return url.toString();
  };
  let cursor = first.toString();
  const tags = new Set<string>();
  const visited = new Set<string>();

  for (let page = 1; page <= MAX_PAGES; page++) {
    try {
      logger.debug(`Registry scan: ${first.host}${first.pathname}, page ${page}`);
      let response;

      // Follow only explicitly validated redirects; Axios must not automatically
      // forward credentials before we inspect Location.
      for (let redirects = 0; ; redirects++) {
        if (visited.has(cursor)) throw new HttpOperationError(HttpFailureCode.PAGINATION_LOOP);

        visited.add(cursor);
        response = await axios.get(cursor, {
          headers,
          maxRedirects: 0,
          timeout: REQUEST_TIMEOUT,
          validateStatus: (status) => status < 500,
        });

        if (!REDIRECT_STATUSES.has(response.status)) break;

        if (redirects >= MAX_REDIRECTS)
          throw new HttpOperationError(HttpFailureCode.REDIRECT_LIMIT);

        const location: unknown = response.headers?.location;

        if (typeof location !== "string" || !location.trim())
          throw new HttpOperationError(HttpFailureCode.INVALID_REDIRECT);

        cursor = validUrl(location, cursor, HttpFailureCode.UNSAFE_REDIRECT);
      }

      if (response.status !== 200)
        throw Object.assign(new Error("HTTP request failed"), { status: response.status });

      const result = parsePage(response.data, response.headers ?? {}, new URL(cursor));

      for (const tag of result.tags) tags.add(tag);

      if (!result.next) {
        logger.debug(`Registry scan: complete ${first.host}${first.pathname}, ${tags.size} tags`);

        return { tags: [...tags], complete: true };
      }

      if (runningTag && containsUpdate(result.tags, runningTag))
        return { tags: [...tags], complete: false };

      cursor = validUrl(result.next, cursor, HttpFailureCode.INVALID_PAGINATION_URL);
    } catch (error) {
      logger.warn(
        `Registry scan: incomplete ${first.host}${first.pathname} — ${httpErrorSummary(error)}`,
      );

      return { tags: [...tags], complete: false, failed: true };
    }
  }

  logger.debug(`Registry scan: reached ${MAX_PAGES}-page limit for ${first.host}${first.pathname}`);

  return { tags: [...tags], complete: false };
}
