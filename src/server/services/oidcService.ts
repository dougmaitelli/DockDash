import type { Client } from "openid-client";
import { generators, Issuer } from "openid-client";

import { config } from "../lib/config.js";

class OidcService {
  private client: Client | null = null;

  get isEnabled(): boolean {
    return config.oidcEnabled;
  }

  async getClient(): Promise<Client> {
    if (this.client) return this.client;

    if (!config.oidcEnabled) throw new Error("OIDC is not configured");

    const issuer = await Issuer.discover(config.oidcIssuer!);

    this.client = new issuer.Client({
      client_id: config.oidcClientId!,
      client_secret: config.oidcClientSecret!,
      response_types: ["code"],
    });

    return this.client;
  }
}

export const oidcService = new OidcService();
export { generators };
