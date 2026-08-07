-- Migration 053: "Feedback tab" — the persistent floating feedback tab + slide-over panel that is
-- available from every authenticated screen (feature-request/41).
--
-- The feedback store IS user_attempts: /api/admin/feedback and the History "Leave feedback" flow
-- both read/write user_attempts.user_feedback. Rather than add a second store, the new tab writes
-- the same rows and tags them so the admin surface can tell tab feedback (and its chip/scope) apart
-- from the per-question History feedback that predates this feature.
--
--   source     'feedback_tab' | 'history'   — where the feedback was submitted from
--   category   chip value (nullable)        — 'wrong_misleading'|'confusing_wording'|'grading_off'|'bug'|'idea'
--   scope      'question' | 'general'        — attached to a question/attempt, or the app in general
--   route      the pathname it was sent from (bug triage)
--   paused_ms  timer paused-while-open time  — excluded from elapsed answer time; recorded for admin
--
-- question_id already exists on user_attempts (nullable since migration 050); the row's own id IS
-- the attempt id, so no separate attempt_id column is needed. General feedback carries a NULL
-- question_id and mode='full' so it still surfaces in the existing admin open-feedback queue.
--
-- Backfill: every existing row that carries feedback came from the History flow on a question, so
-- source='history', scope='question'.
--
-- Additive / idempotent — safe to run repeatedly. MUST be applied to Neon.

ALTER TABLE user_attempts ADD COLUMN IF NOT EXISTS source     TEXT;
ALTER TABLE user_attempts ADD COLUMN IF NOT EXISTS category   TEXT;
ALTER TABLE user_attempts ADD COLUMN IF NOT EXISTS scope      TEXT;
ALTER TABLE user_attempts ADD COLUMN IF NOT EXISTS route      TEXT;
ALTER TABLE user_attempts ADD COLUMN IF NOT EXISTS paused_ms  INT;

DO $$ BEGIN
  ALTER TABLE user_attempts
    ADD CONSTRAINT user_attempts_feedback_source_check
    CHECK (source IS NULL OR source IN ('feedback_tab', 'history'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE user_attempts
    ADD CONSTRAINT user_attempts_feedback_scope_check
    CHECK (scope IS NULL OR scope IN ('question', 'general'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE user_attempts
    ADD CONSTRAINT user_attempts_feedback_category_check
    CHECK (category IS NULL OR category IN ('wrong_misleading', 'confusing_wording', 'grading_off', 'bug', 'idea'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Backfill existing feedback rows: they all came from the per-question History flow.
UPDATE user_attempts
  SET source = 'history', scope = 'question'
  WHERE source IS NULL
    AND user_feedback IS NOT NULL AND length(trim(user_feedback)) > 0;

-- Rate-limit lookups scan a user's recent feedback_tab submissions.
CREATE INDEX IF NOT EXISTS idx_user_attempts_feedback_source
  ON user_attempts (user_id, source, feedback_submitted_at);
