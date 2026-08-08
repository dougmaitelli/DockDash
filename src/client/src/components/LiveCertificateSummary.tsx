import type { TlsCertificate } from "@shared";

import { Badge } from "@/components/ui/Badge";

const badgeVariant = {
  healthy: "success",
  warning: "warning",
  error: "destructive",
} as const;

export function LiveCertificateSummary({
  certificate,
  latestDeployed,
}: {
  certificate: TlsCertificate;
  latestDeployed?: boolean;
}) {
  const expires = certificate.validTo ? new Date(certificate.validTo).toLocaleDateString() : null;

  return (
    <div className="rounded-lg border border-border bg-background p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-medium text-foreground">
            {certificate.hostname}:{certificate.port}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            {certificate.domains.join(", ") || "No DNS names reported"}
          </p>
        </div>
        <Badge variant={badgeVariant[certificate.health]}>{certificate.health}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <span className="text-muted-foreground">Expires</span>
        <span className="text-right text-secondary-foreground">
          {expires ? `${expires} (${certificate.daysRemaining} days)` : "Unknown"}
        </span>
        <span className="text-muted-foreground">Issuer</span>
        <span className="text-right text-secondary-foreground truncate">
          {certificate.issuer ?? "—"}
        </span>
        <span className="text-muted-foreground">Trusted</span>
        <span className="text-right text-secondary-foreground">
          {certificate.trusted && certificate.hostnameValid ? "Yes" : "No"}
        </span>
        <span className="text-muted-foreground">Serial</span>
        <span
          className="text-right text-secondary-foreground truncate"
          title={certificate.serial ?? undefined}
        >
          {certificate.serial ?? "—"}
        </span>
        <span className="text-muted-foreground">SHA-256 fingerprint</span>
        <span
          className="text-right text-secondary-foreground truncate font-mono text-xs"
          title={certificate.fingerprintSha256 ?? undefined}
        >
          {certificate.fingerprintSha256 ?? "—"}
        </span>
      </div>

      {certificate.error && <p className="text-xs text-destructive">{certificate.error}</p>}
      {latestDeployed === false && (
        <p className="text-xs text-warning">
          CertVault’s latest certificate is not deployed on this endpoint.
        </p>
      )}
    </div>
  );
}
