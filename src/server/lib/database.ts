import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";
import type {
  ServicePosition,
  DiscoveryStats,
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
      INSERT INTO services (id, name, host, port, protocol, source, status, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        host = excluded.host,
        port = excluded.port,
        protocol = excluded.protocol,
        status = excluded.status,
        metadata = excluded.metadata,
        updated_at = excluded.updated_at
    `);

    stmt.run(
      id,
      service.name,
      service.host,
      service.port,
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
    data: { name?: string; host?: string; port?: number | null; protocol?: string },
  ): Service {
    const existing = this.getService(id);
    if (!existing) throw new Error("Service not found");

    const now = new Date().toISOString();
    const name = data.name ?? existing.name;
    const host = data.host ?? existing.host;
    const port = data.port ?? existing.port;
    const protocol = data.protocol ?? existing.protocol;

    this.db
      .prepare(
        `
      UPDATE services SET name = ?, host = ?, port = ?, protocol = ?, updated_at = ?
      WHERE id = ?
    `,
      )
      .run(name, host, port, protocol, now, id);

    return this.getService(id)!;
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
      metadata: typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata,
    }));
  }

  getService(id: string): Service | undefined {
    const stmt = this.db.prepare("SELECT * FROM services WHERE id = ?");
    const row = stmt.get(id) as Service;

    if (!row) return undefined;

    return {
      ...row,
      metadata: typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata,
    };
  }

  deleteService(id: string): void {
    this.db.prepare("DELETE FROM services WHERE id = ?").run(id);
    this.db.prepare("DELETE FROM service_positions WHERE service_id = ?").run(id);
  }

  saveServicePosition(serviceId: string, x: number, y: number): void {
    this.db
      .prepare(
        `
      INSERT INTO service_positions (service_id, x, y) VALUES (?, ?, ?)
      ON CONFLICT(service_id) DO UPDATE SET x = excluded.x, y = excluded.y
    `,
      )
      .run(serviceId, x, y);
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
    return stmt.all() as ServiceLink[];
  }

  saveLink(link: Omit<ServiceLink, "id" | "created_at">): ServiceLink {
    const id = uuidv4();
    const now = new Date().toISOString();

    const result = this.db
      .prepare(
        `INSERT OR IGNORE INTO service_links (id, source_id, target_id, label, type, description, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, link.source_id, link.target_id, link.label, link.type, link.description, now);

    if (result.changes === 0) {
      throw new Error("A link between these two services already exists");
    }

    return { ...link, id, created_at: now };
  }

  updateLink(id: string, data: Pick<ServiceLink, "label" | "type" | "description">): ServiceLink {
    const result = this.db
      .prepare(`UPDATE service_links SET label = ?, type = ?, description = ? WHERE id = ?`)
      .run(data.label, data.type, data.description, id);

    if (result.changes === 0) {
      throw new Error("Link not found");
    }

    return this.db.prepare("SELECT * FROM service_links WHERE id = ?").get(id) as ServiceLink;
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
    const stats = this.getDiscoveryStats();

    return {
      services: services.map((service) => ({
        ...service,
        position: positionMap.get(service.id ?? "") ?? null,
      })),
      links,
      stats,
    };
  }

  getServiceStatuses(): ServiceStatusItem[] {
    const stmt = this.db.prepare("SELECT id, status FROM services");
    return stmt.all() as ServiceStatusItem[];
  }

  getDiscoveryStats(): DiscoveryStats {
    const docker = this.db
      .prepare("SELECT COUNT(*) as count FROM services WHERE source = 'docker'")
      .get() as { count: number };
    const network = this.db
      .prepare("SELECT COUNT(*) as count FROM services WHERE source = 'network'")
      .get() as { count: number };
    const up = this.db
      .prepare("SELECT COUNT(*) as count FROM services WHERE status = 'up'")
      .get() as { count: number };
    const total = this.db.prepare("SELECT COUNT(*) as count FROM services").get() as {
      count: number;
    };
    const totalLinks = this.db.prepare("SELECT COUNT(*) as count FROM service_links").get() as {
      count: number;
    };
    return {
      docker: docker.count,
      network: network.count,
      up: up.count,
      total: total.count,
      totalLinks: totalLinks.count,
    };
  }
}

export const db = new DatabaseService();
