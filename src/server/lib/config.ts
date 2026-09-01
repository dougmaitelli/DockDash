import crypto from "crypto";
import fs from "fs";

import { CONFIG_SCHEMA, type ConfigKey, type SchemaConfig } from "@shared/configSchema.js";

import { logger } from "./logService.js";

import "dotenv/config";

export const DEFAULT_DOCKER_SOCKET = "unix:///var/run/docker.sock";
export const DEFAULT_LOCAL_DOCKER_HOST_NAME = "Local";

export interface ConfiguredDockerHost {
  name: string;
  host: string;
}

function defaultDockerHostName(host: string): string {
  return host === DEFAULT_DOCKER_SOCKET ? DEFAULT_LOCAL_DOCKER_HOST_NAME : host;
}

export function parseDockerHostEntry(entry: string): ConfiguredDockerHost {
  const separatorIndex = entry.indexOf("=");

  if (separatorIndex === -1 || entry.slice(0, separatorIndex).includes("://")) {
    return { name: defaultDockerHostName(entry), host: entry };
  }

  const name = entry.slice(0, separatorIndex).trim();
  const host = entry.slice(separatorIndex + 1).trim();

  if (!name || !host) {
    throw new Error(
      `Invalid DOCKER_HOSTS entry "${entry}". Use either an endpoint or name=endpoint.`,
    );
  }

  return { name, host };
}

class Config {
  private _sessionSecret: string | undefined;

  read<K extends ConfigKey>(key: K): SchemaConfig[K] {
    const entry = CONFIG_SCHEMA[key];
    const raw = process.env[entry.env];

    if (entry.type === "boolean-disable") {
      return (raw !== "true") as SchemaConfig[K];
    }

    if (entry.type === "string") {
      return (process.env[entry.env] || entry.default) as SchemaConfig[K];
    }

    if (entry.type === "string-array") {
      return raw
        ? (raw
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean) as SchemaConfig[K])
        : ([...entry.default] as SchemaConfig[K]);
    }

    return (raw !== undefined ? parseInt(raw, 10) : entry.default) as SchemaConfig[K];
  }

  get dockerHosts(): string[] {
    return this.dockerHostConfigs.map(({ host }) => host);
  }

  get dockerHostConfigs(): ConfiguredDockerHost[] {
    const hosts = this.read("dockerHosts").map(parseDockerHostEntry);
    const socketPath = DEFAULT_DOCKER_SOCKET.replace("unix://", "");

    if (fs.existsSync(socketPath) && !hosts.some(({ host }) => host === DEFAULT_DOCKER_SOCKET)) {
      hosts.unshift({ name: DEFAULT_LOCAL_DOCKER_HOST_NAME, host: DEFAULT_DOCKER_SOCKET });
    }

    const names = new Set<string>();
    const endpoints = new Set<string>();

    for (const host of hosts) {
      const normalizedName = host.name.toLocaleLowerCase();

      if (names.has(normalizedName)) {
        throw new Error(`Duplicate Docker host name in DOCKER_HOSTS: ${host.name}`);
      }

      if (endpoints.has(host.host)) {
        throw new Error(`Duplicate Docker endpoint in DOCKER_HOSTS: ${host.host}`);
      }

      names.add(normalizedName);
      endpoints.add(host.host);
    }

    return hosts;
  }

  get dockerHostEntries(): string[] {
    return this.dockerHostConfigs.map(({ name, host }) =>
      name === host ? host : `${name}=${host}`,
    );
  }

  get oidcEnabled(): boolean {
    return !!(this.oidcIssuer && this.oidcClientId && this.oidcClientSecret);
  }

  get sessionSecret(): string {
    const fromEnv = this.read("sessionSecret");

    if (fromEnv) return fromEnv;

    if (!this._sessionSecret) {
      this._sessionSecret = crypto.randomBytes(32).toString("hex");
      logger.warn(
        "\n⚠️  WARNING: SESSION_SECRET is not set. A random secret was generated for this process." +
          " Sessions will be invalidated on every restart. Set SESSION_SECRET in production.\n",
      );
    }

    return this._sessionSecret;
  }

  get secureCookies(): boolean {
    return process.env.NODE_ENV === "production";
  }

  get appriseConfigured(): boolean {
    return !!this.appriseUrl;
  }

  get certVaultResolvedApiKey(): string | null {
    if (this.certVaultApiKey) return this.certVaultApiKey;

    if (!this.certVaultApiKeyFile) return null;

    try {
      return fs.readFileSync(this.certVaultApiKeyFile, "utf8").trim() || null;
    } catch (err) {
      logger.error(
        `Unable to read CERTVAULT_API_KEY_FILE: ${err instanceof Error ? err.message : String(err)}`,
      );

      return null;
    }
  }

  get certVaultConfigured(): boolean {
    return !!(this.certVaultUrl && this.certVaultResolvedApiKey);
  }

  static {
    for (const key of Object.keys(CONFIG_SCHEMA) as ConfigKey[]) {
      if (!Object.getOwnPropertyDescriptor(this.prototype, key)) {
        Object.defineProperty(this.prototype, key, {
          get(this: Config) {
            return this.read(key);
          },
          configurable: true,
        });
      }
    }
  }
}

// Declaration merge — gives TypeScript visibility into the auto-generated schema getters.
interface Config extends SchemaConfig {}

export const config = new Config();
