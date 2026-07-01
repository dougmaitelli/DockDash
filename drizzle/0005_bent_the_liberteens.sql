DROP INDEX `idx_health_history_service_id`;--> statement-breakpoint
CREATE INDEX `idx_health_history_service_checked_at` ON `service_health_history` (`service_id`,`checked_at`);