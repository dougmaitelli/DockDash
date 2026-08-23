import type { Service } from "@shared";
import { ServiceSource } from "@shared";

const HOMARR_BASE = "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons";
const SELFHST_BASE = "https://cdn.jsdelivr.net/gh/selfhst/icons";

const ALIASES: Record<string, string> = {
  "actual-server": "actual-budget",
  "code-server": "vscode",
  "home-assistant-core": "home-assistant",
  npm: "nginx-proxy-manager",
  "paperless-ngx-webserver": "paperless-ngx",
  "plex-media-server": "plex",
  postgres: "postgresql",
};

const GENERIC_NAMES = new Set(["http", "https", "tcp", "udp", "unknown", "unknown-service"]);

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function normalizeIconName(input?: string): string {
  if (!input) return "";

  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(input.trim())) return "";

  let name = input.trim().toLowerCase();

  // Image references may contain a registry, repository, digest, and tag.
  name = name.split("@")[0];
  name = name.split("/").filter(Boolean).at(-1) ?? name;
  name = name.replace(/:[^:]+$/, "");
  name = name.replace(/\.(local|lan|internal)$/i, "");
  name = name.replace(/^(ix-|k8s-|binhex-|linuxserver-|umbrel-|casaos-)/, "");
  name = name.replace(/[-_](webserver|server|daemon|container|app)-\d+$/, "-$1");
  name = name.replace(/[-_]\d+$/, "");
  name = name.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

  return ALIASES[name] ?? name;
}

function addNameVariants(values: Array<string | undefined>): string[] {
  const names: string[] = [];

  for (const value of values) {
    const normalized = normalizeIconName(value);

    if (!normalized || GENERIC_NAMES.has(normalized)) continue;

    names.push(normalized);

    const withoutRole = normalized.replace(
      /-(webserver|server|daemon|proxy|database|db|worker|frontend|backend)$/,
      "",
    );

    if (withoutRole !== normalized) names.push(ALIASES[withoutRole] ?? withoutRole);
  }

  return unique(names);
}

export function getServiceIconNames(service: Service): string[] {
  if (service.source === ServiceSource.NETWORK) return [];

  return addNameVariants([
    service.metadata?.image,
    service.metadata?.workloadName,
    service.metadata?.containerName,
    service.name,
  ]);
}

export function getIconUrls(names: string[], darkMode: boolean): string[] {
  return unique(
    names.flatMap((name) => [
      `${HOMARR_BASE}/svg/${name}.svg`,
      `${HOMARR_BASE}/svg/${name}-${darkMode ? "light" : "dark"}.svg`,
      `${SELFHST_BASE}/svg/${name}.svg`,
      `${SELFHST_BASE}/svg/${name}-${darkMode ? "light" : "dark"}.svg`,
      `${HOMARR_BASE}/png/${name}.png`,
    ]),
  );
}
