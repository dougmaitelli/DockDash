import { ServiceSource } from "@shared";

import { serviceRepository } from "../db/serviceRepository.js";
import { t } from "../i18n/index.js";
import { DOCKER_LATEST_TAG } from "../lib/constants.js";
import { logger } from "../lib/logService.js";
import { TagParser } from "../lib/tagParser.js";
import { ConcurrentService } from "./ConcurrentService.js";
import { notificationService } from "./notificationService.js";
import { registryClient } from "./registryClient.js";

type Service = ReturnType<typeof serviceRepository.getServices>[number];

export class UpdateCheckerService extends ConcurrentService {
  protected readonly concurrencyLimit = 5;

  async checkAllServicesForUpdates(): Promise<void> {
    const services = serviceRepository.getServices();
    const dockerServices = services.filter((s) => s.source === ServiceSource.DOCKER);

    const results = await this.mapWithConcurrency(dockerServices, (service) =>
      this.checkServiceForUpdate(service),
    );
    const newUpdates = results.filter(
      (update): update is { name: string; currentVersion: string; latestVersion: string } =>
        update !== null,
    );

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

    logger.debug(`Update check: checking "${service.name}" (${image}:${imageTag})`);

    const ref = registryClient.parseImageRef(`${image}:${imageTag}`);

    let hasUpdate = false;
    let currentVersion: string | undefined;
    let latestVersion: string | undefined;

    try {
      const parsed = imageTag === DOCKER_LATEST_TAG ? null : TagParser.extractSemVer(imageTag);

      if (parsed) {
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

          const cmp = TagParser.compareSemVer(candidate, highest);

          if (cmp > 0 || (cmp === 0 && candidate.parts.length > highest.parts.length)) {
            highest = candidate;
            highestTag = tag;
          }
        }

        if (highestTag) {
          hasUpdate = true;
          currentVersion = imageTag;
          latestVersion = highestTag;
        }
      } else {
        // Digest comparison for "latest" and non-semver floating tags (e.g. "dev", "stable")
        const localDigest = service.metadata?.imageDigest;
        const registryDigest = await registryClient.getManifestDigest(ref);

        if (!localDigest || !registryDigest) return null;

        hasUpdate = localDigest !== registryDigest;

        if (hasUpdate) {
          currentVersion = `${localDigest.slice(7, 19)}…`;
          latestVersion = `${registryDigest.slice(7, 19)}…`;
        }
      }
    } catch (err) {
      logger.error(
        `Update check failed for service "${service.name}": ${err instanceof Error ? err.message : String(err)}`,
      );

      return null;
    }

    const previousHasUpdate = service.metadata?.hasUpdate;

    serviceRepository.updateServiceMetadata(service.id!, {
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
