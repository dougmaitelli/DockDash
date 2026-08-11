import tls from "node:tls";

import { isIpHostname, resolveTlsEndpoint, type Service, type TlsCertificate } from "@shared";

import { serviceRepository } from "../db/serviceRepository.js";

const CACHE_TTL_MS = 60_000;
const WARNING_DAYS = 30;
const TIMEOUT_MS = 5_000;

export { resolveTlsEndpoint };

export function resolveTlsServername(hostname: string): string | undefined {
  return isIpHostname(hostname) ? undefined : hostname;
}

function issuerName(issuer: tls.PeerCertificate["issuer"]): string | null {
  const value = issuer.O ?? issuer.CN;

  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function domainsFrom(cert: tls.PeerCertificate): string[] {
  const san = cert.subjectaltname ?? "";
  const domains = san
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith("DNS:"))
    .map((entry) => entry.slice(4));

  const commonName = cert.subject?.CN;

  if (domains.length === 0 && commonName) {
    domains.push(Array.isArray(commonName) ? commonName[0] : commonName);
  }

  return domains;
}

function failed(serviceId: string, host: string, port: number, error: string): TlsCertificate {
  return {
    serviceId,
    hostname: host,
    port,
    health: "error",
    trusted: false,
    hostnameValid: false,
    validFrom: null,
    validTo: null,
    daysRemaining: null,
    issuer: null,
    serial: null,
    fingerprintSha256: null,
    domains: [],
    error,
  };
}

export function probeTlsCertificate(service: Service): Promise<TlsCertificate> {
  const target = resolveTlsEndpoint(service);

  if (!target) {
    return Promise.resolve(failed(service.id!, service.host, 443, "Service has no HTTPS endpoint"));
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: TlsCertificate) => {
      if (settled) return;

      settled = true;
      resolve(result);
    };
    const servername = resolveTlsServername(target.hostname);
    const socket = tls.connect({
      host: target.hostname,
      port: target.port,
      ...(servername ? { servername } : {}),
      rejectUnauthorized: true,
      timeout: TIMEOUT_MS,
    });

    const certificateResult = (connectionError?: Error): TlsCertificate | null => {
      const cert = socket.getPeerCertificate();

      if (!cert?.raw) {
        return null;
      }

      const validFromMs = Date.parse(cert.valid_from);
      const validToMs = Date.parse(cert.valid_to);
      const now = Date.now();
      const daysRemaining = Number.isFinite(validToMs)
        ? Math.max(0, Math.ceil((validToMs - now) / 86_400_000))
        : null;
      const hostnameError = tls.checkServerIdentity(target.hostname, cert);
      const dateValid = Number.isFinite(validFromMs) && Number.isFinite(validToMs);
      const active = dateValid && validFromMs <= now && validToMs > now;
      const trusted = socket.authorized;
      const hostnameValid = !hostnameError;
      const error = !active
        ? "Certificate is expired, not active, or has invalid dates"
        : !hostnameValid
          ? hostnameError.message
          : !trusted
            ? String(
                socket.authorizationError ??
                  connectionError?.message ??
                  "Certificate chain is not trusted",
              )
            : undefined;

      return {
        serviceId: service.id!,
        hostname: target.hostname,
        port: target.port,
        health: error
          ? "error"
          : daysRemaining !== null && daysRemaining <= WARNING_DAYS
            ? "warning"
            : "healthy",
        trusted,
        hostnameValid,
        validFrom: dateValid ? new Date(validFromMs).toISOString() : null,
        validTo: dateValid ? new Date(validToMs).toISOString() : null,
        daysRemaining,
        issuer: issuerName(cert.issuer),
        serial: cert.serialNumber || null,
        fingerprintSha256: cert.fingerprint256?.replaceAll(":", "").toLowerCase() ?? null,
        domains: domainsFrom(cert),
        ...(error ? { error } : {}),
      };
    };

    socket.once("secureConnect", () => {
      const result = certificateResult();

      socket.end();
      finish(
        result ?? failed(service.id!, target.hostname, target.port, "No certificate was served"),
      );
    });
    socket.once("timeout", () => socket.destroy(new Error("TLS connection timed out")));
    socket.once("error", (err) => {
      const result = certificateResult(err);

      finish(result ?? failed(service.id!, target.hostname, target.port, err.message));
    });
  });
}

class TlsCertificateService {
  private cache = new Map<string, { expiresAt: number; value: TlsCertificate }>();

  async getForService(serviceId: string, forceRefresh = false): Promise<TlsCertificate | null> {
    const service = serviceRepository.getService(serviceId);

    if (!service) return null;

    if (!resolveTlsEndpoint(service)) return null;

    const cached = this.cache.get(serviceId);

    if (!forceRefresh && cached && cached.expiresAt > Date.now()) return cached.value;

    const value = await probeTlsCertificate(service);

    this.cache.set(serviceId, { value, expiresAt: Date.now() + CACHE_TTL_MS });

    return value;
  }

  async getAll(forceRefresh = false): Promise<TlsCertificate[]> {
    return Promise.all(
      serviceRepository
        .getServices()
        .filter((service) => resolveTlsEndpoint(service))
        .map((service) => this.getForService(service.id!, forceRefresh)),
    ).then((values) => values.filter((value): value is TlsCertificate => value !== null));
  }
}

export const tlsCertificateService = new TlsCertificateService();
