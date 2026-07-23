import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CONFIG_SCHEMA } from "@shared/configSchema.js";

const mockFs = vi.hoisted(() => ({ existsSync: vi.fn() }));
const mockRandomBytes = vi.hoisted(() => vi.fn());
const mockLogger = vi.hoisted(() => ({ warn: vi.fn() }));

vi.mock("fs", () => ({ default: mockFs }));
vi.mock("crypto", () => ({ default: { randomBytes: mockRandomBytes } }));
vi.mock("@server/lib/logService.js", () => ({ logger: mockLogger }));
vi.mock("dotenv/config", () => ({}));

const configEnvironmentKeys = Object.values(CONFIG_SCHEMA).map((entry) => entry.env);
const originalEnvironment = Object.fromEntries(
  [...configEnvironmentKeys, "NODE_ENV"].map((key) => [key, process.env[key]]),
);

async function freshConfig() {
  vi.resetModules();

  return (await import("@server/lib/config.js")).config;
}

describe("config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    configEnvironmentKeys.forEach((key) => delete process.env[key]);
    delete process.env.NODE_ENV;
    mockFs.existsSync.mockReturnValue(false);
    mockRandomBytes.mockReturnValue(Buffer.alloc(32, 0xab));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    Object.entries(originalEnvironment).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  });

  it("uses schema defaults for every configuration type", async () => {
    const config = await freshConfig();

    expect(config.port).toBe(3001);
    expect(config.appVersion).toBe("dev");
    expect(config.networkCidrs).toEqual(["192.168.0.0/24"]);
    expect(config.dockerHosts).toEqual([]);
    expect(config.containerControlsEnabled).toBe(true);
  });

  it("parses numbers, strings, and trimmed comma-separated arrays", async () => {
    vi.stubEnv("PORT", "4321");
    vi.stubEnv("APP_VERSION", "2.0.0");
    vi.stubEnv("DOCKER_HOSTS", " tcp://one:2375, ,tcp://two:2375 ");
    vi.stubEnv("NETWORK_CIDRS", "10.0.0.0/8, 192.168.1.0/24");
    const config = await freshConfig();

    expect(config.port).toBe(4321);
    expect(config.appVersion).toBe("2.0.0");
    expect(config.dockerHosts).toEqual(["tcp://one:2375", "tcp://two:2375"]);
    expect(config.networkCidrs).toEqual(["10.0.0.0/8", "192.168.1.0/24"]);
  });

  it("only disables features for the exact value true", async () => {
    vi.stubEnv("DISABLE_FILE_EXPLORER", "true");
    vi.stubEnv("DISABLE_TERMINAL", "TRUE");
    vi.stubEnv("DISABLE_CONTAINER_CONTROLS", "1");
    const config = await freshConfig();

    expect(config.fileExplorerEnabled).toBe(false);
    expect(config.terminalEnabled).toBe(true);
    expect(config.containerControlsEnabled).toBe(true);
  });

  it("prepends an available local Docker socket without duplicating it", async () => {
    mockFs.existsSync.mockReturnValue(true);
    vi.stubEnv("DOCKER_HOSTS", "tcp://remote:2375");
    let config = await freshConfig();

    expect(config.dockerHosts).toEqual(["unix:///var/run/docker.sock", "tcp://remote:2375"]);

    vi.stubEnv("DOCKER_HOSTS", "unix:///var/run/docker.sock,tcp://remote:2375");
    config = await freshConfig();
    expect(config.dockerHosts).toEqual(["unix:///var/run/docker.sock", "tcp://remote:2375"]);
  });

  it("enables OIDC only when issuer, client ID, and client secret are present", async () => {
    vi.stubEnv("OIDC_ISSUER", "https://idp.example");
    vi.stubEnv("OIDC_CLIENT_ID", "dockdash");
    let config = await freshConfig();

    expect(config.oidcEnabled).toBe(false);

    vi.stubEnv("OIDC_CLIENT_SECRET", "secret");
    config = await freshConfig();
    expect(config.oidcEnabled).toBe(true);
  });

  it("uses an explicit session secret without generating a replacement", async () => {
    vi.stubEnv("SESSION_SECRET", "configured-secret");
    const config = await freshConfig();

    expect(config.sessionSecret).toBe("configured-secret");
    expect(mockRandomBytes).not.toHaveBeenCalled();
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it("generates and caches one process-local session secret", async () => {
    const config = await freshConfig();
    const first = config.sessionSecret;
    const second = config.sessionSecret;

    expect(first).toBe("ab".repeat(32));
    expect(second).toBe(first);
    expect(mockRandomBytes).toHaveBeenCalledOnce();
    expect(mockLogger.warn).toHaveBeenCalledOnce();
  });

  it("enables secure cookies only in production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    let config = await freshConfig();

    expect(config.secureCookies).toBe(false);

    vi.stubEnv("NODE_ENV", "production");
    config = await freshConfig();
    expect(config.secureCookies).toBe(true);
  });

  it("reports Apprise configured only when its primary URL is set", async () => {
    vi.stubEnv("APPRISE_URLS", "discord://one,discord://two");
    let config = await freshConfig();

    expect(config.appriseConfigured).toBe(false);

    vi.stubEnv("APPRISE_URL", "http://apprise:8000");
    config = await freshConfig();
    expect(config.appriseConfigured).toBe(true);
  });

  it("exposes NaN for invalid numeric input instead of silently using a default", async () => {
    vi.stubEnv("PORT", "not-a-number");
    const config = await freshConfig();

    expect(config.port).toBeNaN();
  });
});
