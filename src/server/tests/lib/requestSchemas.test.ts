import { describe, expect, it } from "vitest";

import {
  createLinkRequestSchema,
  createServiceRequestSchema,
  fileContentRequestSchema,
  savePositionsRequestSchema,
  terminalInputRequestSchema,
  updateServiceRequestSchema,
} from "@shared/requestSchemas.js";

describe("request schemas", () => {
  it("accepts and normalizes a valid service request", () => {
    const result = createServiceRequestSchema.parse({
      name: "  Frigate  ",
      host: "  192.168.1.10  ",
      ports: [5000],
    });

    expect(result).toMatchObject({ name: "Frigate", host: "192.168.1.10", ports: [5000] });
  });

  it.each([
    [{ name: "Frigate", host: "host", ports: [0] }, createServiceRequestSchema],
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
