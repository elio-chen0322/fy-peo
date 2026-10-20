CREATE TABLE `themes` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`keywords` text DEFAULT '' NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `theme_names` ON `themes` (`owner`,`name`);--> statement-breakpoint
ALTER TABLE `feedback` ADD `theme_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `feedback` ADD `theme_confidence` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `feedback` ADD `theme_reason` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `feedback_theme` ON `feedback` (`owner`,`theme_id`,`published_at`);