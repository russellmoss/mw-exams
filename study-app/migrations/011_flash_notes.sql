-- Migration 011: Flash Notes — a rapid, single-prompt variant of Dry Notes.
-- Flash Notes runs as a 4th practice mode. Each card is persisted to user_attempts
-- with mode = 'flash' so it shows up in History (with results + "Leave feedback"),
-- exactly like a Dry Notes ('known-wine') attempt. These columns carry the extra
-- per-card / per-deck metadata the mode needs.
--
-- `mode` and `elapsed_seconds` already exist on user_attempts (used by Dry Notes and
-- the study timer respectively); the new mode VALUE 'flash' needs no schema change.
-- Additive only — safe to run repeatedly.

ALTER TABLE user_attempts ADD COLUMN IF NOT EXISTS prompt_type       TEXT;    -- 'style' | 'quality' | 'maturity' | 'commercial' (the single graded competency)
ALTER TABLE user_attempts ADD COLUMN IF NOT EXISTS flight_wine_count INTEGER; -- wines surfaced on the card (2–3), for per-wine pace math
ALTER TABLE user_attempts ADD COLUMN IF NOT EXISTS deck_id           TEXT;    -- session/deck id (NULL for a one-off / infinite card not grouped)
ALTER TABLE user_attempts ADD COLUMN IF NOT EXISTS card_index        INTEGER; -- 0-based position within a built deck
ALTER TABLE user_attempts ADD COLUMN IF NOT EXISTS deck_settings     JSONB;   -- { mode: 'deck'|'infinite', count, promptTypes, mixItUp } for "Run it again"

-- History filters by mode; keep the common lookup fast.
CREATE INDEX IF NOT EXISTS idx_user_attempts_mode ON user_attempts (mode);
