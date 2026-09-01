---
title: Configuration reference
description: Complete DockDash environment-variable reference.
---

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

## Authentication

:::caution
See the [authentication guide](./authentication/) for the complete OIDC settings reference, setup instructions, and authenticated reverse-proxy guidance.
:::

## Discovery

| Variable                | Default                            | Description                                                   |
| ----------------------- | ---------------------------------- | ------------------------------------------------------------- |
| `DOCKER_HOSTS`          | Local Docker socket when available | Comma-separated Docker endpoints, optionally named            |
| `KUBERNETES_ENABLED`    | `false`                            | Enables Kubernetes discovery and container operations         |
| `KUBERNETES_KUBECONFIG` | In-cluster or default kubeconfig   | Optional path to a mounted kubeconfig                         |
| `KUBERNETES_CONTEXTS`   | Current context                    | Comma-separated kubeconfig contexts                           |
| `KUBERNETES_NAMESPACES` | `default`                          | Comma-separated namespaces scanned for regular pod containers |
| `NETWORK_CIDRS`         | `192.168.0.0/24`                   | Comma-separated CIDR ranges available to the network scanner  |

### Local Docker socket

For local Docker discovery, mount the host socket into the container:

```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock
```

The Docker socket grants privileged control over the host. If DockDash does not need container start, stop, terminal, or file operations, consider using a restricted Docker socket proxy as described in the [security guide](../security/).

### Remote Docker hosts

Set `DOCKER_HOSTS` to one or more comma-separated Docker daemon endpoints:

```properties
DOCKER_HOSTS=tcp://192.168.1.100:2375,tcp://192.168.1.101:2375
```

Prefix an endpoint with `name=` to show a friendly host name in DockDash:

```properties
DOCKER_HOSTS=Home=tcp://192.168.1.100:2375,NAS=tcp://192.168.1.101:2375
```

Named and unnamed entries can be mixed. Names are configuration-only and are resolved at runtime;
imported services continue to identify their Docker host by an endpoint-derived ID, so renaming a host
does not require re-importing services or migrating the database.

:::caution[Protect Docker daemon access]
Review the [Docker daemon access security guidance](../security/#docker-daemon-access) before configuring local or remote Docker hosts. It covers restricted socket proxies, least-privilege API access, and the risks of unprotected Docker TCP endpoints.
:::

### Kubernetes

Set `KUBERNETES_ENABLED=true`. When DockDash runs in a cluster it uses its service account;
otherwise mount a kubeconfig and set `KUBERNETES_KUBECONFIG`. Discovery scans every regular
container in `KUBERNETES_NAMESPACES`; init containers and terminal pods are excluded.

See [Kubernetes integration](../concepts/kubernetes-integration/) for credential selection, RBAC requirements, and supported operations.

### Network scanning

Set `NETWORK_CIDRS` to one or more comma-separated CIDR ranges. DockDash first discovers live hosts with an nmap ping sweep and then scans all TCP ports on each discovered host.

```properties
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

## Monitoring

| Variable                     | Default    | Description                                                                                |
| ---------------------------- | ---------- | ------------------------------------------------------------------------------------------ |
| `HEALTH_CHECK_INTERVAL`      | `30000`    | Health-check interval in milliseconds                                                      |
| `RESOURCE_MONITOR_INTERVAL`  | `5000`     | Docker resource-sampling interval in milliseconds                                          |
| `UPDATE_CHECK_INTERVAL`      | `3600000`  | Container image update-check interval in milliseconds                                      |
| `CERTIFICATE_CHECK_INTERVAL` | `21600000` | TLS certificate check interval in milliseconds                                             |
| `HEALTH_HISTORY_TTL_DAYS`    | `30`       | Health and resource history retention period in days                                       |
| `GITHUB_TOKEN`               | unset      | Token for private GHCR images, GitHub Packages lookups, changelogs, and higher rate limits |

## Notifications

See the [notifications guide](./notifications/) for the complete [Apprise](https://github.com/caronc/apprise-api) and resource-alert settings reference, setup examples, and delivery testing instructions.

## TLS certificates and [CertVault](https://github.com/dougmaitelli/CertVault) integration

DockDash probes HTTPS services directly on port 443 by default and shows the certificate actually
served by each hostname. This live certificate health is enabled without additional configuration.

The optional [CertVault](https://github.com/dougmaitelli/CertVault) integration adds its certificate inventory and renewal state. DockDash also
matches [CertVault](https://github.com/dougmaitelli/CertVault) domains and wildcard domains to services and warns when [CertVault's](https://github.com/dougmaitelli/CertVault) latest
certificate fingerprint differs from the certificate currently deployed on the service.

| Variable                 | Default | Description                                                                                   |
| ------------------------ | ------- | --------------------------------------------------------------------------------------------- |
| `CERTVAULT_URL`          | unset   | Public base URL of the [CertVault](https://github.com/dougmaitelli/CertVault) instance        |
| `CERTVAULT_API_KEY`      | unset   | [CertVault](https://github.com/dougmaitelli/CertVault) API key with `certificates:read` scope |
| `CERTVAULT_API_KEY_FILE` | unset   | File containing the [CertVault](https://github.com/dougmaitelli/CertVault) API key            |

Set either `CERTVAULT_API_KEY` or `CERTVAULT_API_KEY_FILE`. The file form is recommended for
container deployments. The API key is used only by the DockDash server and is never sent to the
browser.

## Precedence and parsing

- Values in the process environment are loaded by `dotenv`, so a local `.env` file is convenient for development.
- Comma-separated arrays are trimmed and empty values are ignored.
- Numeric values are integers in the units documented above.
- Disable flags are active only when their value is exactly `true`.

For security implications and hardened deployment examples, see the [security guide](../security/) and [Docker getting-started instructions](../getting-started/#docker).
