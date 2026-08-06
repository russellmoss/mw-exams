-- Migration 043: Live Tasting "I'll choose wines" (BYO) mode — user-1 feature request 2026-08-06.
--
-- A BYO session starts as TASTING PREP: the user picks paper + question type, an LLM writes a
-- shopping brief (what wines to target), and the session exists with NO question yet. After
-- buying, the user enters the actual wines (producer/name/vintage/country/region/price); the
-- pinned generator then builds the question+answer around them (Tavily enrichment researches
-- the tasting notes exactly as for bank wines) and the session proceeds like any other.
--
--   * question_id becomes NULLABLE: NULL = prep state ("tasting prep in progress").
--   * mode: 'pick-for-me' (availability-driven, the original) | 'byo'.
--   * prep_guidance: the shopping brief markdown.
--   * entered_wines: the user's input, verbatim, for the reveal/audit trail.
--
-- Additive / idempotent — safe to run repeatedly. MUST be applied to Neon.

ALTER TABLE live_tasting_sessions ALTER COLUMN question_id DROP NOT NULL;
ALTER TABLE live_tasting_sessions ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'pick-for-me';
ALTER TABLE live_tasting_sessions ADD COLUMN IF NOT EXISTS prep_guidance TEXT;
ALTER TABLE live_tasting_sessions ADD COLUMN IF NOT EXISTS entered_wines JSONB;

DO $$ BEGIN
  ALTER TABLE live_tasting_sessions
    ADD CONSTRAINT live_tasting_sessions_mode_check
    CHECK (mode IN ('pick-for-me', 'byo'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
