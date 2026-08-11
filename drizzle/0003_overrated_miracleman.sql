CREATE TABLE `family_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`school_id` text NOT NULL,
	`account_reference` text NOT NULL,
	`display_name` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `family_accounts_school_reference_unique` ON `family_accounts` (`school_id`,`account_reference`);--> statement-breakpoint
CREATE TABLE `invoice_line_items` (
	`id` text PRIMARY KEY NOT NULL,
	`family_account_id` text NOT NULL,
	`invoice_id` text NOT NULL,
	`student_id` text,
	`description` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`family_account_id`,`invoice_id`) REFERENCES `invoices`(`family_account_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`family_account_id`,`student_id`) REFERENCES `students`(`family_account_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "invoice_line_items_positive_amount" CHECK("invoice_line_items"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`family_account_id` text NOT NULL,
	`invoice_reference` text NOT NULL,
	`currency` text NOT NULL,
	`issued_at` text NOT NULL,
	`due_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`family_account_id`) REFERENCES `family_accounts`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_family_reference_unique` ON `invoices` (`family_account_id`,`invoice_reference`);--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_family_id_id_unique` ON `invoices` (`family_account_id`,`id`);--> statement-breakpoint
CREATE TABLE `students` (
	`id` text PRIMARY KEY NOT NULL,
	`family_account_id` text NOT NULL,
	`student_reference` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`family_account_id`) REFERENCES `family_accounts`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `students_family_reference_unique` ON `students` (`family_account_id`,`student_reference`);--> statement-breakpoint
CREATE UNIQUE INDEX `students_family_id_id_unique` ON `students` (`family_account_id`,`id`);