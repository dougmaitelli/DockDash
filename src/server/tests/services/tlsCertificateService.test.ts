import { describe, expect, it, vi } from "vitest";

import { type Service, ServiceProtocol, ServiceSource, ServiceStatus } from "@shared";

const mocks = vi.hoisted(() => ({
  getService: vi.fn<(id: string) => Service | undefined>(),
  getServices: vi.fn<() => Service[]>(() => []),
}));

vi.mock("@server/db/serviceRepository.js", () => ({
  serviceRepository: mocks,
}));

function service(
  host: string,
  ports: number[],
  protocol: ServiceProtocol | null = null,
  checkPort?: number,
) {
  return {
    id: "service-1",
    name: "Service",
    host,
    protocol,
    ports,
    checkPort,
    source: ServiceSource.NETWORK,
    status: ServiceStatus.UP,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

describe("resolveTlsEndpoint", () => {
  it("uses an explicit port from an HTTPS URL", async () => {
    const { resolveTlsEndpoint } = await import("@server/services/tlsCertificateService.js");

    expect(
      resolveTlsEndpoint(service("https://app.example.com:8443/path", [], ServiceProtocol.HTTPS)),
    ).toEqual({
      hostname: "app.example.com",
      port: 8443,
    });
  });

  it("uses the check port for an explicitly HTTPS service", async () => {
    const { resolveTlsEndpoint } = await import("@server/services/tlsCertificateService.js");

    expect(resolveTlsEndpoint(service("app.example.com", [], ServiceProtocol.HTTPS, 8443))).toEqual(
      {
        hostname: "app.example.com",
        port: 8443,
      },
    );
  });

  it("defaults explicitly HTTPS services to port 443", async () => {
    const { resolveTlsEndpoint } = await import("@server/services/tlsCertificateService.js");

    expect(resolveTlsEndpoint(service("app.example.com", [], ServiceProtocol.HTTPS))).toEqual({
      hostname: "app.example.com",
      port: 443,
    });
  });

  it("accepts IP and local targets only when explicitly HTTPS", async () => {
    const { resolveTlsEndpoint } = await import("@server/services/tlsCertificateService.js");

    expect(resolveTlsEndpoint(service("192.168.0.3", [443], ServiceProtocol.HTTPS))).toEqual({
      hostname: "192.168.0.3",
      port: 443,
    });
    expect(resolveTlsEndpoint(service("localhost", [443], ServiceProtocol.HTTPS))).toEqual({
      hostname: "localhost",
      port: 443,
    });
  });

  it("normalizes explicitly HTTPS IPv6 targets", async () => {
    const { resolveTlsEndpoint } = await import("@server/services/tlsCertificateService.js");

    expect(
      resolveTlsEndpoint(service("https://[2001:db8::1]:8443", [], ServiceProtocol.HTTPS)),
    ).toEqual({
      hostname: "2001:db8::1",
      port: 8443,
    });
  });

  it("does not probe services without an explicit HTTPS protocol", async () => {
    const { resolveTlsEndpoint } = await import("@server/services/tlsCertificateService.js");

    expect(resolveTlsEndpoint(service("app.example.com", [443]))).toBeNull();
    expect(resolveTlsEndpoint(service("app.example.com", [443], ServiceProtocol.HTTP))).toBeNull();
  });
});

describe("resolveTlsServername", () => {
  it("uses DNS hostnames for SNI", async () => {
    const { resolveTlsServername } = await import("@server/services/tlsCertificateService.js");

    expect(resolveTlsServername("app.example.com")).toBe("app.example.com");
  });

  it("omits SNI for IP address targets", async () => {
    const { resolveTlsServername } = await import("@server/services/tlsCertificateService.js");

    expect(resolveTlsServername("192.168.0.3")).toBeUndefined();
    expect(resolveTlsServername("2001:db8::1")).toBeUndefined();
  });
});

describe("TlsCertificateService", () => {
  it("limits concurrent bulk probes", async () => {
    const services = Array.from({ length: 11 }, (_, index) => ({
      ...service(`service-${index}.example.com`, [], ServiceProtocol.HTTPS),
      id: `service-${index}`,
    }));
    let active = 0;
    let maxActive = 0;
    let release: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const probe = vi.fn(async (current: Service) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await gate;
      active--;

      return {
        serviceId: current.id,
        hostname: current.host,
        port: 443,
        health: "healthy" as const,
        trusted: true,
        hostnameValid: true,
        validFrom: null,
        validTo: null,
        daysRemaining: null,
        issuer: null,
        serial: null,
        fingerprintSha256: null,
        domains: [],
      };
    });

    mocks.getServices.mockReturnValue(services);
    mocks.getService.mockImplementation((id: string) => services.find((item) => item.id === id));
    const { TlsCertificateService } = await import("@server/services/tlsCertificateService.js");
    const certificateService = new TlsCertificateService(probe);
    const load = certificateService.getAll(true);

    await expect.poll(() => active).toBe(10);
    expect(probe).toHaveBeenCalledTimes(10);
    release!();
    await load;

    expect(maxActive).toBe(10);
    expect(probe).toHaveBeenCalledTimes(11);
  });
});
