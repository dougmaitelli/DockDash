import { Router } from "express";

import type { ApiSuccess } from "@shared/responseSchemas.js";

import { t } from "../i18n/index.js";
import { config } from "../lib/config.js";
import { APP_NAME } from "../lib/constants.js";
import { notificationService } from "../services/notificationService.js";

const router = Router();

router.post("/notifications/test", async (req, res) => {
  if (!notificationService.configured) {
    return res.status(400).json({ error: "Apprise not configured" });
  }

  try {
    const lang = req.acceptsLanguages([config.locale]) || config.locale;

    await notificationService.notify(
      `${APP_NAME} ${t("notifications.testTitle", undefined, lang)}`,
      t("notifications.testBody", undefined, lang),
      "info",
    );
  } catch (err) {
    return res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
  }

  const response: ApiSuccess = { success: true };

  res.json(response);
});

export default router;
