import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

import type { CertVaultCertificate } from "@shared";

import { certificateApi } from "../services/api";
import { useConfig } from "./ConfigContext";

export type CertificateHealth = "healthy" | "warning" | "error";

const CertificateHealthContext = createContext<ReadonlyMap<string, CertificateHealth>>(new Map());

function displayHealth(health: CertVaultCertificate["health"]): CertificateHealth {
  if (health === "healthy") return "healthy";

  if (health === "warning") return "warning";

  return "error";
}

const healthPriority: Record<CertificateHealth, number> = {
  healthy: 0,
  warning: 1,
  error: 2,
};

export function CertificateHealthProvider({ children }: { children: ReactNode }) {
  const config = useConfig();
  const [certificates, setCertificates] = useState<CertVaultCertificate[]>([]);

  useEffect(() => {
    if (!config?.certVaultConfigured) {
      setCertificates([]);

      return;
    }

    let cancelled = false;

    void certificateApi
      .getAll()
      .then(({ data }) => {
        if (!cancelled) setCertificates(data.certificates);
      })
      .catch(() => {
        if (!cancelled) setCertificates([]);
      });

    return () => {
      cancelled = true;
    };
  }, [config?.certVaultConfigured]);

  const healthByService = useMemo(() => {
    const result = new Map<string, CertificateHealth>();

    for (const certificate of certificates) {
      const health = displayHealth(certificate.health);

      for (const service of certificate.matchedServices) {
        const current = result.get(service.id);

        if (!current || healthPriority[health] > healthPriority[current]) {
          result.set(service.id, health);
        }
      }
    }

    return result;
  }, [certificates]);

  return (
    <CertificateHealthContext.Provider value={healthByService}>
      {children}
    </CertificateHealthContext.Provider>
  );
}

export function useCertificateHealth(serviceId?: string): CertificateHealth | undefined {
  return useContext(CertificateHealthContext).get(serviceId ?? "");
}
