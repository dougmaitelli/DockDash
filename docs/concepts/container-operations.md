---
title: Container operations
description: Learn how DockDash handles controls, logs, files, terminals, and runtime differences.
---

Container services expose operational tools in the service drawer. DockDash sends each request back to the Docker daemon or Kubernetes cluster from which the service was discovered.

:::danger[Privileged access]
Container controls, terminals, and file editing can provide host- or cluster-level access. Protect DockDash with authentication, grant only the runtime permissions you need, and disable unused capabilities.

See [Security](../../security/) for deployment boundaries and [feature controls](../../configuration/#feature-controls) for the disable switches.
:::

## Runtime controls

Docker containers can be started, stopped, and restarted. Kubernetes works at the workload-controller level: DockDash can recreate a pod managed by a controller, but it does not start or stop individual Kubernetes containers.

## Logs

DockDash streams recent and live container output in the browser. It normalizes timestamps and terminal color sequences so Docker and Kubernetes logs remain readable in the same interface.

Log and terminal streams pause output while the browser catches up. Connections close if output remains blocked for 30 seconds or a stream's buffered output exceeds 1 MiB; reconnect to resume viewing output.

## Terminal access

The terminal opens an interactive shell inside the selected container. DockDash tries Bash when it is installed and falls back to `sh`.

Terminal sessions are tied to the signed-in browser session and are closed when the connection ends. They still carry the permissions of the process inside the container.

## File access

The file explorer lists directories and reads or writes text files inside Docker and Kubernetes containers. Whether an operation succeeds depends on the tools, filesystem, and permissions available inside that container.

File reads accept regular files up to 8 MiB and have a 15-second deadline. Closing the connection cancels the read. Symbolic links, directories, devices, and named pipes cannot be opened in the editor. Kubernetes reads require `sh`, `head`, and `timeout` inside the container; `timeout` also bounds the remote process lifetime if the connection closes.
