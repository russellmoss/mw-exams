-- Migration 010: admin-only Feature Request engine
-- Feature-building is now a deliberate, admin-only, conversational flow (NOT a side effect of user
-- feedback — see the attempt-188 incident, where ordinary feedback silently built the Dry Notes
-- feature). An admin describes a feature; Opus clarifies and proposes (user-facing) while writing a
-- separate technical spec stored here for later debugging; on confirm, a GitHub Action builds it.
--
-- Audit columns mirror feedback_analyses so the build pipeline (feature-build.yml +
-- record-feature-apply.mjs) can write status the same way auto-feedback does.
-- Additive only — safe to run repeatedly.

CREATE TABLE IF NOT EXISTS feature_requests (
  id                   BIGSERIAL PRIMARY KEY,
  created_by           INTEGER REFERENCES users(id),
  title                TEXT,
  -- drafting | clarifying | proposed | ready | building | built | pr_opened | failed
  status               TEXT NOT NULL DEFAULT 'drafting',
  -- the admin <-> Opus conversation: [{ role: 'user'|'assistant', content, timestamp }]
  thread               JSONB NOT NULL DEFAULT '[]'::jsonb,
  user_facing_proposal TEXT,   -- the plain-language proposal shown to the admin
  technical_spec       TEXT,   -- the internal spec/plan handed to the build Action (debug record)
  -- build audit (written by record-feature-apply.mjs), mirrors feedback_analyses
  work_branch          TEXT,
  commit_sha           TEXT,
  pr_url               TEXT,
  apply_status         TEXT,   -- dispatched | merged | pr_opened | failed
  apply_error          TEXT,
  applied_by           TEXT,   -- 'admin:{id}'
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feature_requests_status ON feature_requests(status);
CREATE INDEX IF NOT EXISTS idx_feature_requests_created_at ON feature_requests(created_at DESC);
