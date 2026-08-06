-- Shared daily cache for Theory fact-check retrieval.
-- Additive and idempotent: production builds may safely retry after a partial failure.

CREATE TABLE IF NOT EXISTS theory_retrieval_cache (
  question_id TEXT NOT NULL,
  date_bucket DATE NOT NULL,
  retrieval JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (question_id, date_bucket)
);

CREATE INDEX IF NOT EXISTS idx_theory_retrieval_cache_created_at
  ON theory_retrieval_cache (created_at);
