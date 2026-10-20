CREATE TABLE `cycle_decisions` (`id` text PRIMARY KEY NOT NULL, `owner` text NOT NULL, `period` text NOT NULL, `demand_id` text NOT NULL, `decision` text DEFAULT '待评估' NOT NULL, `solution` text DEFAULT '' NOT NULL, `implementation_plan` text DEFAULT '' NOT NULL, `responsible` text DEFAULT '' NOT NULL, `updated_at` text NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX `cycle_decision_owner_period_demand` ON `cycle_decisions` (`owner`,`period`,`demand_id`);
