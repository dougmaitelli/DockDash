# Contributing to DockDash

Thank you for helping improve DockDash. Contributions of all sizes are welcome, including bug reports, documentation, tests, and code changes.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Before you start

- Search existing issues and pull requests before opening a duplicate.
- Use a bug report for reproducible defects and a feature request for proposed behavior.
- For large changes, open an issue first so the design and scope can be discussed before implementation.
- Never include credentials, tokens, private hostnames, database files, or other sensitive homelab information in an issue or commit.
- Report security vulnerabilities privately according to [SECURITY.md](SECURITY.md).

## Development setup

Requirements:

- Node.js 26
- pnpm 11.x
- Docker for the canonical screenshot test environment or real container discovery and controls

Install dependencies and start the mock development environment:

```bash
pnpm install --frozen-lockfile
pnpm dev:mock
```

`dev:mock` starts the client and a mock server with seeded services, so most UI development does not require Docker. Use `pnpm dev` when testing against a real Docker daemon.

Environment variables may be placed in a local `.env` file. Start from `.env.example` and see [Configuration](docs/CONFIGURATION.md). Never commit `.env`.

## Database changes

DockDash uses Drizzle ORM and SQLite. When changing the schema:

1. Update the schema definitions in `src/server/db/schema/`.
2. Generate a migration with `pnpm db:generate`.
3. Review the generated SQL and metadata under `drizzle/`.
4. Add or update repository tests that exercise the migration or affected queries.

Do not edit an already-released migration to change deployed behavior; add a new migration instead.

## Required checks

Run these commands before opening a pull request:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm typecheck:e2e
pnpm test:e2e:docker
```

Use `pnpm lint:fix` to apply supported ESLint and Prettier fixes. New behavior should include tests at the closest applicable layer.

For expected UI changes, review the visual differences and commit updated screenshot
baselines in the same PR. Generate them with `pnpm test:e2e:docker --update-snapshots`
and rerun without the update flag. See [Browser tests](e2e/README.md) for filtering
tests, debugging failures, and reviewing reports.

## Pull requests

- Keep changes focused and avoid unrelated formatting or refactors.
- Describe the problem, the chosen solution, and any tradeoffs.
- Include screenshots or a short recording for visible UI changes.
- Call out configuration, database, security, and backward-compatibility effects.
- Update documentation and `.env.example` when configuration changes.
- Keep the branch current with `master` and ensure CI passes.

Maintainers may ask for changes or close proposals that do not fit the project direction. Reviews should remain technical, specific, and respectful.

## Commit and release notes

Use a concise imperative summary, such as `Fix stale health status after refresh`. Release notes are generated from commit messages when a `v*` tag is published, so user-facing commits should explain the observable change clearly.

See [Release process](docs/RELEASING.md) for versioning and publishing details.
