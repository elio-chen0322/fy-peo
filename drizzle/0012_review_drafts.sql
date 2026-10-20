CREATE UNIQUE INDEX voice_review_open ON voice_review_queue(owner,scope,target_id) WHERE status IN ('草稿','待Codex核对');
