import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import type { CertificateHealth, CertVaultStatus } from "@shared";

import { services } from "./services.js";

export const certificateNotificationStates = sqliteTable("certificate_notification_states", {
  serviceId: text("service_id")
    .primaryKey()
    .references(() => services.id, { onDelete: "cascade" }),
  health: text("health").$type<CertificateHealth>().notNull(),
  fingerprintSha256: text("fingerprint_sha256"),
  warningThreshold: integer("warning_threshold"),
  certVaultStatus: text("cert_vault_status").$type<CertVaultStatus>(),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});
