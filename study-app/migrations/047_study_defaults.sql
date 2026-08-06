-- Migration 047: Study Defaults — per-user system-behaviour defaults chosen on the post-signup
-- onboarding screen (and editable any time in Settings).
--
--   • question_source_default — which acquire path the study flow leads with: 'banked' (serve a
--     reviewed pool question this user has never seen; no model call, costs nothing on their API
--     key) or 'fresh' (generate on the spot). The column default 'fresh' preserves the behaviour
--     every existing account already has; the onboarding screen recommends 'banked' to BYOK users
--     and writes the choice explicitly.
--   • reasoning_stream_default — whether this user's generation/grading calls request the model's
--     summarized reasoning for live display. FALSE stops paying for those thinking tokens (see
--     lib/thinking-stream.ts); TRUE preserves current behaviour for existing accounts.
--
-- Additive / idempotent — safe to run repeatedly.

ALTER TABLE users ADD COLUMN IF NOT EXISTS question_source_default TEXT NOT NULL DEFAULT 'fresh';
ALTER TABLE users ADD COLUMN IF NOT EXISTS reasoning_stream_default BOOLEAN NOT NULL DEFAULT true;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_question_source_default_check'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_question_source_default_check
      CHECK (question_source_default IN ('banked','fresh'));
  END IF;
END $$;
