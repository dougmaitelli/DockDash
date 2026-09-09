#!/bin/sh
# Canonical environment for both CI and reviewed baseline updates.
set -eu
cd "$(dirname "$0")/.."
docker build -f e2e/Dockerfile -t dockdash-e2e .
docker run --rm --ipc=host \
  -v "$PWD:/work" \
  -v /work/node_modules \
  dockdash-e2e sh -c 'pnpm install --frozen-lockfile && pnpm typecheck:e2e && pnpm test:e2e "$@"' sh "$@"
