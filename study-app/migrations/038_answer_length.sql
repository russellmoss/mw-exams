-- Migration 038: Answer Length — hold generated MODEL ANSWERS to a mark-proportional word budget.
--
-- Companion to migration 035 (Length Check), which does the same job for question STEMS. After a model
-- answer is generated and its four sections parsed, lib/answer-length.ts measures the answer PROSE in
-- code (excluding YAML frontmatter, markdown headers and the appended citation block) and compares it
-- to a budget of 6.5 words per mark, band 4.5-8.5 (EK-0017: expected depth scales with marks). An
-- off-budget answer gets up to two model rewrites (lib/answer-length-gate.ts) that cut padding or add
-- load-bearing content without touching the funnelling, the per-wine differentiation, or the
-- "under the skin" insight.
--
-- This replaces a self-reported `actual_word_count:` in the answer's own frontmatter, which was
-- fabricated: across 319 banked answers the reported values span 392-447 (median 424) while the real
-- median body count is 458, and 77 of the 239 numeric self-reports are >10% wrong.
--
--   answer_length_status  'clean'      — in band first time.
--                         'corrected'  — was off budget, a rewrite brought it into band.
--                         'over'       — still above the ceiling after the rewrites.
--                         'under'      — still below the floor after the rewrites.
--                         NULL         — pre-feature row / never checked → treated as 'clean'.
--
-- Nothing renders these yet. They are written by the three model-answer paths and read by
-- scripts/regen-model-answers.mjs --repair; an admin chip alongside the existing Length Check one in
-- FillTheBankCard is the obvious next step, not a promise this migration makes.
--
--   answer_word_count     INT   measured body words of model_answer. Its own column so the offline
--                               repair selector and any distribution query can filter without
--                               re-parsing markdown in SQL. NULL = never measured.
--
--   answer_length (JSONB) { wordCount, totalMarks, target, min, max, wordsPerMark,
--                           attempts:[{attempt, wordCount, verdict}],
--                           summary }
--
-- Additive / idempotent — safe to run repeatedly. Existing rows stay NULL; they are re-measured as the
-- corpus is regenerated through scripts/regen-model-answers.mjs --repair, which computes the count in
-- JS with the same function the generator gates on.

ALTER TABLE generated_questions
  ADD COLUMN IF NOT EXISTS answer_length_status TEXT  NULL;

ALTER TABLE generated_questions
  ADD COLUMN IF NOT EXISTS answer_word_count    INT   NULL;

ALTER TABLE generated_questions
  ADD COLUMN IF NOT EXISTS answer_length        JSONB NULL;

-- The repair selector's hot path: "every answer whose measured count is off budget". Partial index —
-- a row that was never measured is found by the IS NULL branch, which the planner handles separately.
CREATE INDEX IF NOT EXISTS idx_generated_questions_answer_word_count
  ON generated_questions (answer_word_count)
  WHERE answer_word_count IS NOT NULL;
