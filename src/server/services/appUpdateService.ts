import axios from "axios";

import type { ChangelogRelease } from "@shared";
import type { AppUpdateInfo } from "@shared/responseSchemas.js";

import { config } from "../lib/config.js";
import { TagParser } from "../lib/tagParser.js";

const GITHUB_API = "https://api.github.com";

class AppUpdateService {
  private cached: AppUpdateInfo | null = null;
  private lastCheckAt = 0;

  private authHeaders(): Record<string, string> {
    return config.githubToken ? { Authorization: `Bearer ${config.githubToken}` } : {};
  }

  async check(): Promise<AppUpdateInfo | null> {
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
      const currentParsed = TagParser.extractSemVer(config.appVersion);
      const latestParsed = TagParser.extractSemVer(latestTag);

      if (!currentParsed || !latestParsed) return null;

      const hasUpdate = TagParser.compareSemVer(latestParsed, currentParsed) > 0;
      const release: ChangelogRelease = {
        version: latestTag,
        publishedAt: data.published_at as string,
        body: (data.body as string) ?? "",
        htmlUrl: data.html_url as string,
      };

      this.cached = { hasUpdate, release };
      this.lastCheckAt = now;

      return this.cached;
    } catch {
      return null;
    }
  }
}

export const appUpdateService = new AppUpdateService();
