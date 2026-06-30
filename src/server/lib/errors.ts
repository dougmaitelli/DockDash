// docker-modem puts raw HTTP response bodies (e.g. HTML 403 from a socket proxy) into err.message
export function sanitizeDockerError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);

  return message
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
