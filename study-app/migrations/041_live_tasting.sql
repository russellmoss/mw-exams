-- Migration 041: Live Tasting — buy-local blind tasting sessions.
--
-- A Live Tasting session generates an MW-style question around wines the user can actually buy
-- near where they live (Tavily retail search), hides the answer key, and grades the user's blind
-- note via the standard full-answer grader. Plan: live_tasting_plan.md (repo root), council-
-- hardened v2.1.
--
-- Design notes that shape this schema:
--   * Sessions store immutable EVENT TIMESTAMPS (user_revealed_at, token_first_used_at,
--     graded_at, ...) instead of a coarse status enum; display state and the blind-integrity
--     badge are derived at render time and can only ever downgrade.
--   * share_token is stored HASHED (sha-256 hex). The raw token is shown once at mint time; DB
--     read access must never yield a usable partner link.
--   * attempt_id is UNIQUE — the session↔attempt one-to-one invariant, and the CAS target for
--     the double-submit grading lock (UPDATE ... WHERE attempt_id IS NULL).
--   * generated_questions.scope separates AUDIENCE from lifecycle status: 'pool' rows serve the
--     general study pools; 'live-tasting' rows belong to one session and must never be served
--     elsewhere. Every pool query filters scope='pool' (enforced by test).
--   * wine_bank.price_band is the deterministic primary budget gate ('value'|'premium'|
--     'super_premium'|'icon'); Tavily snippet prices only refine it. Unknown band = not a
--     candidate. No CHECK on users.live_budget_currency — whitelist is app-side.
--   * app_flags is a tiny cross-instance latch store (first user: tavily_quota), because a
--     module-level latch does not survive serverless cold starts.
--
-- Additive / idempotent — safe to run repeatedly. MUST be applied to Neon.

ALTER TABLE users ADD COLUMN IF NOT EXISTS live_city            TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS live_country         TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS live_budget_amount   NUMERIC;
ALTER TABLE users ADD COLUMN IF NOT EXISTS live_budget_currency TEXT;

ALTER TABLE wine_bank ADD COLUMN IF NOT EXISTS price_band TEXT;

ALTER TABLE generated_questions ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'pool';

DO $$ BEGIN
  ALTER TABLE generated_questions
    ADD CONSTRAINT generated_questions_scope_check
    CHECK (scope IN ('pool', 'live-tasting'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS live_tasting_sessions (
  id                  TEXT PRIMARY KEY,
  user_id             INTEGER NOT NULL REFERENCES users(id),
  question_id         TEXT NOT NULL REFERENCES generated_questions(question_id),
  paper               INTEGER NOT NULL,
  flight_size         INTEGER NOT NULL,
  archetype           TEXT NOT NULL,
  city                TEXT NOT NULL,
  country             TEXT NOT NULL,
  budget_amount       NUMERIC,
  budget_currency     TEXT,
  availability        JSONB,
  vintages_bought     JSONB,
  share_token_hash    TEXT UNIQUE,
  share_expires_at    TIMESTAMPTZ,
  attempt_id          INTEGER UNIQUE REFERENCES user_attempts(id),
  user_revealed_at    TIMESTAMPTZ,
  share_created_at    TIMESTAMPTZ,
  token_first_used_at TIMESTAMPTZ,
  graded_at           TIMESTAMPTZ,
  abandoned_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lts_user_created
  ON live_tasting_sessions (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS retail_availability (
  cache_key     TEXT PRIMARY KEY,
  wine_key      TEXT NOT NULL,
  city          TEXT NOT NULL,
  country       TEXT NOT NULL,
  stockists     JSONB NOT NULL,
  searched_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  refreshing_at TIMESTAMPTZ,
  hit_count     INTEGER NOT NULL DEFAULT 0,
  last_used_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS app_flags (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
