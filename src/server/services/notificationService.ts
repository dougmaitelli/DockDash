import axios from "axios";

import { config } from "../lib/config.js";
import { APP_NAME } from "../lib/constants.js";
import { logger } from "../lib/logService.js";

export type NotificationType = "info" | "success" | "warning" | "failure";

const RETRY_DELAYS_MS = [1000, 3000];

class NotificationService {
  async notify(title: string, body: string, type: NotificationType = "info"): Promise<void> {
    const url = config.appriseUrl;

    if (!url) return;

    const urls = config.appriseUrls;
    const tags = config.appriseTags;
    const payload = {
      title: `${APP_NAME} — ${title}`,
      body,
      type,
      ...(urls.length > 0 ? { urls } : {}),
      ...(tags.length > 0 ? { tag: tags } : {}),
    };

    for (let attempt = 0; ; attempt++) {
      try {
        await axios.post(url, payload, { timeout: 5000 });

        return;
      } catch (err) {
        const response = axios.isAxiosError(err) ? err.response : undefined;
        const status = response?.status;
        const message = response
          ? `HTTP ${response.status}: ${JSON.stringify(response.data)}`
          : err instanceof Error
            ? err.message
            : String(err);
        // Apprise returns 424 when a downstream notification fails (e.g. Telegram).
        const retryable =
          status === undefined ||
          status === 408 ||
          status === 424 ||
          status === 429 ||
          status >= 500;
        const delay = RETRY_DELAYS_MS[attempt];

        if (!retryable || delay === undefined) {
          logger.error(`Apprise notification failed: ${message}`);
          throw new Error(message);
        }

        logger.warn(
          `Apprise notification attempt ${attempt + 1} failed; retrying in ${delay}ms: ${message}`,
        );
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  get configured(): boolean {
    return config.appriseConfigured;
  }
}

export const notificationService = new NotificationService();
