-- Theory attempts share user_attempts, but need an idempotency key and a neutral stem_detail value.
-- Every statement is safe to re-run after a partial migration.

ALTER TABLE user_attempts ADD COLUMN IF NOT EXISTS submission_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_attempts_user_submission_key
  ON user_attempts (user_id, submission_key)
  WHERE submission_key IS NOT NULL;

ALTER TABLE user_attempts DROP CONSTRAINT IF EXISTS user_attempts_stem_detail_check;
ALTER TABLE user_attempts ADD CONSTRAINT user_attempts_stem_detail_check
  CHECK (stem_detail IN ('guided', 'exam_real', 'blind', 'none'));
