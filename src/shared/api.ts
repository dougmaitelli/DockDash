import type {
  ServicePosition,
  ServiceSource,
  ServiceMetadata,
  ServiceLinkType,
  ServiceProtocol,
} from "./types.js";

// ---------------------------------------------------------------------------
// SSE event names — used by both the server (emitter) and client (listener)
// ---------------------------------------------------------------------------

export const SSE_EVENT = {
  DONE: "done",
  SCAN_ERROR: "scan-error",
  LOG_ERROR: "log-error",
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
  updateCheckInterval: number;
  appriseConfigured: boolean;
  containerControlsEnabled: boolean;
  fileExplorerEnabled: boolean;
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
// POST /api/services
// ---------------------------------------------------------------------------

export interface CreateServiceRequest {
  name: string;
  host: string;
  ports?: number[];
  checkPort?: number;
  source: ServiceSource;
  metadata?: ServiceMetadata; //TODO: this should be populated by server based on source, not provided by client
}

// ---------------------------------------------------------------------------
// PUT /api/services/:id
// ---------------------------------------------------------------------------

export interface UpdateServiceRequest {
  name?: string;
  host?: string;
  ports?: number[] | null;
  checkPort?: number | null;
}

// ---------------------------------------------------------------------------
// POST /api/links
// ---------------------------------------------------------------------------

export interface CreateLinkRequest {
  sourceId: string;
  targetId: string;
  type?: ServiceLinkType;
  label?: string;
  description?: string;
  targetPort?: number;
  protocol?: ServiceProtocol;
}

// ---------------------------------------------------------------------------
// PUT /api/links/:id
// ---------------------------------------------------------------------------

export interface UpdateLinkRequest {
  type?: ServiceLinkType;
  label?: string | null;
  description?: string | null;
  targetPort?: number | null;
  protocol?: ServiceProtocol | null;
}

// ---------------------------------------------------------------------------
// POST /api/positions
// ---------------------------------------------------------------------------

export interface PositionUpdate {
  serviceId: string;
  x?: number;
  y?: number;
  parentId?: string | null;
  w?: number | null;
  h?: number | null;
}

export interface SavePositionsRequest {
  positions: PositionUpdate[];
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
