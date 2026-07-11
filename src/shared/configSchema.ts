// Central definition of all schema-driven config entries.
// Adding a new entry here automatically propagates it to:
//   - the Config class (via config.read() + auto-generated getters)
//   - the /api/config response payload (when showOnUi: true)
//   - the Settings page env-vars table (when showOnUi: true and type is not boolean-disable)

type EntryBase = { env: string; showOnUi?: true; format?: "ms" };

// prettier-ignore
export type SchemaEntry =
  | (EntryBase & { type: "number";          default: number            })
  | (EntryBase & { type: "string";          default: string | null     })
  | (EntryBase & { type: "string-array";    default: readonly string[] })
  | (EntryBase & { type: "boolean-disable"                             });

// prettier-ignore
export const CONFIG_SCHEMA = {
  appRepo:                  { env: "APP_REPO",                  type: "string",         default: null                  },
  appVersion:               { env: "APP_VERSION",               type: "string",         default: "dev"                 },
  locale:                   { env: "LOCALE",                    type: "string",         default: "en"                  },
  port:                     { env: "PORT",                      type: "number",         default: 3001                  },
  dockerHosts:              { env: "DOCKER_HOSTS",              type: "string-array",   default: [],                   showOnUi: true },
  networkCidrs:             { env: "NETWORK_CIDRS",             type: "string-array",   default: ["192.168.0.0/24"],   showOnUi: true },
  healthCheckInterval:      { env: "HEALTH_CHECK_INTERVAL",     type: "number",         default: 30_000,               showOnUi: true, format: "ms" },
  updateCheckInterval:      { env: "UPDATE_CHECK_INTERVAL",     type: "number",         default: 3_600_000,            showOnUi: true, format: "ms" },
  containerControlsEnabled: { env: "DISABLE_CONTAINER_CONTROLS",type: "boolean-disable",                               showOnUi: true },
  healthHistoryEnabled:     { env: "DISABLE_HEALTH_HISTORY",    type: "boolean-disable",                               showOnUi: true },
  healthHistoryTtlDays:     { env: "HEALTH_HISTORY_TTL_DAYS",   type: "number",         default: 30,                   showOnUi: true },
  resourceMonitorEnabled:   { env: "DISABLE_RESOURCE_MONITOR",  type: "boolean-disable",                               showOnUi: true },
  cpuSpikeThreshold:        { env: "CPU_SPIKE_THRESHOLD",       type: "number",         default: 90,                   showOnUi: true },
  memorySpikeThreshold:     { env: "MEMORY_SPIKE_THRESHOLD",    type: "number",         default: 90,                   showOnUi: true },
  spikeDurationThreshold:   { env: "SPIKE_DURATION_THRESHOLD",  type: "number",         default: 300,                  showOnUi: true },
  fileExplorerEnabled:      { env: "DISABLE_FILE_EXPLORER",     type: "boolean-disable",                               showOnUi: true },
  terminalEnabled:          { env: "DISABLE_TERMINAL",          type: "boolean-disable",                               showOnUi: true },
  oidcIssuer:               { env: "OIDC_ISSUER",               type: "string",         default: null                  },
  oidcClientId:             { env: "OIDC_CLIENT_ID",            type: "string",         default: null                  },
  oidcClientSecret:         { env: "OIDC_CLIENT_SECRET",        type: "string",         default: null                  },
  oidcRedirectUri:          { env: "OIDC_REDIRECT_URI",         type: "string",         default: null                  },
  oidcScopes:               { env: "OIDC_SCOPES",               type: "string",         default: "openid profile email"},
  sessionSecret:            { env: "SESSION_SECRET",            type: "string",         default: null                  },
  sessionMaxAge:            { env: "SESSION_MAX_AGE",           type: "number",         default: 8 * 60 * 60 * 1000    },
  trustProxy:               { env: "TRUST_PROXY",               type: "string",         default: "loopback, uniquelocal"},
  appriseUrl:               { env: "APPRISE_URL",               type: "string",         default: null                  },
  appriseUrls:              { env: "APPRISE_URLS",              type: "string-array",   default: []                    },
  appriseTags:              { env: "APPRISE_TAGS",              type: "string-array",   default: []                    },
  githubToken:              { env: "GITHUB_TOKEN",              type: "string",         default: null                  },
} as const satisfies Record<string, SchemaEntry>;

export type ConfigKey = keyof typeof CONFIG_SCHEMA;

type InferValue<E extends SchemaEntry> = E["type"] extends "boolean-disable"
  ? boolean
  : E["type"] extends "string-array"
    ? string[]
    : E extends { type: "string"; default: null }
      ? string | null
      : E extends { type: "string" }
        ? string
        : number;

/** All schema entries — used by the Config class declaration merge. */
export type SchemaConfig = { [K in ConfigKey]: InferValue<(typeof CONFIG_SCHEMA)[K]> };

/** Client-visible entries only (showOnUi: true) — used by DashboardConfig. */
type ClientKey = {
  [K in ConfigKey]: (typeof CONFIG_SCHEMA)[K] extends { showOnUi: true } ? K : never;
}[ConfigKey];
export type ClientSchemaConfig = { [K in ClientKey]: InferValue<(typeof CONFIG_SCHEMA)[K]> };
