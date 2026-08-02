-- Migration 013: Stem Detail — three-level dial (guided | exam_real | blind) controlling how much
-- organising information a question's stem reveals. Same question, wines, marks, model answer and
-- grading — only the stem prose changes.
--
-- Additive / idempotent — safe to run repeatedly.

-- 1. Served question stem variants. The canonical `question_text` stays as-is and is the fallback
--    for any variant that is still NULL. Backfilled lazily by /api/get-question (see lib/stem-detail.ts).
ALTER TABLE generated_questions ADD COLUMN IF NOT EXISTS stem_guided    TEXT;
ALTER TABLE generated_questions ADD COLUMN IF NOT EXISTS stem_exam_real TEXT;
ALTER TABLE generated_questions ADD COLUMN IF NOT EXISTS stem_blind     TEXT;

-- 2. Per-user default level.
ALTER TABLE users ADD COLUMN IF NOT EXISTS stem_detail_default TEXT NOT NULL DEFAULT 'exam_real';
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_stem_detail_default_check'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_stem_detail_default_check
      CHECK (stem_detail_default IN ('guided','exam_real','blind'));
  END IF;
END $$;

-- 3. Attempt-level record: the level the attempt STARTED at, and the level it ENDED at if the
--    candidate used "Add detail" (NULL if they never escalated).
ALTER TABLE user_attempts ADD COLUMN IF NOT EXISTS stem_detail TEXT NOT NULL DEFAULT 'exam_real';
ALTER TABLE user_attempts ADD COLUMN IF NOT EXISTS stem_detail_escalated_to TEXT;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_attempts_stem_detail_check'
  ) THEN
    ALTER TABLE user_attempts ADD CONSTRAINT user_attempts_stem_detail_check
      CHECK (stem_detail IN ('guided','exam_real','blind'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_attempts_stem_detail_escalated_to_check'
  ) THEN
    ALTER TABLE user_attempts ADD CONSTRAINT user_attempts_stem_detail_escalated_to_check
      CHECK (stem_detail_escalated_to IS NULL OR stem_detail_escalated_to IN ('guided','exam_real','blind'));
  END IF;
END $$;
