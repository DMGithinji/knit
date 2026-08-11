ALTER TABLE `payment_events` ADD `family_account_id` text REFERENCES family_accounts(id);--> statement-breakpoint
UPDATE `payment_events`
SET `family_account_id` = (
	SELECT `family_accounts`.`id`
	FROM `family_accounts`
	WHERE `family_accounts`.`school_id` = `payment_events`.`school_id`
		AND `family_accounts`.`account_reference` = `payment_events`.`family_reference`
);--> statement-breakpoint
CREATE INDEX `payment_events_family_account_idx` ON `payment_events` (`family_account_id`);
