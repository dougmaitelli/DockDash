---
title: Kubernetes integration
description: Connect DockDash to Kubernetes for discovery, metrics, logs, exec, and pod recreation.
---

DockDash integrates with Kubernetes to discover and operate regular pod containers. DockDash can run inside the cluster and use its service account, or run elsewhere with access through a mounted kubeconfig.

## Enable the integration

```properties
KUBERNETES_ENABLED=true
KUBERNETES_NAMESPACES=default,homelab
```

When DockDash runs outside the cluster, mount a kubeconfig and set:

```properties
KUBERNETES_KUBECONFIG=/config/kubeconfig
KUBERNETES_CONTEXTS=homelab
```

If `KUBERNETES_CONTEXTS` is omitted, DockDash uses the kubeconfig's current context.

## RBAC requirements

The DockDash service account can be limited to these capabilities:

| Resource              | Required verbs         | Used for                                          |
| --------------------- | ---------------------- | ------------------------------------------------- |
| `pods`                | `get`, `list`, `watch` | Discovery and status                              |
| `pods`                | `delete`               | Pod recreation                                    |
| `pods/log`            | `get`                  | Container logs                                    |
| `pods/exec`           | `create`               | Terminal sessions                                 |
| `pods.metrics.k8s.io` | `get`, `list`          | CPU and memory usage                              |
| `nodes`               | `get`                  | Memory denominator for containers without a limit |
| `nodes/proxy`         | `get`                  | Optional network and disk counters                |

[Download the example RBAC manifest](https://raw.githubusercontent.com/dougmaitelli/DockDash/master/docs/kubernetes-rbac.yaml).

Remove `delete` if pod recreation is disabled. Remove `pods/exec` access if terminal sessions are disabled.

## Supported operations

DockDash supports discovery, logs, exec, metrics, and pod recreation. Kubernetes start and stop operations are intentionally unsupported because those actions belong at the workload-controller level rather than the individual container level.

Init containers and DockDash-created terminal pods are excluded from normal discovery.

See the [configuration reference](../../configuration/#kubernetes) for every Kubernetes setting.

## Resource monitoring

CPU and memory usage require Metrics Server and access to `pods.metrics.k8s.io`.
CPU is expressed as a percentage of one core (two fully used cores are 200%).
Memory is relative to the container memory limit; without a limit, DockDash uses
node allocatable memory, falling back to node capacity. This fallback requires
`get` access to `nodes`. Requests and limits are not interchangeable: memory
requests are not used as a maximum. If neither denominator can be read, the
stats request fails rather than reporting a misleading 0%.

Network totals come from the kubelet `/stats/summary` endpoint. They are **pod-wide**,
shared by all containers in that pod, and labeled “Pod” in the resource monitor.
Disk read/write totals come from the kubelet `/metrics/cadvisor` endpoint and
are summed across devices for the selected container. These are cumulative byte
counters, not bytes per second; they can reset when the pod or container restarts.
Filesystem space used is not treated as disk I/O.

Both endpoints are accessed through the authenticated Kubernetes API server node
proxy. `get` on `nodes/proxy` is optional and grants broader kubelet access than
metrics alone; omit that rule if it is inappropriate for your service account.
Denied access, missing counters, or runtimes without cAdvisor disk counters show
“—” for those measurements while CPU and memory continue working. Node endpoint
responses are shared for five seconds to avoid scraping once per container.

References: [Kubernetes node metrics](https://kubernetes.io/docs/reference/instrumentation/node-metrics/)
and [cAdvisor counter definitions](https://github.com/google/cadvisor/blob/master/docs/storage/prometheus.md).
