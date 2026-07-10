import crypto from "crypto";
import fs from "fs";

import { logger } from "./logService.js";

import "dotenv/config";

export const DEFAULT_PORT = 3001;
export const DEFAULT_DOCKER_SOCKET = "unix:///var/run/docker.sock";
export const DEFAULT_NETWORK_CIDRS = "192.168.0.0/24";
export const DEFAULT_HEALTH_CHECK_INTERVAL = 30000;
export const DEFAULT_UPDATE_CHECK_INTERVAL = 3_600_000; // 1 hour
export const DEFAULT_HEALTH_HISTORY_TTL_DAYS = 30;
export const DEFAULT_SESSION_MAX_AGE = 8 * 60 * 60 * 1000; // 8 hours
export const DEFAULT_CPU_SPIKE_THRESHOLD = 90;
export const DEFAULT_MEMORY_SPIKE_THRESHOLD = 90;

class Config {
  private _sessionSecret: string | undefined;
  get port(): number {
    return process.env.PORT ? parseInt(process.env.PORT, 10) : DEFAULT_PORT;
  }

  get dockerHosts(): string[] {
    const envHosts = process.env.DOCKER_HOSTS
      ? process.env.DOCKER_HOSTS.split(",")
          .map((h) => h.trim())
          .filter(Boolean)
      : [];

    const socketPath = DEFAULT_DOCKER_SOCKET.replace("unix://", "");
    const socketExists = fs.existsSync(socketPath);

    if (socketExists && !envHosts.includes(DEFAULT_DOCKER_SOCKET)) {
      return [DEFAULT_DOCKER_SOCKET, ...envHosts];
    }

    return envHosts;
  }

  get networkCidrs(): string[] {
    return process.env.NETWORK_CIDRS
      ? process.env.NETWORK_CIDRS.split(",")
      : [DEFAULT_NETWORK_CIDRS];
  }

  get healthCheckInterval(): number {
    return process.env.HEALTH_CHECK_INTERVAL
      ? parseInt(process.env.HEALTH_CHECK_INTERVAL, 10)
      : DEFAULT_HEALTH_CHECK_INTERVAL;
  }

  get updateCheckInterval(): number {
    return process.env.UPDATE_CHECK_INTERVAL
      ? parseInt(process.env.UPDATE_CHECK_INTERVAL, 10)
      : DEFAULT_UPDATE_CHECK_INTERVAL;
  }

  get healthHistoryTtlDays(): number {
    return process.env.HEALTH_HISTORY_TTL_DAYS
      ? parseInt(process.env.HEALTH_HISTORY_TTL_DAYS, 10)
      : DEFAULT_HEALTH_HISTORY_TTL_DAYS;
  }

  get appriseUrl(): string | null {
    return process.env.APPRISE_URL || null;
  }

  get appriseUrls(): string[] {
    return process.env.APPRISE_URLS
      ? process.env.APPRISE_URLS.split(",")
          .map((u) => u.trim())
          .filter(Boolean)
      : [];
  }

  get appriseTags(): string[] {
    return process.env.APPRISE_TAGS
      ? process.env.APPRISE_TAGS.split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : [];
  }

  get appriseConfigured(): boolean {
    return !!this.appriseUrl;
  }

  get githubToken(): string | null {
    return process.env.GITHUB_TOKEN || null;
  }

  get appRepo(): string | null {
    return process.env.APP_REPO || null;
  }

  get containerControlsEnabled(): boolean {
    return process.env.DISABLE_CONTAINER_CONTROLS !== "true";
  }

  get fileExplorerEnabled(): boolean {
    return process.env.DISABLE_FILE_EXPLORER !== "true";
  }

  get terminalEnabled(): boolean {
    return process.env.DISABLE_TERMINAL !== "true";
  }

  get healthHistoryEnabled(): boolean {
    return process.env.DISABLE_HEALTH_HISTORY !== "true";
  }

  get resourceMonitorEnabled(): boolean {
    return process.env.DISABLE_RESOURCE_MONITOR !== "true";
  }

  get cpuSpikeThreshold(): number {
    return process.env.CPU_SPIKE_THRESHOLD
      ? parseInt(process.env.CPU_SPIKE_THRESHOLD, 10)
      : DEFAULT_CPU_SPIKE_THRESHOLD;
  }

  get memorySpikeThreshold(): number {
    return process.env.MEMORY_SPIKE_THRESHOLD
      ? parseInt(process.env.MEMORY_SPIKE_THRESHOLD, 10)
      : DEFAULT_MEMORY_SPIKE_THRESHOLD;
  }

  get locale(): string {
    return process.env.LOCALE || "en";
  }

  get oidcIssuer(): string | null {
    return process.env.OIDC_ISSUER || null;
  }

  get oidcClientId(): string | null {
    return process.env.OIDC_CLIENT_ID || null;
  }

  get oidcClientSecret(): string | null {
    return process.env.OIDC_CLIENT_SECRET || null;
  }

  get oidcRedirectUri(): string | null {
    return process.env.OIDC_REDIRECT_URI || null;
  }

  get oidcScopes(): string {
    return process.env.OIDC_SCOPES || "openid profile email";
  }

  get oidcEnabled(): boolean {
    return !!(this.oidcIssuer && this.oidcClientId && this.oidcClientSecret);
  }

  get appVersion(): string {
    return process.env.APP_VERSION || "dev";
  }

  get trustProxy(): string | boolean {
    return process.env.TRUST_PROXY ?? "loopback, uniquelocal";
  }

  get sessionSecret(): string {
    if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;

    if (!this._sessionSecret) {
      this._sessionSecret = crypto.randomBytes(32).toString("hex");
      logger.warn(
        "\n⚠️  WARNING: SESSION_SECRET is not set. A random secret was generated for this process." +
          " Sessions will be invalidated on every restart. Set SESSION_SECRET in production.\n",
      );
    }

    return this._sessionSecret;
  }

  get secureCookies(): boolean {
    return process.env.NODE_ENV === "production";
  }

  get sessionMaxAge(): number {
    return process.env.SESSION_MAX_AGE
      ? parseInt(process.env.SESSION_MAX_AGE, 10)
      : DEFAULT_SESSION_MAX_AGE;
  }
}

export const config = new Config();
