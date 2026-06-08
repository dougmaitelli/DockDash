import Database from "better-sqlite3";
import { asc, desc, eq, getTableColumns, lt, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { alias } from "drizzle-orm/sqlite-core";
import path from "path";
import { v4 as uuidv4 } from "uuid";

import type {
  DashboardData,
  Service,
  ServiceHealthHistoryItem,
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

import { serviceHealthHistory, serviceLinks, servicePositions, services } from "./schema/index.js";

const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

export class DatabaseService {
  private static instance: DatabaseService | null = null;
  private readonly orm: ReturnType<typeof drizzle>;

  constructor() {
    if (DatabaseService.instance) {
      throw new Error("DatabaseService is a singleton — use the exported db instance");
    }

    const sqlite = new Database(process.env.DB_PATH || path.join(process.cwd(), "dockdash.db"));

    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");

    this.orm = drizzle(sqlite);

    migrate(this.orm, { migrationsFolder: MIGRATIONS_FOLDER });

    DatabaseService.instance = this;
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
    return this.orm.select().from(services).orderBy(asc(services.name)).all();
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
    const allServices = this.getServices();
    const positionMap = new Map(this.getServicePositions().map((p) => [p.serviceId, p]));
    const links = this.getLinks();

    return {
      services: allServices.map((service) => ({
        ...service,
        position: positionMap.get(service.id ?? "") ?? null,
      })),
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
    const now = new Date().toISOString();

    this.orm
      .insert(serviceHealthHistory)
      .values({ id: uuidv4(), serviceId, status, checkedAt: now })
      .run();
  }

  getHealthHistory(serviceId: string, days: number): ServiceHealthHistoryItem[] {
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();

    return this.orm
      .select({ status: serviceHealthHistory.status, checkedAt: serviceHealthHistory.checkedAt })
      .from(serviceHealthHistory)
      .where(
        sql`${serviceHealthHistory.serviceId} = ${serviceId} AND ${serviceHealthHistory.checkedAt} >= ${cutoff}`,
      )
      .orderBy(asc(serviceHealthHistory.checkedAt))
      .all()
      .map((row) => ({ status: row.status, checked_at: row.checkedAt }));
  }

  cleanOldHistory(ttlDays: number): number {
    const cutoff = new Date(Date.now() - ttlDays * 86_400_000).toISOString();

    const result = this.orm
      .delete(serviceHealthHistory)
      .where(lt(serviceHealthHistory.checkedAt, cutoff))
      .run();

    return result.changes;
  }
}

export const db = new DatabaseService();
