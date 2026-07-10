import { sql } from "drizzle-orm";
import { index, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { services } from "./services.js";

export const serviceResourceHistory = sqliteTable(
  "service_resource_history",
  {
    id: text("id").primaryKey(),
    serviceId: text("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    cpuPercent: real("cpu_percent").notNull(),
    memoryPercent: real("memory_percent").notNull(),
    checkedAt: text("checked_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_resource_history_service_checked_at").on(table.serviceId, table.checkedAt),
    index("idx_resource_history_checked_at").on(table.checkedAt),
  ],
);
