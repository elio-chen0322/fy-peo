ALTER TABLE `feedback` ADD `request_match_score` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `feedback` ADD `request_match_status` text DEFAULT '未匹配' NOT NULL;