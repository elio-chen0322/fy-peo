ALTER TABLE `feedback` ADD `request_candidate_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `feedback` ADD `request_candidate_score` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `feedback` ADD `request_candidate_reason` text DEFAULT '' NOT NULL;