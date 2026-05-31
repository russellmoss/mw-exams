-- Migration 008: grading telemetry (persist the detect-only grading-override signals)
-- Append-only table recording every grading event's machine-readable verdict tag
-- (GRADING_META) so the confidence-fidelity signals the graders already self-report
-- accumulate into queryable data instead of evaporating into console.warn.
--
-- This is the prerequisite for the back half of the confidence roadmap
-- (outputs/research/confidence_implementation_recommendations.md): R5 (banker/curveball
-- difficulty calibration), R7 (pre-glass difficulty hint, gated on this data), and R8
-- (enforce howler->FAIL — needs the false-positive rate measured here first). Detect-only:
-- nothing in this table changes a verdict; it only lets us MEASURE what the graders did.
--
-- Additive only — safe to run repeatedly (IF NOT EXISTS guards).
-- Apply: psql "$DATABASE_URL" -f migrations/008_grading_telemetry.sql
-- (or via the Neon MCP run_sql tool against the neondb branch).

CREATE TABLE IF NOT EXISTS grading_telemetry (
  id                          BIGSERIAL   PRIMARY KEY,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  grader                      TEXT        NOT NULL,        -- full_debrief | answer_grading
  user_id                     INTEGER,                     -- requesting user, if known
  paper                       INTEGER,                     -- 1 | 2 | 3, if known
  question_id                 TEXT,                         -- links to generated_questions (nullable)

  -- The grader's self-reported verdict tag (GRADING_META), per GRADING_META_INSTRUCTION.
  verdict                     TEXT,                         -- PASS | BORDERLINE | FAIL
  howler_present              BOOLEAN,                      -- a factually impossible claim in the answer
  howler                      TEXT,                         -- short phrase, if any
  cascade_flag                BOOLEAN,                      -- answered downstream for the GUESSED wine
  wrong_call_plausible        BOOLEAN,                      -- primary ID: wrong-but-adjacent (null = correct/no-ID)
  credit_given                TEXT,                         -- none | partial | full (conclusion credit awarded)

  -- Precomputed mismatch flags so base rates / false-positive rates are a trivial COUNT
  -- (the same conditions recordGradingOverrideCheck warns on).
  howler_borderline_mismatch  BOOLEAN     NOT NULL DEFAULT FALSE,  -- howler present + verdict BORDERLINE (IMW rule -> FAIL)
  overcredit_mismatch         BOOLEAN     NOT NULL DEFAULT FALSE,  -- implausible wrong call awarded FULL credit
  undercredit_mismatch        BOOLEAN     NOT NULL DEFAULT FALSE   -- plausible wrong call awarded NO credit
);

CREATE INDEX IF NOT EXISTS idx_grading_telemetry_created  ON grading_telemetry (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_grading_telemetry_grader   ON grading_telemetry (grader);
CREATE INDEX IF NOT EXISTS idx_grading_telemetry_verdict  ON grading_telemetry (verdict);
CREATE INDEX IF NOT EXISTS idx_grading_telemetry_mismatch ON grading_telemetry (howler_borderline_mismatch, overcredit_mismatch, undercredit_mismatch);
