-- Initial schema migration. Uses IF NOT EXISTS throughout so it is safe to
-- run against databases that predate Drizzle being introduced to this project.
CREATE TABLE IF NOT EXISTS `service_links` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`target_id` text NOT NULL,
	`label` text DEFAULT '',
	`type` text DEFAULT 'communication',
	`description` text DEFAULT '',
	`target_port` integer,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "source_ne_target" CHECK("service_links"."source_id" != "service_links"."target_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_links_source` ON `service_links` (`source_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_links_target` ON `service_links` (`target_id`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_links_unique` ON `service_links` (`source_id`,`target_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `service_positions` (
	`service_id` text PRIMARY KEY NOT NULL,
	`x` real NOT NULL,
	`y` real NOT NULL,
	`parent_id` text,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `services` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`host` text NOT NULL,
	`ports` text DEFAULT '[]' NOT NULL,
	`check_port` integer,
	`protocol` text DEFAULT 'http',
	`source` text DEFAULT 'docker' NOT NULL,
	`status` text DEFAULT 'unknown' NOT NULL,
	`metadata` text DEFAULT '{}',
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
