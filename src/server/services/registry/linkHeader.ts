import { HttpFailureCode, HttpOperationError } from "../../lib/httpRequest.js";

// Parse HTTP Link values without splitting commas/semicolons inside quoted
// parameters or URI references. Invalid headers must not imply end-of-list.
export function nextLink(header: unknown): string | undefined {
  if (header === undefined || header === null) return undefined;

  if (typeof header !== "string" || !header.trim())
    throw new HttpOperationError(HttpFailureCode.INVALID_LINK_HEADER);

  let remaining = header.trim();
  let next: string | undefined;

  while (remaining) {
    const link = /^<([^<>]+)>/.exec(remaining);

    if (!link) throw new HttpOperationError(HttpFailureCode.INVALID_LINK_HEADER);

    remaining = remaining.slice(link[0].length).trimStart();
    let relation: string | undefined;

    while (remaining.startsWith(";")) {
      const parameter =
        /^;\s*([!#$%&'*+.^_`|~\w-]+)(?:\s*=\s*("(?:[^"\\]|\\.)*"|[!#$%&'*+.^_`|~\w-]+))?/.exec(
          remaining,
        );

      if (!parameter) throw new HttpOperationError(HttpFailureCode.INVALID_LINK_HEADER);

      const rawValue = parameter[2];
      const value = rawValue?.startsWith('"')
        ? rawValue.slice(1, -1).replace(/\\(.)/g, "$1")
        : rawValue;

      if (parameter[1].toLowerCase() === "rel") relation ??= value;

      remaining = remaining.slice(parameter[0].length).trimStart();
    }

    if (!relation) throw new HttpOperationError(HttpFailureCode.INVALID_LINK_HEADER);

    if (relation.toLowerCase().split(/\s+/).includes("next")) {
      if (next && next !== link[1])
        throw new HttpOperationError(HttpFailureCode.INVALID_LINK_HEADER);

      next = link[1];
    }

    if (!remaining) break;

    if (!remaining.startsWith(","))
      throw new HttpOperationError(HttpFailureCode.INVALID_LINK_HEADER);

    remaining = remaining.slice(1).trimStart();

    if (!remaining) throw new HttpOperationError(HttpFailureCode.INVALID_LINK_HEADER);
  }

  return next;
}
