import { beforeEach, describe, expect, it, vi } from "vitest";

import { ServiceSource, ServiceStatus } from "@shared";

const mockConfig = vi.hoisted(() => ({
  certVaultConfigured: true,
  certVaultUrl: "https://certvault.example.com/",
  certVaultResolvedApiKey: "test-key",
}));
const mockAxiosGet = vi.hoisted(() => vi.fn());
const mockServiceRepository = vi.hoisted(() => ({
  getServices: vi.fn(),
  getService: vi.fn(),
}));

vi.mock("axios", () => ({ default: { get: mockAxiosGet } }));
vi.mock("@server/lib/config.js", () => ({ config: mockConfig }));
vi.mock("@server/db/serviceRepository.js", () => ({
  serviceRepository: mockServiceRepository,
}));

const rawCertificate = {
  name: "homelab",
  domains: ["example.com", "*.example.com"],
  key_type: "ec256",
  status: "ready",
  renew_before_seconds: 2_592_000,
  current_version: {
    serial: "123",
    issuer: "Let's Encrypt",
    fingerprint_sha256: "abc",
    not_before: "2026-07-01T00:00:00Z",
    not_after: "2026-10-01T00:00:00Z",
  },
};

function service(id: string, host: string) {
  return {
    id,
    name: id,
    host,
    ports: [443],
    source: ServiceSource.NETWORK,
    status: ServiceStatus.UP,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

describe("CertVaultService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockConfig.certVaultConfigured = true;
    mockServiceRepository.getServices.mockReturnValue([
      service("exact", "https://example.com:443/path"),
      service("wildcard", "app.example.com"),
      service("too-deep", "nested.app.example.com"),
      service("ip", "192.168.1.5"),
    ]);
    mockAxiosGet.mockResolvedValue({ data: [rawCertificate] });
  });

  it("fetches certificates with a server-side API key and matches service hostnames", async () => {
    const { certVaultService } = await import("@server/services/certVaultService.js");
    const result = await certVaultService.getCertificates();

    expect(mockAxiosGet).toHaveBeenCalledWith(
      "https://certvault.example.com/api/v1/certificates",
      expect.objectContaining({ headers: { Authorization: "Bearer test-key" } }),
    );
    expect(result.certificates[0].matchedServices.map(({ id }) => id)).toEqual([
      "exact",
      "wildcard",
    ]);
    expect(result.certificates[0]).toMatchObject({
      name: "homelab",
      health: "healthy",
      currentVersion: { fingerprintSha256: "abc" },
    });
  });

  it("returns an empty disabled response without contacting CertVault", async () => {
    mockConfig.certVaultConfigured = false;
    const { certVaultService } = await import("@server/services/certVaultService.js");

    await expect(certVaultService.getCertificates()).resolves.toEqual({
      configured: false,
      consoleUrl: "https://certvault.example.com",
      certificates: [],
    });
    expect(mockAxiosGet).not.toHaveBeenCalled();
  });

  it("uses one-label wildcard matching", async () => {
    const { domainMatchesHostname } = await import("@server/services/certVaultService.js");

    expect(domainMatchesHostname("*.example.com", "app.example.com")).toBe(true);
    expect(domainMatchesHostname("*.example.com", "nested.app.example.com")).toBe(false);
    expect(domainMatchesHostname("example.com", "example.com")).toBe(true);
  });
});
