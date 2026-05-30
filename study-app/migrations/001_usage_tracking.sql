-- Migration 001: API usage / cost tracking
-- Adds two append-only tables that record every billable Claude (Anthropic) and
-- Tavily call. The admin "Cost" dashboard and the cost-optimization command read
-- from these. Additive only — safe to run repeatedly (IF NOT EXISTS guards).
--
-- Apply: psql "$DATABASE_URL" -f migrations/001_usage_tracking.sql
-- (or via the Neon MCP run_sql tool against the neondb branch).

-- ── Per-Claude-call usage ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS model_usage (
  id                    BIGSERIAL PRIMARY KEY,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- What the call was for: question_generation | question_appearance |
  -- model_answer | tasting_generation | wine_enrichment | answer_grading |
  -- reasoning_grading | full_debrief | feedback_analysis | feedback_reply |
  -- key_validation
  task_type             TEXT        NOT NULL,
  model                 TEXT        NOT NULL,          -- resolved model id actually used
  -- 'server' = our ANTHROPIC_API_KEY (we pay); 'user' = candidate's own key (they pay)
  source                TEXT        NOT NULL DEFAULT 'server',
  user_id               INTEGER,                       -- requesting user, if known
  attempt_id            INTEGER,                       -- links to user_attempts for accuracy joins
  question_id           TEXT,                          -- links to generated_questions
  ab_group              TEXT,                          -- Phase 2: A/B experiment arm label
  input_tokens          INTEGER     NOT NULL DEFAULT 0,
  output_tokens         INTEGER     NOT NULL DEFAULT 0,
  cache_read_tokens     INTEGER     NOT NULL DEFAULT 0,
  cache_creation_tokens INTEGER     NOT NULL DEFAULT 0,
  cost_usd              NUMERIC(12,6) NOT NULL DEFAULT 0,
  latency_ms            INTEGER,
  success               BOOLEAN     NOT NULL DEFAULT TRUE,
  error                 TEXT
);

CREATE INDEX IF NOT EXISTS idx_model_usage_created   ON model_usage (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_model_usage_task      ON model_usage (task_type);
CREATE INDEX IF NOT EXISTS idx_model_usage_model     ON model_usage (model);
CREATE INDEX IF NOT EXISTS idx_model_usage_ab        ON model_usage (task_type, ab_group);
CREATE INDEX IF NOT EXISTS idx_model_usage_question  ON model_usage (question_id);

-- ── Per-Tavily-call usage ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tavily_usage (
  id            BIGSERIAL PRIMARY KEY,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  task_type     TEXT        NOT NULL,                  -- wine_enrichment | feedback_factcheck
  query         TEXT,
  results_count INTEGER     NOT NULL DEFAULT 0,
  credits       INTEGER     NOT NULL DEFAULT 1,        -- basic search = 1 credit
  cost_usd      NUMERIC(12,6) NOT NULL DEFAULT 0,      -- credits * $0.008
  user_id       INTEGER,
  question_id   TEXT,
  success       BOOLEAN     NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_tavily_usage_created ON tavily_usage (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tavily_usage_task    ON tavily_usage (task_type);
