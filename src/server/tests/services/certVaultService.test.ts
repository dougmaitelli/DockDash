import { beforeEach, describe, expect, it, vi } from "vitest";

import { ServiceProtocol, ServiceSource, ServiceStatus } from "@shared";

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
const mockTlsCertificateService = vi.hoisted(() => ({
  getAll: vi.fn(),
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
    mockServiceRepository.getServices.mockReturnValue([
      service("exact", "https://example.com:443/path"),
      service("wildcard", "app.example.com"),
      service("unverified", "unverified.example.com"),
      service("too-deep", "nested.app.example.com"),
      service("ip", "192.168.1.5"),
      service("http", "http://example.com", ServiceProtocol.HTTP),
    ]);
    mockAxiosGet.mockResolvedValue({ data: [rawCertificate] });
    mockTlsCertificateService.getAll.mockResolvedValue([
      {
        serviceId: "exact",
        fingerprintSha256: "AB:C",
      },
      {
        serviceId: "wildcard",
        fingerprintSha256: "def",
      },
      {
        serviceId: "unverified",
        fingerprintSha256: null,
        error: "TLS connection timed out",
      },
    ]);
    mockTlsCertificateService.getForService.mockResolvedValue({
      serviceId: "exact",
      fingerprintSha256: "abc",
    });
  });

  it("fetches certificates and reports whether hostname matches use the current version", async () => {
    const { certVaultService } = await import("@server/services/certVaultService.js");
    const result = await certVaultService.getCertificates();

    expect(mockAxiosGet).toHaveBeenCalledWith(
      "https://certvault.example.com/api/v1/certificates",
      expect.objectContaining({ headers: { Authorization: "Bearer test-key" } }),
    );
    expect(result.certificates[0].matchedServices).toEqual([
      expect.objectContaining({ id: "exact", deploymentStatus: "in-use" }),
      expect.objectContaining({ id: "wildcard", deploymentStatus: "different" }),
      expect.objectContaining({
        id: "unverified",
        deploymentStatus: "unverified",
        deploymentError: "TLS connection timed out",
      }),
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
    expect(mockTlsCertificateService.getAll).not.toHaveBeenCalled();
  });

  it("only probes the requested service for the service-specific response", async () => {
    mockServiceRepository.getService.mockReturnValue(
      service("exact", "https://example.com:443/path"),
    );
    const { certVaultService } = await import("@server/services/certVaultService.js");

    const result = await certVaultService.getCertificatesForService("exact");

    expect(mockTlsCertificateService.getForService).toHaveBeenCalledWith("exact");
    expect(mockTlsCertificateService.getAll).not.toHaveBeenCalled();
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
