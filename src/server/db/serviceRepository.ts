import { asc, desc, eq, getTableColumns, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { v4 as uuidv4 } from "uuid";

import type {
  DashboardData,
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

import { orm } from "./connection.js";
import {
  serviceLinks,
  servicePositions,
  serviceResourceHistory,
  services,
} from "./schema/index.js";

export class ServiceRepository {
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

    orm.insert(services).values(service).run();

    return service;
  }

  updateService(id: string, data: UpdateServiceRequest): Service {
    if (!this.getService(id)) throw new Error("Service not found");

    orm
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

    orm
      .update(services)
      .set({
        metadata: { ...(service.metadata ?? {}), ...patch },
        updatedAt: new Date().toISOString(),
      })
      .where(eq(services.id, id))
      .run();
  }

  updateServiceStatus(id: string, status: ServiceStatus): void {
    orm
      .update(services)
      .set({ status, updatedAt: new Date().toISOString() })
      .where(eq(services.id, id))
      .run();
  }

  getServices(): Service[] {
    const onDashboardIds = new Set(
      orm
        .select({ serviceId: servicePositions.serviceId })
        .from(servicePositions)
        .all()
        .map((r) => r.serviceId),
    );

    return orm
      .select()
      .from(services)
      .orderBy(asc(services.name))
      .all()
      .map((s) => ({ ...s, onDashboard: onDashboardIds.has(s.id) }));
  }

  getService(id: string): Service | undefined {
    const row = orm.select().from(services).where(eq(services.id, id)).get();

    return row ?? undefined;
  }

  deleteService(id: string): void {
    orm.delete(services).where(eq(services.id, id)).run();
  }

  saveServicePosition(position: PositionUpdate): void {
    orm
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
    orm
      .insert(servicePositions)
      .values({ serviceId, x: 0, y: 0, parentId: null, w: null, h: null })
      .onConflictDoNothing()
      .run();
  }

  removeServiceFromDashboard(serviceId: string): void {
    orm.delete(servicePositions).where(eq(servicePositions.serviceId, serviceId)).run();
  }

  getServicePositions(): ServicePosition[] {
    return orm
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

    return orm
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

    const result = orm.insert(serviceLinks).values(link).onConflictDoNothing().run();

    if (result.changes === 0) {
      throw new Error("A link between these two services already exists");
    }

    return link;
  }

  updateLink(id: string, data: UpdateLinkRequest): ServiceLink {
    const result = orm
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

    const row = orm.select().from(serviceLinks).where(eq(serviceLinks.id, id)).get()!;

    return {
      ...row,
      label: row.label ?? undefined,
      description: row.description ?? undefined,
      targetPort: row.targetPort ?? undefined,
    };
  }

  deleteLink(id: string): void {
    orm.delete(serviceLinks).where(eq(serviceLinks.id, id)).run();
  }

  getLinksForService(serviceId: string): ServiceLink[] {
    return orm
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

  getServiceStatuses(includeResources = false): ServiceStatusItem[] {
    const resourceMap = includeResources ? this.getLatestResourceMap() : new Map();

    return orm
      .select({ id: services.id, status: services.status, metadata: services.metadata })
      .from(services)
      .all()
      .map((row) => {
        const res = resourceMap.get(row.id);

        return {
          id: row.id,
          status: row.status,
          metadata: {
            imageTag: row.metadata?.imageTag,
            hasUpdate: row.metadata?.hasUpdate,
            latestVersion: row.metadata?.latestVersion,
          },
          ...(res && { cpuPercent: res.cpuPercent, memoryPercent: res.memoryPercent }),
        };
      });
  }

  private getLatestResourceMap(): Map<string, { cpuPercent: number; memoryPercent: number }> {
    const rows = orm
      .select({
        serviceId: serviceResourceHistory.serviceId,
        cpuPercent: serviceResourceHistory.cpuPercent,
        memoryPercent: serviceResourceHistory.memoryPercent,
      })
      .from(serviceResourceHistory)
      .where(
        sql`${serviceResourceHistory.checkedAt} = (
          SELECT MAX(checked_at) FROM service_resource_history r2
          WHERE r2.service_id = ${serviceResourceHistory.serviceId}
        )`,
      )
      .all();

    return new Map(rows.map((r) => [r.serviceId, r]));
  }
}

export const serviceRepository = new ServiceRepository();
