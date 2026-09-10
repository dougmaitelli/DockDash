#!/bin/sh
# Canonical environment for both CI and reviewed baseline updates.
set -eu
cd "$(dirname "$0")/.."
PLAYWRIGHT_VERSION=$(node --input-type=commonjs -e '
  const { devDependencies } = require("./package.json");
  const version = devDependencies["@playwright/test"];
  if (!/^\d+\.\d+\.\d+$/.test(version) || version !== devDependencies.playwright) {
    throw new Error("Pin playwright and @playwright/test to the same exact version");
  }
  process.stdout.write(version);
')
docker build --build-arg "PLAYWRIGHT_VERSION=$PLAYWRIGHT_VERSION" -f e2e/Dockerfile -t dockdash-e2e .
docker run --rm --ipc=host \
  -v "$PWD:/work" \
  -v /work/node_modules \
  dockdash-e2e sh -c 'pnpm install --frozen-lockfile && pnpm typecheck:e2e && pnpm test:e2e "$@"' sh "$@"
