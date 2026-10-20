CREATE TABLE `voice_label_events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`feedback_id` text NOT NULL,
	`label_id` text DEFAULT '' NOT NULL,
	`scope` text NOT NULL,
	`payload_json` text NOT NULL,
	`revoked_at` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `voice_label_learning` ON `voice_label_events` (`owner`,`revoked_at`,`created_at`);--> statement-breakpoint
CREATE TABLE `voice_labels` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`feedback_id` text NOT NULL,
	`intent_id` text NOT NULL,
	`fragment` text NOT NULL,
	`ai_json` text NOT NULL,
	`final_json` text NOT NULL,
	`source` text NOT NULL,
	`confidence` integer,
	`text_score` integer,
	`review_status` text DEFAULT '待审核' NOT NULL,
	`reviewer` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`catalog_version` text DEFAULT '' NOT NULL,
	`rule_version` text DEFAULT '' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `voice_label_intent` ON `voice_labels` (`owner`,`feedback_id`,`intent_id`);--> statement-breakpoint
CREATE INDEX `voice_label_feedback` ON `voice_labels` (`owner`,`feedback_id`);--> statement-breakpoint
CREATE INDEX `voice_label_review` ON `voice_labels` (`owner`,`review_status`,`confidence`);--> statement-breakpoint
CREATE UNIQUE INDEX `voice_label_one_demand` ON `voice_labels` (`owner`,`feedback_id`,json_extract(final_json, '$.诉求ID')) WHERE json_extract(final_json, '$.匹配状态')='匹配已有诉求' AND json_extract(final_json, '$.诉求ID')<>'';--> statement-breakpoint
CREATE TABLE `voice_screenings` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`feedback_id` text NOT NULL,
	`voice_id` text NOT NULL,
	`raw_json` text DEFAULT '[]' NOT NULL,
	`ai_json` text DEFAULT '{}' NOT NULL,
	`final_json` text DEFAULT '{}' NOT NULL,
	`relevance` text DEFAULT '待确认' NOT NULL,
	`demandness` text DEFAULT '待确认' NOT NULL,
	`confidence` integer,
	`review_status` text DEFAULT '待审核' NOT NULL,
	`reviewer` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`catalog_version` text DEFAULT '' NOT NULL,
	`rule_version` text DEFAULT '' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `voice_screen_feedback` ON `voice_screenings` (`owner`,`feedback_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `voice_screen_id` ON `voice_screenings` (`owner`,`voice_id`);
--> statement-breakpoint
INSERT OR IGNORE INTO voice_screenings
 (id,owner,feedback_id,voice_id,created_at,updated_at)
 SELECT 'screen:'||id,owner,id,
 CASE WHEN external_id<>'' THEN
 (CASE source WHEN '小红书' THEN 'xhs' WHEN '微博' THEN 'wb' WHEN '抖音' THEN 'dy' WHEN 'B站' THEN 'bili' ELSE source END)
 ||(CASE source_type WHEN '帖子' THEN ':note:' ELSE ':comment:'||post_id||':' END)||external_id
 ELSE 'feedback:'||id END,created_at,updated_at FROM feedback;
INSERT OR IGNORE INTO voice_labels
 (id,owner,feedback_id,intent_id,fragment,ai_json,final_json,source,text_score,review_status,reviewer,created_at,updated_at)
 SELECT 'legacy:'||f.id,f.owner,f.id,'legacy',f.raw,
 json_object('AI诉求ID',d.id,'AI诉求名称',d.name,'AI一级Feature',d.feature1,'AI二级Feature',d.feature2,
 'AI建议/问题',CASE d.request_type WHEN 'Need' THEN '建议' WHEN 'Issue' THEN '问题' ELSE '待判断' END,
 'AI体验/质量',d.attribute,'AI匹配状态','匹配已有诉求','匹配依据',f.request_candidate_reason,
 '文字匹配分',f.request_match_score,'引用证据','[]'),
 json_object('诉求ID',d.id,'诉求名称',d.name,'一级Feature',d.feature1,'二级Feature',d.feature2,
 '建议/问题',CASE d.request_type WHEN 'Need' THEN '建议' WHEN 'Issue' THEN '问题' ELSE '待判断' END,
 '体验/质量',d.attribute,'匹配状态','匹配已有诉求'),
 CASE WHEN f.request_match_status='已确认' THEN '历史人工' ELSE '文字候选' END,
 f.request_match_score,CASE WHEN f.request_match_status='已确认' THEN '确认' ELSE '待审核' END,
 '',f.created_at,f.updated_at
 FROM feedback f JOIN demands d ON d.owner=f.owner AND d.id=COALESCE(NULLIF(f.request_id,''),NULLIF(f.request_candidate_id,''));
