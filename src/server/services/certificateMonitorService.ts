import type { CertVaultStatus, TlsCertificate } from "@shared";

import { certificateNotificationStateRepository } from "../db/certificateNotificationStateRepository.js";
import { serviceRepository } from "../db/serviceRepository.js";
import { t } from "../i18n/index.js";
import { config } from "../lib/config.js";
import { certVaultService } from "./certVaultService.js";
import { notificationService, type NotificationType } from "./notificationService.js";
import { tlsCertificateService } from "./tlsCertificateService.js";

type Notice = { title: string; body: string; type: NotificationType };

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

    for (const certificate of certificates) {
      await this.process(
        certificate,
        certVaultStatuses === null
          ? undefined
          : (certVaultStatuses.get(certificate.serviceId) ?? null),
      ).catch(() => {
        // NotificationService logs delivery failures. Continue processing other services;
        // this service's state remains unchanged so its notices are retried next time.
      });
    }
  }

  private async process(
    certificate: TlsCertificate,
    certVaultStatus: CertVaultStatus | null | undefined,
  ): Promise<void> {
    const service = serviceRepository.getService(certificate.serviceId);

    if (!service) return;

    const previous = certificateNotificationStateRepository.get(certificate.serviceId);
    const threshold =
      certificate.health === "warning"
        ? expiryThreshold(certificate.daysRemaining, config.certificateExpiryThresholds)
        : null;
    const target = `${certificate.hostname}:${certificate.port}`;
    const notices: Notice[] = [];
    const fingerprintChanged =
      previous?.fingerprintSha256 != null &&
      certificate.fingerprintSha256 != null &&
      previous.fingerprintSha256 !== certificate.fingerprintSha256;

    if (fingerprintChanged) {
      notices.push({
        title: t("notifications.certificateRenewed", { name: service.name }),
        body: t("notifications.certificateRenewedBody", { name: service.name, target }),
        type: "success",
      });
    } else if (previous?.health === "error" && certificate.health === "healthy") {
      notices.push({
        title: t("notifications.certificateRecovered", { name: service.name }),
        body: t("notifications.certificateRecoveredBody", { name: service.name, target }),
        type: "success",
      });
    }

    if (certificate.health === "error" && previous?.health !== "error") {
      notices.push({
        title: t("notifications.certificateError", { name: service.name }),
        body: t("notifications.certificateErrorBody", {
          name: service.name,
          target,
          error: certificate.error ?? "Unknown TLS error",
        }),
        type: "failure",
      });
    }

    if (threshold !== null && previous?.warningThreshold !== threshold) {
      notices.push({
        title: t("notifications.certificateExpiring", { name: service.name }),
        body: t("notifications.certificateExpiringBody", {
          name: service.name,
          target,
          days: String(certificate.daysRemaining),
          date: certificate.validTo ?? "unknown",
        }),
        type: "warning",
      });
    }

    if (certVaultStatus === "different" && previous?.certVaultStatus !== "different") {
      notices.push({
        title: t("notifications.certificateMismatch", { name: service.name }),
        body: t("notifications.certificateMismatchBody", { name: service.name, target }),
        type: "warning",
      });
    } else if (certVaultStatus === "in-use" && previous?.certVaultStatus === "different") {
      notices.push({
        title: t("notifications.certificateMismatchResolved", { name: service.name }),
        body: t("notifications.certificateMismatchResolvedBody", { name: service.name, target }),
        type: "success",
      });
    }

    for (const notice of notices) {
      await notificationService.notify(notice.title, notice.body, notice.type);
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
