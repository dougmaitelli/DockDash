export enum HttpFailureCode {
  INVALID_LINK_HEADER = "INVALID_LINK_HEADER",
  INVALID_PAGINATION_URL = "INVALID_PAGINATION_URL",
  PAGINATION_LOOP = "PAGINATION_LOOP",
  INVALID_RESPONSE = "INVALID_RESPONSE",
  INVALID_REDIRECT = "INVALID_REDIRECT",
  UNSAFE_REDIRECT = "UNSAFE_REDIRECT",
  REDIRECT_LIMIT = "REDIRECT_LIMIT",
}

/** Local diagnostic codes contain no remote response data or credentials. */
export class HttpOperationError extends Error {
  constructor(readonly code: HttpFailureCode) {
    super(code);
    this.name = "HttpOperationError";
  }
}

/** Never serialize Axios errors: config/request/response can contain credentials. */
export function httpErrorSummary(error: unknown): string {
  if (!error || typeof error !== "object") return "Request failed";

  const value = error as { code?: unknown; status?: unknown; response?: { status?: unknown } };
  const code =
    typeof value.code === "string" && /^[A-Z][A-Z0-9_]{0,63}$/.test(value.code)
      ? value.code
      : undefined;
  const status = value.status ?? value.response?.status;

  return ["Request failed", code, typeof status === "number" ? `HTTP ${status}` : undefined]
    .filter(Boolean)
    .join("; ");
}
