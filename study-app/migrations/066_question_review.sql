-- Migration 066: "Question Review" — a two-expert rapid pass over the servable bank.
--
-- Mike Juergens and Russell Moss go through the banked questions one at a time and give each a
-- thumbs up or a thumbs down. A thumbs down carries a reason and feeds the EXISTING feedback loop
-- (user_attempts -> runFeedbackAnalysis -> verdict -> notification bell -> rebuttal thread), so this
-- migration adds no second feedback store. It adds three things:
--
--   1. users.can_review_questions — the per-user gate on the surface.
--   2. question_reviews           — one row per (question, reviewer): the vote and its reason.
--   3. a widened user_attempts.source CHECK, so a review-sourced feedback row can be told apart
--      from Coach/History feedback in the admin queue and the root-cause miner.
--
-- Additive / idempotent — safe to run repeatedly. MUST be applied to Neon.

-- ── 1. The gate ──────────────────────────────────────────────────────────────────────────────────
--
-- is_admin cannot gate this: 12 of the 14 live accounts are admins, so an admin check would show the
-- surface to nearly everyone. This is its own flag, following the same per-user-column pattern as
-- stem_detail_default (013), input_method_default (023) and the walkthrough flags (050/051/056/061/062).
ALTER TABLE users ADD COLUMN IF NOT EXISTS can_review_questions BOOLEAN NOT NULL DEFAULT false;

-- Seed the two reviewers. Matched on email rather than id so this is reproducible against any
-- environment, and lower()'d because the users table has no case-folding on email. Both the active
-- accounts and the currently-inactive alternates are listed: getUser() rejects an inactive user
-- anyway, so flagging one is inert, and it means reactivating an account doesn't silently lose the
-- grant. Granting a third reviewer is a one-line UPDATE, not a deploy.
UPDATE users SET can_review_questions = true
WHERE lower(email) IN (
  'mike@bhutanwine.com',
  'michael@michaeljuergens.com',
  'russellmoss87@gmail.com',
  'russell.moss@savvywealth.com'
);

-- ── 2. The votes ─────────────────────────────────────────────────────────────────────────────────
--
-- verdict:
--   'up'   — the question is good. Also writes generated_questions.endorsed_at (migration 057), so
--            an endorsed question becomes a generation exemplar. Costs nothing to record.
--   'down' — the question is bad. Carries reason_tags/reason_note and spawns the user_attempts row
--            named by attempt_id, whose analysis lands in analysis_id.
--   'skip' — deliberately no opinion. Counts as SEEN but not as a vote, so a reviewer is never
--            forced into a lazy thumbs-up on a question they don't want to rule on. A lazy up is
--            worse than silence here: endorsements are fed back into the generation prompt.
CREATE TABLE IF NOT EXISTS question_reviews (
  id            SERIAL PRIMARY KEY,
  question_id   TEXT        NOT NULL,
  reviewer_id   INTEGER     NOT NULL REFERENCES users(id),
  verdict       TEXT        NOT NULL CHECK (verdict IN ('up', 'down', 'skip')),
  reason_tags   JSONB,
  reason_note   TEXT,
  -- The user_attempts row this down-vote created, and the feedback_analyses row adjudicating it.
  -- Both NULL for 'up' and 'skip'. Not FKs: user_attempts rows are user-deletable (migration 060),
  -- and losing the attempt must not cascade away the vote that the countdown is computed from.
  attempt_id    INTEGER,
  analysis_id   INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One vote per reviewer per question — the two reviewers work INDEPENDENTLY, so the key is the pair,
-- not the question. This is also what makes the per-reviewer countdown a plain COUNT, and what lets a
-- re-vote be an idempotent upsert rather than a duplicate row.
CREATE UNIQUE INDEX IF NOT EXISTS idx_question_reviews_pair
  ON question_reviews (question_id, reviewer_id);

-- The countdown ("N done, M left") and the session list both scan one reviewer, newest first.
CREATE INDEX IF NOT EXISTS idx_question_reviews_reviewer
  ON question_reviews (reviewer_id, created_at DESC);

-- The disagreement view groups by question across reviewers.
CREATE INDEX IF NOT EXISTS idx_question_reviews_question
  ON question_reviews (question_id);

-- ── 3. Feedback provenance ───────────────────────────────────────────────────────────────────────
--
-- Migration 053 constrained user_attempts.source to ('feedback_tab', 'history'). A review-sourced row
-- must be distinguishable from both: it comes from an expert ruling on a question they never sat,
-- which is a different evidence class from a candidate's in-flight complaint, and the admin queue and
-- root-cause miner should be able to weight it accordingly. Without widening this, the very first
-- down-vote would throw on the INSERT.
ALTER TABLE user_attempts DROP CONSTRAINT IF EXISTS user_attempts_feedback_source_check;
ALTER TABLE user_attempts ADD CONSTRAINT user_attempts_feedback_source_check
  CHECK (source IS NULL OR source IN ('feedback_tab', 'history', 'question_review'));
