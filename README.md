# DockDash

A self-hosted dashboard for visualizing Docker containers and network services. DockDash discovers services automatically, tracks their health, monitors container image updates, and lets you map connections between them on an interactive canvas.

## Features

- **Docker discovery** — scans running containers and exposes their ports as services
- **Network scanning** — port-scans CIDR ranges to find services not managed by Docker
- **Health monitoring** — periodically checks every service and shows live status
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

## Development

Environment variables can be defined in a `.env` file at the project root. See [`.env.example`](.env.example) for available options.

```bash
yarn install
yarn dev        # starts both Vite (port 8081) and the Express server (port 3001)
yarn typecheck  # type-check client and server
yarn lint:fix   # auto-fix lint and formatting
```