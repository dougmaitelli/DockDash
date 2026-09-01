import { beforeEach, describe, expect, it, vi } from "vitest";

import { ContainerAction, type Service, ServiceSource, ServiceStatus } from "@shared";

const api = vi.hoisted(() => ({
  listNamespacedPod: vi.fn(),
  readNamespacedPod: vi.fn(),
  deleteNamespacedPod: vi.fn(),
}));
const exec = vi.hoisted(() => vi.fn());
const log = vi.hoisted(() => vi.fn());
const getPodMetrics = vi.hoisted(() => vi.fn());
const updateServiceMetadata = vi.hoisted(() => vi.fn());
const registerSession = vi.hoisted(() => vi.fn());

vi.mock("@server/lib/config.js", () => ({
  config: {
    kubernetesEnabled: "true",
    kubernetesKubeconfig: null,
    kubernetesContexts: ["test-context"],
    kubernetesNamespaces: ["default"],
  },
}));
vi.mock("@server/db/serviceRepository.js", () => ({
  serviceRepository: { updateServiceMetadata },
}));
vi.mock("@server/services/terminalService.js", () => ({
  terminalService: { registerSession },
}));
vi.mock("@kubernetes/client-node", () => {
  class KubeConfig {
    loadFromCluster() {}
    loadFromDefault() {}
    loadFromFile() {}
    loadFromOptions() {}
    getCurrentContext() {
      return "test-context";
    }
    getClusters() {
      return [];
    }
    getUsers() {
      return [];
    }
    getContexts() {
      return [];
    }
    makeApiClient() {
      return api;
    }
  }

  return {
    KubeConfig,
    CoreV1Api: class {},
    Log: class {
      log = log;
    },
    Exec: class {
      exec = exec;
    },
    Metrics: class {
      getPodMetrics = getPodMetrics;
    },
  };
});

const { KubernetesRuntime } =
  await import("@server/services/containerRuntime/kubernetesRuntime.js");

const pod = {
  metadata: {
    name: "web-abc123",
    uid: "pod-uid",
    ownerReferences: [{ name: "web-abcdef1234", kind: "ReplicaSet", controller: true }],
  },
  spec: {
    containers: [
      {
        name: "web",
        image: "ghcr.io/acme/web:1.2.3",
        ports: [{ containerPort: 8080 }],
        resources: { limits: { memory: "256Mi" } },
      },
    ],
  },
  status: {
    phase: "Running",
    podIP: "10.0.0.2",
    containerStatuses: [
      { name: "web", ready: true, containerID: "containerd://abc", imageID: "image@sha256:digest" },
    ],
  },
};

function service(overrides: Partial<Service> = {}): Service {
  return {
    id: "svc-k8s",
    name: "web",
    host: "10.0.0.2",
    ports: [8080],
    source: ServiceSource.KUBERNETES,
    status: ServiceStatus.UP,
    metadata: {
      clusterId: "ea1b2003cc8155cb",
      namespace: "default",
      podName: "web-abc123",
      podUid: "pod-uid",
      containerName: "web",
      workloadKind: "Deployment",
      workloadName: "web",
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("KubernetesRuntime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listNamespacedPod.mockResolvedValue({ items: [pod] });
    api.readNamespacedPod.mockResolvedValue(pod);
    api.deleteNamespacedPod.mockResolvedValue({});
    log.mockResolvedValue({ abort: vi.fn() });
    registerSession.mockImplementation((_owner, stream) => ({ sessionId: "session", stream }));
  });

  it("reports configuration and cluster health, including failures", async () => {
    const runtime = new KubernetesRuntime();

    expect(runtime.configured()).toBe(true);
    await expect(runtime.health()).resolves.toEqual([
      { context: "test-context", connected: true, namespaces: 1, pods: 1 },
    ]);

    api.listNamespacedPod.mockRejectedValueOnce(new Error("forbidden"));
    await expect(runtime.health()).resolves.toEqual([
      { context: "test-context", connected: false, error: "forbidden" },
    ]);
  });

  it("discovers regular pod containers with stable workload metadata", async () => {
    const runtime = new KubernetesRuntime();
    const found: Service[] = [];

    for await (const item of runtime.scan()) found.push(item);

    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      name: "default/web:web",
      host: "10.0.0.2",
      ports: [8080],
      source: ServiceSource.KUBERNETES,
      status: ServiceStatus.UP,
      metadata: {
        workloadKind: "Deployment",
        workloadName: "web",
        image: "ghcr.io/acme/web",
        imageTag: "1.2.3",
        imageDigest: "sha256:digest",
      },
    });
  });

  it("reads status and finds replacement pods after a rollout", async () => {
    const runtime = new KubernetesRuntime();

    await expect(runtime.status(service())).resolves.toBe(ServiceStatus.UP);

    api.readNamespacedPod.mockRejectedValueOnce(new Error("not found"));
    const replacement = { ...pod, metadata: { ...pod.metadata, name: "web-new", uid: "new-uid" } };

    api.listNamespacedPod.mockResolvedValueOnce({ items: [replacement] });

    await expect(runtime.status(service())).resolves.toBe(ServiceStatus.UP);
    expect(updateServiceMetadata).toHaveBeenCalledWith(
      "svc-k8s",
      expect.objectContaining({ podName: "web-new", podUid: "new-uid" }),
    );
  });

  it("recreates controller pods and rejects unsupported actions", async () => {
    const runtime = new KubernetesRuntime();

    await runtime.action(service(), ContainerAction.RESTART);
    expect(api.deleteNamespacedPod).toHaveBeenCalledWith({
      name: "web-abc123",
      namespace: "default",
    });
    await expect(runtime.action(service(), ContainerAction.STOP)).rejects.toThrow("recreate only");
    await expect(
      runtime.restart(service({ metadata: { ...service().metadata, workloadKind: "Pod" } })),
    ).rejects.toThrow("controller-managed");
  });

  it("streams logs and aborts the Kubernetes request when closed", async () => {
    const abort = vi.fn();

    log.mockResolvedValueOnce({ abort });
    const output = await new KubernetesRuntime().logs(service());

    const closed = new Promise<void>((resolve) => output.once("close", resolve));

    output.destroy();
    await closed;
    expect(log).toHaveBeenCalledWith(
      "default",
      "web-abc123",
      "web",
      output,
      expect.objectContaining({ follow: true }),
    );
    expect(abort).toHaveBeenCalledOnce();
  });

  it("opens and registers an interactive terminal", async () => {
    exec.mockImplementationOnce(
      async (_ns, _pod, _container, _command, stdout, _stderr, _stdin, tty, done) => {
        expect(tty).toBe(true);
        stdout.write("hello");
        done({ status: "Success" });

        return { close: vi.fn() };
      },
    );
    const session = await new KubernetesRuntime().openTerminal("owner", service(), 80, 24);

    expect(session.sessionId).toBe("session");
    expect(registerSession).toHaveBeenCalledWith("owner", expect.anything());
  });

  it("lists, reads, and writes files through exec", async () => {
    exec.mockImplementation(
      async (_ns, _pod, _container, command, stdout, _stderr, stdin, _tty, done) => {
        if (command[0] === "ls") stdout.write("-rw-r--r-- 1 root root 4 Jan 1 00:00 file.txt\n");

        if (command[0] === "cat") stdout.write("text");

        stdin.resume();
        done({ status: "Success" });

        return {};
      },
    );
    const runtime = new KubernetesRuntime();

    await expect(runtime.listFiles(service(), "/tmp")).resolves.toEqual([
      expect.objectContaining({ name: "file.txt", type: "file", size: 4 }),
    ]);
    await expect(runtime.readFile(service(), "/tmp/file.txt")).resolves.toEqual({
      path: "/tmp/file.txt",
      content: "text",
    });
    await expect(runtime.writeFile(service(), "/tmp/file.txt", "updated")).resolves.toBeUndefined();
  });

  it("converts Kubernetes metrics into container stats", async () => {
    getPodMetrics.mockResolvedValueOnce({
      items: [
        {
          metadata: { name: "web-abc123" },
          containers: [{ name: "web", usage: { cpu: "250m", memory: "128Mi" } }],
        },
      ],
    });

    await expect(new KubernetesRuntime().stats(service())).resolves.toMatchObject({
      cpuPercent: 25,
      memoryUsed: 128 * 1024 * 1024,
      memoryLimit: 256 * 1024 * 1024,
      memoryPercent: 50,
    });
  });

  it("rejects incomplete metadata and unavailable metrics", async () => {
    const runtime = new KubernetesRuntime();

    await expect(runtime.logs(service({ metadata: {} }))).rejects.toThrow(
      "metadata is unavailable",
    );
    getPodMetrics.mockResolvedValueOnce({ items: [] });
    await expect(runtime.stats(service())).rejects.toThrow("metrics are unavailable");
  });
});
