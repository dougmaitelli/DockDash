import { asc, lt, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

import type { HealthBucket, ResourceBucket } from "@shared";
import { ServiceStatus } from "@shared";

import { orm, sqlite } from "./connection.js";
import {
  serviceHealthHistory,
  serviceHealthRollup,
  serviceResourceHistory,
  serviceResourceRollup,
} from "./schema/index.js";

const MS_PER_DAY = 86_400_000;
const ROLLUP_BUCKET_MS = 5 * 60_000; // 5-minute pre-aggregation granularity

export class HistoryRepository {
  rollupHistory(): { health: number; resource: number } {
    const cutoffMs = Math.floor(Date.now() / ROLLUP_BUCKET_MS) * ROLLUP_BUCKET_MS;
    const cutoff = new Date(cutoffMs).toISOString();

    return sqlite.transaction(() => {
      // --- Health rollup ---
      const rawHealth = orm
        .select({
          serviceId: serviceHealthHistory.serviceId,
          status: serviceHealthHistory.status,
          checkedAt: serviceHealthHistory.checkedAt,
        })
        .from(serviceHealthHistory)
        .where(lt(serviceHealthHistory.checkedAt, cutoff))
        .all();

      type HealthAgg = {
        serviceId: string;
        bucketStart: string;
        up: number;
        down: number;
        unknown: number;
      };
      const healthMap = new Map<string, HealthAgg>();

      for (const row of rawHealth) {
        const bMs =
          Math.floor(new Date(row.checkedAt).getTime() / ROLLUP_BUCKET_MS) * ROLLUP_BUCKET_MS;
        const bucketStart = new Date(bMs).toISOString();
        const key = `${row.serviceId}|${bucketStart}`;

        if (!healthMap.has(key)) {
          healthMap.set(key, { serviceId: row.serviceId, bucketStart, up: 0, down: 0, unknown: 0 });
        }

        const b = healthMap.get(key)!;

        if (row.status === ServiceStatus.UP) b.up++;
        else if (row.status === ServiceStatus.DOWN) b.down++;
        else b.unknown++;
      }

      for (const b of healthMap.values()) {
        orm
          .insert(serviceHealthRollup)
          .values({
            id: uuidv4(),
            serviceId: b.serviceId,
            bucketStart: b.bucketStart,
            upCount: b.up,
            downCount: b.down,
            unknownCount: b.unknown,
          })
          .onConflictDoUpdate({
            target: [serviceHealthRollup.serviceId, serviceHealthRollup.bucketStart],
            set: {
              upCount: sql`${serviceHealthRollup.upCount} + excluded.up_count`,
              downCount: sql`${serviceHealthRollup.downCount} + excluded.down_count`,
              unknownCount: sql`${serviceHealthRollup.unknownCount} + excluded.unknown_count`,
            },
          })
          .run();
      }

      const healthDeleted =
        rawHealth.length > 0
          ? orm.delete(serviceHealthHistory).where(lt(serviceHealthHistory.checkedAt, cutoff)).run()
              .changes
          : 0;

      // --- Resource rollup ---
      const rawResource = orm
        .select({
          serviceId: serviceResourceHistory.serviceId,
          cpuPercent: serviceResourceHistory.cpuPercent,
          memoryPercent: serviceResourceHistory.memoryPercent,
          checkedAt: serviceResourceHistory.checkedAt,
        })
        .from(serviceResourceHistory)
        .where(lt(serviceResourceHistory.checkedAt, cutoff))
        .all();

      type ResourceAgg = {
        serviceId: string;
        bucketStart: string;
        cpuSum: number;
        memSum: number;
        count: number;
      };
      const resourceMap = new Map<string, ResourceAgg>();

      for (const row of rawResource) {
        const bMs =
          Math.floor(new Date(row.checkedAt).getTime() / ROLLUP_BUCKET_MS) * ROLLUP_BUCKET_MS;
        const bucketStart = new Date(bMs).toISOString();
        const key = `${row.serviceId}|${bucketStart}`;

        if (!resourceMap.has(key)) {
          resourceMap.set(key, {
            serviceId: row.serviceId,
            bucketStart,
            cpuSum: 0,
            memSum: 0,
            count: 0,
          });
        }

        const b = resourceMap.get(key)!;

        b.cpuSum += row.cpuPercent;
        b.memSum += row.memoryPercent;
        b.count++;
      }

      for (const b of resourceMap.values()) {
        orm
          .insert(serviceResourceRollup)
          .values({
            id: uuidv4(),
            serviceId: b.serviceId,
            bucketStart: b.bucketStart,
            cpuSum: b.cpuSum,
            memSum: b.memSum,
            sampleCount: b.count,
          })
          .onConflictDoUpdate({
            target: [serviceResourceRollup.serviceId, serviceResourceRollup.bucketStart],
            set: {
              cpuSum: sql`${serviceResourceRollup.cpuSum} + excluded.cpu_sum`,
              memSum: sql`${serviceResourceRollup.memSum} + excluded.mem_sum`,
              sampleCount: sql`${serviceResourceRollup.sampleCount} + excluded.sample_count`,
            },
          })
          .run();
      }

      const resourceDeleted =
        rawResource.length > 0
          ? orm
              .delete(serviceResourceHistory)
              .where(lt(serviceResourceHistory.checkedAt, cutoff))
              .run().changes
          : 0;

      return { health: healthDeleted, resource: resourceDeleted };
    })();
  }

  addHealthHistory(serviceId: string, status: ServiceStatus): void {
    orm
      .insert(serviceHealthHistory)
      .values({ id: uuidv4(), serviceId, status, checkedAt: new Date().toISOString() })
      .run();
  }

  addResourceStatsHistory(serviceId: string, cpuPercent: number, memoryPercent: number): void {
    orm
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
    const now = Date.now();
    const start = now - rangeMs;
    const bucketMs = rangeMs / bucketCount;
    const rangeCutoff = new Date(start).toISOString();
    // Boundary between rolled-up data and the live tail (current open bucket)
    const rollupCutoff = new Date(
      Math.floor(now / ROLLUP_BUCKET_MS) * ROLLUP_BUCKET_MS,
    ).toISOString();

    const rollupRows = orm
      .select()
      .from(serviceHealthRollup)
      .where(
        sql`${serviceHealthRollup.serviceId} = ${serviceId}
            AND ${serviceHealthRollup.bucketStart} >= ${rangeCutoff}
            AND ${serviceHealthRollup.bucketStart} < ${rollupCutoff}`,
      )
      .orderBy(asc(serviceHealthRollup.bucketStart))
      .all();

    const rawRows = orm
      .select({ status: serviceHealthHistory.status, checkedAt: serviceHealthHistory.checkedAt })
      .from(serviceHealthHistory)
      .where(
        sql`${serviceHealthHistory.serviceId} = ${serviceId} AND ${serviceHealthHistory.checkedAt} >= ${rangeCutoff}`,
      )
      .orderBy(asc(serviceHealthHistory.checkedAt))
      .all();

    type Flags = { up: boolean; down: boolean; unknown: boolean };
    const seen: Flags[] = Array.from({ length: bucketCount }, () => ({
      up: false,
      down: false,
      unknown: false,
    }));

    for (const row of rollupRows) {
      const t = new Date(row.bucketStart).getTime();
      const idx = Math.min(Math.floor((t - start) / bucketMs), bucketCount - 1);

      if (idx < 0) continue;

      if (row.upCount > 0) seen[idx].up = true;

      if (row.downCount > 0) seen[idx].down = true;

      if (row.unknownCount > 0) seen[idx].unknown = true;
    }

    for (const row of rawRows) {
      const t = new Date(row.checkedAt).getTime();
      const idx = Math.min(Math.floor((t - start) / bucketMs), bucketCount - 1);

      if (idx < 0) continue;

      if (row.status === ServiceStatus.UP) seen[idx].up = true;
      else if (row.status === ServiceStatus.DOWN) seen[idx].down = true;
      else seen[idx].unknown = true;
    }

    return seen.map(({ up, down, unknown }) => {
      if (!up && !down && !unknown) return null;

      if (up && down) return "mixed";

      if (down) return ServiceStatus.DOWN;

      if (unknown) return ServiceStatus.UNKNOWN;

      return ServiceStatus.UP;
    });
  }

  getResourceHistory(serviceId: string, days: number, bucketCount: number): ResourceBucket[] {
    const rangeMs = days * MS_PER_DAY;
    const now = Date.now();
    const start = now - rangeMs;
    const bucketMs = rangeMs / bucketCount;
    const rangeCutoff = new Date(start).toISOString();
    const rollupCutoff = new Date(
      Math.floor(now / ROLLUP_BUCKET_MS) * ROLLUP_BUCKET_MS,
    ).toISOString();

    const rollupRows = orm
      .select()
      .from(serviceResourceRollup)
      .where(
        sql`${serviceResourceRollup.serviceId} = ${serviceId}
            AND ${serviceResourceRollup.bucketStart} >= ${rangeCutoff}
            AND ${serviceResourceRollup.bucketStart} < ${rollupCutoff}`,
      )
      .orderBy(asc(serviceResourceRollup.bucketStart))
      .all();

    const rawRows = orm
      .select({
        cpuPercent: serviceResourceHistory.cpuPercent,
        memoryPercent: serviceResourceHistory.memoryPercent,
        checkedAt: serviceResourceHistory.checkedAt,
      })
      .from(serviceResourceHistory)
      .where(
        sql`${serviceResourceHistory.serviceId} = ${serviceId} AND ${serviceResourceHistory.checkedAt} >= ${rangeCutoff}`,
      )
      .orderBy(asc(serviceResourceHistory.checkedAt))
      .all();

    type BucketData = { cpuSum: number; memSum: number; count: number };
    const buckets: BucketData[] = Array.from({ length: bucketCount }, () => ({
      cpuSum: 0,
      memSum: 0,
      count: 0,
    }));

    for (const row of rollupRows) {
      const t = new Date(row.bucketStart).getTime();
      const idx = Math.min(Math.floor((t - start) / bucketMs), bucketCount - 1);

      if (idx < 0) continue;

      buckets[idx].cpuSum += row.cpuSum;
      buckets[idx].memSum += row.memSum;
      buckets[idx].count += row.sampleCount;
    }

    for (const row of rawRows) {
      const t = new Date(row.checkedAt).getTime();
      const idx = Math.min(Math.floor((t - start) / bucketMs), bucketCount - 1);

      if (idx < 0) continue;

      buckets[idx].cpuSum += row.cpuPercent;
      buckets[idx].memSum += row.memoryPercent;
      buckets[idx].count++;
    }

    return buckets.map(({ cpuSum, memSum, count }) => {
      if (count === 0) return null;

      return {
        cpuPercent: Math.round((cpuSum / count) * 10) / 10,
        memoryPercent: Math.round((memSum / count) * 10) / 10,
      };
    });
  }

  cleanOldHistory(ttlDays: number): number {
    const cutoff = new Date(Date.now() - ttlDays * MS_PER_DAY).toISOString();

    // Raw tables: safety net for records that escaped the rollup job
    const health = orm
      .delete(serviceHealthHistory)
      .where(lt(serviceHealthHistory.checkedAt, cutoff))
      .run();
    const resource = orm
      .delete(serviceResourceHistory)
      .where(lt(serviceResourceHistory.checkedAt, cutoff))
      .run();

    // Rollup tables: TTL by bucket_start
    const healthRollup = orm
      .delete(serviceHealthRollup)
      .where(lt(serviceHealthRollup.bucketStart, cutoff))
      .run();
    const resourceRollup = orm
      .delete(serviceResourceRollup)
      .where(lt(serviceResourceRollup.bucketStart, cutoff))
      .run();

    return health.changes + resource.changes + healthRollup.changes + resourceRollup.changes;
  }
}

export const historyRepository = new HistoryRepository();
