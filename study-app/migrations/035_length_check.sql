-- Migration 035: Length Check — enforce MW paper length/complexity on generated bank questions.
--
-- Feature "Length Check": after generation and the existing mark-allocation validator, the bank
-- worker runs an LLM length/ask-density audit (lib/length-check.ts). A failing question gets ONE
-- auto-repair pass (split over-crowded sub-bullets, trim wordy ones) that preserves meaning, every
-- mark number and the 25-marks-per-wine total (EK-0041). The outcome is stamped on the question so
-- admin batch review can surface a "Trimmed" / "Runs long" badge and a before/after diff.
--
--   length_check_status  'clean'    — passed first time, NO badge.
--                        'trimmed'  — failed, auto-repair fixed it (amber "Trimmed" chip + diff).
--                        'over'     — failed, still over after one repair (red "Runs long" chip).
--                        NULL       — pre-feature row / never checked → treated as 'clean', no badge.
--
--   length_check (JSONB) { totalWords,
--                          bullets:[{index,marks,wordCount,askCount,violations}],
--                          changes:[{bulletIndex, before, after}],
--                          summary }
--
-- Additive / idempotent — safe to run repeatedly. Existing rows stay NULL (no backfill needed: NULL
-- is read as 'clean' / no badge everywhere).

ALTER TABLE generated_questions
  ADD COLUMN IF NOT EXISTS length_check_status TEXT  NULL;

ALTER TABLE generated_questions
  ADD COLUMN IF NOT EXISTS length_check        JSONB NULL;
