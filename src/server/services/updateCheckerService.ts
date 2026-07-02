import { ServiceSource } from "@shared";

import { db } from "../db/databaseService.js";
import { t } from "../i18n/index.js";
import { DOCKER_LATEST_TAG } from "../lib/constants.js";
import { TagParser } from "../lib/tagParser.js";
import { notificationService } from "./notificationService.js";
import { registryClient } from "./registryClient.js";

type Service = ReturnType<typeof db.getServices>[number];

export class UpdateCheckerService {
  async checkAllServicesForUpdates(): Promise<void> {
    const services = db.getServices();
    const dockerServices = services.filter((s) => s.source === ServiceSource.DOCKER);

    const newUpdates: { name: string; currentVersion: string; latestVersion: string }[] = [];

    for (const service of dockerServices) {
      const update = await this.checkServiceForUpdate(service);

      if (update) newUpdates.push(update);
    }

    if (newUpdates.length === 0) return;

    const titleKey =
      newUpdates.length === 1 ? "notifications.updateAvailable" : "notifications.updatesAvailable";
    const title = t(titleKey);

    const body = newUpdates
      .map(
        ({ name, currentVersion, latestVersion }) =>
          `• ${t("notifications.updateEntry", { name, currentVersion, latestVersion })}`,
      )
      .join("\n");

    notificationService.notify(title, body, "warning").catch(() => {});
  }

  private async checkServiceForUpdate(
    service: Service,
  ): Promise<{ name: string; currentVersion: string; latestVersion: string } | null> {
    const image = service.metadata?.image;
    const imageTag = service.metadata?.imageTag;

    if (!image || !imageTag) return null;

    const ref = registryClient.parseImageRef(`${image}:${imageTag}`);

    let hasUpdate = false;
    let currentVersion: string | undefined;
    let latestVersion: string | undefined;

    try {
      if (imageTag === DOCKER_LATEST_TAG) {
        const localDigest = service.metadata?.imageDigest;
        const registryDigest = await registryClient.getManifestDigest(ref);

        if (!localDigest || !registryDigest) return null;

        hasUpdate = localDigest !== registryDigest;

        if (hasUpdate) {
          currentVersion = `${localDigest.slice(7, 19)}…`;
          latestVersion = `${registryDigest.slice(7, 19)}…`;
        }
      } else {
        const parsed = TagParser.extractSemVer(imageTag);

        if (!parsed) return null; // Non-SemVer tag, nothing to compare

        const allTags = await registryClient.getRepositoryTags(ref, parsed.prefix);

        if (allTags.length === 0) return null; // Can't determine — preserve existing status

        let highest = parsed;
        let highestTag: string | undefined;

        for (const tag of allTags) {
          const candidate = TagParser.extractSemVer(tag);

          if (!candidate) continue;

          if (
            !TagParser.prefixMatches(candidate.prefix, parsed.prefix) ||
            candidate.suffix !== parsed.suffix
          )
            continue;

          if (TagParser.compareSemVer(candidate, highest) > 0) {
            highest = candidate;
            highestTag = tag;
          }
        }

        if (highestTag) {
          hasUpdate = true;
          currentVersion = imageTag;
          latestVersion = highestTag;
        }
      }
    } catch (err) {
      console.error(
        `Update check failed for service "${service.name}":`,
        err instanceof Error ? err.message : String(err),
      );

      return null;
    }

    const previousHasUpdate = service.metadata?.hasUpdate;

    db.updateServiceMetadata(service.id!, {
      hasUpdate,
      ...(latestVersion !== undefined ? { latestVersion } : {}),
      updateCheckedAt: new Date().toISOString(),
    });

    if (hasUpdate && !previousHasUpdate && currentVersion && latestVersion) {
      return { name: service.name, currentVersion, latestVersion };
    }

    return null;
  }
}

export const updateCheckerService = new UpdateCheckerService();
