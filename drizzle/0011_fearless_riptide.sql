CREATE TABLE `labels` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_labels_normalized_name` ON `labels` (`normalized_name`);--> statement-breakpoint
CREATE TABLE `service_labels` (
	`service_id` text NOT NULL,
	`label_id` text NOT NULL,
	PRIMARY KEY(`service_id`, `label_id`),
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`label_id`) REFERENCES `labels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_service_labels_label` ON `service_labels` (`label_id`);