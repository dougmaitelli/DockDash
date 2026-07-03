import type { DatabaseService } from "@server/db/databaseService.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ServiceLinkType, ServiceSource, ServiceStatus } from "@shared";

let db: DatabaseService;

beforeEach(async () => {
  vi.resetModules();
  process.env.DB_PATH = ":memory:";
  db = (await import("@server/db/databaseService.js")).db;
});

afterEach(() => {
  try {
    // Close in-memory database so the next test gets a fresh one
    (db as unknown as { sqlite: { close(): void } }).sqlite.close();
  } catch {}
  delete process.env.DB_PATH;
});

describe("saveService / getService", () => {
  it("saves and retrieves a service", () => {
    const service = db.saveService({
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

    const retrieved = db.getService(service.id!);

    expect(retrieved).toMatchObject({ name: "web-app", host: "192.168.1.10" });
  });

  it("returns undefined for a non-existent ID", () => {
    expect(db.getService("does-not-exist")).toBeUndefined();
  });
});

describe("updateService", () => {
  it("updates name, host, and ports", () => {
    const svc = db.saveService({
      name: "old",
      host: "1.1.1.1",
      ports: [],
      source: ServiceSource.NETWORK,
    });
    const updated = db.updateService(svc.id!, { name: "new", host: "2.2.2.2", ports: [8080] });

    expect(updated.name).toBe("new");
    expect(updated.host).toBe("2.2.2.2");
    expect(updated.ports).toEqual([8080]);

    // Verify the change was persisted — not just returned by the method
    const retrieved = db.getService(svc.id!);

    expect(retrieved).toMatchObject({ name: "new", host: "2.2.2.2", ports: [8080] });
  });

  it("throws when service does not exist", () => {
    expect(() => db.updateService("nonexistent", { name: "x", host: "y", ports: [] })).toThrow(
      "Service not found",
    );
  });
});

describe("updateServiceStatus", () => {
  it("reflects the new status immediately", () => {
    const svc = db.saveService({ name: "s", host: "h", ports: [], source: ServiceSource.NETWORK });

    db.updateServiceStatus(svc.id!, ServiceStatus.UP);
    expect(db.getService(svc.id!)!.status).toBe(ServiceStatus.UP);

    db.updateServiceStatus(svc.id!, ServiceStatus.DOWN);
    expect(db.getService(svc.id!)!.status).toBe(ServiceStatus.DOWN);
  });
});

describe("updateServiceMetadata", () => {
  it("merges patch without overwriting unrelated fields", () => {
    const svc = db.saveService({
      name: "s",
      host: "h",
      ports: [],
      source: ServiceSource.DOCKER,
      metadata: { imageTag: "v1.0", containerName: "my-container" },
    });

    db.updateServiceMetadata(svc.id!, { hasUpdate: true, latestVersion: "v2.0" });

    const result = db.getService(svc.id!)!;

    expect(result.metadata?.imageTag).toBe("v1.0");
    expect(result.metadata?.containerName).toBe("my-container");
    expect(result.metadata?.hasUpdate).toBe(true);
    expect(result.metadata?.latestVersion).toBe("v2.0");
  });

  it("is a no-op for a non-existent service", () => {
    expect(() => db.updateServiceMetadata("nonexistent", { hasUpdate: true })).not.toThrow();
  });
});

describe("deleteService", () => {
  it("removes the service so it can no longer be fetched", () => {
    const svc = db.saveService({ name: "s", host: "h", ports: [], source: ServiceSource.NETWORK });

    db.deleteService(svc.id!);
    expect(db.getService(svc.id!)).toBeUndefined();
  });
});

describe("dashboard membership", () => {
  it("addServiceToDashboard creates a position row at (0, 0)", () => {
    const svc = db.saveService({ name: "s", host: "h", ports: [], source: ServiceSource.NETWORK });

    db.addServiceToDashboard(svc.id!);

    const positions = db.getServicePositions();

    expect(positions.some((p) => p.serviceId === svc.id)).toBe(true);
  });

  it("addServiceToDashboard is idempotent (no error on second call)", () => {
    const svc = db.saveService({ name: "s", host: "h", ports: [], source: ServiceSource.NETWORK });

    db.addServiceToDashboard(svc.id!);
    expect(() => db.addServiceToDashboard(svc.id!)).not.toThrow();
  });

  it("removeServiceFromDashboard deletes the position row", () => {
    const svc = db.saveService({ name: "s", host: "h", ports: [], source: ServiceSource.NETWORK });

    db.addServiceToDashboard(svc.id!);
    db.removeServiceFromDashboard(svc.id!);

    expect(db.getServicePositions().some((p) => p.serviceId === svc.id)).toBe(false);
  });

  it("getServices returns onDashboard:true only for dashboard members", () => {
    const s1 = db.saveService({ name: "a", host: "h1", ports: [], source: ServiceSource.NETWORK });
    const s2 = db.saveService({ name: "b", host: "h2", ports: [], source: ServiceSource.NETWORK });

    db.addServiceToDashboard(s1.id!);

    const all = db.getServices();
    const r1 = all.find((s) => s.id === s1.id);
    const r2 = all.find((s) => s.id === s2.id);

    expect(r1?.onDashboard).toBe(true);
    expect(r2?.onDashboard).toBe(false);
  });
});

describe("links", () => {
  it("saves and retrieves a link between two services", () => {
    const s1 = db.saveService({ name: "a", host: "h1", ports: [], source: ServiceSource.NETWORK });
    const s2 = db.saveService({ name: "b", host: "h2", ports: [], source: ServiceSource.NETWORK });
    const link = db.saveLink({
      sourceId: s1.id!,
      targetId: s2.id!,
      type: ServiceLinkType.COMMUNICATION,
    });

    expect(link.id).toBeDefined();
    expect(db.getLinks().some((l) => l.id === link.id)).toBe(true);
  });

  it("throws when a duplicate link is saved", () => {
    const s1 = db.saveService({ name: "a", host: "h1", ports: [], source: ServiceSource.NETWORK });
    const s2 = db.saveService({ name: "b", host: "h2", ports: [], source: ServiceSource.NETWORK });

    db.saveLink({ sourceId: s1.id!, targetId: s2.id! });
    expect(() => db.saveLink({ sourceId: s1.id!, targetId: s2.id! })).toThrow(
      "A link between these two services already exists",
    );
  });

  it("deleteLink removes the link", () => {
    const s1 = db.saveService({ name: "a", host: "h1", ports: [], source: ServiceSource.NETWORK });
    const s2 = db.saveService({ name: "b", host: "h2", ports: [], source: ServiceSource.NETWORK });
    const link = db.saveLink({ sourceId: s1.id!, targetId: s2.id! });

    db.deleteLink(link.id);
    expect(db.getLinks().some((l) => l.id === link.id)).toBe(false);
  });

  it("getLinksForService returns only the service's own links", () => {
    const s1 = db.saveService({ name: "a", host: "h1", ports: [], source: ServiceSource.NETWORK });
    const s2 = db.saveService({ name: "b", host: "h2", ports: [], source: ServiceSource.NETWORK });
    const s3 = db.saveService({ name: "c", host: "h3", ports: [], source: ServiceSource.NETWORK });

    db.saveLink({ sourceId: s1.id!, targetId: s2.id! });
    db.saveLink({ sourceId: s2.id!, targetId: s3.id! });

    const forS1 = db.getLinksForService(s1.id!);
    const forS3 = db.getLinksForService(s3.id!);

    expect(forS1).toHaveLength(1);
    expect(forS1[0].sourceId).toBe(s1.id);
    expect(forS3).toHaveLength(1);
    expect(forS3[0].targetId).toBe(s3.id);
  });
});

describe("health history", () => {
  it("getHealthHistory returns a non-null bucket after adding history", () => {
    const svc = db.saveService({ name: "s", host: "h", ports: [], source: ServiceSource.NETWORK });

    db.addHealthHistory(svc.id!, ServiceStatus.UP);

    const buckets = db.getHealthHistory(svc.id!, 1, 90);

    expect(buckets.some((b) => b !== null)).toBe(true);
  });

  it("mixed UP and DOWN in the same bucket yields 'mixed'", () => {
    const svc = db.saveService({ name: "s", host: "h", ports: [], source: ServiceSource.NETWORK });

    db.addHealthHistory(svc.id!, ServiceStatus.UP);
    db.addHealthHistory(svc.id!, ServiceStatus.DOWN);

    // Use a single bucket so both records land in it
    const buckets = db.getHealthHistory(svc.id!, 1, 1);

    expect(buckets[0]).toBe("mixed");
  });

  it("cleanOldHistory removes records older than the TTL", async () => {
    const svc = db.saveService({ name: "s", host: "h", ports: [], source: ServiceSource.NETWORK });

    db.addHealthHistory(svc.id!, ServiceStatus.UP);

    // Ensure the record's checkedAt timestamp is strictly before the cutoff (Date.now())
    await new Promise((r) => setTimeout(r, 5));

    const deleted = db.cleanOldHistory(0);

    expect(deleted).toBeGreaterThanOrEqual(1);
  });

  it("cleanOldHistory preserves records within the TTL", () => {
    const svc = db.saveService({ name: "s", host: "h", ports: [], source: ServiceSource.NETWORK });

    db.addHealthHistory(svc.id!, ServiceStatus.UP);

    // 30-day TTL — the record we just added is within the window
    const deleted = db.cleanOldHistory(30);

    expect(deleted).toBe(0);
  });
});

describe("getDashboardData", () => {
  it("includes only services with a position and enriches them with that position", () => {
    const s1 = db.saveService({ name: "a", host: "h1", ports: [], source: ServiceSource.NETWORK });
    const s2 = db.saveService({ name: "b", host: "h2", ports: [], source: ServiceSource.NETWORK });

    db.addServiceToDashboard(s1.id!);

    const data = db.getDashboardData();

    expect(data.services).toHaveLength(1);
    expect(data.services[0].id).toBe(s1.id);
    expect(data.services[0].position).toBeDefined();
    expect(data.services.some((s) => s.id === s2.id)).toBe(false);
  });
});
