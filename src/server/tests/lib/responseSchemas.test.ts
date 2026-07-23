import { describe, expect, it } from "vitest";

import { CONFIG_SCHEMA } from "@shared/configSchema.js";
import {
  dashboardConfigResponseSchema,
  dashboardDataResponseSchema,
  serviceResponseSchema,
  sseScanDoneResponseSchema,
} from "@shared/responseSchemas.js";
import { ServiceSource, ServiceStatus } from "@shared/types.js";

const service = {
  id: "service-1",
  name: "Web",
  host: "web.local",
  ports: [80, 443],
  source: ServiceSource.DOCKER,
  status: ServiceStatus.UP,
  metadata: { containerId: "abc123", image: "example/web:1.0" },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("response schemas", () => {
  it("accepts a valid dashboard response", () => {
    expect(
      dashboardDataResponseSchema.parse({
        services: [{ ...service, position: { serviceId: service.id, x: 10, y: 20 } }],
        links: [],
      }),
    ).toBeDefined();
  });

  it("rejects malformed service responses", () => {
    expect(() => serviceResponseSchema.parse({ ...service, ports: ["80"] })).toThrow();
  });

  it("accepts and ignores additive response fields", () => {
    const parsed = serviceResponseSchema.parse({
      ...service,
      futureServiceField: "value",
      metadata: {
        dockerHost: "unix:///var/run/docker.sock",
        dockerHostId: "host-id",
        containerId: "abc123",
      },
    });

    expect(parsed).not.toHaveProperty("futureServiceField");
    expect(parsed.metadata).toEqual({ dockerHostId: "host-id", containerId: "abc123" });
  });

  it("rejects malformed SSE completion payloads", () => {
    expect(() => sseScanDoneResponseSchema.parse({ count: -1 })).toThrow();
  });

  it("keeps dashboard configuration fields synchronized with the central schema", () => {
    const expectedKeys = [
      "version",
      "appriseConfigured",
      ...Object.entries(CONFIG_SCHEMA)
        .filter(([, entry]) => "showOnUi" in entry && entry.showOnUi)
        .map(([key]) => key),
    ];
    const schemaKeys = Object.keys(dashboardConfigResponseSchema.shape);

    expect(schemaKeys.sort()).toEqual(expectedKeys.sort());
  });
});
