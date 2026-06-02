PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_service_links` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`target_id` text NOT NULL,
	`label` text DEFAULT '',
	`type` text DEFAULT 'communication' NOT NULL,
	`description` text DEFAULT '',
	`target_port` integer,
	`protocol` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "source_ne_target" CHECK("__new_service_links"."source_id" != "__new_service_links"."target_id")
);
--> statement-breakpoint
INSERT INTO `__new_service_links`("id", "source_id", "target_id", "label", "type", "description", "target_port", "protocol", "created_at") SELECT "id", "source_id", "target_id", "label", "type", "description", "target_port", "protocol", "created_at" FROM `service_links`;--> statement-breakpoint
DROP TABLE `service_links`;--> statement-breakpoint
ALTER TABLE `__new_service_links` RENAME TO `service_links`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_links_source` ON `service_links` (`source_id`);--> statement-breakpoint
CREATE INDEX `idx_links_target` ON `service_links` (`target_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_links_unique` ON `service_links` (`source_id`,`target_id`);--> statement-breakpoint
CREATE TABLE `__new_services` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`host` text NOT NULL,
	`ports` text DEFAULT '[]' NOT NULL,
	`check_port` integer,
	`source` text DEFAULT 'docker' NOT NULL,
	`status` text DEFAULT 'unknown' NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_services`("id", "name", "host", "ports", "check_port", "source", "status", "metadata", "created_at", "updated_at") SELECT "id", "name", "host", "ports", "check_port", "source", "status", "metadata", "created_at", "updated_at" FROM `services`;--> statement-breakpoint
DROP TABLE `services`;--> statement-breakpoint
ALTER TABLE `__new_services` RENAME TO `services`;