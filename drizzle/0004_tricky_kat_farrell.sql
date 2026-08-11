CREATE TABLE `ledger_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`school_id` text NOT NULL,
	`family_account_id` text NOT NULL,
	`invoice_id` text NOT NULL,
	`payment_event_id` text NOT NULL,
	`kind` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`currency` text NOT NULL,
	`occurred_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`school_id`,`family_account_id`) REFERENCES `family_accounts`(`school_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`family_account_id`,`invoice_id`) REFERENCES `invoices`(`family_account_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`school_id`,`payment_event_id`) REFERENCES `payment_events`(`school_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ledger_entries_positive_amount" CHECK("ledger_entries"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ledger_entries_payment_event_unique` ON `ledger_entries` (`payment_event_id`);--> statement-breakpoint
CREATE TABLE `payment_events` (
	`id` text PRIMARY KEY NOT NULL,
	`school_id` text NOT NULL,
	`provider_event_id` text NOT NULL,
	`type` text NOT NULL,
	`family_reference` text NOT NULL,
	`invoice_reference` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`currency` text NOT NULL,
	`occurred_at` text NOT NULL,
	`provider_reason` text,
	`raw_payload` text NOT NULL,
	`processing_status` text DEFAULT 'received' NOT NULL,
	`processing_reason` text,
	`resolved_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_events_school_provider_event_unique` ON `payment_events` (`school_id`,`provider_event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `payment_events_school_id_id_unique` ON `payment_events` (`school_id`,`id`);--> statement-breakpoint
CREATE INDEX `payment_events_processing_status_idx` ON `payment_events` (`processing_status`);--> statement-breakpoint
CREATE UNIQUE INDEX `family_accounts_school_id_id_unique` ON `family_accounts` (`school_id`,`id`);
--> statement-breakpoint
CREATE TRIGGER `payment_events_prevent_provider_fact_update`
BEFORE UPDATE OF
  `school_id`, `provider_event_id`, `type`, `family_reference`,
  `invoice_reference`, `amount_cents`, `currency`, `occurred_at`, `provider_reason`, `raw_payload`
ON `payment_events`
BEGIN
  SELECT RAISE(ABORT, 'provider event facts are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `payment_events_prevent_delete`
BEFORE DELETE ON `payment_events`
BEGIN
  SELECT RAISE(ABORT, 'payment events are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `ledger_entries_prevent_update`
BEFORE UPDATE ON `ledger_entries`
BEGIN
  SELECT RAISE(ABORT, 'ledger entries are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `ledger_entries_prevent_delete`
BEFORE DELETE ON `ledger_entries`
BEGIN
  SELECT RAISE(ABORT, 'ledger entries are immutable');
END;
