-- Migration 002: spoken feedback-verdict notifications + ElevenLabs usage tracking
-- Adds a Sonnet-written, ElevenLabs-voiced explanation of each feedback verdict
-- (accept/reject/partial) that the notification bell plays aloud, plus an
-- append-only usage table for the TTS spend so it shows on the Cost dashboard
-- alongside Claude (model_usage) and Tavily (tavily_usage).
-- Additive only — safe to run repeatedly (IF NOT EXISTS guards).
--
-- Apply: via the Neon MCP run_sql tool against the MW-exam project, or
--   psql "$DATABASE_URL" -f migrations/002_notification_narration.sql

-- ── Narration columns on the analysis row ────────────────────────────────────
-- The verdict explanation that the bell speaks. Generated server-side right
-- before the analysis flips to 'complete', so the audio is ready the moment the
-- notification surfaces. narration_audio holds base64-encoded mp3 (kept inline —
-- clips are tiny and low-volume, and this avoids a blob store dependency).
ALTER TABLE feedback_analyses ADD COLUMN IF NOT EXISTS narration_text  TEXT;
ALTER TABLE feedback_analyses ADD COLUMN IF NOT EXISTS narration_audio TEXT;      -- base64 mp3
ALTER TABLE feedback_analyses ADD COLUMN IF NOT EXISTS narration_voice TEXT;      -- ElevenLabs voice id used
ALTER TABLE feedback_analyses ADD COLUMN IF NOT EXISTS narration_chars INTEGER;   -- chars synthesized (= TTS credits)

-- ── Per-ElevenLabs-call usage ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS elevenlabs_usage (
  id            BIGSERIAL PRIMARY KEY,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  task_type     TEXT        NOT NULL,                  -- notification_narration
  voice_id      TEXT,
  model_id      TEXT,                                  -- eleven_turbo_v2_5 etc.
  characters    INTEGER     NOT NULL DEFAULT 0,        -- chars synthesized = credits
  credits       INTEGER     NOT NULL DEFAULT 0,        -- ElevenLabs credits (1/char on turbo)
  cost_usd      NUMERIC(12,6) NOT NULL DEFAULT 0,      -- characters/1000 * per-1k rate (plan-dependent estimate)
  user_id       INTEGER,
  attempt_id    INTEGER,
  analysis_id   INTEGER,
  latency_ms    INTEGER,
  success       BOOLEAN     NOT NULL DEFAULT TRUE,
  error         TEXT
);

CREATE INDEX IF NOT EXISTS idx_elevenlabs_usage_created ON elevenlabs_usage (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_elevenlabs_usage_task    ON elevenlabs_usage (task_type);
