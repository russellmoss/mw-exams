-- Migration 065: record WHICH wines the generator intended as curveballs.
--
-- The generation prompt has always asked for `Curveball: [which wine and why, or "None"]` and nothing
-- ever parsed it — the flight's own intent was produced and thrown away on every generation. (The
-- existing `curveball` column is not that: across all 800 populated rows it holds "low"/"medium"/"high",
-- duplicating curveball_level. Zero contain a digit.)
--
-- That intent is what makes the answer key's per-wine `role` authoritative. Without it, Rule 1 of
-- validateAnswerKeyClaims can only compare a debrief's "banker"/"curveball" label against isBanker() —
-- a reviewer-calibrated region×variety table, but still an inference about the wine rather than a record
-- of what the question was built to do.
--
-- NULL vs '{}' is load-bearing and must not be collapsed:
--   NULL  → the generator did not say. The role stays DERIVED, and Rule 1 only flags for review.
--   '{}'  → the generator positively declared every wine an anchor. Enforced.
-- Defaulting a missing line to '{}' would key every wine a banker and turn every legitimate mention of
-- a curveball in a debrief into a rewrite.
--
-- Additive only, nullable — safe to run repeatedly.
-- Apply: psql "$DATABASE_URL" -f migrations/065_curveball_slots.sql

ALTER TABLE generated_questions
  ADD COLUMN IF NOT EXISTS curveball_slots INTEGER[];

COMMENT ON COLUMN generated_questions.curveball_slots IS
  'Wine slots the generator declared as curveballs. NULL = not declared (role stays derived); '
  '{} = declared all-anchor. Feeds stem_answer_keys.ground_truth[].role.';
