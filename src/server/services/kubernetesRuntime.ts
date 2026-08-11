import * as k8s from "@kubernetes/client-node";
import { createHash } from "crypto";
import fs from "fs";
import { Duplex, PassThrough } from "stream";
import { v4 as uuidv4 } from "uuid";

import {
  ContainerAction,
  type ContainerStats,
  Service,
  ServiceSource,
  ServiceStatus,
} from "@shared";
import type { FileContentResponse, FileEntry } from "@shared/responseSchemas.js";

import { serviceRepository } from "../db/serviceRepository.js";
import { config } from "../lib/config.js";
import { detectProtocolByPort } from "../lib/constants.js";
import type { ContainerRuntime, RuntimeTerminalSession } from "./containerRuntime/types.js";
import { terminalService } from "./terminalService.js";

type Client = { context: string; id: string; kc: k8s.KubeConfig; api: k8s.CoreV1Api };

export interface KubernetesHealth {
  context: string;
  connected: boolean;
  namespaces?: number;
  pods?: number;
  error?: string;
}

export class KubernetesRuntime implements ContainerRuntime {
  private readonly clients = new Map<string, Client>();

  constructor() {
    if (config.kubernetesEnabled !== "true") return;

    const base = new k8s.KubeConfig();

    if (config.kubernetesKubeconfig && fs.existsSync(config.kubernetesKubeconfig)) {
      base.loadFromFile(config.kubernetesKubeconfig);
    } else {
      try {
        base.loadFromCluster();
      } catch {
        base.loadFromDefault();
      }
    }

    const contexts = config.kubernetesContexts.length
      ? config.kubernetesContexts
      : [base.getCurrentContext()].filter(Boolean);

    for (const context of contexts) {
      const kc = new k8s.KubeConfig();

      kc.loadFromOptions({
        clusters: base.getClusters(),
        users: base.getUsers(),
        contexts: base.getContexts(),
        currentContext: context,
      });
      const id = createHash("sha256").update(context).digest("hex").slice(0, 16);

      this.clients.set(id, { context, id, kc, api: kc.makeApiClient(k8s.CoreV1Api) });
    }
  }

  configured(): boolean {
    return this.clients.size > 0;
  }

  async health(): Promise<KubernetesHealth[]> {
    return Promise.all(
      [...this.clients.values()].map(async (client) => {
        try {
          let pods = 0;

          for (const namespace of config.kubernetesNamespaces) {
            pods += (await client.api.listNamespacedPod({ namespace })).items.length;
          }

          return {
            context: client.context,
            connected: true,
            namespaces: config.kubernetesNamespaces.length,
            pods,
          };
        } catch (err) {
          return {
            context: client.context,
            connected: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }),
    );
  }

  async *scan(): AsyncGenerator<Service> {
    for (const client of this.clients.values()) {
      for (const namespace of config.kubernetesNamespaces) {
        const pods = (await client.api.listNamespacedPod({ namespace })).items;

        for (const pod of pods) {
          if (
            !pod.metadata?.name ||
            !pod.metadata.uid ||
            ["Succeeded", "Failed"].includes(pod.status?.phase ?? "")
          )
            continue;

          const owner =
            pod.metadata.ownerReferences?.find((item) => item.controller) ??
            pod.metadata.ownerReferences?.[0];
          const workloadKind = owner?.kind === "ReplicaSet" ? "Deployment" : (owner?.kind ?? "Pod");
          const workloadName =
            owner?.kind === "ReplicaSet"
              ? owner.name.replace(/-[a-f0-9]{8,10}$/, "")
              : (owner?.name ?? pod.metadata.name);

          for (const container of pod.spec?.containers ?? []) {
            const state = pod.status?.containerStatuses?.find(
              (item) => item.name === container.name,
            );
            const ports = (container.ports ?? [])
              .map((item) => item.containerPort)
              .filter((port): port is number => !!port);
            const image = container.image?.split("@")[0] ?? "";
            const last = image.split("/").at(-1) ?? "";
            const colon = last.lastIndexOf(":");
            const imageTag = colon >= 0 ? last.slice(colon + 1) : "latest";
            const imageName =
              colon >= 0
                ? image.slice(0, image.length - last.length) + last.slice(0, colon)
                : image;
            const now = new Date().toISOString();

            yield {
              id: `kubernetes-${uuidv4()}`,
              name: `${namespace}/${workloadName}:${container.name}`,
              host: pod.status?.podIP ?? `${pod.metadata.name}.${namespace}.pod`,
              protocol: detectProtocolByPort(ports[0] ?? 0),
              ports,
              checkPort: ports[0],
              source: ServiceSource.KUBERNETES,
              status: state?.ready
                ? ServiceStatus.UP
                : state?.state?.terminated
                  ? ServiceStatus.DOWN
                  : ServiceStatus.UNKNOWN,
              metadata: {
                clusterId: client.id,
                kubernetesContext: client.context,
                namespace,
                podUid: pod.metadata.uid,
                podName: pod.metadata.name,
                containerName: container.name,
                containerId: state?.containerID,
                workloadKind,
                workloadName,
                image: imageName,
                imageTag,
                imageDigest: state?.imageID?.split("@")[1],
              },
              createdAt: now,
              updatedAt: now,
            };
          }
        }
      }
    }
  }

  private resolve(service: Service): Client {
    const client = service.metadata?.clusterId
      ? this.clients.get(service.metadata.clusterId)
      : undefined;

    if (
      !client ||
      !service.metadata?.namespace ||
      !service.metadata.podName ||
      !service.metadata.containerName
    ) {
      throw new Error("Kubernetes container metadata is unavailable");
    }

    return client;
  }

  async status(service: Service): Promise<ServiceStatus> {
    const client = this.resolve(service);
    let pod: k8s.V1Pod;

    try {
      pod = await client.api.readNamespacedPod({
        name: service.metadata!.podName!,
        namespace: service.metadata!.namespace!,
      });
    } catch {
      const pods = (await client.api.listNamespacedPod({ namespace: service.metadata!.namespace! }))
        .items;

      const replacement = pods.find((candidate) => {
        const owner =
          candidate.metadata?.ownerReferences?.find((item) => item.controller) ??
          candidate.metadata?.ownerReferences?.[0];
        const workloadName =
          owner?.kind === "ReplicaSet"
            ? owner.name.replace(/-[a-f0-9]{8,10}$/, "")
            : (owner?.name ?? candidate.metadata?.name);

        return (
          workloadName === service.metadata?.workloadName &&
          candidate.spec?.containers.some(
            (container) => container.name === service.metadata?.containerName,
          )
        );
      });

      if (!replacement?.metadata?.name || !replacement.metadata.uid) return ServiceStatus.DOWN;

      pod = replacement;
      const state = replacement.status?.containerStatuses?.find(
        (item) => item.name === service.metadata?.containerName,
      );

      serviceRepository.updateServiceMetadata(service.id!, {
        podName: replacement.metadata.name,
        podUid: replacement.metadata.uid,
        containerId: state?.containerID,
        imageDigest: state?.imageID?.split("@")[1],
      });
    }

    const state = pod.status?.containerStatuses?.find(
      (item) => item.name === service.metadata!.containerName,
    );

    return state?.ready
      ? ServiceStatus.UP
      : state?.state?.terminated
        ? ServiceStatus.DOWN
        : ServiceStatus.UNKNOWN;
  }

  async restart(service: Service): Promise<void> {
    const client = this.resolve(service);

    if (!service.metadata?.workloadName || service.metadata.workloadKind === "Pod")
      throw new Error("Only controller-managed pods can be recreated");

    await client.api.deleteNamespacedPod({
      name: service.metadata!.podName!,
      namespace: service.metadata!.namespace!,
    });
  }

  async action(service: Service, action: ContainerAction): Promise<void> {
    if (action !== ContainerAction.RESTART)
      throw new Error("Kubernetes containers support recreate only");

    await this.restart(service);
  }

  async logs(service: Service): Promise<PassThrough> {
    const client = this.resolve(service);
    const output = new PassThrough();
    const abort = await new k8s.Log(client.kc).log(
      service.metadata!.namespace!,
      service.metadata!.podName!,
      service.metadata!.containerName!,
      output,
      { follow: true, tailLines: 100, timestamps: true },
    );

    output.once("close", () => abort.abort());

    return output;
  }

  async terminal(service: Service): Promise<NodeJS.ReadWriteStream> {
    const client = this.resolve(service);
    const stdin = new PassThrough();
    let socket: { close(): void } | undefined;
    const stream = new Duplex({
      read() {},
      write(chunk, _encoding, callback) {
        stdin.write(chunk, callback);
      },
      final(callback) {
        stdin.end();
        socket?.close();
        callback();
      },
    });
    const stdout = new PassThrough();
    const stderr = new PassThrough();

    stdout.on("data", (chunk) => stream.push(chunk));
    stderr.on("data", (chunk) => stream.push(chunk));
    socket = await new k8s.Exec(client.kc).exec(
      service.metadata!.namespace!,
      service.metadata!.podName!,
      service.metadata!.containerName!,
      [
        "/bin/sh",
        "-c",
        "TERM=xterm-256color; export TERM; [ -x /bin/bash ] && exec bash || exec sh",
      ],
      stdout,
      stderr,
      stdin,
      true,
      () => {
        stream.push(null);
      },
    );

    return stream;
  }

  async openTerminal(
    userSessionId: string,
    service: Service,
    _cols: number,
    _rows: number,
  ): Promise<RuntimeTerminalSession> {
    return terminalService.registerSession(userSessionId, await this.terminal(service));
  }

  private async execCapture(
    service: Service,
    command: string[],
    input?: string,
  ): Promise<{ stdout: string; stderr: string }> {
    const client = this.resolve(service);
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const stdin = new PassThrough();
    const out: Buffer[] = [];
    const errors: Buffer[] = [];

    stdout.on("data", (chunk: Buffer) => out.push(chunk));
    stderr.on("data", (chunk: Buffer) => errors.push(chunk));

    await new Promise<void>((resolve, reject) => {
      new k8s.Exec(client.kc)
        .exec(
          service.metadata!.namespace!,
          service.metadata!.podName!,
          service.metadata!.containerName!,
          command,
          stdout,
          stderr,
          stdin,
          false,
          (status) => {
            if (status.status === "Failure") reject(new Error(status.message ?? "Exec failed"));
            else resolve();
          },
        )
        .then(() => {
          stdin.end(input);
        })
        .catch(reject);
    });

    return {
      stdout: Buffer.concat(out).toString("utf8"),
      stderr: Buffer.concat(errors).toString("utf8"),
    };
  }

  async listFiles(service: Service, path: string): Promise<FileEntry[]> {
    const result = await this.execCapture(service, ["ls", "-la", "--", path]);

    if (!result.stdout.trim() && result.stderr.trim()) throw new Error(result.stderr.trim());

    return result.stdout.split("\n").flatMap((line): FileEntry[] => {
      const parts = line.trim().split(/\s+/);

      if (parts.length < 9 || line.trim().startsWith("total ")) return [];

      const permissions = parts[0];
      let name = parts.slice(8).join(" ");

      if (name === "." || name === "..") return [];

      const type: FileEntry["type"] =
        permissions[0] === "d"
          ? "directory"
          : permissions[0] === "l"
            ? "symlink"
            : permissions[0] === "-"
              ? "file"
              : "other";

      if (type === "symlink") name = name.split(" -> ")[0];

      return [
        {
          name,
          type,
          size: Number(parts[4]) || 0,
          permissions,
          modified: `${parts[5]} ${parts[6]} ${parts[7]}`,
        },
      ];
    });
  }

  async readFile(service: Service, path: string): Promise<FileContentResponse> {
    const result = await this.execCapture(service, ["cat", "--", path]);

    if (!result.stdout && result.stderr.trim()) throw new Error(result.stderr.trim());

    return { path, content: result.stdout };
  }

  async writeFile(service: Service, path: string, content: string): Promise<void> {
    await this.execCapture(
      service,
      ["sh", "-c", 'base64 -d > "$1"', "sh", path],
      Buffer.from(content, "utf8").toString("base64"),
    );
  }

  async stats(_service: Service): Promise<ContainerStats> {
    const service = _service;
    const client = this.resolve(service);
    const metrics = await new k8s.Metrics(client.kc).getPodMetrics(service.metadata!.namespace!);
    const usage = metrics.items
      .find((pod) => pod.metadata.name === service.metadata!.podName)
      ?.containers.find((container) => container.name === service.metadata!.containerName)?.usage;

    if (!usage) throw new Error("Container metrics are unavailable");

    const pod = await client.api.readNamespacedPod({
      name: service.metadata!.podName!,
      namespace: service.metadata!.namespace!,
    });
    const spec = pod.spec?.containers.find(
      (container) => container.name === service.metadata!.containerName,
    );
    const memoryUsed = this.bytes(usage.memory);
    const memoryLimit = this.bytes(String(spec?.resources?.limits?.memory ?? "0"));

    return {
      cpuPercent: Math.round(this.cores(usage.cpu) * 1000) / 10,
      memoryUsed,
      memoryLimit,
      memoryPercent: memoryLimit ? Math.round((memoryUsed / memoryLimit) * 1000) / 10 : 0,
      networkRx: 0,
      networkTx: 0,
      blockRead: 0,
      blockWrite: 0,
    };
  }

  private cores(value: string): number {
    if (value.endsWith("n")) return Number(value.slice(0, -1)) / 1e9;

    if (value.endsWith("u")) return Number(value.slice(0, -1)) / 1e6;

    if (value.endsWith("m")) return Number(value.slice(0, -1)) / 1e3;

    return Number(value);
  }

  private bytes(value: string): number {
    const units: Record<string, number> = {
      Ki: 1024,
      Mi: 1024 ** 2,
      Gi: 1024 ** 3,
      K: 1e3,
      M: 1e6,
      G: 1e9,
    };
    const match = value.match(/^([\d.]+)([A-Za-z]+)?$/);

    return match ? Number(match[1]) * (units[match[2] ?? ""] ?? 1) : 0;
  }
}

export const kubernetesRuntime = new KubernetesRuntime();
