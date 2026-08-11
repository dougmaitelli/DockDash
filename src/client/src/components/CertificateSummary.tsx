import { useTranslation } from "react-i18next";

import type { CertVaultCertificate } from "@shared";

import { Badge } from "@/components/ui/Badge";

const badgeVariant = {
  healthy: "success",
  warning: "warning",
  expired: "destructive",
  error: "destructive",
  pending: "secondary",
} as const;

const deploymentBadgeVariant = {
  "in-use": "success",
  different: "warning",
  unverified: "secondary",
} as const;

interface CertificateSummaryProps {
  certificate: CertVaultCertificate;
  showServices?: boolean;
}

export function CertificateSummary({ certificate, showServices = false }: CertificateSummaryProps) {
  const { t } = useTranslation();
  const expires = certificate.currentVersion
    ? new Date(certificate.currentVersion.notAfter).toLocaleDateString()
    : null;

  return (
    <div className="rounded-lg border border-border bg-background p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-medium text-foreground">{certificate.name}</h3>
          <p className="text-xs text-muted-foreground mt-1">{certificate.domains.join(", ")}</p>
        </div>
        <Badge variant={badgeVariant[certificate.health]}>{certificate.status}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <span className="text-muted-foreground">Renewal status</span>
        <span className="text-right text-secondary-foreground">{certificate.status}</span>
        <span className="text-muted-foreground">Expires</span>
        <span className="text-right text-secondary-foreground">
          {expires ? `${expires} (${certificate.daysRemaining} days)` : "Not issued"}
        </span>
        <span className="text-muted-foreground">Issuer</span>
        <span className="text-right text-secondary-foreground truncate">
          {certificate.currentVersion?.issuer ?? "—"}
        </span>
        <span className="text-muted-foreground">Key type</span>
        <span className="text-right text-secondary-foreground">{certificate.keyType}</span>
      </div>

      {certificate.lastError && (
        <p className="text-xs text-destructive break-words">{certificate.lastError}</p>
      )}

      {showServices && (
        <div className="pt-2 border-t border-border">
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            Matched services
          </p>
          {certificate.matchedServices.length > 0 ? (
            <div className="space-y-2">
              {certificate.matchedServices.map((service) => (
                <div key={service.id} className="flex items-center justify-between gap-3">
                  <a
                    href="/services"
                    title={service.host}
                    className="text-sm text-primary no-underline truncate"
                  >
                    {service.name}
                  </a>
                  <Badge
                    variant={deploymentBadgeVariant[service.deploymentStatus]}
                    title={service.deploymentError}
                  >
                    {t(`certificates.deployment.${service.deploymentStatus}`)}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No matching DockDash services</p>
          )}
        </div>
      )}
    </div>
  );
}
