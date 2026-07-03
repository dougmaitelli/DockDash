import { logger } from "../../lib/logService.js";
import { DockerHubProvider } from "./dockerHubProvider.js";
import { GenericRegistryProvider } from "./genericProvider.js";
import { GhcrProvider } from "./ghcrProvider.js";
import type { RegistryProvider } from "./types.js";

type RegistryEntry = { url: string; Provider: new () => RegistryProvider };

// Add an entry here to support a new registry — the router picks it up automatically.
export const Registry: Record<string, RegistryEntry> = {
  DOCKER_HUB: { url: "registry-1.docker.io", Provider: DockerHubProvider },
  GHCR: { url: "ghcr.io", Provider: GhcrProvider },
};

export function getProvider(registry: string): RegistryProvider {
  const entry = Object.values(Registry).find((r) => r.url === registry);
  const ProviderClass = entry?.Provider ?? GenericRegistryProvider;

  logger.debug(`Registry: using ${ProviderClass.name} for ${registry}`);

  return new ProviderClass();
}
