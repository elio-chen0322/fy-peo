ALTER TABLE `feedback` ADD `post_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `feedback` ADD `parent_comment_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `feedback` ADD `crawl_keyword` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `feedback` ADD `captured_at` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `feedback` ADD `like_count` integer;--> statement-breakpoint
ALTER TABLE `feedback` ADD `comment_count` integer;--> statement-breakpoint
ALTER TABLE `feedback` ADD `collect_count` integer;--> statement-breakpoint
ALTER TABLE `feedback` ADD `share_count` integer;--> statement-breakpoint
ALTER TABLE `feedback` ADD `reply_count` integer;--> statement-breakpoint
CREATE INDEX `feedback_post` ON `feedback` (`owner`,`post_id`,`published_at`);