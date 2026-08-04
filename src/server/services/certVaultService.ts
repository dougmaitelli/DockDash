import axios from "axios";
import { z } from "zod";

import type { CertVaultCertificate, CertVaultCertificatesResponse, Service } from "@shared";

import { serviceRepository } from "../db/serviceRepository.js";
import { config } from "../lib/config.js";

const CACHE_TTL_MS = 60_000;

const versionSchema = z.object({
  serial: z.string(),
  issuer: z.string(),
  fingerprint_sha256: z.string(),
  not_before: z.string(),
  not_after: z.string(),
});

const certificateSchema = z.object({
  name: z.string(),
  domains: z.array(z.string()),
  key_type: z.string(),
  status: z.string(),
  renew_before_seconds: z.number(),
  current_version: versionSchema.nullish(),
  last_error: z.string().optional(),
});

type RawCertificate = z.infer<typeof certificateSchema>;

function normalizeHostname(host: string): string | null {
  const value = host.trim();

  if (!value) return null;

  try {
    const parsed = new URL(value.includes("://") ? value : `https://${value}`);
    const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");

    // Certificate DNS SAN matching does not apply to IP-only service addresses.
    if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname.includes(":")) return null;

    return hostname;
  } catch {
    return null;
  }
}

export function domainMatchesHostname(domain: string, hostname: string): boolean {
  const normalizedDomain = domain.trim().toLowerCase().replace(/\.$/, "");
  const normalizedHost = hostname.trim().toLowerCase().replace(/\.$/, "");

  if (normalizedDomain === normalizedHost) return true;

  if (!normalizedDomain.startsWith("*.")) return false;

  const suffix = normalizedDomain.slice(2);

  return (
    normalizedHost.endsWith(`.${suffix}`) &&
    normalizedHost.split(".").length === suffix.split(".").length + 1
  );
}

function matchesService(certificate: RawCertificate, service: Service): boolean {
  const hostname = normalizeHostname(service.host);

  return (
    hostname !== null &&
    certificate.domains.some((domain) => domainMatchesHostname(domain, hostname))
  );
}

function certificateHealth(certificate: RawCertificate): CertVaultCertificate["health"] {
  if (certificate.last_error || ["failed", "error"].includes(certificate.status.toLowerCase())) {
    return "error";
  }

  if (!certificate.current_version) return "pending";

  const expiresAt = Date.parse(certificate.current_version.not_after);

  if (!Number.isFinite(expiresAt)) return "error";

  if (expiresAt <= Date.now()) return "expired";

  if (expiresAt - Date.now() <= certificate.renew_before_seconds * 1000) return "warning";

  return "healthy";
}

class CertVaultService {
  private cache: { expiresAt: number; certificates: RawCertificate[] } | null = null;

  private get consoleUrl(): string | null {
    return config.certVaultUrl?.replace(/\/+$/, "") ?? null;
  }

  private async fetchCertificates(forceRefresh = false): Promise<RawCertificate[]> {
    if (!config.certVaultConfigured) return [];

    if (!forceRefresh && this.cache && this.cache.expiresAt > Date.now()) {
      return this.cache.certificates;
    }

    const response = await axios.get(`${this.consoleUrl}/api/v1/certificates`, {
      headers: { Authorization: `Bearer ${config.certVaultResolvedApiKey}` },
      timeout: 5_000,
    });
    const certificates = z.array(certificateSchema).parse(response.data);

    this.cache = { certificates, expiresAt: Date.now() + CACHE_TTL_MS };

    return certificates;
  }

  private enrich(certificate: RawCertificate, services: Service[]): CertVaultCertificate {
    const version = certificate.current_version;
    const notAfter = version ? Date.parse(version.not_after) : NaN;

    return {
      name: certificate.name,
      domains: certificate.domains,
      keyType: certificate.key_type,
      status: certificate.status,
      renewBeforeSeconds: certificate.renew_before_seconds,
      ...(certificate.last_error ? { lastError: certificate.last_error } : {}),
      currentVersion: version
        ? {
            serial: version.serial,
            issuer: version.issuer,
            fingerprintSha256: version.fingerprint_sha256,
            notBefore: version.not_before,
            notAfter: version.not_after,
          }
        : null,
      daysRemaining: Number.isFinite(notAfter)
        ? Math.max(0, Math.ceil((notAfter - Date.now()) / 86_400_000))
        : null,
      health: certificateHealth(certificate),
      matchedServices: services
        .filter((service) => matchesService(certificate, service))
        .map(({ id, name, host }) => ({ id: id!, name, host })),
    };
  }

  async getCertificates(forceRefresh = false): Promise<CertVaultCertificatesResponse> {
    if (!config.certVaultConfigured) {
      return { configured: false, consoleUrl: this.consoleUrl, certificates: [] };
    }

    const services = serviceRepository.getServices();
    const certificates = await this.fetchCertificates(forceRefresh);

    return {
      configured: true,
      consoleUrl: this.consoleUrl,
      certificates: certificates.map((certificate) => this.enrich(certificate, services)),
    };
  }

  async getCertificatesForService(serviceId: string): Promise<CertVaultCertificate[] | null> {
    const service = serviceRepository.getService(serviceId);

    if (!service) return null;

    const result = await this.getCertificates();

    return result.certificates.filter((certificate) =>
      certificate.matchedServices.some(({ id }) => id === serviceId),
    );
  }
}

export const certVaultService = new CertVaultService();
