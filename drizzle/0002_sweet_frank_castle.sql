CREATE TABLE `school_config_activations` (
	`id` text PRIMARY KEY NOT NULL,
	`school_id` text NOT NULL,
	`config_version_id` text NOT NULL,
	`previous_config_version_id` text,
	`sequence` integer NOT NULL,
	`activated_by` text NOT NULL,
	`activation_reason` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`school_id`,`config_version_id`) REFERENCES `school_config_versions`(`school_id`,`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `school_config_activations_school_sequence_unique` ON `school_config_activations` (`school_id`,`sequence`);--> statement-breakpoint
CREATE TABLE `school_config_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`school_id` text NOT NULL,
	`version` integer NOT NULL,
	`config` text NOT NULL,
	`checksum` text NOT NULL,
	`created_by` text NOT NULL,
	`change_reason` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `school_config_versions_school_version_unique` ON `school_config_versions` (`school_id`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `school_config_versions_school_id_id_unique` ON `school_config_versions` (`school_id`,`id`);
--> statement-breakpoint
CREATE TRIGGER `school_config_versions_prevent_update`
BEFORE UPDATE ON `school_config_versions`
BEGIN
  SELECT RAISE(ABORT, 'school configuration versions are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `school_config_versions_prevent_delete`
BEFORE DELETE ON `school_config_versions`
BEGIN
  SELECT RAISE(ABORT, 'school configuration versions are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `school_config_activations_prevent_update`
BEFORE UPDATE ON `school_config_activations`
BEGIN
  SELECT RAISE(ABORT, 'school configuration activations are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `school_config_activations_prevent_delete`
BEFORE DELETE ON `school_config_activations`
BEGIN
  SELECT RAISE(ABORT, 'school configuration activations are immutable');
END;
