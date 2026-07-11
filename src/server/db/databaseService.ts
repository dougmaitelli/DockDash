import Database from "better-sqlite3";
import SqliteStoreFactory from "better-sqlite3-session-store";
import { asc, desc, eq, getTableColumns, lt, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { alias } from "drizzle-orm/sqlite-core";
import session from "express-session";
import path from "path";
import { v4 as uuidv4 } from "uuid";

import type {
  DashboardData,
  HealthBucket,
  ResourceBucket,
  Service,
  ServiceLink,
  ServiceMetadata,
  ServicePosition,
  ServiceStatusItem,
} from "@shared";
import { ServiceLinkType, ServiceStatus } from "@shared";
import type {
  CreateLinkRequest,
  CreateServiceRequest,
  PositionUpdate,
  UpdateLinkRequest,
  UpdateServiceRequest,
} from "@shared/api";

import {
  serviceHealthHistory,
  serviceLinks,
  servicePositions,
  serviceResourceHistory,
  services,
} from "./schema/index.js";

const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");
const MS_PER_DAY = 86_400_000;

export class DatabaseService {
  private static instance: DatabaseService | null = null;
  private readonly orm: ReturnType<typeof drizzle>;
  private readonly sqlite: Database.Database;

  constructor() {
    if (DatabaseService.instance) {
      throw new Error("DatabaseService is a singleton — use the exported db instance");
    }

    this.sqlite = new Database(process.env.DB_PATH || path.join(process.cwd(), "dockdash.db"));

    this.sqlite.pragma("journal_mode = WAL");
    this.sqlite.pragma("foreign_keys = ON");

    this.orm = drizzle(this.sqlite);

    migrate(this.orm, { migrationsFolder: MIGRATIONS_FOLDER });

    DatabaseService.instance = this;
  }

  createSessionStore(): session.Store {
    const SqliteStore = SqliteStoreFactory(session);

    return new SqliteStore({ client: this.sqlite });
  }

  saveService(data: CreateServiceRequest): Service {
    const now = new Date().toISOString();

    const service: Service = {
      id: uuidv4(),
      name: data.name,
      host: data.host,
      ports: data.ports ?? [],
      checkPort: data.checkPort,
      source: data.source,
      status: ServiceStatus.UNKNOWN,
      metadata: data.metadata,
      createdAt: now,
      updatedAt: now,
    };

    this.orm.insert(services).values(service).run();

    return service;
  }

  updateService(id: string, data: UpdateServiceRequest): Service {
    if (!this.getService(id)) throw new Error("Service not found");

    this.orm
      .update(services)
      .set({
        name: data.name,
        host: data.host,
        ports: data.ports === null ? [] : data.ports,
        checkPort: data.checkPort,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(services.id, id))
      .run();

    return this.getService(id)!;
  }

  updateServiceMetadata(id: string, patch: Partial<ServiceMetadata>): void {
    const service = this.getService(id);

    if (!service) return;

    this.orm
      .update(services)
      .set({
        metadata: { ...(service.metadata ?? {}), ...patch },
        updatedAt: new Date().toISOString(),
      })
      .where(eq(services.id, id))
      .run();
  }

  updateServiceStatus(id: string, status: ServiceStatus): void {
    this.orm
      .update(services)
      .set({ status, updatedAt: new Date().toISOString() })
      .where(eq(services.id, id))
      .run();
  }

  getServices(): Service[] {
    const onDashboardIds = new Set(
      this.orm
        .select({ serviceId: servicePositions.serviceId })
        .from(servicePositions)
        .all()
        .map((r) => r.serviceId),
    );

    return this.orm
      .select()
      .from(services)
      .orderBy(asc(services.name))
      .all()
      .map((s) => ({ ...s, onDashboard: onDashboardIds.has(s.id) }));
  }

  getService(id: string): Service | undefined {
    const row = this.orm.select().from(services).where(eq(services.id, id)).get();

    return row ?? undefined;
  }

  deleteService(id: string): void {
    this.orm.delete(services).where(eq(services.id, id)).run();
  }

  saveServicePosition(position: PositionUpdate): void {
    this.orm
      .insert(servicePositions)
      .values({
        serviceId: position.serviceId,
        x: position.x ?? 0,
        y: position.y ?? 0,
        parentId: position.parentId ?? null,
        w: position.w ?? null,
        h: position.h ?? null,
      })
      .onConflictDoUpdate({
        target: servicePositions.serviceId,
        set: {
          x: position.x,
          y: position.y,
          parentId: position.parentId,
          w: position.w,
          h: position.h,
        },
      })
      .run();
  }

  // Adds a service to the dashboard by creating a default position. No-op if
  // the service already has one (preserves existing coords).
  addServiceToDashboard(serviceId: string): void {
    this.orm
      .insert(servicePositions)
      .values({ serviceId, x: 0, y: 0, parentId: null, w: null, h: null })
      .onConflictDoNothing()
      .run();
  }

  removeServiceFromDashboard(serviceId: string): void {
    this.orm.delete(servicePositions).where(eq(servicePositions.serviceId, serviceId)).run();
  }

  getServicePositions(): ServicePosition[] {
    return this.orm
      .select()
      .from(servicePositions)
      .all()
      .map((p) => ({
        ...p,
        parentId: p.parentId ?? undefined,
        w: p.w ?? undefined,
        h: p.h ?? undefined,
      }));
  }

  getLinks(): ServiceLink[] {
    const source = alias(services, "source_svc");
    const target = alias(services, "target_svc");

    return this.orm
      .select({
        ...getTableColumns(serviceLinks),
        sourceName: source.name,
        targetName: target.name,
      })
      .from(serviceLinks)
      .innerJoin(source, eq(serviceLinks.sourceId, source.id))
      .innerJoin(target, eq(serviceLinks.targetId, target.id))
      .orderBy(desc(serviceLinks.createdAt))
      .all()
      .map((row) => ({
        ...row,
        label: row.label ?? undefined,
        description: row.description ?? undefined,
        targetPort: row.targetPort ?? undefined,
      }));
  }

  saveLink(data: CreateLinkRequest): ServiceLink {
    const link = {
      id: uuidv4(),
      sourceId: data.sourceId,
      targetId: data.targetId,
      type: data.type ?? ServiceLinkType.COMMUNICATION,
      label: data.label,
      description: data.description,
      targetPort: data.targetPort,
      protocol: data.protocol,
    };

    const result = this.orm.insert(serviceLinks).values(link).onConflictDoNothing().run();

    if (result.changes === 0) {
      throw new Error("A link between these two services already exists");
    }

    return link;
  }

  updateLink(id: string, data: UpdateLinkRequest): ServiceLink {
    const result = this.orm
      .update(serviceLinks)
      .set({
        label: data.label,
        type: data.type,
        description: data.description,
        targetPort: data.targetPort,
        protocol: data.protocol,
      })
      .where(eq(serviceLinks.id, id))
      .run();

    if (result.changes === 0) throw new Error("Link not found");

    const row = this.orm.select().from(serviceLinks).where(eq(serviceLinks.id, id)).get()!;

    return {
      ...row,
      label: row.label ?? undefined,
      description: row.description ?? undefined,
      targetPort: row.targetPort ?? undefined,
    };
  }

  deleteLink(id: string): void {
    this.orm.delete(serviceLinks).where(eq(serviceLinks.id, id)).run();
  }

  getLinksForService(serviceId: string): ServiceLink[] {
    return this.orm
      .select()
      .from(serviceLinks)
      .where(or(eq(serviceLinks.sourceId, serviceId), eq(serviceLinks.targetId, serviceId)))
      .orderBy(desc(serviceLinks.createdAt))
      .all()
      .map((row) => ({
        ...row,
        label: row.label ?? undefined,
        description: row.description ?? undefined,
        targetPort: row.targetPort ?? undefined,
      }));
  }

  getDashboardData(): DashboardData {
    const positionMap = new Map(this.getServicePositions().map((p) => [p.serviceId, p]));
    const links = this.getLinks();

    // Only services explicitly added to the dashboard (i.e. that have a position) are returned.
    return {
      services: this.getServices()
        .filter((s) => positionMap.has(s.id ?? ""))
        .map((service) => ({ ...service, position: positionMap.get(service.id ?? "") ?? null })),
      links,
    };
  }

  getServiceStatuses(): ServiceStatusItem[] {
    return this.orm
      .select({ id: services.id, status: services.status, metadata: services.metadata })
      .from(services)
      .all()
      .map((row) => ({
        id: row.id,
        status: row.status,
        metadata: {
          imageTag: row.metadata?.imageTag,
          hasUpdate: row.metadata?.hasUpdate,
          latestVersion: row.metadata?.latestVersion,
        },
      }));
  }

  addHealthHistory(serviceId: string, status: ServiceStatus): void {
    this.orm
      .insert(serviceHealthHistory)
      .values({ id: uuidv4(), serviceId, status, checkedAt: new Date().toISOString() })
      .run();
  }

  addResourceStatsHistory(serviceId: string, cpuPercent: number, memoryPercent: number): void {
    this.orm
      .insert(serviceResourceHistory)
      .values({
        id: uuidv4(),
        serviceId,
        cpuPercent,
        memoryPercent,
        checkedAt: new Date().toISOString(),
      })
      .run();
  }

  getHealthHistory(serviceId: string, days: number, bucketCount: number): HealthBucket[] {
    const rangeMs = days * MS_PER_DAY;
    const cutoff = new Date(Date.now() - rangeMs).toISOString();
    const rows = this.orm
      .select({ status: serviceHealthHistory.status, checkedAt: serviceHealthHistory.checkedAt })
      .from(serviceHealthHistory)
      .where(
        sql`${serviceHealthHistory.serviceId} = ${serviceId} AND ${serviceHealthHistory.checkedAt} >= ${cutoff}`,
      )
      .orderBy(asc(serviceHealthHistory.checkedAt))
      .all();

    const now = Date.now();
    const start = now - rangeMs;
    const bucketMs = rangeMs / bucketCount;

    const seen: Set<string>[] = Array.from({ length: bucketCount }, () => new Set<string>());

    for (const row of rows) {
      const t = new Date(row.checkedAt).getTime();
      const idx = Math.min(Math.floor((t - start) / bucketMs), bucketCount - 1);

      if (idx >= 0) seen[idx].add(row.status);
    }

    return seen.map((s) => {
      if (s.size === 0) return null;

      const hasUp = s.has(ServiceStatus.UP);
      const hasDown = s.has(ServiceStatus.DOWN);

      if (hasUp && hasDown) return "mixed";

      if (hasDown) return ServiceStatus.DOWN;

      if (s.has(ServiceStatus.UNKNOWN)) return ServiceStatus.UNKNOWN;

      return ServiceStatus.UP;
    });
  }

  getResourceHistory(serviceId: string, days: number, bucketCount: number): ResourceBucket[] {
    const rangeMs = days * MS_PER_DAY;
    const cutoff = new Date(Date.now() - rangeMs).toISOString();
    const rows = this.orm
      .select({
        cpuPercent: serviceResourceHistory.cpuPercent,
        memoryPercent: serviceResourceHistory.memoryPercent,
        checkedAt: serviceResourceHistory.checkedAt,
      })
      .from(serviceResourceHistory)
      .where(
        sql`${serviceResourceHistory.serviceId} = ${serviceId} AND ${serviceResourceHistory.checkedAt} >= ${cutoff}`,
      )
      .orderBy(asc(serviceResourceHistory.checkedAt))
      .all();

    const now = Date.now();
    const start = now - rangeMs;
    const bucketMs = rangeMs / bucketCount;

    type Sample = { cpu: number; mem: number };
    const buckets: Sample[][] = Array.from({ length: bucketCount }, () => []);

    for (const row of rows) {
      const t = new Date(row.checkedAt).getTime();
      const idx = Math.min(Math.floor((t - start) / bucketMs), bucketCount - 1);

      if (idx >= 0) buckets[idx].push({ cpu: row.cpuPercent, mem: row.memoryPercent });
    }

    return buckets.map((samples) => {
      if (samples.length === 0) return null;

      const cpuPercent = samples.reduce((s, r) => s + r.cpu, 0) / samples.length;
      const memoryPercent = samples.reduce((s, r) => s + r.mem, 0) / samples.length;

      return {
        cpuPercent: Math.round(cpuPercent * 10) / 10,
        memoryPercent: Math.round(memoryPercent * 10) / 10,
      };
    });
  }

  cleanOldHistory(ttlDays: number): number {
    const cutoff = new Date(Date.now() - ttlDays * MS_PER_DAY).toISOString();

    const health = this.orm
      .delete(serviceHealthHistory)
      .where(lt(serviceHealthHistory.checkedAt, cutoff))
      .run();

    const resource = this.orm
      .delete(serviceResourceHistory)
      .where(lt(serviceResourceHistory.checkedAt, cutoff))
      .run();

    return health.changes + resource.changes;
  }
}

export let db: DatabaseService = new DatabaseService();

export function overrideDatabase(instance: DatabaseService): void {
  db = instance;
}
