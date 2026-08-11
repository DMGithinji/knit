PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_ledger_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`school_id` text NOT NULL,
	`family_account_id` text NOT NULL,
	`invoice_id` text,
	`payment_event_id` text NOT NULL,
	`kind` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`currency` text NOT NULL,
	`occurred_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`school_id`,`family_account_id`) REFERENCES `family_accounts`(`school_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`family_account_id`,`invoice_id`) REFERENCES `invoices`(`family_account_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`school_id`,`payment_event_id`) REFERENCES `payment_events`(`school_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ledger_entries_positive_amount" CHECK("__new_ledger_entries"."amount_cents" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_ledger_entries`("id", "school_id", "family_account_id", "invoice_id", "payment_event_id", "kind", "amount_cents", "currency", "occurred_at", "created_at") SELECT "id", "school_id", "family_account_id", "invoice_id", "payment_event_id", "kind", "amount_cents", "currency", "occurred_at", "created_at" FROM `ledger_entries`;--> statement-breakpoint
DROP TABLE `ledger_entries`;--> statement-breakpoint
ALTER TABLE `__new_ledger_entries` RENAME TO `ledger_entries`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `ledger_entries_payment_event_unique` ON `ledger_entries` (`payment_event_id`);
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
