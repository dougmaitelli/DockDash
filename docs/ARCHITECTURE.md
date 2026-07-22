# DockDash architecture

DockDash is a TypeScript application with a React client, an Express API, background monitoring jobs, and a SQLite database. The production Docker image serves both the compiled client and server from one process boundary.

## System overview

```text
Browser
  │
  ├── React UI (Vite build)
  │     ├── dashboard and service management
  │     ├── health/resource history
  │     └── logs, files, and terminal clients
  │
  └── Express API
        ├── routes and request validation
        ├── application services
        ├── background jobs
        ├── Drizzle repositories ── SQLite
        ├── Dockerode ───────────── Docker daemons
        ├── registry providers ──── Docker Hub / GHCR / OCI registries
        ├── network scanner ─────── LAN services
        ├── OIDC client ─────────── identity provider
        └── Apprise client ──────── notification service
```

## Repository layout

| Path                   | Responsibility                                                                   |
| ---------------------- | -------------------------------------------------------------------------------- |
| `src/client/`          | React application, pages, UI components, contexts, and API clients               |
| `src/server/routes/`   | HTTP route definitions and transport-level responses                             |
| `src/server/services/` | Docker, health, registry, notification, terminal, file, and application logic    |
| `src/server/jobs/`     | Periodic health, history, resource, and update work                              |
| `src/server/db/`       | SQLite connection, Drizzle schema, and repositories                              |
| `src/shared/`          | Types, schemas, validation contracts, and API shapes shared by client and server |
| `drizzle/`             | Generated, ordered database migrations and Drizzle metadata                      |
| `scripts/`             | Screenshot and project-maintenance utilities                                     |
| `.github/workflows/`   | CI, release, and image-publishing automation                                     |

## Client

`src/client/src/main.tsx` initializes the React application. `App.tsx` defines the main routes, while context providers hold authentication, configuration, and theme state.

Pages use hooks in `hooks/useData.ts` and the HTTP clients in `services/api.ts` rather than calling server endpoints directly. Reusable dialogs and drawers live under `components/modals/`; primitive UI controls live under `components/ui/`.

The dashboard canvas reads services, saved positions, and links from `/api/dashboard`. Position and link edits are persisted through the API rather than being browser-only state.

## Server

`src/server/index.ts` is the production entry point. It loads configuration, initializes persistence and integrations, registers middleware and routes, starts background jobs, and coordinates graceful shutdown.

Routes should remain thin: validate input, call a service or repository, and translate the result into an HTTP response. Reusable domain and integration behavior belongs under `services/`.

The mock entry point, `src/server/mockEntry.ts`, provides seeded in-memory behavior for UI development without access to Docker.

## Persistence

DockDash stores service inventory, dashboard positions and links, health history, and resource history in SQLite. Drizzle schema definitions live in `src/server/db/schema/`; migrations live under `drizzle/`.

Repository modules isolate database access from routes and integrations. Schema changes must include a generated migration and tests. Released migrations are append-only.

## Background processing

`BackgroundJob` provides the common lifecycle for periodic work. Concrete jobs perform:

- Service health checks
- Container resource sampling
- Image update checks
- History aggregation and retention cleanup

Jobs share service instances with request handlers so cached status and resource information can be returned without starting duplicate polling loops.

## Integrations

- Docker access uses Dockerode and supports local or remote daemons through `DOCKER_HOSTS`.
- Registry checks select a provider for Docker Hub, GHCR, or a generic OCI registry.
- Network discovery invokes the scanner for configured CIDR ranges.
- Authentication is enabled only when the required OIDC settings are present.
- Notifications are sent through an Apprise REST API endpoint when configured.

Integration code should handle timeouts, unavailable dependencies, and partial failures without terminating the main server.

## Security boundaries

The Docker socket, terminal, file explorer, and container controls are privileged interfaces. Authentication and feature-disable settings must be enforced by the server; hiding controls in the client is not a security boundary.

See [SECURITY.md](../SECURITY.md) and the README deployment guidance before exposing DockDash outside a trusted network.

## Testing

Vitest covers routes, services, jobs, repositories, middleware, and shared validation. Supertest route tests create local HTTP listeners. The required checks are documented in [CONTRIBUTING.md](../CONTRIBUTING.md) and run in GitHub Actions for pull requests.
