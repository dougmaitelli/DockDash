# Browser integration and visual regression tests

These tests start the built React app and production Express server, use real
HTTP routes, validation, SQLite repositories, and SSE, and navigate with browser
controls. `server.ts` supplies deterministic external integrations and a fresh
in-memory database for each test. Its reset endpoint and overrides are only in
the test bundle, never the production build.

## Run and inspect failures

```sh
# Canonical Linux environment, also used by GitHub Actions
pnpm test:e2e:docker

# Run one test or project in the same environment
pnpm test:e2e:docker --project=desktop-dark --grep 'service details'

# Fast local debugging (requires Node 26 and installed Playwright Chromium)
pnpm exec playwright install chromium
pnpm test:e2e
pnpm test:e2e:ui

# Open the report from either runner
pnpm exec playwright show-report
```

The Docker command installs dependencies in a disposable container volume, so it
does not reuse or replace your host's `node_modules`. Tests use port 8099 and fail
if another server is already using it. The test server ignores `.env` and clears
application configuration inherited from the shell.

CI runs on every PR, including Dependabot PRs, and on pushes to master. The
`UI integration and screenshots` job uploads the HTML report, expected/actual/diff
images, traces, and failure videos as `ui-test-report`. Add this job to the
repository's required checks if merges must be blocked on visual regressions.

## Intentional UI changes

1. Run the tests and inspect the differences. Check behavior assertions as well
   as the screenshots.
2. Update only the affected baselines **inside the canonical container**:

   ```sh
   pnpm test:e2e:docker --update-snapshots --grep 'service details'
   ```

3. Review and commit the changed PNGs under `e2e/snapshots/` in the same PR as the
   UI code. Run `pnpm test:e2e:docker` again without the update flag.
4. Reviewers should inspect the baseline changes. Do not accept all differences
   merely to make CI green.

`pnpm test:e2e:update` is the direct Playwright update command; use it only when
already inside the canonical environment. Normal runs never create or update
baselines, and updating images never bypasses behavioral assertions.

Both Playwright dependencies must use the same exact version. Dependabot groups
them in one update, and the Docker runner derives the browser image version from
that pin. When upgrading, run the tests in the updated image and review any
rendering differences before updating affected baselines.

## Coverage and deterministic inputs

- Desktop dark/light: dashboard nodes and links; service table/search; drawer
  certificate, resource, changelog, file, log, and terminal views; Docker/Kubernetes discovery
  and importing; CIDR and add-service validation; settings/theme persistence;
  empty states; dashboard error/retry; login and authentication errors.
- Fixed server/browser dates, locale, timezone, IDs, metrics, and history. No
  real Docker daemon, Kubernetes cluster, registry, identity provider, network scan, or host file
  operations. CDN service icons use one local mock SVG.
- The default dataset mixes four Docker services with two Kubernetes services
  in the `homelab` context and `monitoring` namespace. Existing flows check both
  sources on the dashboard/table, Kubernetes controls and pod resource counters,
  both runtimes' detail tabs, and discovery/import persistence for each runtime.
- Browser exceptions and unexpected external browser requests fail the test.
- One worker prevents shared database races. Fresh browser contexts and database
  resets isolate tests. Tests wait for meaningful UI content and loaded images
  and fonts; there are no fixed sleep calls or whole-region screenshot masks.
- Chromium screenshots use zero differing pixels (with Playwright's default
  per-pixel color threshold). Screenshots complement assertions about navigation,
  form validation, persistence, and recovery; they do not guarantee untested
  states, browsers, accessibility, or real external integrations.

When adding a screen or interaction, add a focused test and baseline. Use roles
and accessible names where available. Keep special API failure mocks explicit
in the individual test; the default fixture should continue exercising real APIs.
