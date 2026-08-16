import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

import type { TlsCertificate } from "@shared";

import { tlsCertificateApi } from "../services/api";

export type CertificateHealth = TlsCertificate["health"];

export function effectiveCertificateHealth(certificate: TlsCertificate): CertificateHealth {
  return certificate.health === "healthy" && certificate.certVaultStatus === "different"
    ? "warning"
    : certificate.health;
}

const CertificateHealthContext = createContext<ReadonlyMap<string, CertificateHealth>>(new Map());

export function CertificateHealthProvider({ children }: { children: ReactNode }) {
  const [certificates, setCertificates] = useState<TlsCertificate[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = (refresh = false) => {
      void tlsCertificateApi
        .getAll(refresh)
        .then(({ data }) => !cancelled && setCertificates(data))
        .catch(() => !cancelled && setCertificates([]));
    };

    load();
    const interval = window.setInterval(() => load(true), 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const healthByService = useMemo(
    () =>
      new Map(
        certificates.map((certificate) => [
          certificate.serviceId,
          effectiveCertificateHealth(certificate),
        ]),
      ),
    [certificates],
  );

  return (
    <CertificateHealthContext.Provider value={healthByService}>
      {children}
    </CertificateHealthContext.Provider>
  );
}

export function useCertificateHealth(serviceId?: string): CertificateHealth | undefined {
  return useContext(CertificateHealthContext).get(serviceId ?? "");
}
