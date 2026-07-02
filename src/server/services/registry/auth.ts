import axios from "axios";

import { REQUEST_TIMEOUT } from "./types.js";

function parseWwwAuthenticate(
  header: string,
): { realm: string; params: Record<string, string> } | null {
  const match = header.match(/Bearer\s+(.+)/i);

  if (!match) return null;

  const params: Record<string, string> = {};
  let realm = "";

  for (const kv of match[1].matchAll(/(\w+)="([^"]+)"/g)) {
    if (kv[1] === "realm") {
      realm = kv[2];
    } else {
      params[kv[1]] = kv[2];
    }
  }

  return realm ? { realm, params } : null;
}

// Generic WWW-Authenticate challenge flow. Pass basicAuth for registries that
// require credentials during the token exchange (e.g. private GHCR packages).
export async function fetchRegistryToken(
  registry: string,
  repository: string,
  basicAuth?: { username: string; password: string },
): Promise<string | null> {
  try {
    // Ping /v2/ to get a WWW-Authenticate challenge
    const ping = await axios.get(`https://${registry}/v2/`, {
      timeout: REQUEST_TIMEOUT,
      validateStatus: (s) => s === 200 || s === 401,
    });

    if (ping.status === 200) return null; // No auth needed

    const wwwAuth = ping.headers["www-authenticate"] as string | undefined;

    if (!wwwAuth) return null;

    const parsed = parseWwwAuthenticate(wwwAuth);

    if (!parsed) return null;

    const tokenResp = await axios.get(parsed.realm, {
      params: { ...parsed.params, scope: `repository:${repository}:pull` },
      ...(basicAuth ? { auth: basicAuth } : {}),
      timeout: REQUEST_TIMEOUT,
    });

    return (tokenResp.data?.token ?? tokenResp.data?.access_token ?? null) as string | null;
  } catch (err) {
    console.warn(
      `Registry: failed to fetch auth token for ${registry}/${repository} —`,
      err instanceof Error ? err.message : String(err),
    );

    return null;
  }
}
