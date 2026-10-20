CREATE TABLE `demands` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `demand_names` ON `demands` (`owner`,`name`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`feedback_id` text DEFAULT '' NOT NULL,
	`action` text NOT NULL,
	`before_json` text NOT NULL,
	`after_json` text NOT NULL,
	`after_revision` integer DEFAULT 0 NOT NULL,
	`actor` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `events_owner_time` ON `events` (`owner`,`created_at`);--> statement-breakpoint
CREATE INDEX `events_feedback` ON `events` (`owner`,`feedback_id`);--> statement-breakpoint
CREATE TABLE `features` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`parent` text NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `feature_names` ON `features` (`owner`,`parent`,`name`);--> statement-breakpoint
CREATE TABLE `feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`fingerprint` text NOT NULL,
	`external_id` text DEFAULT '' NOT NULL,
	`raw` text NOT NULL,
	`request_id` text DEFAULT '' NOT NULL,
	`feature_id` text DEFAULT '' NOT NULL,
	`kind` text DEFAULT '待判断' NOT NULL,
	`version` text DEFAULT '' NOT NULL,
	`published_at` text DEFAULT '' NOT NULL,
	`url` text DEFAULT '' NOT NULL,
	`attachment_links` text DEFAULT '' NOT NULL,
	`city` text DEFAULT '' NOT NULL,
	`source` text DEFAULT '小红书' NOT NULL,
	`source_type` text DEFAULT '帖子' NOT NULL,
	`status` text DEFAULT '待审核' NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`original_snapshot` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `feedback_source_unique` ON `feedback` (`owner`,`fingerprint`);--> statement-breakpoint
CREATE INDEX `feedback_time` ON `feedback` (`owner`,`archived`,`published_at`);--> statement-breakpoint
CREATE INDEX `feedback_request` ON `feedback` (`owner`,`request_id`);--> statement-breakpoint
CREATE INDEX `feedback_feature` ON `feedback` (`owner`,`feature_id`);--> statement-breakpoint
CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`feedback_id` text NOT NULL,
	`name` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`storage_key` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `files_feedback` ON `files` (`owner`,`feedback_id`);