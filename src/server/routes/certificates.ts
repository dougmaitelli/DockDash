import { Router } from "express";

import type { TlsCertificate } from "@shared";

import { certVaultService } from "../services/certVaultService.js";
import { tlsCertificateService } from "../services/tlsCertificateService.js";

const router = Router();

async function withCertVaultStatus(certificates: TlsCertificate[]): Promise<TlsCertificate[]> {
  const statuses = await certVaultService
    .getDeploymentStatuses(certificates)
    .catch(() => new Map());

  return certificates.map((certificate) => {
    const certVaultStatus = statuses.get(certificate.serviceId);

    return certVaultStatus ? { ...certificate, certVaultStatus } : certificate;
  });
}

router.get("/tls-certificates", async (req, res) => {
  const certificates = await tlsCertificateService.getAll(req.query.refresh === "true");

  res.json(await withCertVaultStatus(certificates));
});

router.get("/services/:id/tls-certificate", async (req, res) => {
  const certificate = await tlsCertificateService.getForService(
    req.params.id,
    req.query.refresh === "true",
  );

  if (!certificate) return res.status(404).json({ error: "Service has no HTTPS endpoint" });

  res.json((await withCertVaultStatus([certificate]))[0]);
});

export default router;
