import axios from "axios";
import { Router } from "express";

import { certVaultService } from "../services/certVaultService.js";
import { tlsCertificateService } from "../services/tlsCertificateService.js";

const router = Router();

function integrationError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    if (err.response) return `CertVault returned HTTP ${err.response.status}`;

    return `Unable to reach CertVault: ${err.message}`;
  }

  return err instanceof Error ? err.message : String(err);
}

router.get("/services/:id/certificates", async (req, res) => {
  try {
    const certificates = await certVaultService.getCertificatesForService(req.params.id);

    if (certificates === null) return res.status(404).json({ error: "Service not found" });

    res.json(certificates);
  } catch (err) {
    res.status(502).json({ error: integrationError(err) });
  }
});

router.get("/tls-certificates", async (req, res) => {
  res.json(await tlsCertificateService.getAll(req.query.refresh === "true"));
});

router.get("/services/:id/tls-certificate", async (req, res) => {
  const certificate = await tlsCertificateService.getForService(
    req.params.id,
    req.query.refresh === "true",
  );

  if (!certificate) return res.status(404).json({ error: "Service has no HTTPS endpoint" });

  res.json(certificate);
});

export default router;
