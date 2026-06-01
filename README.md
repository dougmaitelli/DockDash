# DockDash

A self-hosted dashboard for visualizing Docker containers and network services. DockDash discovers services automatically, tracks their health, monitors container image updates, and lets you map connections between them on an interactive canvas.

## Features

- **Docker discovery** — scans running containers and exposes their ports as services
- **Network scanning** — port-scans CIDR ranges to find services not managed by Docker
- **Health monitoring** — periodically checks every service and shows live status
- **Health history** — visualizes uptime over the last 1, 7, or 30 days as a color-coded timeline per service
- **Docker logs** — streams live container logs directly in the UI with timestamp parsing and ANSI stripping
- **Update monitoring** — checks Docker images against registries and flags outdated containers
- **Interactive canvas** — drag nodes, draw connections between services, zoom and pan

## Running with Docker Compose

```yaml
services:
  dockdash:
    image: dockdash
    container_name: dockdash
    restart: unless-stopped
    ports:
      - "3001:3001"
    environment:
      - NETWORK_CIDRS=192.168.0.1/24
      - SCAN_PORTS=80,443,3000,8080,8443
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - dockdash-data:/app/data

volumes:
  dockdash-data:
```

A ready-to-use `docker-compose.yml` is included in the repository. Build and start it with:

```bash
docker compose up -d --build
```

The UI is available at `http://localhost:3001`.

## Configuration

All configuration is done via environment variables. Changes require a container restart.

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | Port the server listens on |
| `DOCKER_HOST` | `unix:///var/run/docker.sock` | Docker daemon socket or TCP address |
| `NETWORK_CIDRS` | `192.168.0.1/24` | Comma-separated CIDR ranges to scan |
| `SCAN_PORTS` | *(see [default scan ports](#default-scan-ports))* | Ports checked during network scans |
| `DB_PATH` | `/app/data/dockdash.db` | Path to the SQLite database file |
| `REFRESH_INTERVAL` | `30000` | Discovery refresh interval in milliseconds |
| `HEALTH_CHECK_INTERVAL` | `30000` | How often the server re-checks service health (ms) |
| `UPDATE_CHECK_INTERVAL` | `3600000` | How often to check Docker images for updates (ms) |
| `HEALTH_HISTORY_TTL_DAYS` | `30` | How many days of health check history to retain |
| `APPRISE_URL` | — | Full notify endpoint of the [Apprise REST API](https://github.com/caronc/apprise-api) server (e.g. `http://apprise:8000/notify/myconfig`) |
| `APPRISE_TAGS` | — | Optional — comma-separated tags to filter which configured Apprise endpoints receive notifications (e.g. `admin`) |
| `APPRISE_URLS` | — | Optional — comma-separated Apprise notification URLs sent inline (e.g. `slack://token/channel`) |

### Docker socket

Mount the host socket into the container so DockDash can inspect running containers:

```
-v /var/run/docker.sock:/var/run/docker.sock
```

### Remote Docker host

To connect to a remote Docker daemon instead of the local socket, set `DOCKER_HOST`:

```
DOCKER_HOST=tcp://192.168.1.100:2375
```

TLS is supported via the standard `DOCKER_TLS_CERTDIR` variable.

### Network scanning

Set `NETWORK_CIDRS` to one or more comma-separated CIDR ranges. DockDash will probe every address in those ranges on the ports listed in `SCAN_PORTS`:

```
NETWORK_CIDRS=192.168.0.1/24,10.0.0.0/16
SCAN_PORTS=80,443,3000,8080,9090
```

#### Default scan ports

22, 80, 443, 3000, 3001, 3306, 5432, 6379, 8080, 8443, 9090, 27017

### Notifications (Apprise)

DockDash can send push notifications when services go down, recover, or have Docker image updates available. It integrates with the [Apprise REST API](https://github.com/caronc/apprise-api), a self-hosted sidecar that forwards notifications to 80+ services (Slack, Discord, Telegram, email, etc.).

Set `APPRISE_URL` to the full notify endpoint of your Apprise server. The path encodes the config key for stateful mode (`/notify/{key}`).

If you use tag-based routing on the Apprise side, set `APPRISE_TAGS` to match:

```
APPRISE_URL=http://192.168.7.5:8000/notify/apprise
APPRISE_TAGS=admin
```

`APPRISE_URLS` is optional — use it to add extra inline notification targets (Slack, Discord, etc.) without pre-configuring them on the Apprise server:

```
APPRISE_URL=http://apprise:8000/notify
APPRISE_URLS=slack://tokenA/tokenB/tokenC/#channel,discord://webhook_id/webhook_token
```

All three variables can be combined.

Once configured, the **Settings** page shows a "Send Test" button to verify delivery. Notifications are sent for:

- Service goes **down** (failure alert)
- Service **recovers** after being down (success alert)
- Docker image **update available** (warning alert)

## Development

Environment variables can be defined in a `.env` file at the project root. See [`.env.example`](.env.example) for available options.

```bash
yarn install
yarn dev        # starts both Vite (port 8081) and the Express server (port 3001)
yarn typecheck  # type-check client and server
yarn lint:fix   # auto-fix lint and formatting
```