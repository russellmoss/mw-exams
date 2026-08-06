-- Migration 046: Live Tasting FULL PAPERS (user-1 feature, 2026-08-06; Phase D).
--
-- A paper = a corpus-realistic set of flights generated as one sitting: half (6 wines) or full
-- (12 wines), composition SAMPLED from the real exam corpus (family distribution + flight-size
-- patterns derived from the 112-question taxonomy — no user family choice), total-budget
-- allocation across flights, and a pacing choice made before starting:
--   * flight-by-flight — taste and grade each question whenever (no clock, no zeros)
--   * exam-conditions — one sitting against the real clock (2h15 full / half pro-rata);
--     unanswered questions at the deadline score ZERO, like the real exam.
--
-- Child flights are ordinary live_tasting_sessions (paper_id + paper_position) so generation,
-- blind serving, partner flow and grading reuse everything; the paper adds composition,
-- consolidated shopping/brief share, the clock, and the aggregate report.
--
-- Additive / idempotent — safe to run repeatedly. MUST be applied to Neon.

CREATE TABLE IF NOT EXISTS live_tasting_papers (
  id               TEXT PRIMARY KEY,          -- ltpr_<random>
  user_id          INTEGER NOT NULL REFERENCES users(id),
  paper            INTEGER NOT NULL,          -- 1 | 2 | 3
  size             TEXT NOT NULL CHECK (size IN ('half', 'full')),
  mode             TEXT NOT NULL CHECK (mode IN ('pick-for-me', 'byo')),
  pacing           TEXT NOT NULL CHECK (pacing IN ('flight-by-flight', 'exam-conditions')),
  total_budget     NUMERIC,
  budget_currency  TEXT,
  city             TEXT NOT NULL,
  country          TEXT NOT NULL,
  composition      JSONB NOT NULL,            -- sampled plan: [{position, family, flightSize, perBottleBudget}]
  prep_guidance    TEXT,                      -- BYO: ONE brief covering every flight
  brief_sent_to    TEXT,
  brief_self_opened_at TIMESTAMPTZ,
  share_token_hash TEXT UNIQUE,               -- paper-level partner link (list or brief+entry)
  share_expires_at TIMESTAMPTZ,
  token_first_used_at TIMESTAMPTZ,
  user_revealed_at TIMESTAMPTZ,
  exam_started_at  TIMESTAMPTZ,               -- exam-conditions: clock start (set-once)
  exam_deadline_at TIMESTAMPTZ,
  abandoned_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ltpr_user_created
  ON live_tasting_papers (user_id, created_at DESC);

ALTER TABLE live_tasting_sessions ADD COLUMN IF NOT EXISTS paper_id TEXT REFERENCES live_tasting_papers(id);
ALTER TABLE live_tasting_sessions ADD COLUMN IF NOT EXISTS paper_position INTEGER;

CREATE INDEX IF NOT EXISTS idx_lts_paper ON live_tasting_sessions (paper_id, paper_position);
