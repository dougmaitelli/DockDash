import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq, or, asc, desc, getTableColumns } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";
import { services, serviceLinks, servicePositions } from "./schema/index.js";
import type {
  ServicePosition,
  Service,
  ServiceLink,
  DashboardData,
  ServiceStatusItem,
  ServiceStatus,
} from "@shared";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_FOLDER = path.join(__dirname, "../../../drizzle");

// Map Drizzle row → Service (camelCase timestamps → snake_case to match the shared interface)
function toService(row: typeof services.$inferSelect): Service {
  return {
    ...row,
    ports: row.ports ?? [],
    metadata: row.metadata ?? undefined,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  } as unknown as Service;
}

// Map Drizzle row → ServicePosition
function toPosition(row: typeof servicePositions.$inferSelect): ServicePosition {
  return { service_id: row.serviceId, x: row.x, y: row.y, parent_id: row.parentId };
}

// Map Drizzle row → ServiceLink
function toLink(
  row: typeof serviceLinks.$inferSelect & {
    source_name?: string | null;
    target_name?: string | null;
  },
): ServiceLink {
  return {
    id: row.id,
    source_id: row.sourceId,
    source_name: row.source_name ?? undefined,
    target_id: row.targetId,
    target_name: row.target_name ?? undefined,
    label: row.label ?? "",
    type: row.type as ServiceLink["type"],
    description: row.description ?? "",
    targetPort: row.targetPort ?? null,
    protocol: (row.protocol as ServiceLink["protocol"]) ?? null,
    created_at: row.createdAt,
  };
}

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

  upsertService(service: Service): Service {
    const id = service.id || uuidv4();
    const now = new Date().toISOString();

    this.orm
      .insert(services)
      .values({
        id,
        name: service.name,
        host: service.host,
        ports: service.ports ?? [],
        checkPort: service.checkPort ?? null,
        source: service.source,
        status: service.status,
        metadata: service.metadata,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: services.id,
        set: {
          name: service.name,
          host: service.host,
          ports: service.ports ?? [],
          checkPort: service.checkPort ?? null,
          status: service.status,
          metadata: service.metadata,
          updatedAt: now,
        },
      })
      .run();

    return { ...service, id, created_at: now, updated_at: now };
  }

  updateService(
    id: string,
    data: { name?: string; host?: string; ports?: number[]; checkPort?: number },
  ): Service {
    const existing = this.getService(id);

    if (!existing) throw new Error("Service not found");

    const now = new Date().toISOString();

    this.orm
      .update(services)
      .set({
        name: data.name ?? existing.name,
        host: data.host ?? existing.host,
        ports: data.ports ?? [],
        checkPort: data.checkPort !== undefined ? data.checkPort : (existing.checkPort ?? null),
        updatedAt: now,
      })
      .where(eq(services.id, id))
      .run();

    return this.getService(id)!;
  }

  updateServiceMetadata(
    id: string,
    patch: Record<string, string | number | boolean | string[] | number[]>,
  ): void {
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
    return this.orm.select().from(services).orderBy(asc(services.name)).all().map(toService);
  }

  getService(id: string): Service | undefined {
    const row = this.orm.select().from(services).where(eq(services.id, id)).get();

    return row ? toService(row) : undefined;
  }

  deleteService(id: string): void {
    this.orm.delete(services).where(eq(services.id, id)).run();
  }

  saveServicePosition(serviceId: string, x: number, y: number, parentId?: string | null): void {
    this.orm
      .insert(servicePositions)
      .values({ serviceId, x, y, parentId: parentId ?? null })
      .onConflictDoUpdate({
        target: servicePositions.serviceId,
        set: { x, y, parentId: parentId ?? null },
      })
      .run();
  }

  getServicePositions(): ServicePosition[] {
    return this.orm.select().from(servicePositions).all().map(toPosition);
  }

  getLinks(): ServiceLink[] {
    const source = alias(services, "source_svc");
    const target = alias(services, "target_svc");

    return this.orm
      .select({
        ...getTableColumns(serviceLinks),
        source_name: source.name,
        target_name: target.name,
      })
      .from(serviceLinks)
      .innerJoin(source, eq(serviceLinks.sourceId, source.id))
      .innerJoin(target, eq(serviceLinks.targetId, target.id))
      .orderBy(desc(serviceLinks.createdAt))
      .all()
      .map(toLink);
  }

  saveLink(link: Omit<ServiceLink, "id" | "created_at">): ServiceLink {
    const id = uuidv4();
    const now = new Date().toISOString();

    const result = this.orm
      .insert(serviceLinks)
      .values({
        id,
        sourceId: link.source_id,
        targetId: link.target_id,
        label: link.label,
        type: link.type,
        description: link.description,
        targetPort: link.targetPort ?? null,
        protocol: link.protocol ?? null,
        createdAt: now,
      })
      .onConflictDoNothing()
      .run();

    if (result.changes === 0) {
      throw new Error("A link between these two services already exists");
    }

    return { ...link, id, created_at: now };
  }

  updateLink(
    id: string,
    data: Pick<ServiceLink, "label" | "type" | "description" | "targetPort" | "protocol">,
  ): ServiceLink {
    const result = this.orm
      .update(serviceLinks)
      .set({
        label: data.label,
        type: data.type,
        description: data.description,
        targetPort: data.targetPort ?? null,
        protocol: data.protocol ?? null,
      })
      .where(eq(serviceLinks.id, id))
      .run();

    if (result.changes === 0) throw new Error("Link not found");

    const row = this.orm.select().from(serviceLinks).where(eq(serviceLinks.id, id)).get()!;

    return toLink(row);
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
      .map(toLink);
  }

  getDashboardData(): DashboardData {
    const allServices = this.getServices();
    const positionMap = new Map(this.getServicePositions().map((p) => [p.service_id, p]));
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
      .select({ id: services.id, status: services.status })
      .from(services)
      .all() as ServiceStatusItem[];
  }
}

export const db = new DatabaseService();
