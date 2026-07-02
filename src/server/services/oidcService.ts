import { type Configuration, discovery } from "openid-client";

import { config } from "../lib/config.js";

class OidcService {
  private oidcConfig: Configuration | null = null;

  get isEnabled(): boolean {
    return config.oidcEnabled;
  }

  async getConfig(): Promise<Configuration> {
    if (this.oidcConfig) return this.oidcConfig;

    if (!config.oidcEnabled) throw new Error("OIDC is not configured");

    this.oidcConfig = await discovery(
      new URL(config.oidcIssuer!),
      config.oidcClientId!,
      config.oidcClientSecret ?? undefined,
    );

    return this.oidcConfig;
  }
}

export const oidcService = new OidcService();
