import { describe, expect, it } from "vitest";

import type { Service } from "@shared";
import { ServiceSource, ServiceStatus } from "@shared";

import { getIconUrls, getServiceIconNames, normalizeIconName } from "../../lib/serviceIcons";

function service(overrides: Partial<Service>): Service {
  return {
    id: "service-id",
    name: "Service",
    host: "10.0.0.1",
    ports: [],
    source: ServiceSource.NETWORK,
    status: ServiceStatus.UP,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("service icon resolution", () => {
  it("normalizes container images and known aliases", () => {
    expect(normalizeIconName("ghcr.io/home-assistant/home-assistant-core:2026.8")).toBe(
      "home-assistant",
    );
    expect(normalizeIconName("postgres:17-alpine")).toBe("postgresql");
  });

  it("uses image metadata before a Docker display name", () => {
    const names = getServiceIconNames(
      service({
        source: ServiceSource.DOCKER,
        name: "media-prod-1",
        metadata: { image: "lscr.io/linuxserver/jellyfin:latest" },
      }),
    );

    expect(names[0]).toBe("jellyfin");
  });

  it("never infers an icon for network services", () => {
    expect(
      getServiceIconNames(
        service({ name: "Grafana", source: ServiceSource.NETWORK, ports: [3000] }),
      ),
    ).toEqual([]);
  });

  it("infers an icon for Kubernetes services from the image", () => {
    const names = getServiceIconNames(
      service({
        source: ServiceSource.KUBERNETES,
        name: "media-pod",
        metadata: { image: "docker.io/grafana/grafana:latest" },
      }),
    );

    expect(names[0]).toBe("grafana");
  });

  it("generates both icon collections and theme variants", () => {
    const urls = getIconUrls(["grafana"], true);

    expect(urls).toContain(
      "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/grafana.svg",
    );
    expect(urls).toContain("https://cdn.jsdelivr.net/gh/selfhst/icons/svg/grafana-light.svg");
  });
});
