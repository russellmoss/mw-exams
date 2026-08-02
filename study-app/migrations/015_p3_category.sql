-- Migration 015: Paper 3 category tag — the invisible style family a P3 flight belongs to
-- (sparkling | sweet | fortified | oxidative | rose | other). Drives the weighted-sampling layer
-- that steers P3 serving toward historical exam composition and backs the candidate-facing 'Focus'
-- override. Nullable: NULL means "not yet classified" (backfilled by scripts/backfill-p3-category.mjs
-- for existing rows; new P3 questions are tagged at insert). Papers 1 and 2 leave it NULL.
--
-- Additive / idempotent — safe to run repeatedly.

ALTER TABLE generated_questions ADD COLUMN IF NOT EXISTS p3_category TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'generated_questions_p3_category_check'
  ) THEN
    ALTER TABLE generated_questions ADD CONSTRAINT generated_questions_p3_category_check
      CHECK (p3_category IS NULL OR p3_category IN
        ('sparkling','sweet','fortified','oxidative','rose','other'));
  END IF;
END $$;

-- Serving reads P3 rows filtered by category; index keeps that cheap.
CREATE INDEX IF NOT EXISTS idx_generated_questions_p3_category
  ON generated_questions (paper, p3_category);
