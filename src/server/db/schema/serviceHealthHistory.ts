import { sql } from "drizzle-orm";
import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";

import type { ServiceStatus } from "@shared";

import { services } from "./services.js";

export const serviceHealthHistory = sqliteTable(
  "service_health_history",
  {
    id: text("id").primaryKey(),
    serviceId: text("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    status: text("status").$type<ServiceStatus>().notNull(),
    checkedAt: text("checked_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_health_history_service_checked_at").on(table.serviceId, table.checkedAt),
    index("idx_health_history_checked_at").on(table.checkedAt),
  ],
);
