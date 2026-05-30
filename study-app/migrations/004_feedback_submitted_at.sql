-- Migration 004: order feedback by when it was actually left
-- The admin feedback dashboard sorted by completed_at (when the QUESTION was
-- finished) and feedback_reviewed_at (when the DECISION was made) — neither is
-- when the candidate left the feedback, so the list looked randomly ordered
-- (feedback can be added long after a question is completed). Stamp a real
-- feedback timestamp and sort by it.
-- Additive only — safe to run repeatedly.

ALTER TABLE user_attempts ADD COLUMN IF NOT EXISTS feedback_submitted_at TIMESTAMPTZ;

-- Backfill existing feedback rows so they aren't all NULL (which would still
-- sort arbitrarily). Best available proxy for "when feedback was left", in order:
--   1. the first feedback-analysis row's created_at (analysis fires at submit time)
--   2. completed_at, then started_at as fallbacks.
UPDATE user_attempts a
SET feedback_submitted_at = sub.ts
FROM (
  SELECT a2.id,
    COALESCE(
      (SELECT MIN(f.created_at) FROM feedback_analyses f WHERE f.attempt_id = a2.id),
      a2.completed_at,
      a2.started_at
    ) AS ts
  FROM user_attempts a2
  WHERE a2.user_feedback IS NOT NULL AND trim(a2.user_feedback) <> ''
) sub
WHERE a.id = sub.id AND a.feedback_submitted_at IS NULL;
