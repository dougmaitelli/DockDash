import axios from "axios";
import { config } from "../lib/config.js";
import { APP_NAME } from "../lib/constants.js";

export type NotificationType = "info" | "success" | "warning" | "failure";

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

    try {
      await axios.post(url, payload, { timeout: 5000 });
    } catch (err) {
      const message =
        axios.isAxiosError(err) && err.response
          ? `HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}`
          : err instanceof Error
            ? err.message
            : String(err);

      console.error("Apprise notification failed:", message);
      throw new Error(message);
    }
  }

  get configured(): boolean {
    return config.appriseConfigured;
  }
}

export const notificationService = new NotificationService();
