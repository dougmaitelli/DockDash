import { describe, expect, it, vi } from "vitest";

import { Service, ServiceSource } from "@shared";

const dockerRuntime = vi.hoisted(() => ({ runtime: "docker", sourceName: vi.fn() }));
const kubernetesRuntime = vi.hoisted(() => ({ runtime: "kubernetes", sourceName: vi.fn() }));

vi.mock("@server/services/containerRuntime/dockerRuntime.js", () => ({ dockerRuntime }));
vi.mock("@server/services/containerRuntime/kubernetesRuntime.js", () => ({ kubernetesRuntime }));

const { containerRuntimeService } =
  await import("@server/services/containerRuntime/containerRuntimeService.js");

function service(source: ServiceSource): Service {
  return Object.assign(new Service(), { source });
}

describe("ContainerRuntimeService", () => {
  it("returns the registered runtime for Docker and Kubernetes services", () => {
    expect(containerRuntimeService.getRuntime(service(ServiceSource.DOCKER))).toBe(dockerRuntime);
    expect(containerRuntimeService.getRuntime(service(ServiceSource.KUBERNETES))).toBe(
      kubernetesRuntime,
    );
  });

  it("identifies container services and rejects unsupported sources", () => {
    expect(containerRuntimeService.isContainer(service(ServiceSource.DOCKER))).toBe(true);
    expect(containerRuntimeService.isContainer(service(ServiceSource.KUBERNETES))).toBe(true);
    expect(containerRuntimeService.isContainer(service(ServiceSource.NETWORK))).toBe(false);
    expect(() => containerRuntimeService.getRuntime(service(ServiceSource.NETWORK))).toThrow(
      "Not a container service",
    );
  });

  it("adds source names without mutating services", () => {
    const dockerService = service(ServiceSource.DOCKER);

    dockerRuntime.sourceName.mockReturnValue("Home");

    expect(containerRuntimeService.withSourceName(dockerService)).toMatchObject({
      sourceName: "Home",
    });
    expect(dockerService.sourceName).toBeUndefined();
    expect(containerRuntimeService.withSourceName(service(ServiceSource.NETWORK)).sourceName).toBe(
      undefined,
    );
  });
});
