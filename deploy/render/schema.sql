-- Final application schema for a NEW Supabase project. Contains no local records.
BEGIN;
CREATE OR REPLACE FUNCTION public.json_extract(document text, path text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT AS $$ SELECT document::jsonb #>> string_to_array(substring(path FROM 3), '.') $$;
CREATE OR REPLACE FUNCTION public.json_each(document text) RETURNS TABLE(value text)
LANGUAGE sql IMMUTABLE STRICT AS $$ SELECT jsonb_array_elements_text(document::jsonb) $$;
CREATE OR REPLACE FUNCTION public.feedback_bool_sum(state bigint, value boolean) RETURNS bigint
LANGUAGE sql IMMUTABLE AS $$ SELECT COALESCE(state,0) + CASE WHEN value THEN 1 ELSE 0 END $$;
CREATE AGGREGATE public.sum(boolean) (SFUNC=public.feedback_bool_sum, STYPE=bigint, INITCOND='0');

CREATE TABLE public."demands" (
  "id" text PRIMARY KEY NOT NULL,
  "owner" text NOT NULL,
  "name" text NOT NULL,
  "source_id" text NOT NULL DEFAULT '',
  "uba" text NOT NULL DEFAULT '',
  "attribute" text NOT NULL DEFAULT '',
  "request_type" text NOT NULL DEFAULT '',
  "hardware_software" text NOT NULL DEFAULT '',
  "feature1" text NOT NULL DEFAULT '',
  "feature1_source_id" text NOT NULL DEFAULT '',
  "feature2" text NOT NULL DEFAULT '',
  "feature2_source_id" text NOT NULL DEFAULT '',
  "team" text NOT NULL DEFAULT '',
  "team_source_id" text NOT NULL DEFAULT '',
  "team_lead" text NOT NULL DEFAULT '',
  "team_members" text NOT NULL DEFAULT '',
  "created_time" text NOT NULL DEFAULT '',
  "creator" text NOT NULL DEFAULT '',
  "lifecycle_status" text NOT NULL DEFAULT '',
  "source_url" text NOT NULL DEFAULT '',
  "ao" text NOT NULL DEFAULT ''
);
ALTER TABLE public."demands" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."events" (
  "id" text PRIMARY KEY NOT NULL,
  "owner" text NOT NULL,
  "feedback_id" text NOT NULL DEFAULT '',
  "action" text NOT NULL,
  "before_json" text NOT NULL,
  "after_json" text NOT NULL,
  "after_revision" integer NOT NULL DEFAULT 0,
  "actor" text NOT NULL,
  "created_at" text NOT NULL
);
ALTER TABLE public."events" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."features" (
  "id" text PRIMARY KEY NOT NULL,
  "owner" text NOT NULL,
  "parent" text NOT NULL,
  "name" text NOT NULL,
  "source_id" text NOT NULL DEFAULT ''
);
ALTER TABLE public."features" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."feedback" (
  "id" text PRIMARY KEY NOT NULL,
  "owner" text NOT NULL,
  "fingerprint" text NOT NULL,
  "external_id" text NOT NULL DEFAULT '',
  "raw" text NOT NULL,
  "request_id" text NOT NULL DEFAULT '',
  "feature_id" text NOT NULL DEFAULT '',
  "kind" text NOT NULL DEFAULT '待判断',
  "version" text NOT NULL DEFAULT '',
  "published_at" text NOT NULL DEFAULT '',
  "url" text NOT NULL DEFAULT '',
  "attachment_links" text NOT NULL DEFAULT '',
  "city" text NOT NULL DEFAULT '',
  "source" text NOT NULL DEFAULT '小红书',
  "source_type" text NOT NULL DEFAULT '帖子',
  "status" text NOT NULL DEFAULT '待审核',
  "archived" integer NOT NULL DEFAULT 0,
  "revision" integer NOT NULL DEFAULT 1,
  "original_snapshot" text NOT NULL,
  "created_at" text NOT NULL,
  "updated_at" text NOT NULL,
  "theme_id" text NOT NULL DEFAULT '',
  "theme_confidence" integer NOT NULL DEFAULT 0,
  "theme_reason" text NOT NULL DEFAULT '',
  "request_candidate_id" text NOT NULL DEFAULT '',
  "request_candidate_score" integer NOT NULL DEFAULT 0,
  "request_candidate_reason" text NOT NULL DEFAULT '',
  "post_id" text NOT NULL DEFAULT '',
  "parent_comment_id" text NOT NULL DEFAULT '',
  "crawl_keyword" text NOT NULL DEFAULT '',
  "captured_at" text NOT NULL DEFAULT '',
  "like_count" integer,
  "comment_count" integer,
  "collect_count" integer,
  "share_count" integer,
  "reply_count" integer,
  "expression_type" text NOT NULL DEFAULT '待判断',
  "expression_reason" text NOT NULL DEFAULT '',
  "request_match_score" integer NOT NULL DEFAULT 0,
  "request_match_status" text NOT NULL DEFAULT '未匹配'
);
ALTER TABLE public."feedback" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."files" (
  "id" text PRIMARY KEY NOT NULL,
  "owner" text NOT NULL,
  "feedback_id" text NOT NULL,
  "name" text NOT NULL,
  "mime" text NOT NULL,
  "size" integer NOT NULL,
  "storage_key" text NOT NULL,
  "created_at" text NOT NULL
);
ALTER TABLE public."files" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."themes" (
  "id" text PRIMARY KEY NOT NULL,
  "owner" text NOT NULL,
  "name" text NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "keywords" text NOT NULL DEFAULT '',
  "active" integer NOT NULL DEFAULT 1,
  "created_at" text NOT NULL,
  "updated_at" text NOT NULL,
  "feature_id" text NOT NULL DEFAULT ''
);
ALTER TABLE public."themes" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."cycle_decisions" (
  "id" text PRIMARY KEY NOT NULL,
  "owner" text NOT NULL,
  "period" text NOT NULL,
  "demand_id" text NOT NULL,
  "decision" text NOT NULL DEFAULT '待评估',
  "solution" text NOT NULL DEFAULT '',
  "implementation_plan" text NOT NULL DEFAULT '',
  "responsible" text NOT NULL DEFAULT '',
  "updated_at" text NOT NULL
);
ALTER TABLE public."cycle_decisions" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."voice_label_events" (
  "id" text PRIMARY KEY NOT NULL,
  "owner" text NOT NULL,
  "feedback_id" text NOT NULL,
  "label_id" text NOT NULL DEFAULT '',
  "scope" text NOT NULL,
  "payload_json" text NOT NULL,
  "revoked_at" text NOT NULL DEFAULT '',
  "created_at" text NOT NULL
);
ALTER TABLE public."voice_label_events" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."voice_labels" (
  "id" text PRIMARY KEY NOT NULL,
  "owner" text NOT NULL,
  "feedback_id" text NOT NULL,
  "intent_id" text NOT NULL,
  "fragment" text NOT NULL,
  "ai_json" text NOT NULL,
  "final_json" text NOT NULL,
  "source" text NOT NULL,
  "confidence" integer,
  "text_score" integer,
  "review_status" text NOT NULL DEFAULT '待审核',
  "reviewer" text NOT NULL DEFAULT '',
  "note" text NOT NULL DEFAULT '',
  "catalog_version" text NOT NULL DEFAULT '',
  "rule_version" text NOT NULL DEFAULT '',
  "revision" integer NOT NULL DEFAULT 1,
  "created_at" text NOT NULL,
  "updated_at" text NOT NULL
);
ALTER TABLE public."voice_labels" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."voice_screenings" (
  "id" text PRIMARY KEY NOT NULL,
  "owner" text NOT NULL,
  "feedback_id" text NOT NULL,
  "voice_id" text NOT NULL,
  "raw_json" text NOT NULL DEFAULT '[]',
  "ai_json" text NOT NULL DEFAULT '{}',
  "final_json" text NOT NULL DEFAULT '{}',
  "relevance" text NOT NULL DEFAULT '待确认',
  "demandness" text NOT NULL DEFAULT '待确认',
  "confidence" integer,
  "review_status" text NOT NULL DEFAULT '待审核',
  "reviewer" text NOT NULL DEFAULT '',
  "note" text NOT NULL DEFAULT '',
  "catalog_version" text NOT NULL DEFAULT '',
  "rule_version" text NOT NULL DEFAULT '',
  "revision" integer NOT NULL DEFAULT 1,
  "created_at" text NOT NULL,
  "updated_at" text NOT NULL
);
ALTER TABLE public."voice_screenings" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."voice_review_queue" (
  "id" text PRIMARY KEY NOT NULL,
  "owner" text NOT NULL,
  "feedback_id" text NOT NULL,
  "target_id" text NOT NULL,
  "scope" text NOT NULL,
  "proposal_json" text NOT NULL,
  "snapshot_json" text NOT NULL,
  "snapshot_hash" text NOT NULL,
  "actor" text NOT NULL,
  "status" text NOT NULL DEFAULT '待Codex核对',
  "verification_reason" text NOT NULL DEFAULT '',
  "event_id" text NOT NULL DEFAULT '',
  "created_at" text NOT NULL,
  "checked_at" text NOT NULL DEFAULT ''
);
ALTER TABLE public."voice_review_queue" ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX "demand_names" ON "demands" ("owner","name");
CREATE INDEX "events_owner_time" ON "events" ("owner","created_at");
CREATE INDEX "events_feedback" ON "events" ("owner","feedback_id");
CREATE UNIQUE INDEX "feature_names" ON "features" ("owner","parent","name");
CREATE UNIQUE INDEX "feedback_source_unique" ON "feedback" ("owner","fingerprint");
CREATE INDEX "feedback_time" ON "feedback" ("owner","archived","published_at");
CREATE INDEX "feedback_request" ON "feedback" ("owner","request_id");
CREATE INDEX "feedback_feature" ON "feedback" ("owner","feature_id");
CREATE INDEX "files_feedback" ON "files" ("owner","feedback_id");
CREATE UNIQUE INDEX "theme_names" ON "themes" ("owner","name");
CREATE INDEX "feedback_theme" ON "feedback" ("owner","theme_id","published_at");
CREATE INDEX "feedback_post" ON "feedback" ("owner","post_id","published_at");
CREATE UNIQUE INDEX "cycle_decision_owner_period_demand" ON "cycle_decisions" ("owner","period","demand_id");
CREATE INDEX "voice_label_learning" ON "voice_label_events" ("owner","revoked_at","created_at");
CREATE UNIQUE INDEX "voice_label_intent" ON "voice_labels" ("owner","feedback_id","intent_id");
CREATE INDEX "voice_label_feedback" ON "voice_labels" ("owner","feedback_id");
CREATE INDEX "voice_label_review" ON "voice_labels" ("owner","review_status","confidence");
CREATE UNIQUE INDEX "voice_label_one_demand" ON "voice_labels" ("owner","feedback_id",json_extract(final_json, '$.诉求ID')) WHERE json_extract(final_json, '$.匹配状态')='匹配已有诉求' AND json_extract(final_json, '$.诉求ID')<>'';
CREATE UNIQUE INDEX "voice_screen_feedback" ON "voice_screenings" ("owner","feedback_id");
CREATE UNIQUE INDEX "voice_screen_id" ON "voice_screenings" ("owner","voice_id");
CREATE INDEX voice_review_queue_pending ON voice_review_queue(owner,status,created_at);
CREATE UNIQUE INDEX voice_review_queue_active ON voice_review_queue(owner,scope,target_id) WHERE status='待Codex核对';
CREATE UNIQUE INDEX voice_review_open ON voice_review_queue(owner,scope,target_id) WHERE status IN ('草稿','待Codex核对');
REVOKE ALL ON public."demands" FROM anon, authenticated;
REVOKE ALL ON public."events" FROM anon, authenticated;
REVOKE ALL ON public."features" FROM anon, authenticated;
REVOKE ALL ON public."feedback" FROM anon, authenticated;
REVOKE ALL ON public."files" FROM anon, authenticated;
REVOKE ALL ON public."themes" FROM anon, authenticated;
REVOKE ALL ON public."cycle_decisions" FROM anon, authenticated;
REVOKE ALL ON public."voice_label_events" FROM anon, authenticated;
REVOKE ALL ON public."voice_labels" FROM anon, authenticated;
REVOKE ALL ON public."voice_screenings" FROM anon, authenticated;
REVOKE ALL ON public."voice_review_queue" FROM anon, authenticated;
COMMIT;
