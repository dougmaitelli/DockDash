CREATE TABLE `service_resource_history` (
	`id` text PRIMARY KEY NOT NULL,
	`service_id` text NOT NULL,
	`cpu_percent` real NOT NULL,
	`memory_percent` real NOT NULL,
	`checked_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_resource_history_service_checked_at` ON `service_resource_history` (`service_id`,`checked_at`);--> statement-breakpoint
CREATE INDEX `idx_resource_history_checked_at` ON `service_resource_history` (`checked_at`);--> statement-breakpoint
ALTER TABLE `service_health_history` DROP COLUMN `cpu_percent`;--> statement-breakpoint
ALTER TABLE `service_health_history` DROP COLUMN `memory_percent`;