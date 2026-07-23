import type { ServiceRepository } from "@server/db/serviceRepository.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ServiceLinkType, ServiceProtocol, ServiceSource, ServiceStatus } from "@shared";

let svcRepo: ServiceRepository;
let connSqlite: { close(): void };

beforeEach(async () => {
  vi.resetModules();
  process.env.DB_PATH = ":memory:";
  // Import connection first so the in-memory DB is created before the
  // repositories bind to it, then capture the sqlite handle for cleanup.
  const connMod = await import("@server/db/connection.js");

  connSqlite = connMod.sqlite;
  svcRepo = (await import("@server/db/serviceRepository.js")).serviceRepository;
});

afterEach(() => {
  try {
    // Close in-memory database so the next test gets a fresh one
    connSqlite.close();
  } catch {}
  delete process.env.DB_PATH;
});

describe("saveService / getService", () => {
  it("saves and retrieves a service", () => {
    const service = svcRepo.saveService({
      name: "web-app",
      host: "192.168.1.10",
      ports: [80, 443],
      checkPort: 80,
      source: ServiceSource.NETWORK,
    });

    expect(service.id).toBeDefined();
    expect(service.name).toBe("web-app");
    expect(service.host).toBe("192.168.1.10");
    expect(service.ports).toEqual([80, 443]);
    expect(service.status).toBe(ServiceStatus.UNKNOWN);

    const retrieved = svcRepo.getService(service.id!);

    expect(retrieved).toMatchObject({ name: "web-app", host: "192.168.1.10" });
  });

  it("returns undefined for a non-existent ID", () => {
    expect(svcRepo.getService("does-not-exist")).toBeUndefined();
  });
});

describe("updateService", () => {
  it("updates name, host, and ports", () => {
    const svc = svcRepo.saveService({
      name: "old",
      host: "1.1.1.1",
      ports: [],
      source: ServiceSource.NETWORK,
    });
    const updated = svcRepo.updateService(svc.id!, {
      name: "new",
      host: "2.2.2.2",
      ports: [8080],
    });

    expect(updated.name).toBe("new");
    expect(updated.host).toBe("2.2.2.2");
    expect(updated.ports).toEqual([8080]);

    // Verify the change was persisted — not just returned by the method
    const retrieved = svcRepo.getService(svc.id!);

    expect(retrieved).toMatchObject({ name: "new", host: "2.2.2.2", ports: [8080] });
  });

  it("throws when service does not exist", () => {
    expect(() => svcRepo.updateService("nonexistent", { name: "x", host: "y", ports: [] })).toThrow(
      "Service not found",
    );
  });
});

describe("updateServiceStatus", () => {
  it("reflects the new status immediately", () => {
    const svc = svcRepo.saveService({
      name: "s",
      host: "h",
      ports: [],
      source: ServiceSource.NETWORK,
    });

    svcRepo.updateServiceStatus(svc.id!, ServiceStatus.UP);
    expect(svcRepo.getService(svc.id!)!.status).toBe(ServiceStatus.UP);

    svcRepo.updateServiceStatus(svc.id!, ServiceStatus.DOWN);
    expect(svcRepo.getService(svc.id!)!.status).toBe(ServiceStatus.DOWN);
  });
});

describe("updateServiceMetadata", () => {
  it("merges patch without overwriting unrelated fields", () => {
    const svc = svcRepo.saveService({
      name: "s",
      host: "h",
      ports: [],
      source: ServiceSource.DOCKER,
      metadata: { imageTag: "v1.0", containerName: "my-container" },
    });

    svcRepo.updateServiceMetadata(svc.id!, { hasUpdate: true, latestVersion: "v2.0" });

    const result = svcRepo.getService(svc.id!)!;

    expect(result.metadata?.imageTag).toBe("v1.0");
    expect(result.metadata?.containerName).toBe("my-container");
    expect(result.metadata?.hasUpdate).toBe(true);
    expect(result.metadata?.latestVersion).toBe("v2.0");
  });

  it("is a no-op for a non-existent service", () => {
    expect(() => svcRepo.updateServiceMetadata("nonexistent", { hasUpdate: true })).not.toThrow();
  });
});

describe("deleteService", () => {
  it("removes the service so it can no longer be fetched", () => {
    const svc = svcRepo.saveService({
      name: "s",
      host: "h",
      ports: [],
      source: ServiceSource.NETWORK,
    });

    svcRepo.deleteService(svc.id!);
    expect(svcRepo.getService(svc.id!)).toBeUndefined();
  });
});

describe("dashboard membership", () => {
  it("saveServicePosition applies defaults and updates an existing position", () => {
    const svc = svcRepo.saveService({
      name: "s",
      host: "h",
      ports: [],
      source: ServiceSource.NETWORK,
    });

    svcRepo.saveServicePosition({ serviceId: svc.id! });
    expect(svcRepo.getServicePositions()).toEqual([
      { serviceId: svc.id, x: 0, y: 0, parentId: undefined, w: undefined, h: undefined },
    ]);

    svcRepo.saveServicePosition({ serviceId: svc.id!, x: 25, y: 40, w: 320, h: 180 });
    expect(svcRepo.getServicePositions()).toEqual([
      { serviceId: svc.id, x: 25, y: 40, parentId: undefined, w: 320, h: 180 },
    ]);
  });

  it("addServiceToDashboard creates a position row at (0, 0)", () => {
    const svc = svcRepo.saveService({
      name: "s",
      host: "h",
      ports: [],
      source: ServiceSource.NETWORK,
    });

    svcRepo.addServiceToDashboard(svc.id!);

    const positions = svcRepo.getServicePositions();

    expect(positions.some((p) => p.serviceId === svc.id)).toBe(true);
  });

  it("addServiceToDashboard is idempotent (no error on second call)", () => {
    const svc = svcRepo.saveService({
      name: "s",
      host: "h",
      ports: [],
      source: ServiceSource.NETWORK,
    });

    svcRepo.addServiceToDashboard(svc.id!);
    expect(() => svcRepo.addServiceToDashboard(svc.id!)).not.toThrow();
  });

  it("removeServiceFromDashboard deletes the position row", () => {
    const svc = svcRepo.saveService({
      name: "s",
      host: "h",
      ports: [],
      source: ServiceSource.NETWORK,
    });

    svcRepo.addServiceToDashboard(svc.id!);
    svcRepo.removeServiceFromDashboard(svc.id!);

    expect(svcRepo.getServicePositions().some((p) => p.serviceId === svc.id)).toBe(false);
  });

  it("getServices returns onDashboard:true only for dashboard members", () => {
    const s1 = svcRepo.saveService({
      name: "a",
      host: "h1",
      ports: [],
      source: ServiceSource.NETWORK,
    });
    const s2 = svcRepo.saveService({
      name: "b",
      host: "h2",
      ports: [],
      source: ServiceSource.NETWORK,
    });

    svcRepo.addServiceToDashboard(s1.id!);

    const all = svcRepo.getServices();
    const r1 = all.find((s) => s.id === s1.id);
    const r2 = all.find((s) => s.id === s2.id);

    expect(r1?.onDashboard).toBe(true);
    expect(r2?.onDashboard).toBe(false);
  });
});

describe("links", () => {
  it("uses the communication type by default", () => {
    const s1 = svcRepo.saveService({
      name: "a",
      host: "h1",
      ports: [],
      source: ServiceSource.NETWORK,
    });
    const s2 = svcRepo.saveService({
      name: "b",
      host: "h2",
      ports: [],
      source: ServiceSource.NETWORK,
    });

    const link = svcRepo.saveLink({ sourceId: s1.id!, targetId: s2.id! });

    expect(link.type).toBe(ServiceLinkType.COMMUNICATION);
  });

  it("saves and retrieves a link between two services", () => {
    const s1 = svcRepo.saveService({
      name: "a",
      host: "h1",
      ports: [],
      source: ServiceSource.NETWORK,
    });
    const s2 = svcRepo.saveService({
      name: "b",
      host: "h2",
      ports: [],
      source: ServiceSource.NETWORK,
    });
    const link = svcRepo.saveLink({
      sourceId: s1.id!,
      targetId: s2.id!,
      type: ServiceLinkType.COMMUNICATION,
    });

    expect(link.id).toBeDefined();
    expect(svcRepo.getLinks().some((l) => l.id === link.id)).toBe(true);
  });

  it("throws when a duplicate link is saved", () => {
    const s1 = svcRepo.saveService({
      name: "a",
      host: "h1",
      ports: [],
      source: ServiceSource.NETWORK,
    });
    const s2 = svcRepo.saveService({
      name: "b",
      host: "h2",
      ports: [],
      source: ServiceSource.NETWORK,
    });

    svcRepo.saveLink({ sourceId: s1.id!, targetId: s2.id! });
    expect(() => svcRepo.saveLink({ sourceId: s1.id!, targetId: s2.id! })).toThrow(
      "A link between these two services already exists",
    );
  });

  it("deleteLink removes the link", () => {
    const s1 = svcRepo.saveService({
      name: "a",
      host: "h1",
      ports: [],
      source: ServiceSource.NETWORK,
    });
    const s2 = svcRepo.saveService({
      name: "b",
      host: "h2",
      ports: [],
      source: ServiceSource.NETWORK,
    });
    const link = svcRepo.saveLink({ sourceId: s1.id!, targetId: s2.id! });

    svcRepo.deleteLink(link.id);
    expect(svcRepo.getLinks().some((l) => l.id === link.id)).toBe(false);
  });

  it("updates link fields and normalizes cleared nullable values", () => {
    const s1 = svcRepo.saveService({
      name: "a",
      host: "h1",
      ports: [],
      source: ServiceSource.NETWORK,
    });
    const s2 = svcRepo.saveService({
      name: "b",
      host: "h2",
      ports: [],
      source: ServiceSource.NETWORK,
    });
    const link = svcRepo.saveLink({
      sourceId: s1.id!,
      targetId: s2.id!,
      label: "old",
      description: "old description",
      targetPort: 80,
      protocol: ServiceProtocol.HTTP,
    });

    const updated = svcRepo.updateLink(link.id, {
      label: null,
      description: null,
      targetPort: null,
      protocol: null,
      type: ServiceLinkType.DEPENDENCY,
    });

    expect(updated).toMatchObject({
      type: ServiceLinkType.DEPENDENCY,
      label: undefined,
      description: undefined,
      targetPort: undefined,
      protocol: null,
    });
  });

  it("throws when updating a missing link", () => {
    expect(() => svcRepo.updateLink("missing", { label: "new" })).toThrow("Link not found");
  });

  it("getLinksForService returns only the service's own links", () => {
    const s1 = svcRepo.saveService({
      name: "a",
      host: "h1",
      ports: [],
      source: ServiceSource.NETWORK,
    });
    const s2 = svcRepo.saveService({
      name: "b",
      host: "h2",
      ports: [],
      source: ServiceSource.NETWORK,
    });
    const s3 = svcRepo.saveService({
      name: "c",
      host: "h3",
      ports: [],
      source: ServiceSource.NETWORK,
    });

    svcRepo.saveLink({ sourceId: s1.id!, targetId: s2.id! });
    svcRepo.saveLink({ sourceId: s2.id!, targetId: s3.id! });

    const forS1 = svcRepo.getLinksForService(s1.id!);
    const forS3 = svcRepo.getLinksForService(s3.id!);

    expect(forS1).toHaveLength(1);
    expect(forS1[0].sourceId).toBe(s1.id);
    expect(forS3).toHaveLength(1);
    expect(forS3[0].targetId).toBe(s3.id);
  });
});

describe("getServiceStatuses", () => {
  it("returns id, status, and metadata for all services", () => {
    const svc = svcRepo.saveService({
      name: "s",
      host: "h",
      ports: [],
      source: ServiceSource.DOCKER,
      metadata: { imageTag: "v1.0", hasUpdate: true, latestVersion: "v2.0" },
    });

    svcRepo.updateServiceStatus(svc.id!, ServiceStatus.UP);

    const [status] = svcRepo.getServiceStatuses();

    expect(status.id).toBe(svc.id);
    expect(status.status).toBe(ServiceStatus.UP);
    expect(status.metadata?.imageTag).toBe("v1.0");
    expect(status.metadata?.hasUpdate).toBe(true);
    expect(status.metadata?.latestVersion).toBe("v2.0");
  });

  it("projects only status-relevant metadata", () => {
    svcRepo.saveService({
      name: "s",
      host: "h",
      ports: [],
      source: ServiceSource.DOCKER,
      metadata: {
        containerId: "container-id",
        imageTag: "v1",
        hasUpdate: false,
        latestVersion: "v1",
      },
    });

    const [status] = svcRepo.getServiceStatuses();

    expect(status.metadata).toEqual({
      imageTag: "v1",
      hasUpdate: false,
      latestVersion: "v1",
    });
    expect(status.metadata).not.toHaveProperty("containerId");
  });
});

describe("getDashboardData", () => {
  it("includes only services with a position and enriches them with that position", () => {
    const s1 = svcRepo.saveService({
      name: "a",
      host: "h1",
      ports: [],
      source: ServiceSource.NETWORK,
    });
    const s2 = svcRepo.saveService({
      name: "b",
      host: "h2",
      ports: [],
      source: ServiceSource.NETWORK,
    });

    svcRepo.addServiceToDashboard(s1.id!);

    const data = svcRepo.getDashboardData();

    expect(data.services).toHaveLength(1);
    expect(data.services[0].id).toBe(s1.id);
    expect(data.services[0].position).toBeDefined();
    expect(data.services.some((s) => s.id === s2.id)).toBe(false);
  });
});
