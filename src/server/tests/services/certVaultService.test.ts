import { beforeEach, describe, expect, it, vi } from "vitest";

import { ServiceProtocol, ServiceSource, ServiceStatus } from "@shared";

const mockConfig = vi.hoisted(() => ({
  certVaultConfigured: true,
  certVaultUrl: "https://certvault.example.com/",
  certVaultResolvedApiKey: "test-key",
}));
const mockAxiosGet = vi.hoisted(() => vi.fn());
const mockServiceRepository = vi.hoisted(() => ({
  getService: vi.fn(),
}));
const mockTlsCertificateService = vi.hoisted(() => ({
  getForService: vi.fn(),
}));

vi.mock("axios", () => ({ default: { get: mockAxiosGet } }));
vi.mock("@server/lib/config.js", () => ({ config: mockConfig }));
vi.mock("@server/db/serviceRepository.js", () => ({
  serviceRepository: mockServiceRepository,
}));
vi.mock("@server/services/tlsCertificateService.js", () => ({
  tlsCertificateService: mockTlsCertificateService,
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

function service(
  id: string,
  host: string,
  protocol: ServiceProtocol | null = ServiceProtocol.HTTPS,
) {
  return {
    id,
    name: id,
    host,
    protocol,
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
    mockAxiosGet.mockResolvedValue({ data: [rawCertificate] });
    mockTlsCertificateService.getForService.mockResolvedValue({
      serviceId: "exact",
      fingerprintSha256: "abc",
    });
  });

  it("fetches certificates and reports whether the service uses the current version", async () => {
    mockServiceRepository.getService.mockReturnValue(
      service("exact", "https://example.com:443/path"),
    );
    const { certVaultService } = await import("@server/services/certVaultService.js");
    const result = await certVaultService.getCertificatesForService("exact");

    expect(mockAxiosGet).toHaveBeenCalledWith(
      "https://certvault.example.com/api/v1/certificates",
      expect.objectContaining({ headers: { Authorization: "Bearer test-key" } }),
    );
    expect(result?.[0]).toMatchObject({
      name: "homelab",
      health: "healthy",
      currentVersion: { fingerprintSha256: "abc" },
      matchedServices: [expect.objectContaining({ id: "exact", deploymentStatus: "in-use" })],
    });
  });

  it("returns no certificates when CertVault is disabled", async () => {
    mockConfig.certVaultConfigured = false;
    mockServiceRepository.getService.mockReturnValue(service("exact", "example.com"));
    const { certVaultService } = await import("@server/services/certVaultService.js");

    await expect(certVaultService.getCertificatesForService("exact")).resolves.toEqual([]);
    expect(mockAxiosGet).not.toHaveBeenCalled();
    expect(mockTlsCertificateService.getForService).not.toHaveBeenCalled();
  });

  it("only probes the requested service for the service-specific response", async () => {
    mockServiceRepository.getService.mockReturnValue(
      service("exact", "https://example.com:443/path"),
    );
    const { certVaultService } = await import("@server/services/certVaultService.js");

    const result = await certVaultService.getCertificatesForService("exact");

    expect(mockTlsCertificateService.getForService).toHaveBeenCalledWith("exact");
    expect(result).toEqual([
      expect.objectContaining({
        matchedServices: [expect.objectContaining({ id: "exact", deploymentStatus: "in-use" })],
      }),
    ]);
  });

  it("uses one-label wildcard matching", async () => {
    const { domainMatchesHostname } = await import("@server/services/certVaultService.js");

    expect(domainMatchesHostname("*.example.com", "app.example.com")).toBe(true);
    expect(domainMatchesHostname("*.example.com", "nested.app.example.com")).toBe(false);
    expect(domainMatchesHostname("example.com", "example.com")).toBe(true);
  });
});
