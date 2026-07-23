import { z } from "zod";

import type { ClientSchemaConfig } from "./configSchema.js";
import type { Service } from "./Service.js";
import type { ServiceWithPosition } from "./ServiceWithPosition.js";
import type { DashboardData, ServiceLink, ServicePosition, ServiceStatusItem } from "./types.js";
import { ServiceLinkType, ServiceProtocol, ServiceSource, ServiceStatus } from "./types.js";

export const serviceMetadataResponseSchema = z
  .object({
    dockerHostId: z.string().optional(),
    containerId: z.string().optional(),
    containerName: z.string().optional(),
    networkNames: z.array(z.string()).optional(),
    image: z.string().optional(),
    imageTag: z.string().optional(),
    imageDigest: z.string().optional(),
    hasUpdate: z.boolean().optional(),
    latestVersion: z.string().optional(),
    updateCheckedAt: z.string().optional(),
  })
  .strip();

export const serviceResponseSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    host: z.string(),
    ports: z.array(z.number().int()),
    checkPort: z.number().int().nullable().optional(),
    source: z.enum(ServiceSource),
    status: z.enum(ServiceStatus),
    metadata: serviceMetadataResponseSchema.optional(),
    onDashboard: z.boolean().optional(),
    cpuPercent: z.number().optional(),
    memoryPercent: z.number().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strip() satisfies z.ZodType<Service>;

export const servicePositionResponseSchema = z
  .object({
    serviceId: z.string(),
    x: z.number(),
    y: z.number(),
    parentId: z.string().optional(),
    w: z.number().optional(),
    h: z.number().optional(),
  })
  .strip() satisfies z.ZodType<ServicePosition>;

export const serviceWithPositionResponseSchema = serviceResponseSchema.extend({
  position: servicePositionResponseSchema.nullable(),
}) satisfies z.ZodType<ServiceWithPosition>;

export const serviceLinkResponseSchema = z
  .object({
    id: z.string(),
    sourceId: z.string(),
    sourceName: z.string().optional(),
    targetId: z.string(),
    targetName: z.string().optional(),
    type: z.enum(ServiceLinkType),
    label: z.string().optional(),
    description: z.string().optional(),
    targetPort: z.number().int().optional(),
    protocol: z.enum(ServiceProtocol).nullable().optional(),
    createdAt: z.string().optional(),
  })
  .strip() satisfies z.ZodType<ServiceLink>;

export const dashboardDataResponseSchema = z
  .object({
    services: z.array(serviceWithPositionResponseSchema),
    links: z.array(serviceLinkResponseSchema),
  })
  .strip() satisfies z.ZodType<DashboardData>;

export const serviceStatusResponseSchema = z
  .object({
    id: z.string(),
    status: z.enum(ServiceStatus),
    metadata: serviceMetadataResponseSchema.partial().optional(),
    cpuPercent: z.number().optional(),
    memoryPercent: z.number().optional(),
  })
  .strip() satisfies z.ZodType<ServiceStatusItem>;

export const healthHistoryResponseSchema = z.array(
  z.union([z.enum(ServiceStatus), z.literal("mixed"), z.null()]),
);

export const resourceHistoryResponseSchema = z.array(
  z.object({ cpuPercent: z.number(), memoryPercent: z.number() }).strip().nullable(),
);

export const dockerHostHealthResponseSchema = z.array(
  z
    .object({
      host: z.string(),
      connected: z.boolean(),
      containers: z.number().int().optional(),
      containersRunning: z.number().int().optional(),
      containersPaused: z.number().int().optional(),
      containersStopped: z.number().int().optional(),
      serverVersion: z.string().optional(),
      error: z.string().optional(),
    })
    .strip(),
);

export const sseScanDoneResponseSchema = z
  .object({ count: z.number().int().nonnegative() })
  .strip();
export const sseScanErrorResponseSchema = z.object({ message: z.string() }).strip();

export const apiSuccessResponseSchema = z.object({ success: z.boolean() }).strip();

export const savePositionsResponseSchema = z
  .object({ positions: z.array(servicePositionResponseSchema) })
  .strip();

export const checkAllServicesResponseSchema = z
  .object({ status: z.string(), message: z.string() })
  .strip();

export const containerStatsResponseSchema = z
  .object({
    cpuPercent: z.number(),
    memoryUsed: z.number(),
    memoryLimit: z.number(),
    memoryPercent: z.number(),
    networkRx: z.number(),
    networkTx: z.number(),
    blockRead: z.number(),
    blockWrite: z.number(),
  })
  .strip();

export const changelogReleaseResponseSchema = z
  .object({
    version: z.string(),
    publishedAt: z.string(),
    body: z.string(),
    htmlUrl: z.string(),
  })
  .strip();

export const changelogResponseSchema = z.discriminatedUnion("available", [
  z.object({ available: z.literal(true), release: changelogReleaseResponseSchema }).strip(),
  z.object({ available: z.literal(false), reason: z.string() }).strip(),
]);

export const appUpdateResponseSchema = z
  .object({ hasUpdate: z.boolean(), release: changelogReleaseResponseSchema.optional() })
  .strip();

export const filesResponseSchema = z
  .object({
    path: z.string(),
    entries: z.array(
      z
        .object({
          name: z.string(),
          type: z.enum(["directory", "file", "symlink", "other"]),
          size: z.number(),
          permissions: z.string(),
          modified: z.string(),
        })
        .strip(),
    ),
  })
  .strip();

export const fileContentResponseSchema = z
  .object({ path: z.string(), content: z.string() })
  .strip();

export const dashboardConfigResponseSchema = z
  .object({
    version: z.string(),
    appriseConfigured: z.boolean(),
    dockerHosts: z.array(z.string()),
    networkCidrs: z.array(z.string()),
    healthCheckInterval: z.number(),
    resourceMonitorInterval: z.number(),
    updateCheckInterval: z.number(),
    containerControlsEnabled: z.boolean(),
    healthHistoryEnabled: z.boolean(),
    healthHistoryTtlDays: z.number(),
    resourceMonitorEnabled: z.boolean(),
    cpuSpikeThreshold: z.number(),
    memorySpikeThreshold: z.number(),
    spikeDurationThreshold: z.number(),
    fileExplorerEnabled: z.boolean(),
    terminalEnabled: z.boolean(),
  })
  .strip() satisfies z.ZodType<
  { version: string; appriseConfigured: boolean } & ClientSchemaConfig
>;

export const authStateResponseSchema = z
  .object({
    enabled: z.boolean(),
    user: z
      .object({
        sub: z.string(),
        name: z.string().optional(),
        email: z.string().optional(),
        picture: z.string().optional(),
      })
      .strip()
      .nullable(),
  })
  .strip();

export const authLogoutResponseSchema = z.object({ ok: z.literal(true) }).strip();

export const sseTerminalSessionResponseSchema = z.object({ sessionId: z.string() }).strip();

export type ApiSuccess = z.infer<typeof apiSuccessResponseSchema>;
export type AppUpdateInfo = z.infer<typeof appUpdateResponseSchema>;
export type AuthStateResponse = z.infer<typeof authStateResponseSchema>;
export type ChangelogRelease = z.infer<typeof changelogReleaseResponseSchema>;
export type ChangelogResponse = z.infer<typeof changelogResponseSchema>;
export type CheckAllServicesResponse = z.infer<typeof checkAllServicesResponseSchema>;
export type ContainerStats = z.infer<typeof containerStatsResponseSchema>;
export type DashboardConfig = z.infer<typeof dashboardConfigResponseSchema>;
export type DockerHostHealth = z.infer<typeof dockerHostHealthResponseSchema>[number];
export type FileContentResponse = z.infer<typeof fileContentResponseSchema>;
export type FilesResponse = z.infer<typeof filesResponseSchema>;
export type FileEntry = FilesResponse["entries"][number];
export type HealthBucket = z.infer<typeof healthHistoryResponseSchema>[number];
export type ResourceBucket = z.infer<typeof resourceHistoryResponseSchema>[number];
export type SavePositionsResponse = z.infer<typeof savePositionsResponseSchema>;
export type SseScanDonePayload = z.infer<typeof sseScanDoneResponseSchema>;
export type SseScanErrorPayload = z.infer<typeof sseScanErrorResponseSchema>;
export type SseTerminalSessionPayload = z.infer<typeof sseTerminalSessionResponseSchema>;
