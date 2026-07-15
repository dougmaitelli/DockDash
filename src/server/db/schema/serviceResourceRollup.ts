import { integer, real, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

import { services } from "./services.js";

export const serviceResourceRollup = sqliteTable(
  "service_resource_rollup",
  {
    id: text("id").primaryKey(),
    serviceId: text("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    bucketStart: text("bucket_start").notNull(),
    cpuSum: real("cpu_sum").notNull(),
    memSum: real("mem_sum").notNull(),
    sampleCount: integer("sample_count").notNull(),
  },
  (t) => [unique("uq_resource_rollup_svc_bucket").on(t.serviceId, t.bucketStart)],
);
