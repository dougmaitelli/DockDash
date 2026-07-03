import axios from "axios";
import Docker from "dockerode";

import type { Service } from "@shared";
import type { ChangelogRelease, ChangelogResponse } from "@shared";

import { config } from "../lib/config.js";
import { logger } from "../lib/logService.js";
import { TagParser } from "../lib/tagParser.js";
import { dockerService } from "./dockerService.js";

const GITHUB_API = "https://api.github.com";
const OCI_SOURCE_LABEL = "org.opencontainers.image.source";

// In-memory cache: serviceId+tag → result (only successful lookups are cached)
const cache = new Map<string, ChangelogResponse>();

export class ChangelogService {
  private authHeaders(): Record<string, string> {
    return config.githubToken ? { Authorization: `Bearer ${config.githubToken}` } : {};
  }

  private async resolveGithubRepo(service: Service): Promise<string | null> {
    // 1. Try OCI label from running container
    const dockerHostId = service.metadata?.dockerHostId;
    const resolvedHost = dockerHostId ? dockerService.resolveHost(dockerHostId) : undefined;
    const containerId = service.metadata?.containerId;

    if (resolvedHost && containerId) {
      try {
        const docker: Docker = dockerService.createDockerClientForHost(resolvedHost);
        const info = await docker.getContainer(containerId).inspect();
        const imageInfo = await docker.getImage(info.Image).inspect();
        const labels: Record<string, string> = imageInfo.Config?.Labels ?? {};
        const source = labels[OCI_SOURCE_LABEL];

        if (source) {
          const match = /github\.com\/([^/]+\/[^/]+?)(?:\.git)?\/?$/.exec(source);

          if (match) return match[1];

          logger.warn(
            `Changelog: "${service.name}" has OCI source label "${source}" but it is not a recognized GitHub URL`,
          );
        } else {
          logger.warn(
            `Changelog: "${service.name}" image has no ${OCI_SOURCE_LABEL} label — falling back to image name resolution`,
          );
        }
      } catch (err) {
        logger.warn(
          `Changelog: failed to inspect image for "${service.name}" — falling back to image name resolution:`,
          err,
        );
      }
    }

    // 2. GHCR: ghcr.io/owner/repo
    const rawImage = service.metadata?.image;

    if (!rawImage) return null;

    // Strip docker.io / index.docker.io registry prefix before hub matching
    const image = rawImage.replace(/^(?:docker\.io|index\.docker\.io)\//, "");

    const ghcrMatch = /^ghcr\.io\/([^/]+\/[^/]+)/.exec(image);

    if (ghcrMatch) return ghcrMatch[1];

    // 3. Docker Hub owner/image → try as GitHub owner/repo
    const hubMatch = /^([^/]+)\/([^/:]+)$/.exec(image);

    if (hubMatch) return `${hubMatch[1]}/${hubMatch[2]}`;

    return null;
  }

  private async fetchRelease(repo: string, tag: string): Promise<ChangelogRelease | null> {
    const headers = this.authHeaders();
    const seen = new Set<string>();
    const addWithVVariant = (t: string) => {
      seen.add(t);
      seen.add(t.startsWith("v") ? t.slice(1) : `v${t}`);
    };

    addWithVVariant(tag);

    // Also try the bare semver without any prefix/suffix (e.g. "0.17.1-rocm" → "0.17.1")
    const parsed = TagParser.extractSemVer(tag);

    if (parsed && (parsed.prefix || parsed.suffix)) addWithVVariant(parsed.version);

    const candidates = [...seen];

    for (const candidate of candidates) {
      try {
        const { data } = await axios.get(`${GITHUB_API}/repos/${repo}/releases/tags/${candidate}`, {
          headers,
        });

        return {
          version: data.tag_name,
          publishedAt: data.published_at,
          body: data.body ?? "",
          htmlUrl: data.html_url,
        };
      } catch (err) {
        if (axios.isAxiosError(err)) {
          const status = err.response?.status;

          if (status === 403 || status === 429) {
            logger.warn(
              `Changelog: GitHub API rate limit hit for ${repo} (HTTP ${status}). Set GITHUB_TOKEN to increase the limit.`,
            );

            return null;
          }

          if (status !== 404) {
            logger.warn(
              `Changelog: unexpected HTTP ${status} fetching release tag "${candidate}" for ${repo} —`,
              err.message,
            );
          }
        } else {
          logger.warn(`Changelog: error fetching release tag "${candidate}" for ${repo} —`, err);
        }
        // try next candidate
      }
    }

    return null;
  }

  async fetchChangelog(service: Service): Promise<ChangelogResponse> {
    const tag = service.metadata?.hasUpdate
      ? (service.metadata.latestVersion ?? service.metadata.imageTag)
      : service.metadata?.imageTag;

    if (!tag) return { available: false, reason: "No image tag available" };

    const cacheKey = `${service.id}:${tag}`;
    const cached = cache.get(cacheKey);

    if (cached) return cached;

    const repo = await this.resolveGithubRepo(service);

    if (!repo) {
      logger.warn(
        `Changelog: could not resolve GitHub repo for service "${service.name}" (image: ${service.metadata?.image ?? "unknown"})`,
      );

      return { available: false, reason: "Could not resolve GitHub repository" };
    }

    const release = await this.fetchRelease(repo, tag);

    if (!release) {
      return {
        available: false,
        reason: `No release found for tag "${tag}" in ${repo}`,
      };
    }

    const result: ChangelogResponse = { available: true, release };

    cache.set(cacheKey, result);

    return result;
  }
}

export const changelogService = new ChangelogService();
