import { beforeEach, describe, expect, it, vi } from "vitest";

import { ServiceProtocol, ServiceSource, ServiceStatus, type TlsCertificate } from "@shared";

const mockConfig = vi.hoisted(() => ({
  certVaultConfigured: true,
  certVaultUrl: "https://certvault.example.com/",
  certVaultResolvedApiKey: "test-key",
}));
const mockAxiosGet = vi.hoisted(() => vi.fn());
const mockServiceRepository = vi.hoisted(() => ({
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

function liveCertificate(serviceId: string, fingerprintSha256: string): TlsCertificate {
  return {
    serviceId,
    hostname: "example.com",
    port: 443,
    health: "healthy",
    trusted: true,
    hostnameValid: true,
    validFrom: "2026-07-01T00:00:00Z",
    validTo: "2026-10-01T00:00:00Z",
    daysRemaining: 30,
    issuer: "Let's Encrypt",
    serial: "123",
    fingerprintSha256,
    domains: ["example.com"],
  };
}

describe("CertVaultService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockConfig.certVaultConfigured = true;
    mockAxiosGet.mockResolvedValue({ data: [rawCertificate] });
  });

  it("reports when the current CertVault certificate is deployed", async () => {
    mockServiceRepository.getService.mockReturnValue(
      service("exact", "https://example.com:443/path"),
    );
    const { certVaultService } = await import("@server/services/certVaultService.js");
    const result = await certVaultService.getDeploymentStatuses([liveCertificate("exact", "abc")]);

    expect(mockAxiosGet).toHaveBeenCalledWith(
      "https://certvault.example.com/api/v1/certificates",
      expect.objectContaining({ headers: { Authorization: "Bearer test-key" } }),
    );
    expect(result.get("exact")).toBe("in-use");
  });

  it("reports a different deployed certificate", async () => {
    mockServiceRepository.getService.mockReturnValue(service("exact", "example.com"));
    const { certVaultService } = await import("@server/services/certVaultService.js");

    const result = await certVaultService.getDeploymentStatuses([
      liveCertificate("exact", "different"),
    ]);

    expect(result.get("exact")).toBe("different");
  });

  it("does not report a status when no CertVault certificate matches", async () => {
    mockServiceRepository.getService.mockReturnValue(service("other", "other.test"));
    const { certVaultService } = await import("@server/services/certVaultService.js");

    const result = await certVaultService.getDeploymentStatuses([
      liveCertificate("other", "different"),
    ]);

    expect(result.has("other")).toBe(false);
  });

  it("returns no statuses when CertVault is disabled", async () => {
    mockConfig.certVaultConfigured = false;
    const { certVaultService } = await import("@server/services/certVaultService.js");

    const result = await certVaultService.getDeploymentStatuses([
      liveCertificate("exact", "different"),
    ]);

    expect(result.size).toBe(0);
    expect(mockAxiosGet).not.toHaveBeenCalled();
  });

  it("uses one-label wildcard matching", async () => {
    const { domainMatchesHostname } = await import("@server/services/certVaultService.js");

    expect(domainMatchesHostname("*.example.com", "app.example.com")).toBe(true);
    expect(domainMatchesHostname("*.example.com", "nested.app.example.com")).toBe(false);
    expect(domainMatchesHostname("example.com", "example.com")).toBe(true);
  });
});
