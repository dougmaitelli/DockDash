import { describe, expect, it, vi } from "vitest";

import { ServiceSource, ServiceStatus } from "@shared";

vi.mock("@server/db/serviceRepository.js", () => ({
  serviceRepository: { getService: vi.fn(), getServices: vi.fn(() => []) },
}));

function service(host: string, ports: number[]) {
  return {
    id: "service-1",
    name: "Service",
    host,
    ports,
    source: ServiceSource.NETWORK,
    status: ServiceStatus.UP,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

describe("resolveTlsEndpoint", () => {
  it("uses the hostname and explicit port from an HTTPS URL", async () => {
    const { resolveTlsEndpoint } = await import("@server/services/tlsCertificateService.js");

    expect(resolveTlsEndpoint(service("https://app.example.com:8443/path", []))).toEqual({
      hostname: "app.example.com",
      port: 8443,
    });
  });

  it("uses port 443 for a bare hostname that exposes HTTPS", async () => {
    const { resolveTlsEndpoint } = await import("@server/services/tlsCertificateService.js");

    expect(resolveTlsEndpoint(service("app.example.com", [80, 443]))).toEqual({
      hostname: "app.example.com",
      port: 443,
    });
  });

  it("normalizes an IPv6 URL hostname for TLS connections", async () => {
    const { resolveTlsEndpoint } = await import("@server/services/tlsCertificateService.js");

    expect(resolveTlsEndpoint(service("https://[2001:db8::1]:8443", []))).toEqual({
      hostname: "2001:db8::1",
      port: 8443,
    });
  });

  it("does not probe HTTP-only services", async () => {
    const { resolveTlsEndpoint } = await import("@server/services/tlsCertificateService.js");

    expect(resolveTlsEndpoint(service("http://app.example.com", [443]))).toBeNull();
    expect(resolveTlsEndpoint(service("app.example.com", [80]))).toBeNull();
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
