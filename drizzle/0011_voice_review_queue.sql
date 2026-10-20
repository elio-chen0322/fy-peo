CREATE TABLE voice_review_queue (
 id TEXT PRIMARY KEY NOT NULL,owner TEXT NOT NULL,feedback_id TEXT NOT NULL,target_id TEXT NOT NULL,scope TEXT NOT NULL,
 proposal_json TEXT NOT NULL,snapshot_json TEXT NOT NULL,snapshot_hash TEXT NOT NULL,actor TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT '待Codex核对',verification_reason TEXT NOT NULL DEFAULT '',event_id TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL,checked_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX voice_review_queue_pending ON voice_review_queue(owner,status,created_at);
CREATE UNIQUE INDEX voice_review_queue_active ON voice_review_queue(owner,scope,target_id) WHERE status='待Codex核对';
