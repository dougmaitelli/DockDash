import { integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

import { services } from "./services.js";

export const serviceHealthRollup = sqliteTable(
  "service_health_rollup",
  {
    id: text("id").primaryKey(),
    serviceId: text("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    bucketStart: text("bucket_start").notNull(),
    upCount: integer("up_count").notNull().default(0),
    downCount: integer("down_count").notNull().default(0),
    unknownCount: integer("unknown_count").notNull().default(0),
  },
  (t) => [unique("uq_health_rollup_svc_bucket").on(t.serviceId, t.bucketStart)],
);
