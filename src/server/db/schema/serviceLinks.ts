import { sqliteTable, text, integer, index, uniqueIndex, check } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { services } from "./services.js";
import type { ServiceLinkType, ServiceProtocol } from "@shared";

export const serviceLinks = sqliteTable(
  "service_links",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    targetId: text("target_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    label: text("label").default(""),
    type: text("type").$type<ServiceLinkType>().notNull().default("communication"),
    description: text("description").default(""),
    targetPort: integer("target_port"),
    protocol: text("protocol").$type<ServiceProtocol>(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_links_source").on(table.sourceId),
    index("idx_links_target").on(table.targetId),
    uniqueIndex("idx_links_unique").on(table.sourceId, table.targetId),
    check("source_ne_target", sql`${table.sourceId} != ${table.targetId}`),
  ],
);
