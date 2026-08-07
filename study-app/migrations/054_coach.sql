-- Migration 054: the Coach — a conversational study assistant (docs/plans/2026-08-07-coach-widget.md).
--
-- Four tables, none of which overlap an existing store:
--
--   coach_conversations  one per chat thread. Kept server-side because the loop is stateless:
--                        a serverless function has no memory between turns, so the thread must be
--                        replayable from Postgres or multi-turn tool use cannot work at all.
--   coach_messages       one per turn. `blocks` holds the raw Anthropic content array (text +
--                        tool_use + tool_result) because replay must reconstruct the EXACT shape the
--                        API returned — a flattened string cannot be fed back as assistant context.
--                        `text` is the flattened display copy.
--   coach_feedback       thumbs up/down on a single assistant message.
--   coach_screenshots    base64 PNG captures (Phase 2). Precedent for base64-in-Postgres is
--                        media_cache.image_base64 and feedback_analyses.narration_audio.
--
-- WHY TOKEN COUNTS ARE COLUMNS, NOT JUST model_usage ROWS. Under BYOK every turn spends the
-- CANDIDATE's Anthropic credits, and the plan's H3/H4 findings are specifically about prompt-cache
-- behaviour. cache_read/cache_write per message is what makes a cache regression visible as data
-- rather than as a surprise on someone's bill. model_usage still gets its own row via logClaudeUsage;
-- this is the per-message detail that lets the cost-regression test (verification layer 6) assert a
-- baseline.
--
-- The kill switch (COACH_HARD_DISABLE / the 'coach_enabled' app_settings key) needs no DDL —
-- app_settings already exists as a key/value store.
--
-- Additive / idempotent — safe to run repeatedly.

CREATE TABLE IF NOT EXISTS coach_conversations (
  id          TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_coach_conversations_user
  ON coach_conversations (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS coach_messages (
  id              BIGSERIAL PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES coach_conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL,
  -- Raw Anthropic content blocks, verbatim. Replay depends on this being unmodified.
  blocks          JSONB,
  -- Flattened text for display and for the leak probe to scan.
  text            TEXT,
  model           TEXT,
  input_tokens        INTEGER,
  output_tokens       INTEGER,
  cache_read_tokens   INTEGER,
  cache_write_tokens  INTEGER,
  -- Which attempt state the turn was resolved under. Recorded so a leak can be traced back to the
  -- gate decision that allowed it (plan §4 / H2) rather than reconstructed by guesswork.
  attempt_state   TEXT,
  -- Tool names actually dispatched this turn. The citation guard (plan §5) asserts against this,
  -- and the routing eval reads it to score which surface the model chose.
  tools_used      TEXT[],
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE coach_messages
    ADD CONSTRAINT coach_messages_role_check CHECK (role IN ('user', 'assistant'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE coach_messages
    ADD CONSTRAINT coach_messages_attempt_state_check
    CHECK (attempt_state IS NULL OR attempt_state IN ('none', 'in_progress', 'submitted', 'graded'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_coach_messages_conversation
  ON coach_messages (conversation_id, id);

CREATE TABLE IF NOT EXISTS coach_feedback (
  id         BIGSERIAL PRIMARY KEY,
  message_id BIGINT NOT NULL REFERENCES coach_messages(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating     TEXT NOT NULL,
  comment    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE coach_feedback
    ADD CONSTRAINT coach_feedback_rating_check CHECK (rating IN ('up', 'down'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- One rating per message per user; re-rating updates in place (ON CONFLICT in the writer).
CREATE UNIQUE INDEX IF NOT EXISTS idx_coach_feedback_message_user
  ON coach_feedback (message_id, user_id);

CREATE TABLE IF NOT EXISTS coach_screenshots (
  id              BIGSERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id TEXT REFERENCES coach_conversations(id) ON DELETE CASCADE,
  message_id      BIGINT REFERENCES coach_messages(id) ON DELETE SET NULL,
  image_base64    TEXT NOT NULL,
  content_type    TEXT NOT NULL DEFAULT 'image/png',
  bytes           INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Retention sweeps delete oldest-first; conversations cascade.
CREATE INDEX IF NOT EXISTS idx_coach_screenshots_created
  ON coach_screenshots (created_at);
