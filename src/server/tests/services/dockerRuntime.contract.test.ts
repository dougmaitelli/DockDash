import { PassThrough } from "stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ContainerAction, type Service, ServiceSource, ServiceStatus } from "@shared";

const fileService = vi.hoisted(() => ({
  listFiles: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));
const terminalService = vi.hoisted(() => ({ openSession: vi.fn() }));

vi.mock("@server/lib/config.js", () => ({ config: { dockerHostConfigs: [] } }));
vi.mock("@server/services/fileService.js", () => ({ fileService }));
vi.mock("@server/services/terminalService.js", () => ({ terminalService }));

const { DockerRuntime, overrideDockerRuntime } =
  await import("@server/services/containerRuntime/dockerRuntime.js");

const service: Service = {
  id: "docker-service",
  name: "docker",
  host: "localhost",
  ports: [],
  source: ServiceSource.DOCKER,
  status: ServiceStatus.UP,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("DockerRuntime ContainerRuntime contract", () => {
  const container = { stop: vi.fn(), start: vi.fn(), restart: vi.fn() };
  let runtime: InstanceType<typeof DockerRuntime>;

  beforeEach(() => {
    vi.clearAllMocks();
    runtime = new DockerRuntime();
    vi.spyOn(runtime, "getContainer").mockReturnValue(container as never);
  });

  it.each([
    [ContainerAction.STOP, "stop"],
    [ContainerAction.START, "start"],
    [ContainerAction.RESTART, "restart"],
  ] as const)("delegates %s actions", async (action, method) => {
    await runtime.action(service, action);
    expect(container[method]).toHaveBeenCalledOnce();
  });

  it("delegates stats and logs using the resolved container", async () => {
    const stats = { cpuPercent: 1 };
    const stream = new PassThrough();

    vi.spyOn(runtime, "getContainerStats").mockResolvedValue(stats as never);
    vi.spyOn(runtime, "openLogStream").mockResolvedValue(stream);

    await expect(runtime.stats(service)).resolves.toBe(stats);
    await expect(runtime.logs(service)).resolves.toBe(stream);
  });

  it("delegates terminal and file operations", async () => {
    const session = { sessionId: "session", stream: new PassThrough() };

    terminalService.openSession.mockResolvedValue(session);
    fileService.listFiles.mockResolvedValue([]);
    fileService.readFile.mockResolvedValue({ path: "/a", content: "a" });
    fileService.writeFile.mockResolvedValue(undefined);

    await expect(runtime.openTerminal("owner", service, 80, 24)).resolves.toBe(session);
    await expect(runtime.listFiles(service, "/")).resolves.toEqual([]);
    await expect(runtime.readFile(service, "/a")).resolves.toEqual({ path: "/a", content: "a" });
    await expect(runtime.writeFile(service, "/a", "b")).resolves.toBeUndefined();
    expect(terminalService.openSession).toHaveBeenCalledWith("owner", container, 80, 24);
  });

  it("allows replacing the exported runtime for mock mode", () => {
    expect(() => overrideDockerRuntime(runtime)).not.toThrow();
  });
});
