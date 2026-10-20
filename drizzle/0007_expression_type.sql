ALTER TABLE `feedback` ADD `expression_type` text DEFAULT '待判断' NOT NULL;--> statement-breakpoint
ALTER TABLE `feedback` ADD `expression_reason` text DEFAULT '' NOT NULL;
