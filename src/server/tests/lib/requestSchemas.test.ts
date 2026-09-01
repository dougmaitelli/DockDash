import { describe, expect, it } from "vitest";

import {
  createLinkRequestSchema,
  createServiceRequestSchema,
  fileContentRequestSchema,
  savePositionsRequestSchema,
  terminalInputRequestSchema,
  updateServiceRequestSchema,
} from "@shared/requestSchemas.js";
import { SERVICE_LABEL_MAX_COUNT, SERVICE_LABEL_MAX_LENGTH } from "@shared/serviceLabels.js";
import { ServiceProtocol } from "@shared/types.js";

describe("request schemas", () => {
  it("accepts and normalizes a valid service request", () => {
    const result = createServiceRequestSchema.parse({
      name: "  Frigate  ",
      host: "  192.168.1.10  ",
      protocol: ServiceProtocol.HTTPS,
      ports: [5000],
    });

    expect(result).toMatchObject({
      name: "Frigate",
      host: "192.168.1.10",
      protocol: ServiceProtocol.HTTPS,
      ports: [5000],
    });
  });

  it("accepts labels and trims their display names", () => {
    const result = updateServiceRequestSchema.parse({ labels: ["  Production  ", "Backend"] });

    expect(result.labels).toEqual(["Production", "Backend"]);
  });

  it.each([
    { labels: ["Production", "production"] },
    { labels: ["x".repeat(SERVICE_LABEL_MAX_LENGTH + 1)] },
    { labels: Array.from({ length: SERVICE_LABEL_MAX_COUNT + 1 }, (_, index) => `label-${index}`) },
  ])("rejects invalid service labels %#", (input) => {
    expect(updateServiceRequestSchema.safeParse(input).success).toBe(false);
  });

  it.each([
    [{ name: "Frigate", host: "host", ports: [0] }, createServiceRequestSchema],
    [{ name: "Frigate", host: "host", protocol: "tls" }, createServiceRequestSchema],
    [{ name: "Frigate", host: "host", unexpected: true }, createServiceRequestSchema],
    [
      { name: "Frigate", host: "host", metadata: { networkNames: [1] } },
      createServiceRequestSchema,
    ],
    [{ name: 42 }, updateServiceRequestSchema],
    [{ sourceId: "same", targetId: "same" }, createLinkRequestSchema],
    [{ positions: [{ serviceId: "svc", x: "10" }] }, savePositionsRequestSchema],
    [{ path: "/tmp/file" }, fileContentRequestSchema],
    [{ sessionId: "session", data: 1 }, terminalInputRequestSchema],
  ])("rejects malformed request data %#", (input, schema) => {
    expect(schema.safeParse(input).success).toBe(false);
  });
});
