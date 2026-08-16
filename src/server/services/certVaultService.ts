import axios from "axios";
import { z } from "zod";

import { type Service, ServiceProtocol, type TlsCertificate } from "@shared";

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
  if (service.protocol !== ServiceProtocol.HTTPS) return false;

  const hostname = normalizeHostname(service.host);

  return (
    hostname !== null &&
    certificate.domains.some((domain) => domainMatchesHostname(domain, hostname))
  );
}

function normalizeFingerprint(fingerprint: string | null | undefined): string | null {
  const normalized = fingerprint?.replaceAll(":", "").trim().toLowerCase();

  return normalized || null;
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

  async getDeploymentStatuses(
    liveCertificates: TlsCertificate[],
  ): Promise<ReadonlyMap<string, "in-use" | "different">> {
    if (!config.certVaultConfigured || liveCertificates.length === 0) return new Map();

    const certificates = await this.fetchCertificates();
    const statuses = new Map<string, "in-use" | "different">();

    for (const liveCertificate of liveCertificates) {
      const service = serviceRepository.getService(liveCertificate.serviceId);

      if (!service) continue;

      const matchingCertificates = certificates.filter((certificate) =>
        matchesService(certificate, service),
      );

      if (matchingCertificates.length === 0) continue;

      const liveFingerprint = normalizeFingerprint(liveCertificate.fingerprintSha256);
      const currentIsDeployed = matchingCertificates.some(
        (certificate) =>
          normalizeFingerprint(certificate.current_version?.fingerprint_sha256) === liveFingerprint,
      );

      statuses.set(liveCertificate.serviceId, currentIsDeployed ? "in-use" : "different");
    }

    return statuses;
  }
}

export const certVaultService = new CertVaultService();
