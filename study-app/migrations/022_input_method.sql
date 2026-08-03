-- Migration 022: Input method — how the candidate produced an answer, so spelling can be graded
-- fairly.
--
-- MW examiners deduct for blatant or repeated misspellings, and the grader is right to flag them.
-- But a candidate dictating their answer is being marked on their transcription engine rather than
-- their knowledge. When input_method = 'voice' the grader still SURFACES spelling problems (the
-- candidate needs to know a term came out wrong) but does not deduct for them, and says plainly
-- that the real exam is handwritten and spelling counts there.
--
-- 'typed' is the default, so every existing attempt keeps exactly the grading it had.
--
-- Additive / idempotent — safe to run repeatedly.

-- 1. Per-attempt record of how the answer was produced.
ALTER TABLE user_attempts ADD COLUMN IF NOT EXISTS input_method TEXT NOT NULL DEFAULT 'typed';
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_attempts_input_method_check'
  ) THEN
    ALTER TABLE user_attempts ADD CONSTRAINT user_attempts_input_method_check
      CHECK (input_method IN ('typed','voice'));
  END IF;
END $$;

-- 2. Per-user default, so the toggle is set once rather than every attempt.
ALTER TABLE users ADD COLUMN IF NOT EXISTS input_method_default TEXT NOT NULL DEFAULT 'typed';
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_input_method_default_check'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_input_method_default_check
      CHECK (input_method_default IN ('typed','voice'));
  END IF;
END $$;
