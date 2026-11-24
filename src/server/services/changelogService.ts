import axios from "axios";
import Docker from "dockerode";

import type { Service } from "@shared";
import type { ChangelogRelease, ChangelogResponse } from "@shared";

import { config } from "../lib/config.js";
import { httpErrorSummary } from "../lib/httpRequest.js";
import { logger } from "../lib/logService.js";
import { TagParser } from "../lib/tagParser.js";
import { dockerRuntime } from "./containerRuntime/dockerRuntime.js";
import { REQUEST_TIMEOUT } from "./registry/types.js";

const GITHUB_API = "https://api.github.com";
const RELEASES_PER_PAGE = 100;
const MAX_RELEASE_PAGES = 50;
const OCI_SOURCE_LABEL = "org.opencontainers.image.source";

// In-memory cache scoped to the service, image and requested range.
const cache = new Map<string, ChangelogResponse>();

export class ChangelogService {
  private authHeaders(): Record<string, string> {
    return config.githubToken ? { Authorization: `Bearer ${config.githubToken}` } : {};
  }

  private async resolveGithubRepo(service: Service): Promise<string | null> {
    // 1. Try OCI label from running container
    const dockerHostId = service.metadata?.dockerHostId;
    const resolvedHost = dockerHostId ? dockerRuntime.resolveHost(dockerHostId) : undefined;
    const containerId = service.metadata?.containerId;

    if (resolvedHost && containerId) {
      try {
        const docker: Docker = dockerRuntime.createDockerClientForHost(resolvedHost);
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
          httpErrorSummary(err),
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

  private releaseTagCandidates(tag: string): Set<string> {
    const seen = new Set<string>();
    const addWithVVariant = (t: string) => {
      seen.add(t);
      seen.add(t.startsWith("v") ? t.slice(1) : `v${t}`);
    };

    addWithVVariant(tag);

    // Also try the bare semver without any prefix/suffix (e.g. "0.17.1-rocm" → "0.17.1")
    const parsed = TagParser.extractSemVer(tag);

    if (parsed && (parsed.prefix || parsed.suffix)) addWithVVariant(parsed.version);

    // Fallback: iteratively strip trailing .0 parts and add each shorter form as a candidate.
    // The update checker stores the longest available form, but GitHub releases sometimes
    // only tag shorter forms. Handles multiple levels: "1.2.0.0" → "1.2.0" → "1.2".
    if (parsed) {
      let parts = [...parsed.parts];

      while (parts.length > 2 && parts[parts.length - 1] === 0) {
        parts = parts.slice(0, -1);
        addWithVVariant(parsed.prefix + parts.join(".") + parsed.suffix);
      }
    }

    return seen;
  }

  private async fetchRelease(repo: string, tag: string): Promise<ChangelogRelease | null> {
    const headers = this.authHeaders();
    const candidates = this.releaseTagCandidates(tag);

    for (const candidate of candidates) {
      try {
        const { data } = await axios.get(`${GITHUB_API}/repos/${repo}/releases/tags/${candidate}`, {
          headers,
          timeout: REQUEST_TIMEOUT,
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
              httpErrorSummary(err),
            );
          }
        } else {
          logger.warn(
            `Changelog: error fetching release tag "${candidate}" for ${repo} — ${httpErrorSummary(err)}`,
          );
        }
        // try next candidate
      }
    }

    return null;
  }

  private toRelease(data: Record<string, unknown>): ChangelogRelease {
    return {
      version: String(data.tag_name),
      publishedAt: String(data.published_at),
      body: typeof data.body === "string" ? data.body : "",
      htmlUrl: String(data.html_url),
    };
  }

  private async fetchReleasesBetween(
    repo: string,
    currentTag: string,
    latestTag: string,
  ): Promise<{ releases: ChangelogRelease[]; complete: boolean }> {
    const current = TagParser.extractSemVer(currentTag);
    const latest = TagParser.extractSemVer(latestTag);

    if (!current || !latest) return { releases: [], complete: true };

    let complete = false;

    const releases: ChangelogRelease[] = [];
    const seenVersions = new Set<string>();
    const targetTags = this.releaseTagCandidates(latestTag);

    // GitHub returns releases newest first. Continue until a page is not full so ranges
    // spanning more than one API page still include every intervening release.
    for (let page = 1; page <= MAX_RELEASE_PAGES; page++) {
      try {
        const { data } = await axios.get(`${GITHUB_API}/repos/${repo}/releases`, {
          headers: this.authHeaders(),
          timeout: REQUEST_TIMEOUT,
          params: { per_page: RELEASES_PER_PAGE, page },
        });

        if (!Array.isArray(data)) break;

        const pageReleases: Record<string, unknown>[] = data;

        for (const item of pageReleases) {
          if (item.draft === true) continue;

          const tag = typeof item.tag_name === "string" ? item.tag_name : "";
          const parsed = TagParser.extractSemVer(tag);

          if (!parsed) continue;

          if (TagParser.compareSemVer(parsed, current) <= 0) continue;

          const comparison = TagParser.compareSemVer(parsed, latest);

          if (comparison > 0 || (comparison === 0 && !targetTags.has(tag))) continue;

          // A repository can publish multiple variants for one numeric version. Prefer the
          // first one returned by GitHub and show each version only once.
          const versionKey = parsed.parts.join(".");

          if (seenVersions.has(versionKey)) continue;

          seenVersions.add(versionKey);
          releases.push(this.toRelease(item));
        }

        if (pageReleases.length < RELEASES_PER_PAGE) {
          complete = true;
          break;
        }
      } catch (err) {
        logger.warn(`Changelog: failed to list releases for ${repo} — ${httpErrorSummary(err)}`);
        break;
      }
    }

    return {
      releases: releases.sort((a, b) => TagParser.compareSemVer(b.version, a.version)),
      complete,
    };
  }

  async fetchReleaseUrl(service: Service, tag: string): Promise<string | undefined> {
    const repo = await this.resolveGithubRepo(service);

    if (!repo) return undefined;

    return (await this.fetchRelease(repo, tag))?.htmlUrl;
  }

  async fetchChangelog(service: Service): Promise<ChangelogResponse> {
    const tag = service.metadata?.hasUpdate
      ? (service.metadata.latestVersion ?? service.metadata.imageTag)
      : service.metadata?.imageTag;

    if (!tag) return { available: false, reason: "No image tag available" };

    const cacheKey = JSON.stringify([
      service.id,
      service.metadata?.image,
      service.metadata?.imageTag,
      tag,
    ]);
    const cached = cache.get(cacheKey);

    if (cached) return cached;

    const repo = await this.resolveGithubRepo(service);

    if (!repo) {
      logger.warn(
        `Changelog: could not resolve GitHub repo for service "${service.name}" (image: ${service.metadata?.image ?? "unknown"})`,
      );

      return { available: false, reason: "Could not resolve GitHub repository" };
    }

    let releases: ChangelogRelease[] = [];
    let complete = true;

    if (
      service.metadata?.hasUpdate &&
      service.metadata.imageTag &&
      service.metadata.latestVersion
    ) {
      ({ releases, complete } = await this.fetchReleasesBetween(
        repo,
        service.metadata.imageTag,
        service.metadata.latestVersion,
      ));
    }

    // Preserve exact-tag lookup (including its tag variants) as a fallback for repositories
    // that do not expose a semver-compatible release list.
    if (releases.length === 0) {
      const release = await this.fetchRelease(repo, tag);

      if (release) releases = [release];
    }

    if (releases.length === 0) {
      return {
        available: false,
        reason: `No release found for tag "${tag}" in ${repo}`,
      };
    }

    const targetTags = this.releaseTagCandidates(tag);
    const release = releases.find((entry) => targetTags.has(entry.version));
    const result: ChangelogResponse = { available: true, ...(release && { release }), releases };

    if (complete) cache.set(cacheKey, result);

    return result;
  }
}

export const changelogService = new ChangelogService();
