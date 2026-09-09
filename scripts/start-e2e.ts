import { build } from "esbuild";
import { spawn } from "node:child_process";
import { cp, mkdir } from "node:fs/promises";

import { CONFIG_SCHEMA } from "../src/shared/configSchema.js";

await build({
  entryPoints: ["e2e/entry.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: "dist/server/e2e.js",
  packages: "external",
  alias: { "@shared": "./src/shared" },
});
await mkdir("dist/server/i18n", { recursive: true });
await cp("src/server/i18n/locales", "dist/server/i18n/locales", { recursive: true });
const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "build"], {
  stdio: "inherit",
});

if ((await new Promise((resolve) => vite.once("exit", resolve))) !== 0) process.exit(1);

const env = { ...process.env };

// Never inherit a developer's credentials, Docker endpoints, or database.
for (const entry of Object.values(CONFIG_SCHEMA)) delete env[entry.env];

Object.assign(env, {
  NODE_ENV: "test",
  DOTENV_CONFIG_PATH: "/dev/null",
  DB_PATH: ":memory:",
  PORT: "8099",
  TZ: "UTC",
  SESSION_SECRET: "e2e-only-session-secret",
  APP_VERSION: "e2e",
  DOCKER_HOSTS: "unix:///var/run/docker.sock",
  NETWORK_CIDRS: "",
});
const server = spawn(process.execPath, ["dist/server/e2e.js"], { env, stdio: "inherit" });

for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => server.kill(signal));

server.once("exit", (code) => process.exit(code ?? 0));
