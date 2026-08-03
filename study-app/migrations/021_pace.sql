-- Migration 021: Pace — a per-wine benchmark timer + post-attempt pace report for Full Question
-- (mode 'full') and Dry Notes (mode 'known-wine'). The clock never blocks; the pace only sets the
-- benchmark used for colouring and reporting. There is no "no limit" option.
--
--   Exam Pace   — 660s per wine (system default).
--   Speed Notes — user-configured 480s or 540s per wine (default 480 if never set).
--
-- Additive / idempotent — safe to run repeatedly.

-- 1. Per-user default pace. `pace_default` is 'exam' | 'speed'; `pace_speed_seconds` is the chosen
--    Speed Notes length (480 = 8 min, 540 = 9 min) and only takes effect when pace_default='speed'.
ALTER TABLE users ADD COLUMN IF NOT EXISTS pace_default       TEXT NOT NULL DEFAULT 'exam';
ALTER TABLE users ADD COLUMN IF NOT EXISTS pace_speed_seconds INT  NOT NULL DEFAULT 480;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_pace_default_check'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_pace_default_check
      CHECK (pace_default IN ('exam','speed'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_pace_speed_seconds_check'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_pace_speed_seconds_check
      CHECK (pace_speed_seconds IN (480,540));
  END IF;
END $$;

-- 2. Per-attempt pace report (nullable — older attempts render without a pace badge). Shape:
--    { mode: 'exam'|'speed', benchmarkSeconds, wineTimes: number[], totalSeconds, avgSeconds, overSeconds }
ALTER TABLE user_attempts ADD COLUMN IF NOT EXISTS pace JSONB;
