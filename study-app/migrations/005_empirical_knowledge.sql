-- Migration 005: queryable projection of the empirical-knowledge doc
-- mw_exam_empirical_knowledge.md stays the CANONICAL, human-readable, git-versioned source.
-- This table is a DERIVED mirror, rebuilt from the doc by scripts/sync-ek-table.mjs whenever the
-- doc changes (in CI, with no Vercel deploy). The feedback-analysis agent reads it at runtime so a
-- freshly-synced ruling is visible immediately — no build-question-index rerun, no redeploy lag.
-- Never hand-edit; it is overwritten from the doc on every sync.

CREATE TABLE IF NOT EXISTS empirical_knowledge (
  ek_id         TEXT PRIMARY KEY,                 -- 'EK-0089'
  section       INTEGER NOT NULL,                 -- §number (1..9)
  tier          TEXT,                             -- STRONG SIGNAL | PLAUSIBLE | CURVEBALL | PROCESS
  status        TEXT NOT NULL DEFAULT 'live',     -- live | superseded
  title         TEXT NOT NULL,
  claim         TEXT NOT NULL,
  evidence      TEXT,
  paper         INTEGER,                          -- 1/2/3 when the entry is paper-specific, else NULL
  superseded_by TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ek_section ON empirical_knowledge (section);
CREATE INDEX IF NOT EXISTS idx_ek_paper   ON empirical_knowledge (paper);
CREATE INDEX IF NOT EXISTS idx_ek_status  ON empirical_knowledge (status);
