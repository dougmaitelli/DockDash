import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";
import type {
  ServicePosition,
  Service,
  ServiceLink,
  DashboardData,
  ServiceStatusItem,
  ServiceStatus,
} from "@shared";

const rootDir = process.cwd();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class DatabaseService {
  private db: Database.Database;

  constructor() {
    const dbPath = process.env.DB_PATH || path.join(rootDir, "dockdash.db");

    this.db = new Database(dbPath);

    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");

    const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf-8");

    this.db.exec(schema);
  }

  upsertService(service: Service): Service {
    const id = service.id || uuidv4();
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO services (id, name, host, ports, check_port, protocol, source, status, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        host = excluded.host,
        ports = excluded.ports,
        check_port = excluded.check_port,
        protocol = excluded.protocol,
        status = excluded.status,
        metadata = excluded.metadata,
        updated_at = excluded.updated_at
    `);

    stmt.run(
      id,
      service.name,
      service.host,
      JSON.stringify(service.ports ?? []),
      service.checkPort,
      service.protocol,
      service.source,
      service.status,
      JSON.stringify(service.metadata),
      now,
      now,
    );

    return { ...service, id, created_at: now, updated_at: now };
  }

  updateService(
    id: string,
    data: { name?: string; host?: string; ports?: number[]; checkPort?: number; protocol?: string },
  ): Service {
    const existing = this.getService(id);

    if (!existing) throw new Error("Service not found");

    const now = new Date().toISOString();
    const name = data.name ?? existing.name;
    const host = data.host ?? existing.host;
    const ports = data.ports ?? existing.ports;
    const checkPort = data.checkPort !== undefined ? data.checkPort : existing.checkPort;
    const protocol = data.protocol ?? existing.protocol;

    this.db
      .prepare(`UPDATE services SET name = ?, host = ?, ports = ?, check_port = ?, protocol = ?, updated_at = ? WHERE id = ?`)
      .run(name, host, JSON.stringify(ports), checkPort, protocol, now, id);

    return this.getService(id)!;
  }

  updateServiceMetadata(
    id: string,
    patch: Record<string, string | number | boolean | string[] | number[]>,
  ): void {
    const service = this.getService(id);

    if (!service) return;

    const merged = { ...(service.metadata ?? {}), ...patch };
    const now = new Date().toISOString();

    this.db
      .prepare(`UPDATE services SET metadata = ?, updated_at = ? WHERE id = ?`)
      .run(JSON.stringify(merged), now, id);
  }

  updateServiceStatus(id: string, status: ServiceStatus, lastChecked?: string): void {
    const now = lastChecked || new Date().toISOString();

    this.db
      .prepare(
        `
      UPDATE services SET status = ?, updated_at = ? WHERE id = ?
    `,
      )
      .run(status, now, id);
  }

  getServices(): Service[] {
    const stmt = this.db.prepare("SELECT * FROM services ORDER BY name");
    const rows = stmt.all() as Service[];

    return rows.map((row) => ({
      ...row,
      ports: typeof row.ports === "string" ? JSON.parse(row.ports) : (row.ports ?? []),
      checkPort: (row as any).check_port,
      metadata: typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata,
    }));
  }

  getService(id: string): Service | undefined {
    const stmt = this.db.prepare("SELECT * FROM services WHERE id = ?");
    const row = stmt.get(id) as Service;

    if (!row) return undefined;

    return {
      ...row,
      ports: typeof row.ports === "string" ? JSON.parse(row.ports) : (row.ports ?? []),
      checkPort: (row as any).check_port,
      metadata: typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata,
    };
  }

  deleteService(id: string): void {
    this.db.prepare("DELETE FROM services WHERE id = ?").run(id);
    this.db.prepare("DELETE FROM service_positions WHERE service_id = ?").run(id);
  }

  saveServicePosition(serviceId: string, x: number, y: number, parentId?: string | null): void {
    this.db
      .prepare(
        `
      INSERT INTO service_positions (service_id, x, y, parent_id) VALUES (?, ?, ?, ?)
      ON CONFLICT(service_id) DO UPDATE SET x = excluded.x, y = excluded.y, parent_id = excluded.parent_id
    `,
      )
      .run(serviceId, x, y, parentId ?? null);
  }

  getServicePositions(): ServicePosition[] {
    const stmt = this.db.prepare("SELECT * FROM service_positions");

    return stmt.all() as ServicePosition[];
  }

  getLinks(): ServiceLink[] {
    const stmt = this.db.prepare(`
      SELECT sl.*,
        s1.name as source_name, s1.host as source_host,
        s2.name as target_name, s2.host as target_host
      FROM service_links sl
      JOIN services s1 ON sl.source_id = s1.id
      JOIN services s2 ON sl.target_id = s2.id
      ORDER BY sl.created_at DESC
    `);

    return (stmt.all() as any[]).map((row) => ({ ...row, targetPort: row.target_port ?? null }));
  }

  saveLink(link: Omit<ServiceLink, "id" | "created_at">): ServiceLink {
    const id = uuidv4();
    const now = new Date().toISOString();

    const result = this.db
      .prepare(
        `INSERT OR IGNORE INTO service_links (id, source_id, target_id, label, type, description, target_port, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, link.source_id, link.target_id, link.label, link.type, link.description, link.targetPort ?? null, now);

    if (result.changes === 0) {
      throw new Error("A link between these two services already exists");
    }

    return { ...link, id, created_at: now };
  }

  updateLink(id: string, data: Pick<ServiceLink, "label" | "type" | "description" | "targetPort">): ServiceLink {
    const result = this.db
      .prepare(`UPDATE service_links SET label = ?, type = ?, description = ?, target_port = ? WHERE id = ?`)
      .run(data.label, data.type, data.description, data.targetPort ?? null, id);

    if (result.changes === 0) {
      throw new Error("Link not found");
    }

    const row = this.db.prepare("SELECT * FROM service_links WHERE id = ?").get(id) as any;

    return { ...row, targetPort: row.target_port ?? null };
  }

  deleteLink(id: string): void {
    this.db.prepare("DELETE FROM service_links WHERE id = ?").run(id);
  }

  getLinksForService(serviceId: string): ServiceLink[] {
    const stmt = this.db.prepare(`
      SELECT * FROM service_links WHERE source_id = ? OR target_id = ? ORDER BY created_at DESC
    `);

    return stmt.all(serviceId, serviceId) as ServiceLink[];
  }

  getDashboardData(): DashboardData {
    const services = this.getServices();
    const rawPositions = this.getServicePositions();
    const positionMap = new Map(rawPositions.map((p) => [p.service_id, p]));
    const links = this.getLinks();

    return {
      services: services.map((service) => ({
        ...service,
        position: positionMap.get(service.id ?? "") ?? null,
      })),
      links,
    };
  }

  getServiceStatuses(): ServiceStatusItem[] {
    const stmt = this.db.prepare("SELECT id, status FROM services");

    return stmt.all() as ServiceStatusItem[];
  }
}

export const db = new DatabaseService();
