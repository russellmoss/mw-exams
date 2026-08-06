-- Migration 045: BYO shopping-brief routing (user-1 feedback, 2026-08-06).
--
-- "Who should get the shopping brief?" — the candidate chooses Me or A Partner. Partner: the
-- brief is EMAILED (with the entry link) and the candidate never sees it — full blindness now
-- starts at the brief, not just the wine list. The prep API withholds prep_guidance until the
-- candidate explicitly opens it (brief_self_opened_at, set-once).
--
--   * brief_sent_to: the partner email the brief went to (display + resend).
--   * brief_self_opened_at: candidate chose "Me" — brief served to them from then on.
--
-- Additive / idempotent — safe to run repeatedly. MUST be applied to Neon.

ALTER TABLE live_tasting_sessions ADD COLUMN IF NOT EXISTS brief_sent_to TEXT;
ALTER TABLE live_tasting_sessions ADD COLUMN IF NOT EXISTS brief_self_opened_at TIMESTAMPTZ;
