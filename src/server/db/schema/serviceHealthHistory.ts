import { sqliteTable, text, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { services } from "./services.js";
import type { ServiceStatus } from "@shared";

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
    index("idx_health_history_service_id").on(table.serviceId),
    index("idx_health_history_checked_at").on(table.checkedAt),
  ],
);
