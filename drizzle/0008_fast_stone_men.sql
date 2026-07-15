CREATE TABLE `service_health_rollup` (
	`id` text PRIMARY KEY NOT NULL,
	`service_id` text NOT NULL,
	`bucket_start` text NOT NULL,
	`up_count` integer DEFAULT 0 NOT NULL,
	`down_count` integer DEFAULT 0 NOT NULL,
	`unknown_count` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_health_rollup_svc_bucket` ON `service_health_rollup` (`service_id`,`bucket_start`);--> statement-breakpoint
CREATE TABLE `service_resource_rollup` (
	`id` text PRIMARY KEY NOT NULL,
	`service_id` text NOT NULL,
	`bucket_start` text NOT NULL,
	`cpu_sum` real NOT NULL,
	`mem_sum` real NOT NULL,
	`sample_count` integer NOT NULL,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_resource_rollup_svc_bucket` ON `service_resource_rollup` (`service_id`,`bucket_start`);