-- Migration 024: Retire the 'blind' stem-detail level. The dial is now two levels only —
-- 'guided' and 'exam_real' (surfaced as "IMW Only"). 'exam_real' remains the default, so every
-- existing user and attempt keeps exactly the level it already had.
--
-- Historical user_attempts rows that stored 'blind' are LEFT INTACT (do not rewrite history); the
-- app no longer renders that value. The user PREFERENCE column is coerced defensively — admin
-- confirmed no user currently holds 'blind' — and its CHECK is narrowed to the two live levels.
-- The orphaned generated_questions.stem_blind column is harmless and left in place.
--
-- Additive / idempotent — safe to run repeatedly.

-- 1. Coerce any lingering 'blind' user preference to the exam-real (IMW Only) default.
UPDATE users SET stem_detail_default = 'exam_real' WHERE stem_detail_default = 'blind';

-- 2. Re-assert the per-user default as the exam-real (IMW Only) level.
ALTER TABLE users ALTER COLUMN stem_detail_default SET DEFAULT 'exam_real';

-- 3. Narrow the users default CHECK to the two surviving levels.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_stem_detail_default_check'
  ) THEN
    ALTER TABLE users DROP CONSTRAINT users_stem_detail_default_check;
  END IF;
  ALTER TABLE users ADD CONSTRAINT users_stem_detail_default_check
    CHECK (stem_detail_default IN ('guided','exam_real'));
END $$;
