import type { ClientSchemaConfig } from "./configSchema.js";
import type { ChangelogRelease, ServicePosition } from "./types.js";

// ---------------------------------------------------------------------------
// SSE event names — used by both the server (emitter) and client (listener)
// ---------------------------------------------------------------------------

export const SSE_EVENT = {
  DONE: "done",
  SCAN_ERROR: "scan-error",
  LOG_ERROR: "log-error",
  TERMINAL_SESSION: "terminal-session",
  TERMINAL_ERROR: "terminal-error",
} as const;

// ---------------------------------------------------------------------------
// Common envelopes
// ---------------------------------------------------------------------------

/** Returned by routes that fail with a 4xx / 5xx status. */
export interface ApiError {
  error: string;
}

/** Returned by DELETE endpoints on success. */
export interface ApiSuccess {
  success: boolean;
}

// ---------------------------------------------------------------------------
// GET /api/docker/health
// ---------------------------------------------------------------------------

export interface DockerHostHealth {
  host: string;
  connected: boolean;
  /** Only present when connected is true */
  containers?: number;
  containersRunning?: number;
  containersPaused?: number;
  containersStopped?: number;
  serverVersion?: string;
  /** Only present when connected is false */
  error?: string;
}

// ---------------------------------------------------------------------------
// GET /api/app-update
// ---------------------------------------------------------------------------

export interface AppUpdateInfo {
  hasUpdate: boolean;
  release?: ChangelogRelease;
}

// ---------------------------------------------------------------------------
// GET /api/config
// ---------------------------------------------------------------------------

interface DashboardConfigBase {
  version: string;
  appriseConfigured: boolean;
}

export type DashboardConfig = DashboardConfigBase & ClientSchemaConfig;

// ---------------------------------------------------------------------------
// SSE streams — GET /api/docker/scan/stream  &  /api/network/scan/stream
// Each data frame carries a Service JSON string.
// The terminal frames use these shapes:
// ---------------------------------------------------------------------------

export interface SseScanDonePayload {
  count: number;
}

export interface SseScanErrorPayload {
  message: string;
}

// ---------------------------------------------------------------------------
// POST /api/positions
// ---------------------------------------------------------------------------

export interface SavePositionsResponse {
  positions: ServicePosition[];
}

// ---------------------------------------------------------------------------
// POST /api/checkAllServices
// ---------------------------------------------------------------------------

export interface CheckAllServicesResponse {
  status: string;
  message: string;
}

// ---------------------------------------------------------------------------
// GET /api/services/:id/stats
// ---------------------------------------------------------------------------

export interface ContainerStats {
  cpuPercent: number;
  memoryUsed: number;
  memoryLimit: number;
  memoryPercent: number;
  networkRx: number;
  networkTx: number;
  blockRead: number;
  blockWrite: number;
}

// ---------------------------------------------------------------------------
// GET /api/services/:id/files
// ---------------------------------------------------------------------------

export interface FileEntry {
  name: string;
  type: "directory" | "file" | "symlink" | "other";
  size: number;
  permissions: string;
  modified: string;
}

export interface FilesResponse {
  path: string;
  entries: FileEntry[];
}

// ---------------------------------------------------------------------------
// GET /api/services/:id/files/content
// PUT /api/services/:id/files/content
// ---------------------------------------------------------------------------

export interface FileContentResponse {
  path: string;
  content: string;
}

// ---------------------------------------------------------------------------
// SSE terminal-session event payload
// ---------------------------------------------------------------------------

export interface SseTerminalSessionPayload {
  sessionId: string;
}
