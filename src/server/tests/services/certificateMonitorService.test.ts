import {
  CertificateMonitorService,
  certVaultStatusObservation,
  expiryThreshold,
} from "@server/services/certificateMonitorService.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TlsCertificate } from "@shared";

const mocks = vi.hoisted(() => ({
  getAll: vi.fn(),
  getDeploymentStatuses: vi.fn(),
  getService: vi.fn(),
  get: vi.fn(),
  save: vi.fn(),
  notify: vi.fn(),
}));

vi.mock("@server/services/tlsCertificateService.js", () => ({
  tlsCertificateService: { getAll: mocks.getAll },
}));
vi.mock("@server/services/certVaultService.js", () => ({
  certVaultService: { getDeploymentStatuses: mocks.getDeploymentStatuses },
}));
vi.mock("@server/services/notificationService.js", () => ({
  notificationService: { configured: true, notify: mocks.notify },
}));
vi.mock("@server/db/serviceRepository.js", () => ({
  serviceRepository: { getService: mocks.getService },
}));
vi.mock("@server/db/certificateNotificationStateRepository.js", () => ({
  certificateNotificationStateRepository: { get: mocks.get, save: mocks.save },
}));
vi.mock("@server/lib/config.js", () => ({
  config: { certificateExpiryThresholds: "30,14,7,3,1" },
}));
vi.mock("@server/i18n/index.js", () => ({
  t: (key: string, values: Record<string, string>) => `${key}: ${JSON.stringify(values)}`,
}));

describe("expiryThreshold", () => {
  it("returns the most urgent crossed threshold", () => {
    expect(expiryThreshold(20, "30,14,7,3,1")).toBe(30);
    expect(expiryThreshold(10, "30,14,7,3,1")).toBe(14);
    expect(expiryThreshold(1, "30,14,7,3,1")).toBe(1);
  });

  it("ignores invalid and disabled thresholds", () => {
    expect(expiryThreshold(20, "0,nope,-4")).toBeNull();
    expect(expiryThreshold(null, "30")).toBeNull();
  });
});

describe("certVaultStatusObservation", () => {
  it("distinguishes a known missing match from a failed CertVault lookup", () => {
    expect(certVaultStatusObservation("service-1", new Map())).toBeNull();
    expect(certVaultStatusObservation("service-1", null)).toBeUndefined();
  });
});

function certificate(serviceId: string, overrides: Partial<TlsCertificate> = {}): TlsCertificate {
  return {
    serviceId,
    hostname: "example.com",
    port: 443,
    health: "healthy",
    trusted: true,
    hostnameValid: true,
    validFrom: null,
    validTo: "2026-12-01",
    daysRemaining: 60,
    issuer: null,
    serial: null,
    fingerprintSha256: "aabb",
    domains: ["example.com"],
    ...overrides,
  };
}

describe("CertificateMonitorService", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getService.mockImplementation((id: string) => ({ name: id }));
    mocks.getAll.mockResolvedValue([
      certificate("service-1"),
      certificate("service-2", {
        hostname: "EXAMPLE.COM.",
        fingerprintSha256: "AA:BB",
        port: 8443,
      }),
    ]);
    mocks.getDeploymentStatuses.mockResolvedValue(
      new Map([
        ["service-1", "different"],
        ["service-2", "different"],
      ]),
    );
    mocks.notify.mockResolvedValue(undefined);
  });

  it("sends one shared CertVault mismatch and saves state for every service", async () => {
    await new CertificateMonitorService().checkAll();

    expect(mocks.notify).toHaveBeenCalledOnce();
    expect(mocks.notify.mock.calls[0][0]).toContain("service-1, service-2");
    expect(mocks.save).toHaveBeenCalledTimes(2);
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: "service-2",
        certVaultStatus: "different",
      }),
    );
  });

  it("keeps different domains and certificates separate", async () => {
    mocks.getAll.mockResolvedValue([
      certificate("service-1"),
      certificate("service-2", { fingerprintSha256: "ccdd" }),
      certificate("service-3", { hostname: "other.example.com" }),
    ]);
    mocks.getDeploymentStatuses.mockResolvedValue(
      new Map([
        ["service-1", "different"],
        ["service-2", "different"],
        ["service-3", "different"],
      ]),
    );

    await new CertificateMonitorService().checkAll();

    expect(mocks.notify).toHaveBeenCalledTimes(3);
    expect(mocks.save).toHaveBeenCalledTimes(3);
  });

  it("retries failed shared delivery on the next check without advancing states", async () => {
    const monitor = new CertificateMonitorService();

    mocks.notify.mockRejectedValueOnce(new Error("Apprise unavailable"));

    await monitor.checkAll();
    expect(mocks.notify).toHaveBeenCalledOnce();
    expect(mocks.save).not.toHaveBeenCalled();

    await monitor.checkAll();
    expect(mocks.notify).toHaveBeenCalledTimes(2);
    expect(mocks.save).toHaveBeenCalledTimes(2);
  });

  it("deduplicates expiry and renewal independently from mismatch resolution", async () => {
    mocks.getAll.mockResolvedValue([
      certificate("service-1", { health: "warning", daysRemaining: 10 }),
      certificate("service-2", { health: "warning", daysRemaining: 10 }),
    ]);
    mocks.get.mockReturnValue({ fingerprintSha256: "old", certVaultStatus: "different" });
    mocks.getDeploymentStatuses.mockResolvedValue(
      new Map([
        ["service-1", "in-use"],
        ["service-2", "in-use"],
      ]),
    );

    await new CertificateMonitorService().checkAll();

    expect(mocks.notify).toHaveBeenCalledTimes(3);
    expect(mocks.save).toHaveBeenCalledTimes(2);
  });

  it("does not repeat a shared mismatch after states have been saved", async () => {
    mocks.save.mockImplementation(() => {
      mocks.get.mockImplementation(
        (id) => mocks.save.mock.calls.find(([saved]) => saved.serviceId === id)?.[0],
      );
    });
    const monitor = new CertificateMonitorService();

    await monitor.checkAll();
    await monitor.checkAll();

    expect(mocks.notify).toHaveBeenCalledOnce();
  });
});
