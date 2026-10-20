ALTER TABLE `demands` ADD `source_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `demands` ADD `uba` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `demands` ADD `attribute` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `demands` ADD `request_type` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `demands` ADD `hardware_software` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `demands` ADD `feature1` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `demands` ADD `feature1_source_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `demands` ADD `feature2` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `demands` ADD `feature2_source_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `demands` ADD `team` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `demands` ADD `team_source_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `demands` ADD `team_lead` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `demands` ADD `team_members` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `demands` ADD `created_time` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `demands` ADD `creator` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `demands` ADD `lifecycle_status` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `demands` ADD `source_url` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `features` ADD `source_id` text DEFAULT '' NOT NULL;