-- Migration 003: play-the-verdict-narration-once tracking
-- The notification bell must speak each verdict AT MOST ONCE per user, ever —
-- even across page navigations, reloads, and devices. In-memory de-dup can't
-- guarantee that (it resets on remount), so we persist a "played" timestamp on
-- the analysis row. The bell only plays narration where this is NULL, and marks
-- it the moment playback actually starts. The unread bell count is unaffected —
-- it keeps climbing off is_read until the user opens the bell.
-- Additive only — safe to run repeatedly.

ALTER TABLE feedback_analyses ADD COLUMN IF NOT EXISTS narration_played_at TIMESTAMPTZ;
