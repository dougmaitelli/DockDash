import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import type { ServiceMetadata, ServiceStatus, ServiceSource } from "@shared";

export const services = sqliteTable("services", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  host: text("host").notNull(),
  ports: text("ports", { mode: "json" })
    .$type<number[]>()
    .notNull()
    .default(sql`'[]'`),
  checkPort: integer("check_port"),
  source: text("source").$type<ServiceSource>().notNull().default("docker"),
  status: text("status").$type<ServiceStatus>().notNull().default("unknown"),
  metadata: text("metadata", { mode: "json" })
    .$type<ServiceMetadata>()
    .notNull()
    .default(sql`'{}'`),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});
