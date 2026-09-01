---
title: Service discovery
description: Learn how DockDash finds Docker, Kubernetes, and network services.
---

DockDash builds a single service inventory from container runtimes, network scans, and services you add manually. Discovery finds candidates; you decide which services belong on the dashboard.

## Docker

DockDash connects to the local Docker socket by default. You can also configure multiple local or remote daemons with `DOCKER_HOSTS`, with optional friendly names such as `Home=tcp://192.168.1.100:2375`.

A scan reads running containers and their exposed ports. Each imported service keeps its Docker host, container name, image, tag, digest, networks, and port information so DockDash can monitor and operate the correct container later.

Docker services are matched by host and container name, which keeps containers with the same name on different Docker hosts distinct.

## Kubernetes

When Kubernetes support is enabled, DockDash scans the configured contexts and namespaces. Imported services retain their cluster, namespace, workload, pod, and container identity.

When DockDash runs inside a cluster, it can use its service account. Outside a cluster, it can use a kubeconfig file and selected contexts. See [Kubernetes integration](../kubernetes-integration/) for setup, permissions, and supported operations.

## Network scanning

Network discovery scans the configured CIDR ranges for reachable services that are not managed by Docker or Kubernetes. A quick scan checks common service ports; a deep scan searches a broader port range.

Network results are grouped by host and accumulate the ports found on that host. Review scan results before importing them, especially on large or shared networks.

## Manual services

You can add a service directly when automatic discovery is unnecessary or cannot reach it. A manual service needs a host and a check port; its protocol determines how DockDash performs health checks.

Discovery settings are documented in the [configuration reference](../../configuration/#discovery-and-monitoring).
