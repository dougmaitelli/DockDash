import { z } from "zod";

import { ServiceLinkType, ServiceProtocol, ServiceSource } from "./types.js";

const nonEmptyString = z.string().trim().min(1);
const port = z.number().int().min(1).max(65535);

const serviceMetadataSchema = z
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
  .strict();

export const createServiceRequestSchema = z
  .object({
    name: nonEmptyString,
    host: nonEmptyString,
    ports: z.array(port).optional(),
    checkPort: port.optional(),
    source: z.enum(ServiceSource).optional(),
    metadata: serviceMetadataSchema.optional(),
  })
  .strict();

export const updateServiceRequestSchema = z
  .object({
    name: nonEmptyString.optional(),
    host: nonEmptyString.optional(),
    ports: z.array(port).nullable().optional(),
    checkPort: port.nullable().optional(),
  })
  .strict();

export const createLinkRequestSchema = z
  .object({
    sourceId: nonEmptyString,
    targetId: nonEmptyString,
    type: z.enum(ServiceLinkType).optional(),
    label: z.string().optional(),
    description: z.string().optional(),
    targetPort: port.optional(),
    protocol: z.enum(ServiceProtocol).optional(),
  })
  .strict()
  .refine(({ sourceId, targetId }) => sourceId !== targetId, {
    message: "source and target cannot be the same",
    path: ["targetId"],
  });

export const updateLinkRequestSchema = z
  .object({
    type: z.enum(ServiceLinkType).optional(),
    label: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    targetPort: port.nullable().optional(),
    protocol: z.enum(ServiceProtocol).nullable().optional(),
  })
  .strict();

const positionUpdateSchema = z
  .object({
    serviceId: nonEmptyString,
    x: z.number().finite().optional(),
    y: z.number().finite().optional(),
    parentId: nonEmptyString.nullable().optional(),
    w: z.number().finite().nullable().optional(),
    h: z.number().finite().nullable().optional(),
  })
  .strict();

export const savePositionsRequestSchema = z
  .object({ positions: z.array(positionUpdateSchema) })
  .strict();

export const fileContentRequestSchema = z
  .object({ path: z.string(), content: z.string() })
  .strict();

export const terminalInputRequestSchema = z
  .object({ sessionId: nonEmptyString, data: z.string() })
  .strict();

export type CreateServiceRequest = z.infer<typeof createServiceRequestSchema>;
export type UpdateServiceRequest = z.infer<typeof updateServiceRequestSchema>;
export type CreateLinkRequest = z.infer<typeof createLinkRequestSchema>;
export type UpdateLinkRequest = z.infer<typeof updateLinkRequestSchema>;
export type SavePositionsRequest = z.infer<typeof savePositionsRequestSchema>;
export type PositionUpdate = SavePositionsRequest["positions"][number];
export type TerminalInputRequest = z.infer<typeof terminalInputRequestSchema>;
