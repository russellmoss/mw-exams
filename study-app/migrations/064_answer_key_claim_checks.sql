-- Migration 064: record the answer-key CLAIM check on each grading event.
--
-- validateAnswerKeyClaims (question-validator.ts) checks that a debrief's PROSE does not assert wine
-- facts the answer key contradicts — a curveball called a banker (fb_188), an absolute production-method
-- claim about a mixed-method category (fb_175), a quality hierarchy flattened to geography when a keyed
-- region ranks producers or ageing (fb_135). On a hard violation the debrief gets ONE targeted correction
-- pass before the authoritative text is served.
--
-- These columns exist so the loop is measurable rather than merely believed:
--   • how often the check fires at all (is the defect as recurrent as three ledger rows suggest?)
--   • whether the correction pass actually fixes it (reason_after IS NULL) or just costs a second call
--   • how often the corrector itself fails, since that path serves the uncorrected prose on purpose
--
-- Without the last two, a rule that fires constantly and fixes nothing would look identical to one that
-- works. That matters here because each fire bills a full extra grading-sized completion.
--
-- Additive only, all nullable/defaulted — safe to run repeatedly (IF NOT EXISTS guards).
-- Apply: psql "$DATABASE_URL" -f migrations/064_answer_key_claim_checks.sql
-- (or let scripts/migrate.mjs apply it on the next PRODUCTION deploy).

-- SOFT vs HARD matters when reading these columns. Rule 1 (role) is HARD only against a role the answer
-- key actually stores, and nothing stores one yet, so today it emits a SOFT flag: recorded here, no
-- rewrite, nothing billed. Rules 2 and 3 are hard. So:
--    claim_rules non-empty AND claim_reason_before IS NULL  →  soft, review-only, cost zero
--    claim_reason_before IS NOT NULL                        →  hard, a correction pass ran (or tried)
ALTER TABLE grading_telemetry
  -- The HARD-violation detail(s) the FIRST draft failed on. NULL = no hard violation (see above).
  ADD COLUMN IF NOT EXISTS claim_reason_before  TEXT,
  -- Still-failing hard detail(s) in the text that actually SHIPPED. NULL = clean when served.
  ADD COLUMN IF NOT EXISTS claim_reason_after   TEXT,
  -- Every rule that fired, soft or hard: answer-key-claim-{role,method,hierarchy}.
  ADD COLUMN IF NOT EXISTS claim_rules          TEXT[],
  -- A correction pass ran (and its redraft was served).
  ADD COLUMN IF NOT EXISTS claim_regenerated    BOOLEAN NOT NULL DEFAULT FALSE,
  -- The corrector threw or returned nothing; the ORIGINAL prose was served as the fallback.
  ADD COLUMN IF NOT EXISTS claim_correction_failed BOOLEAN NOT NULL DEFAULT FALSE;

-- Partial index: the interesting rows are the minority where any claim rule fired.
CREATE INDEX IF NOT EXISTS idx_grading_telemetry_claim_fired
  ON grading_telemetry (created_at DESC)
  WHERE claim_rules IS NOT NULL;
