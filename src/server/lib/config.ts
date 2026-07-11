import crypto from "crypto";
import fs from "fs";

import { CONFIG_SCHEMA, type ConfigKey, type SchemaConfig } from "@shared/configSchema.js";

import { logger } from "./logService.js";

import "dotenv/config";

export const DEFAULT_DOCKER_SOCKET = "unix:///var/run/docker.sock";

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
    const hosts = this.read("dockerHosts");
    const socketPath = DEFAULT_DOCKER_SOCKET.replace("unix://", "");

    if (fs.existsSync(socketPath) && !hosts.includes(DEFAULT_DOCKER_SOCKET)) {
      return [DEFAULT_DOCKER_SOCKET, ...hosts];
    }

    return hosts;
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
