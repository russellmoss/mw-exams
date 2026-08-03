-- Migration 020: reusable question bank + per-user exposure tracking.
--
-- Feature "New or Banked Question": the /study setup card now offers two ways to start —
-- generate a fresh question (existing behaviour) OR serve a previously-generated one this user
-- has never seen. That needs (a) a durable, reusable pool of generated questions, and (b) a
-- per-user "seen" ledger that burns a question the moment it is served, even if abandoned.
--
-- (a) THE POOL already exists: `generated_questions` is written on every successful, validated
--     generation and is independent of attempts — it IS the question bank. Rather than duplicate
--     it into a second `question_bank` table, we extend it with the bank bookkeeping columns the
--     spec calls for (times_served, is_retired, created_by_user_id). Retirement already had a
--     stronger sibling in `invalid_reasons` (the validator/feedback quarantine flag); `is_retired`
--     is the additional soft-retire switch and every bank query gates on BOTH.
--
-- (b) THE SEEN LEDGER is new: `question_views`. One row per (user, question) the first time it is
--     served — from the bank or freshly generated. The unique constraint makes the insert
--     idempotent (a re-serve never moves first_seen_at); the anti-join in the bank-count and
--     banked-serve queries reads it to exclude anything this user has already seen.
--
-- Additive / idempotent — safe to run repeatedly.

ALTER TABLE generated_questions ADD COLUMN IF NOT EXISTS times_served       INT     DEFAULT 0;
ALTER TABLE generated_questions ADD COLUMN IF NOT EXISTS is_retired         BOOLEAN DEFAULT false;
ALTER TABLE generated_questions ADD COLUMN IF NOT EXISTS created_by_user_id INT;

CREATE TABLE IF NOT EXISTS question_views (
  id            SERIAL PRIMARY KEY,
  user_id       INT         NOT NULL,
  question_id   TEXT        NOT NULL,   -- links to generated_questions.question_id
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, question_id)
);

-- The bank queries anti-join question_views by user across the whole pool, so index by user.
CREATE INDEX IF NOT EXISTS idx_question_views_user ON question_views (user_id);
