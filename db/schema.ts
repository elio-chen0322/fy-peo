import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
  index,
} from 'drizzle-orm/sqlite-core';
import {sql} from 'drizzle-orm';
export const features = sqliteTable(
  'features',
  {
    id: text('id').primaryKey(),
    owner: text('owner').notNull(),
    parent: text('parent').notNull(),
    name: text('name').notNull(),
    source_id: text('source_id').notNull().default(''),
  },
  (t) => [uniqueIndex('feature_names').on(t.owner, t.parent, t.name)],
);
export const demands = sqliteTable(
  'demands',
  {
    id: text('id').primaryKey(),
    owner: text('owner').notNull(),
    name: text('name').notNull(),
    ao: text('ao').notNull().default(''),
    source_id: text('source_id').notNull().default(''),
    uba: text('uba').notNull().default(''),
    attribute: text('attribute').notNull().default(''),
    request_type: text('request_type').notNull().default(''),
    hardware_software: text('hardware_software').notNull().default(''),
    feature1: text('feature1').notNull().default(''),
    feature1_source_id: text('feature1_source_id').notNull().default(''),
    feature2: text('feature2').notNull().default(''),
    feature2_source_id: text('feature2_source_id').notNull().default(''),
    team: text('team').notNull().default(''),
    team_source_id: text('team_source_id').notNull().default(''),
    team_lead: text('team_lead').notNull().default(''),
    team_members: text('team_members').notNull().default(''),
    created_time: text('created_time').notNull().default(''),
    creator: text('creator').notNull().default(''),
    lifecycle_status: text('lifecycle_status').notNull().default(''),
    source_url: text('source_url').notNull().default(''),
  },
  (t) => [uniqueIndex('demand_names').on(t.owner, t.name)],
);
export const themes = sqliteTable(
  'themes',
  {
    id: text('id').primaryKey(),
    owner: text('owner').notNull(),
    feature_id: text('feature_id').notNull().default(''),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    keywords: text('keywords').notNull().default(''),
    active: integer('active').notNull().default(1),
    created_at: text('created_at').notNull(),
    updated_at: text('updated_at').notNull(),
  },
  (t) => [uniqueIndex('theme_names').on(t.owner, t.name)],
);
export const feedback = sqliteTable(
  'feedback',
  {
    id: text('id').primaryKey(),
    owner: text('owner').notNull(),
    fingerprint: text('fingerprint').notNull(),
    external_id: text('external_id').notNull().default(''),
    post_id: text('post_id').notNull().default(''),
    parent_comment_id: text('parent_comment_id').notNull().default(''),
    crawl_keyword: text('crawl_keyword').notNull().default(''),
    raw: text('raw').notNull(),
    request_id: text('request_id').notNull().default(''),
    request_candidate_id: text('request_candidate_id').notNull().default(''),
    request_candidate_score: integer('request_candidate_score').notNull().default(0),
    request_candidate_reason: text('request_candidate_reason').notNull().default(''),
    request_match_score: integer('request_match_score').notNull().default(0),
    request_match_status: text('request_match_status').notNull().default('未匹配'),
    theme_id: text('theme_id').notNull().default(''),
    theme_confidence: integer('theme_confidence').notNull().default(0),
    theme_reason: text('theme_reason').notNull().default(''),
    feature_id: text('feature_id').notNull().default(''),
    kind: text('kind').notNull().default('待判断'),
    expression_type: text('expression_type').notNull().default('待判断'),
    expression_reason: text('expression_reason').notNull().default(''),
    version: text('version').notNull().default(''),
    published_at: text('published_at').notNull().default(''),
    captured_at: text('captured_at').notNull().default(''),
    like_count: integer('like_count'),
    comment_count: integer('comment_count'),
    collect_count: integer('collect_count'),
    share_count: integer('share_count'),
    reply_count: integer('reply_count'),
    url: text('url').notNull().default(''),
    attachment_links: text('attachment_links').notNull().default(''),
    city: text('city').notNull().default(''),
    source: text('source').notNull().default('小红书'),
    source_type: text('source_type').notNull().default('帖子'),
    status: text('status').notNull().default('待审核'),
    archived: integer('archived').notNull().default(0),
    revision: integer('revision').notNull().default(1),
    original_snapshot: text('original_snapshot').notNull(),
    created_at: text('created_at').notNull(),
    updated_at: text('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('feedback_source_unique').on(t.owner, t.fingerprint),
    index('feedback_time').on(t.owner, t.archived, t.published_at),
    index('feedback_post').on(t.owner, t.post_id, t.published_at),
    index('feedback_request').on(t.owner, t.request_id),
    index('feedback_feature').on(t.owner, t.feature_id),
    index('feedback_theme').on(t.owner, t.theme_id, t.published_at),
  ],
);
export const events = sqliteTable(
  'events',
  {
    id: text('id').primaryKey(),
    owner: text('owner').notNull(),
    feedback_id: text('feedback_id').notNull().default(''),
    action: text('action').notNull(),
    before_json: text('before_json').notNull(),
    after_json: text('after_json').notNull(),
    after_revision: integer('after_revision').notNull().default(0),
    actor: text('actor').notNull(),
    created_at: text('created_at').notNull(),
  },
  (t) => [
    index('events_owner_time').on(t.owner, t.created_at),
    index('events_feedback').on(t.owner, t.feedback_id),
  ],
);
export const cycleDecisions = sqliteTable('cycle_decisions', {
  id: text('id').primaryKey(), owner: text('owner').notNull(), period: text('period').notNull(), demand_id: text('demand_id').notNull(), decision: text('decision').notNull().default('待评估'), solution: text('solution').notNull().default(''), implementation_plan: text('implementation_plan').notNull().default(''), responsible: text('responsible').notNull().default(''), updated_at: text('updated_at').notNull(),
}, (t) => [uniqueIndex('cycle_decision_owner_period_demand').on(t.owner, t.period, t.demand_id)]);
export const files = sqliteTable(
  'files',
  {
    id: text('id').primaryKey(),
    owner: text('owner').notNull(),
    feedback_id: text('feedback_id').notNull(),
    name: text('name').notNull(),
    mime: text('mime').notNull(),
    size: integer('size').notNull(),
    storage_key: text('storage_key').notNull(),
    created_at: text('created_at').notNull(),
  },
  (t) => [index('files_feedback').on(t.owner, t.feedback_id)],
);

export const voiceScreenings = sqliteTable('voice_screenings', {
 id:text('id').primaryKey(), owner:text('owner').notNull(), feedback_id:text('feedback_id').notNull(), voice_id:text('voice_id').notNull(),
 raw_json:text('raw_json').notNull().default('[]'),ai_json:text('ai_json').notNull().default('{}'),final_json:text('final_json').notNull().default('{}'),
 relevance:text('relevance').notNull().default('待确认'),demandness:text('demandness').notNull().default('待确认'),confidence:integer('confidence'),
 review_status:text('review_status').notNull().default('待审核'),reviewer:text('reviewer').notNull().default(''),note:text('note').notNull().default(''),
 catalog_version:text('catalog_version').notNull().default(''),rule_version:text('rule_version').notNull().default(''),revision:integer('revision').notNull().default(1),
 created_at:text('created_at').notNull(),updated_at:text('updated_at').notNull(),
},t=>[uniqueIndex('voice_screen_feedback').on(t.owner,t.feedback_id),uniqueIndex('voice_screen_id').on(t.owner,t.voice_id)]);
export const voiceLabels = sqliteTable('voice_labels', {
 id:text('id').primaryKey(),owner:text('owner').notNull(),feedback_id:text('feedback_id').notNull(),intent_id:text('intent_id').notNull(),fragment:text('fragment').notNull(),
 ai_json:text('ai_json').notNull(),final_json:text('final_json').notNull(),source:text('source').notNull(),confidence:integer('confidence'),text_score:integer('text_score'),
 review_status:text('review_status').notNull().default('待审核'),reviewer:text('reviewer').notNull().default(''),note:text('note').notNull().default(''),
 catalog_version:text('catalog_version').notNull().default(''),rule_version:text('rule_version').notNull().default(''),revision:integer('revision').notNull().default(1),
 created_at:text('created_at').notNull(),updated_at:text('updated_at').notNull(),
},t=>[uniqueIndex('voice_label_intent').on(t.owner,t.feedback_id,t.intent_id),index('voice_label_feedback').on(t.owner,t.feedback_id),index('voice_label_review').on(t.owner,t.review_status,t.confidence),uniqueIndex('voice_label_one_demand').on(t.owner,t.feedback_id,sql`json_extract(${t.final_json}, '$.诉求ID')`).where(sql`json_extract(${t.final_json}, '$.匹配状态')='匹配已有诉求' AND json_extract(${t.final_json}, '$.诉求ID')<>''`)]);
export const voiceLabelEvents=sqliteTable('voice_label_events',{
 id:text('id').primaryKey(),owner:text('owner').notNull(),feedback_id:text('feedback_id').notNull(),label_id:text('label_id').notNull().default(''),
 scope:text('scope').notNull(),payload_json:text('payload_json').notNull(),revoked_at:text('revoked_at').notNull().default(''),created_at:text('created_at').notNull(),
},t=>[index('voice_label_learning').on(t.owner,t.revoked_at,t.created_at)]);

export const voiceReviewQueue=sqliteTable('voice_review_queue',{
 id:text('id').primaryKey(),owner:text('owner').notNull(),feedback_id:text('feedback_id').notNull(),target_id:text('target_id').notNull(),scope:text('scope').notNull(),
 proposal_json:text('proposal_json').notNull(),snapshot_json:text('snapshot_json').notNull(),snapshot_hash:text('snapshot_hash').notNull(),actor:text('actor').notNull(),
 status:text('status').notNull().default('待Codex核对'),verification_reason:text('verification_reason').notNull().default(''),event_id:text('event_id').notNull().default(''),
 created_at:text('created_at').notNull(),checked_at:text('checked_at').notNull().default(''),
},t=>[index('voice_review_queue_pending').on(t.owner,t.status,t.created_at),uniqueIndex('voice_review_open').on(t.owner,t.scope,t.target_id).where(sql`status IN ('草稿','待Codex核对')`),uniqueIndex('voice_review_queue_active').on(t.owner,t.scope,t.target_id).where(sql`status='待Codex核对'`)]);
