-- Migration 018: question-generation attempt telemetry.
--
-- Until now the generation retry loop threw its own failure data away: `lastViolations` was computed
-- on every attempt, printed to console.error, and dropped. Only the SURVIVING question was persisted
-- (generated_questions), so there was no way to answer the one question that matters for making
-- first-pass generation work — "which validator is actually rejecting our drafts, and is it getting
-- better or worse?" Prompt and spec changes were being made blind.
--
-- This table records EVERY attempt, passed or failed, keyed by the prompt/spec version that produced
-- it. That turns the retry loop into a measurable system: scripts/analyze-generation.mjs reads this
-- to rank rules by firing frequency and to compare first-pass rate across prompt versions, which is
-- the readout the improvement loop steers on.
--
-- Append-only and fire-and-forget: nothing in the serving path reads it, and a write failure here
-- must never fail a generation (the logger swallows its own errors).
--
-- Additive only — safe to run repeatedly (IF NOT EXISTS guards).

CREATE TABLE IF NOT EXISTS generation_attempts (
  id                BIGSERIAL   PRIMARY KEY,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- What was asked for
  paper             INTEGER     NOT NULL,
  family            TEXT,
  source            TEXT,                    -- study | stem_sniper | reverse_tasting | ...
  user_id           INTEGER,

  -- Which attempt in the loop, and what produced it
  attempt           INTEGER     NOT NULL,    -- 1-based; attempt 1 IS the first-pass measurement
  model             TEXT,
  ab_group          TEXT,
  prompt_version    TEXT,                    -- bumped whenever the generation prompt changes
  spec_version      TEXT,                    -- the flight-spec compiler's version
  is_repair         BOOLEAN     NOT NULL DEFAULT FALSE,  -- retry carried the prior violations back in

  -- What the deterministic spec pre-decided (so a rule that fires DESPITE the spec is visible)
  spec_wine_count   INTEGER,
  spec_axis         TEXT,

  -- The outcome
  passed            BOOLEAN     NOT NULL,
  rules_fired       TEXT[],                  -- validator names, e.g. {markMix,banker}
  violations        JSONB,                   -- full violation strings, for reading real examples
  question_id       TEXT,                    -- set on the attempt that shipped
  latency_ms        INTEGER,
  parse_failed      BOOLEAN     NOT NULL DEFAULT FALSE,
  model_error       TEXT                     -- set when the call itself failed (timeout/429/529)
);

-- The two queries the analysis script runs: recent attempts by version, and rule frequency.
CREATE INDEX IF NOT EXISTS idx_generation_attempts_created
  ON generation_attempts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generation_attempts_version
  ON generation_attempts (prompt_version, spec_version, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generation_attempts_first_pass
  ON generation_attempts (paper, attempt, passed);
