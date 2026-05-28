import type { ServicePosition } from "./shared.js";

// ---------------------------------------------------------------------------
// SSE event names — used by both the server (emitter) and client (listener)
// ---------------------------------------------------------------------------

export const SSE_EVENT = {
  DONE: "done",
  SCAN_ERROR: "scan-error",
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
// GET /api/config
// ---------------------------------------------------------------------------

export interface DashboardConfig {
  dockerHosts: string[];
  networkCidrs: string[];
  scanPorts: number[];
  refreshInterval: number;
  healthCheckInterval: number;
}

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

export interface SavePositionsRequest {
  positions: ServicePosition[];
}

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
