#!/bin/sh
# Run the screenshot script inside a Playwright Docker container.
# All browser binaries and system dependencies are pre-installed in the image.
# Requires Docker. Useful on WSL or any host without a local Chromium install.
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLAYWRIGHT_VERSION=$(node -e "process.stdout.write(require('$ROOT/node_modules/playwright/package.json').version)")
IMAGE="mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble"

echo "Using image: $IMAGE"

exec docker run --rm \
  --ipc=host \
  -v "$ROOT:/work" \
  -w /work \
  -e PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
  "$IMAGE" \
  node node_modules/.bin/tsx scripts/take-screenshots.ts
