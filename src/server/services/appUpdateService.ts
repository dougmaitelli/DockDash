import axios from "axios";

import { config } from "../lib/config.js";
import { TagParser } from "../lib/tagParser.js";

const GITHUB_API = "https://api.github.com";

interface UpdateCheckResult {
  hasUpdate: boolean;
  latestVersion: string;
  releaseUrl: string;
}

class AppUpdateService {
  private cached: UpdateCheckResult | null = null;
  private lastCheckAt = 0;

  private authHeaders(): Record<string, string> {
    return config.githubToken ? { Authorization: `Bearer ${config.githubToken}` } : {};
  }

  async check(): Promise<UpdateCheckResult | null> {
    if (!config.appRepo || config.appVersion === "dev") return null;

    const now = Date.now();

    if (this.cached && now - this.lastCheckAt < config.updateCheckInterval) {
      return this.cached;
    }

    try {
      const { data } = await axios.get(`${GITHUB_API}/repos/${config.appRepo}/releases/latest`, {
        headers: this.authHeaders(),
      });

      const latestTag = data.tag_name as string;
      const releaseUrl = data.html_url as string;
      const currentParsed = TagParser.extractSemVer(config.appVersion);
      const latestParsed = TagParser.extractSemVer(latestTag);

      if (!currentParsed || !latestParsed) return null;

      const hasUpdate = TagParser.compareSemVer(latestParsed.parts, currentParsed.parts) > 0;

      this.cached = { hasUpdate, latestVersion: latestTag, releaseUrl };
      this.lastCheckAt = now;

      return this.cached;
    } catch {
      return null;
    }
  }
}

export const appUpdateService = new AppUpdateService();
