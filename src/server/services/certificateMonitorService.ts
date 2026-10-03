import type { CertVaultStatus, TlsCertificate } from "@shared";

import { certificateNotificationStateRepository } from "../db/certificateNotificationStateRepository.js";
import { serviceRepository } from "../db/serviceRepository.js";
import { t } from "../i18n/index.js";
import { config } from "../lib/config.js";
import { certVaultService } from "./certVaultService.js";
import { notificationService, type NotificationType } from "./notificationService.js";
import { tlsCertificateService } from "./tlsCertificateService.js";

type Notice = { event: string; title: string; body: string; type: NotificationType };

function certificateIdentity(certificate: TlsCertificate): string {
  return JSON.stringify([
    certificate.hostname.trim().toLowerCase().replace(/\.$/, ""),
    certificate.fingerprintSha256?.replaceAll(":", "").trim().toLowerCase() ?? null,
  ]);
}

export function certVaultStatusObservation(
  serviceId: string,
  statuses: ReadonlyMap<string, CertVaultStatus> | null,
): CertVaultStatus | null | undefined {
  if (statuses === null) return undefined;

  return statuses.get(serviceId) ?? null;
}

export function expiryThreshold(daysRemaining: number | null, raw: string): number | null {
  if (daysRemaining === null) return null;

  const crossed = raw
    .split(",")
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => Number.isFinite(value) && value > 0 && daysRemaining <= value)
    .sort((a, b) => b - a);

  return crossed.at(-1) ?? null;
}

export class CertificateMonitorService {
  async checkAll(): Promise<void> {
    if (!notificationService.configured) return;

    const certificates = await tlsCertificateService.getAll(true);
    const certVaultStatuses = await certVaultService
      .getDeploymentStatuses(certificates)
      .catch(() => null);

    // Share delivery promises, including failures, so each certificate event is sent once
    // per check. Each service still persists its own state only after successful delivery.
    const deliveries = new Map<string, Promise<void>>();
    const names = new Map<string, Set<string>>();
    const targets = new Map<string, Set<string>>();

    for (const certificate of certificates) {
      const service = serviceRepository.getService(certificate.serviceId);

      if (!service) continue;

      const identity = certificateIdentity(certificate);
      const group = names.get(identity) ?? new Set<string>();

      group.add(service.name);
      names.set(identity, group);
      const endpoints = targets.get(identity) ?? new Set<string>();

      endpoints.add(`${certificate.hostname}:${certificate.port}`);
      targets.set(identity, endpoints);
    }

    for (const certificate of certificates) {
      const identity = certificateIdentity(certificate);

      await this.process(
        certificate,
        certVaultStatusObservation(certificate.serviceId, certVaultStatuses),
        [...(names.get(identity) ?? [])].join(", "),
        [...(targets.get(identity) ?? [])].join(", "),
        (notice, threshold) => {
          const key = JSON.stringify([
            identity,
            notice.event,
            notice.event === "Expiring" ? threshold : null,
            notice.event === "Error" ? certificate.error : null,
          ]);
          let delivery = deliveries.get(key);

          if (!delivery) {
            delivery = notificationService.notify(notice.title, notice.body, notice.type);
            deliveries.set(key, delivery);
          }

          return delivery;
        },
      ).catch(() => {
        // NotificationService logs delivery failures. Continue processing other services;
        // this service's state remains unchanged so its notices are retried next time.
      });
    }
  }

  private async process(
    certificate: TlsCertificate,
    certVaultStatus: CertVaultStatus | null | undefined,
    name: string,
    target: string,
    deliver: (notice: Notice, threshold: number | null) => Promise<void>,
  ): Promise<void> {
    // Connection and transport failures are covered by service health notifications. Without a
    // peer certificate, there is no TLS certificate validity state to alert on or persist.
    if (certificate.health === "error" && certificate.fingerprintSha256 === null) return;

    const service = serviceRepository.getService(certificate.serviceId);

    if (!service) return;

    const previous = certificateNotificationStateRepository.get(certificate.serviceId);
    const threshold =
      certificate.health === "warning"
        ? expiryThreshold(certificate.daysRemaining, config.certificateExpiryThresholds)
        : null;
    const notices: Notice[] = [];
    const fingerprintChanged =
      previous?.fingerprintSha256 != null &&
      certificate.fingerprintSha256 != null &&
      previous.fingerprintSha256 !== certificate.fingerprintSha256;

    if (fingerprintChanged) {
      notices.push({
        event: "Renewed",
        title: t("notifications.certificateRenewed", { name }),
        body: t("notifications.certificateRenewedBody", { name, target }),
        type: "success",
      });
    } else if (
      previous?.health === "error" &&
      previous.fingerprintSha256 !== null &&
      certificate.health === "healthy"
    ) {
      notices.push({
        event: "Recovered",
        title: t("notifications.certificateRecovered", { name }),
        body: t("notifications.certificateRecoveredBody", { name, target }),
        type: "success",
      });
    }

    if (certificate.health === "error" && previous?.health !== "error") {
      notices.push({
        event: "Error",
        title: t("notifications.certificateError", { name }),
        body: t("notifications.certificateErrorBody", {
          name,
          target,
          error: certificate.error ?? "Unknown TLS error",
        }),
        type: "failure",
      });
    }

    if (threshold !== null && previous?.warningThreshold !== threshold) {
      notices.push({
        event: "Expiring",
        title: t("notifications.certificateExpiring", { name }),
        body: t("notifications.certificateExpiringBody", {
          name,
          target,
          days: String(certificate.daysRemaining),
          date: certificate.validTo ?? "unknown",
        }),
        type: "warning",
      });
    }

    if (certVaultStatus === "different" && previous?.certVaultStatus !== "different") {
      notices.push({
        event: "Mismatch",
        title: t("notifications.certificateMismatch", { name }),
        body: t("notifications.certificateMismatchBody", { name, target }),
        type: "warning",
      });
    } else if (certVaultStatus === "in-use" && previous?.certVaultStatus === "different") {
      notices.push({
        event: "MismatchResolved",
        title: t("notifications.certificateMismatchResolved", { name }),
        body: t("notifications.certificateMismatchResolvedBody", { name, target }),
        type: "success",
      });
    }

    for (const notice of notices) {
      await deliver(notice, threshold);
    }

    certificateNotificationStateRepository.save({
      serviceId: certificate.serviceId,
      health: certificate.health,
      fingerprintSha256: certificate.fingerprintSha256,
      warningThreshold: threshold,
      certVaultStatus:
        certVaultStatus === undefined ? (previous?.certVaultStatus ?? null) : certVaultStatus,
    });
  }
}

export const certificateMonitorService = new CertificateMonitorService();
