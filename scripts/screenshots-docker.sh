#!/bin/sh
# Use the same pinned browser, Node, dependencies, and server as visual tests.
set -eu
exec sh "$(dirname "$0")/e2e-docker.sh" --config playwright.docs.config.ts "$@"
