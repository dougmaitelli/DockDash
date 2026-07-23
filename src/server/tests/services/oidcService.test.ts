import { beforeEach, describe, expect, it, vi } from "vitest";

const mockConfig = vi.hoisted(() => ({
  oidcEnabled: false,
  oidcIssuer: null as string | null,
  oidcClientId: null as string | null,
  oidcClientSecret: null as string | null,
}));
const mockDiscovery = vi.hoisted(() => vi.fn());

vi.mock("@server/lib/config.js", () => ({ config: mockConfig }));
vi.mock("openid-client", () => ({ discovery: mockDiscovery }));

describe("OidcService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockConfig.oidcEnabled = false;
    mockConfig.oidcIssuer = null;
    mockConfig.oidcClientId = null;
    mockConfig.oidcClientSecret = null;
  });

  it("reports whether OIDC is enabled", async () => {
    const { oidcService } = await import("@server/services/oidcService.js");

    expect(oidcService.isEnabled).toBe(false);
    mockConfig.oidcEnabled = true;
    expect(oidcService.isEnabled).toBe(true);
  });

  it("rejects discovery when OIDC is disabled", async () => {
    const { oidcService } = await import("@server/services/oidcService.js");

    await expect(oidcService.getConfig()).rejects.toThrow("OIDC is not configured");
    expect(mockDiscovery).not.toHaveBeenCalled();
  });

  it("discovers and caches the provider configuration", async () => {
    mockConfig.oidcEnabled = true;
    mockConfig.oidcIssuer = "https://idp.example";
    mockConfig.oidcClientId = "dockdash";
    mockConfig.oidcClientSecret = "secret";
    const discovered = { issuer: "https://idp.example" };

    mockDiscovery.mockResolvedValue(discovered);
    const { oidcService } = await import("@server/services/oidcService.js");

    await expect(oidcService.getConfig()).resolves.toBe(discovered);
    await expect(oidcService.getConfig()).resolves.toBe(discovered);
    expect(mockDiscovery).toHaveBeenCalledOnce();
    expect(mockDiscovery).toHaveBeenCalledWith(
      new URL("https://idp.example"),
      "dockdash",
      "secret",
    );
  });
});
