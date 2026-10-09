---
title: Authentication
description: Protect DockDash with built-in OIDC or an authenticated reverse proxy.
---

:::caution
DockDash does not enforce authentication by default. Configure authentication before exposing it to an untrusted network.
:::

## Built-in OIDC

OIDC is enabled when all three required provider settings are present:

Startup fails if any OIDC setting is supplied without all three required provider settings containing non-blank values. The error names the missing settings without exposing their values. To disable built-in authentication for an authenticated reverse proxy, leave all OIDC environment variables unset; empty values also count as supplied settings.

| Variable             | Default                | Description                                                            |
| -------------------- | ---------------------- | ---------------------------------------------------------------------- |
| `OIDC_ISSUER`        | unset                  | Provider issuer or discovery URL                                       |
| `OIDC_CLIENT_ID`     | unset                  | Registered client ID                                                   |
| `OIDC_CLIENT_SECRET` | unset                  | Registered client secret                                               |
| `OIDC_REDIRECT_URI`  | auto-detected          | Explicit callback URL when proxy headers do not produce the public URL |
| `OIDC_SCOPES`        | `openid profile email` | Space-separated requested scopes                                       |
| `SESSION_SECRET`     | generated per process  | Cookie-signing secret; set a stable, random value in production        |
| `SESSION_MAX_AGE`    | `28800000`             | Session lifetime in milliseconds (eight hours)                         |

```properties
OIDC_ISSUER=https://auth.example.com/realms/homelab
OIDC_CLIENT_ID=dockdash
OIDC_CLIENT_SECRET=replace-with-provider-secret
SESSION_SECRET=replace-with-a-long-random-value
```

`OIDC_REDIRECT_URI` is normally inferred from the request. Set it explicitly when proxy headers do not describe the public URL correctly:

```properties
OIDC_REDIRECT_URI=https://dockdash.example.com/auth/callback
```

Register that exact callback URL with your identity provider.

:::tip
Set a stable `SESSION_SECRET` in production. If it is omitted, DockDash generates a new value at startup and existing sessions become invalid after every restart.
:::

## Authenticated reverse proxy

You can instead put DockDash behind Caddy, Traefik, nginx, oauth2-proxy, Authelia, Tailscale, or another authentication layer.

Prevent clients from bypassing the proxy by binding the published port to loopback:

```yaml
ports:
  - "127.0.0.1:3001:3001"
```

If the reverse proxy is on a separate Docker network, do not publish the DockDash port at all; connect the proxy directly to that network.

## Trusted proxy settings

DockDash defaults `TRUST_PROXY` to `loopback, uniquelocal`. Use `true` only when every upstream proxy is trusted. An overly broad setting can allow clients to spoof forwarded connection information.

Review [Security](../../security/) before enabling remote access.
