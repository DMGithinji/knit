CREATE TABLE `payment_event_resolutions` (
	`id` text PRIMARY KEY NOT NULL,
	`school_id` text NOT NULL,
	`payment_event_id` text NOT NULL,
	`decision` text NOT NULL,
	`verified_amount_cents` integer,
	`resolved_by` text NOT NULL,
	`resolution_reason` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`school_id`,`payment_event_id`) REFERENCES `payment_events`(`school_id`,`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_event_resolutions_event_unique` ON `payment_event_resolutions` (`payment_event_id`);
--> statement-breakpoint
CREATE TRIGGER `payment_event_resolutions_prevent_update`
BEFORE UPDATE ON `payment_event_resolutions`
BEGIN
  SELECT RAISE(ABORT, 'payment event resolutions are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `payment_event_resolutions_prevent_delete`
BEFORE DELETE ON `payment_event_resolutions`
BEGIN
  SELECT RAISE(ABORT, 'payment event resolutions are immutable');
END;
