# Configuration

DockDash is configured through environment variables. Values are read when the server starts, so restart the container or process after changing them.

For Docker Compose, copy `.env.example` to `.env` and keep the resulting file out of source control:

```bash
cp .env.example .env
docker compose up -d --build
```

The schema-driven settings in `src/shared/configSchema.ts` are the source of truth for runtime defaults and client-visible configuration. `.env.example` and this document must be updated when adding an environment variable.

## Core settings

| Variable      | Default                 | Description                                                                         |
| ------------- | ----------------------- | ----------------------------------------------------------------------------------- |
| `PORT`        | `3001`                  | HTTP port used by the server and published by Docker Compose                        |
| `LOG_LEVEL`   | `info`                  | `error`, `warn`, `info`, or `debug`                                                 |
| `DB_PATH`     | `/app/data/dockdash.db` | SQLite database path                                                                |
| `LOCALE`      | `en`                    | Locale for server-generated notification messages                                   |
| `TRUST_PROXY` | `loopback, uniquelocal` | Express trusted-proxy setting; use `true` only when every upstream proxy is trusted |

`APP_REPO` and `APP_VERSION` are image build metadata supplied by CI. Local builds normally use the development defaults.

## Discovery and monitoring

| Variable                    | Default                            | Description                                                                                |
| --------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------ |
| `DOCKER_HOSTS`              | Local Docker socket when available | Comma-separated Docker socket or TCP endpoints                                             |
| `NETWORK_CIDRS`             | `192.168.0.0/24`                   | Comma-separated CIDR ranges available to the network scanner                               |
| `HEALTH_CHECK_INTERVAL`     | `30000`                            | Health-check interval in milliseconds                                                      |
| `RESOURCE_MONITOR_INTERVAL` | `5000`                             | Docker resource-sampling interval in milliseconds                                          |
| `UPDATE_CHECK_INTERVAL`     | `3600000`                          | Container image update-check interval in milliseconds                                      |
| `HEALTH_HISTORY_TTL_DAYS`   | `30`                               | Health history retention period in days                                                    |
| `CPU_SPIKE_THRESHOLD`       | `90`                               | CPU percentage that triggers an alert; `0` disables it                                     |
| `MEMORY_SPIKE_THRESHOLD`    | `90`                               | Memory percentage that triggers an alert; `0` disables it                                  |
| `SPIKE_DURATION_THRESHOLD`  | `300`                              | Seconds a spike must persist before alerting; `0` alerts immediately                       |
| `GITHUB_TOKEN`              | unset                              | Token for private GHCR images, GitHub Packages lookups, changelogs, and higher rate limits |

### Local Docker socket

For local Docker discovery, mount the host socket into the container:

```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock
```

The Docker socket grants privileged control over the host. If DockDash does not need container start, stop, terminal, or file operations, consider using a restricted Docker socket proxy as described in the [security guide](../SECURITY.md).

### Remote Docker hosts

Set `DOCKER_HOSTS` to one or more comma-separated Docker daemon endpoints:

```env
DOCKER_HOSTS=tcp://192.168.1.100:2375,tcp://192.168.1.101:2375
```

Prefer TLS-protected Docker endpoints or a restricted Docker socket proxy. An unprotected Docker TCP endpoint provides privileged host access.

### Network scanning

Set `NETWORK_CIDRS` to one or more comma-separated CIDR ranges. DockDash first discovers live hosts with an nmap ping sweep and then scans all TCP ports on each discovered host.

```env
NETWORK_CIDRS=192.168.0.0/24,10.0.0.0/16
```

## Feature controls

The following variables disable privileged or storage-intensive features when set to `true`:

| Variable                     | Effect                                                    |
| ---------------------------- | --------------------------------------------------------- |
| `DISABLE_CONTAINER_CONTROLS` | Disables start, stop, and restart operations              |
| `DISABLE_HEALTH_HISTORY`     | Stops recording and displaying health history             |
| `DISABLE_RESOURCE_MONITOR`   | Stops recording and displaying container resource metrics |
| `DISABLE_FILE_EXPLORER`      | Disables container filesystem browsing and editing        |
| `DISABLE_TERMINAL`           | Disables interactive container terminals                  |

These restrictions are enforced on the server as well as represented in the UI.

## OIDC authentication

OIDC is enabled when `OIDC_ISSUER`, `OIDC_CLIENT_ID`, and `OIDC_CLIENT_SECRET` are all configured.

| Variable             | Default                | Description                                                            |
| -------------------- | ---------------------- | ---------------------------------------------------------------------- |
| `OIDC_ISSUER`        | unset                  | Provider discovery URL                                                 |
| `OIDC_CLIENT_ID`     | unset                  | Registered client ID                                                   |
| `OIDC_CLIENT_SECRET` | unset                  | Registered client secret                                               |
| `OIDC_REDIRECT_URI`  | auto-detected          | Explicit callback URL when proxy headers do not produce the public URL |
| `OIDC_SCOPES`        | `openid profile email` | Space-separated requested scopes                                       |
| `SESSION_SECRET`     | generated per process  | Cookie-signing secret; set a stable, random value in production        |
| `SESSION_MAX_AGE`    | `28800000`             | Session lifetime in milliseconds (eight hours)                         |

Example:

```env
OIDC_ISSUER=https://auth.example.com/realms/homelab
OIDC_CLIENT_ID=dockdash
OIDC_CLIENT_SECRET=replace-with-provider-secret
OIDC_REDIRECT_URI=https://dockdash.example.com/auth/callback
SESSION_SECRET=replace-with-a-long-random-value
```

Without OIDC, protect DockDash with an authenticated reverse proxy and do not make the application directly reachable from an untrusted network.

## Notifications

DockDash integrates with the [Apprise REST API](https://github.com/caronc/apprise-api), a self-hosted sidecar that forwards notifications to services such as Slack, Discord, Telegram, and email.

Notifications are emitted when a service goes down or recovers, when an image update is available, and when configured resource thresholds are crossed or cleared.

| Variable       | Default | Description                                      |
| -------------- | ------- | ------------------------------------------------ |
| `APPRISE_URL`  | unset   | Apprise REST notification endpoint               |
| `APPRISE_TAGS` | unset   | Comma-separated Apprise routing tags             |
| `APPRISE_URLS` | unset   | Comma-separated inline Apprise notification URLs |

Set `APPRISE_URL` to the full notify endpoint. In Apprise's stateful mode, the path contains the configuration key:

```env
APPRISE_URL=http://192.168.7.5:8000/notify/apprise
```

Use `APPRISE_TAGS` to restrict delivery to matching endpoints in the Apprise configuration:

```env
APPRISE_TAGS=admin
```

Use `APPRISE_URLS` for additional inline targets that are not preconfigured in Apprise:

```env
APPRISE_URL=http://apprise:8000/notify
APPRISE_URLS=slack://tokenA/tokenB/tokenC/#channel,discord://webhook_id/webhook_token
```

All three variables can be combined. Once notifications are configured, use **Send Test** on the Settings page to verify delivery.

Notification URLs frequently contain credentials. Store them in deployment secrets and never include them in issues, logs, or commits.

## Precedence and parsing

- Values in the process environment are loaded by `dotenv`, so a local `.env` file is convenient for development.
- Comma-separated arrays are trimmed and empty values are ignored.
- Numeric values are integers in the units documented above.
- Disable flags are active only when their value is exactly `true`.
- If `SESSION_SECRET` is absent, a random value is generated and sessions are invalidated on restart.

For security implications and hardened deployment examples, see [SECURITY.md](../SECURITY.md) and the [README](../README.md#security).
