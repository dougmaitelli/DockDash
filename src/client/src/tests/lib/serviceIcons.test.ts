import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Service } from "@shared";
import { ServiceSource, ServiceStatus } from "@shared";

import {
  getIconUrls,
  getServiceIconNames,
  normalizeIconName,
  resolveServiceIcon,
} from "../../lib/serviceIcons";

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

describe("icon loading", () => {
  const images: Array<{ src: string; onload: (() => void) | null; onerror: (() => void) | null }> =
    [];

  beforeEach(() => {
    vi.useFakeTimers();
    images.length = 0;
    vi.stubGlobal(
      "Image",
      class {
        src = "";
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        constructor() {
          images.push(this);
        }
        removeAttribute() {
          this.src = "";
        }
      },
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("uses a working alternative without waiting for a stalled source", async () => {
    const result = resolveServiceIcon(["race-a", "race-b"]);

    expect(images).toHaveLength(2);
    images[1].onload?.();
    expect(await result).toBe("race-b");
    await vi.runAllTimersAsync();
  });

  it("times out stalled requests and advances to another pair", async () => {
    const result = resolveServiceIcon(["timeout-a", "timeout-b", "timeout-c"]);

    await vi.advanceTimersByTimeAsync(1500);
    expect(images).toHaveLength(3);
    expect(images[0].src).toBe("");
    images[2].onload?.();
    expect(await result).toBe("timeout-c");
  });

  it("shares requests and caches successful images", async () => {
    const first = resolveServiceIcon(["shared"]);
    const second = resolveServiceIcon(["shared"]);

    expect(images).toHaveLength(1);
    images[0].onload?.();
    expect(await first).toBe("shared");
    expect(await second).toBe("shared");
    expect(await resolveServiceIcon(["shared"])).toBe("shared");
    expect(images).toHaveLength(1);
  });

  it("bounds total search time and allows failed sources to be retried later", async () => {
    const urls = Array.from({ length: 20 }, (_, index) => `budget-${index}`);
    const result = resolveServiceIcon(urls);

    await vi.advanceTimersByTimeAsync(6000);
    expect(await result).toBeNull();
    expect(images.length).toBeLessThan(20);
    await vi.advanceTimersByTimeAsync(60_000);
    const retry = resolveServiceIcon([urls[0]]);

    images.at(-1)?.onload?.();
    expect(await retry).toBe(urls[0]);
  });
});
