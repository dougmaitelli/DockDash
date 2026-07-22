import { Router } from "express";

import { ServiceLinkType } from "@shared";
import {
  type CreateLinkRequest,
  createLinkRequestSchema,
  type UpdateLinkRequest,
  updateLinkRequestSchema,
} from "@shared/requestSchemas.js";
import type { ApiSuccess } from "@shared/responseSchemas.js";

import { serviceRepository } from "../db/serviceRepository.js";
import { validateBody } from "../middleware/validateRequest.js";

const router = Router();

router.post("/links", validateBody(createLinkRequestSchema), (req, res) => {
  const { sourceId, targetId, label, type, description, targetPort, protocol } =
    req.body as CreateLinkRequest;

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

router.put("/links/:id", validateBody(updateLinkRequestSchema), (req, res) => {
  const { label, type, description, targetPort, protocol } = req.body as UpdateLinkRequest;

  try {
    const link = serviceRepository.updateLink(String(req.params.id), {
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
