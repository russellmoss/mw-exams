-- Migration 012: document the user_attempts.mode NOT NULL DEFAULT 'full' constraint.
--
-- This constraint was applied directly to production (no migration file) and broke attempt
-- creation: the app inserted an EXPLICIT NULL for "normal" study attempts, and a column default
-- only applies when the column is OMITTED from the INSERT — an explicit NULL violates NOT NULL and
-- 500s. The app code now coalesces null → 'full' (see createAttempt/createAttemptWithUser in
-- src/lib/db.ts); this migration backfills + records the constraint so every environment matches
-- production. The query layer already treats NULL and 'full' as equivalent.
--
-- Additive / idempotent — safe to run repeatedly.

UPDATE user_attempts SET mode = 'full' WHERE mode IS NULL;
ALTER TABLE user_attempts ALTER COLUMN mode SET DEFAULT 'full';
ALTER TABLE user_attempts ALTER COLUMN mode SET NOT NULL;
