CREATE TABLE `certificate_notification_states` (
	`service_id` text PRIMARY KEY NOT NULL,
	`health` text NOT NULL,
	`fingerprint_sha256` text,
	`warning_threshold` integer,
	`cert_vault_status` text,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE cascade
);
