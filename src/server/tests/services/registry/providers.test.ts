import { describe, expect, it, vi } from "vitest";

vi.mock("@server/lib/logService.js", () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

const { getProvider, Registry } = await import("@server/services/registry/providers.js");
const { DockerHubProvider } = await import("@server/services/registry/dockerHubProvider.js");
const { GhcrProvider } = await import("@server/services/registry/ghcrProvider.js");
const { GenericRegistryProvider } = await import("@server/services/registry/genericProvider.js");

describe("getProvider", () => {
  it("returns DockerHubProvider for the Docker Hub registry URL", () => {
    expect(getProvider(Registry.DOCKER_HUB.url)).toBeInstanceOf(DockerHubProvider);
  });

  it("returns GhcrProvider for the GHCR registry URL", () => {
    expect(getProvider(Registry.GHCR.url)).toBeInstanceOf(GhcrProvider);
  });

  it("returns GenericRegistryProvider for an unrecognised registry", () => {
    expect(getProvider("registry.example.com")).toBeInstanceOf(GenericRegistryProvider);
    expect(getProvider("my-private-registry.internal:5000")).toBeInstanceOf(
      GenericRegistryProvider,
    );
  });
});
