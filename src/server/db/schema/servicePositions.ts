import { sqliteTable, text, real } from "drizzle-orm/sqlite-core";
import { services } from "./services.js";

export const servicePositions = sqliteTable("service_positions", {
  serviceId: text("service_id")
    .primaryKey()
    .references(() => services.id, { onDelete: "cascade" }),
  x: real("x").notNull(),
  y: real("y").notNull(),
  parentId: text("parent_id").references(() => services.id, { onDelete: "set null" }),
  w: real("w"),
  h: real("h"),
});
