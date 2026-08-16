import { useTranslation } from "react-i18next";

import type { TlsCertificate } from "@shared";

import { Badge } from "@/components/ui/Badge";
import { effectiveCertificateHealth } from "@/context/CertificateHealthContext";

const badgeVariant = {
  healthy: "success",
  warning: "warning",
  error: "destructive",
} as const;

export function LiveCertificateSummary({ certificate }: { certificate: TlsCertificate }) {
  const { t } = useTranslation();
  const effectiveHealth = effectiveCertificateHealth(certificate);
  const expires = certificate.validTo ? new Date(certificate.validTo).toLocaleDateString() : null;
  const expiration = expires
    ? certificate.daysRemaining === null
      ? expires
      : t("certificates.expirationWithDays", {
          date: expires,
          remaining: t("certificates.daysRemaining", { count: certificate.daysRemaining }),
        })
    : t("certificates.unknown");

  return (
    <div className="rounded-lg border border-border bg-background p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-medium text-foreground">
            {certificate.hostname}:{certificate.port}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            {certificate.domains.join(", ") || t("certificates.noDnsNames")}
          </p>
        </div>
        <Badge variant={badgeVariant[effectiveHealth]}>
          {t(`certificates.status.${effectiveHealth}`)}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <span className="text-muted-foreground">{t("certificates.fields.expires")}</span>
        <span className="text-right text-secondary-foreground">{expiration}</span>
        <span className="text-muted-foreground">{t("certificates.fields.issuer")}</span>
        <span className="text-right text-secondary-foreground truncate">
          {certificate.issuer ?? "—"}
        </span>
        <span className="text-muted-foreground">{t("certificates.fields.trusted")}</span>
        <span className="text-right text-secondary-foreground">
          {certificate.trusted && certificate.hostnameValid
            ? t("certificates.yes")
            : t("certificates.no")}
        </span>
        <span className="text-muted-foreground">{t("certificates.fields.serial")}</span>
        <span
          className="text-right text-secondary-foreground truncate"
          title={certificate.serial ?? undefined}
        >
          {certificate.serial ?? "—"}
        </span>
        <span className="text-muted-foreground">{t("certificates.fields.sha256Fingerprint")}</span>
        <span
          className="text-right text-secondary-foreground truncate font-mono text-xs"
          title={certificate.fingerprintSha256 ?? undefined}
        >
          {certificate.fingerprintSha256 ?? "—"}
        </span>
      </div>

      {certificate.error && <p className="text-xs text-destructive">{certificate.error}</p>}
      {certificate.certVaultStatus === "different" && (
        <p className="text-xs text-warning">{t("certificates.latestNotDeployed")}</p>
      )}
    </div>
  );
}
