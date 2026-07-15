import { Router } from "express";

import { ServiceLinkType, ServiceProtocol } from "@shared";
import type { ApiSuccess, CreateLinkRequest, UpdateLinkRequest } from "@shared/api";

import { serviceRepository } from "../db/serviceRepository.js";
import { isNonEmptyString, isValidEnumValue } from "../lib/validate.js";

const router = Router();

router.post("/links", (req, res) => {
  const { sourceId, targetId, label, type, description, targetPort, protocol } =
    req.body as CreateLinkRequest;

  if (!isNonEmptyString(sourceId)) {
    return res.status(400).json({ error: "sourceId is required" });
  }

  if (!isNonEmptyString(targetId)) {
    return res.status(400).json({ error: "targetId is required" });
  }

  if (sourceId === targetId) {
    return res.status(400).json({ error: "source and target cannot be the same" });
  }

  if (protocol != null && !isValidEnumValue(ServiceProtocol, protocol)) {
    return res.status(400).json({ error: "invalid protocol" });
  }

  try {
    const link = serviceRepository.saveLink({
      sourceId,
      targetId,
      label: label || "",
      type: type || ServiceLinkType.COMMUNICATION,
      description: description || "",
      targetPort: targetPort != null ? Number(targetPort) : undefined,
      protocol: protocol || undefined,
    });

    res.status(201).json(link);
  } catch (err) {
    res.status(409).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.put("/links/:id", (req, res) => {
  const { label, type, description, targetPort, protocol } = req.body as UpdateLinkRequest;

  if (type !== undefined && !isValidEnumValue(ServiceLinkType, type)) {
    return res.status(400).json({ error: "invalid type" });
  }

  if (protocol != null && !isValidEnumValue(ServiceProtocol, protocol)) {
    return res.status(400).json({ error: "invalid protocol" });
  }

  try {
    const link = serviceRepository.updateLink(req.params.id, {
      label,
      type,
      description,
      targetPort: targetPort != null ? Number(targetPort) : targetPort,
      protocol,
    });

    res.json(link);
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.delete("/links/:id", (req, res) => {
  serviceRepository.deleteLink(req.params.id);

  const response: ApiSuccess = { success: true };

  res.json(response);
});

export default router;
