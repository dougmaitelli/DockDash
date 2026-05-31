CREATE TABLE `service_health_history` (
	`id` text PRIMARY KEY NOT NULL,
	`service_id` text NOT NULL,
	`status` text NOT NULL,
	`checked_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_health_history_service_id` ON `service_health_history` (`service_id`);--> statement-breakpoint
CREATE INDEX `idx_health_history_checked_at` ON `service_health_history` (`checked_at`);