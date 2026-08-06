import { useTranslation } from "react-i18next";

import type { CertificateHealth } from "@/context/CertificateHealthContext";
import { cn } from "@/lib/utils";

interface CertificateHealthDotProps {
  health?: CertificateHealth;
}

const healthClass: Record<CertificateHealth, string> = {
  healthy: "bg-success",
  warning: "bg-warning",
  error: "bg-destructive",
};

export function CertificateHealthDot({ health }: CertificateHealthDotProps) {
  const { t } = useTranslation();

  if (!health) return null;

  const label = t(`certificates.health.${health}`);

  return (
    <span
      className={cn("inline-block w-2 h-2 rounded-full shrink-0", healthClass[health])}
      title={label}
      role="img"
      aria-label={label}
    />
  );
}
