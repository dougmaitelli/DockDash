import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const services = sqliteTable("services", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  host: text("host").notNull(),
  ports: text("ports", { mode: "json" })
    .$type<number[]>()
    .notNull()
    .default(sql`'[]'`),
  checkPort: integer("check_port"),
  protocol: text("protocol").default("http"),
  source: text("source").notNull().default("docker"),
  status: text("status").notNull().default("unknown"),
  metadata: text("metadata", { mode: "json" })
    .$type<Record<string, string | number | boolean | string[] | number[]>>()
    .default(sql`'{}'`),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});
