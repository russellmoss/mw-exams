-- Migration 033: "Batch Undo" — reverse a bulk auto-keep, and surface reviewed vs never-reviewed state
-- on every bank item.
--
-- The bank items live in generated_questions; a bulk run is one bank_batches row (migrations 022/025).
-- Three things change:
--
--   (a) NEVER-REVIEWED STATE. Historically a kept item carried no record of WHO kept it — the on-the-fly
--       study path and any implicit auto-keep both land review_state='kept' with reviewed_by NULL. We now
--       record that explicitly: auto_kept marks an item that reached 'kept' without an admin ever looking
--       at it, so the review queue and Bank Health can badge it "Never reviewed" (vs "Reviewed", which is
--       an item with reviewed_by set). An explicit admin keep / keep-all stamps reviewed_by + auto_kept=false.
--
--   (b) SERVE BOOKKEEPING. served_count / first_served_at are the batch-undo safety rail: an item that has
--       already been served to a candidate must NOT be yanked back to the review queue, so the reopen
--       endpoint leaves served items kept. served_count mirrors the existing times_served counter (bumped
--       in the same /api/get-question/banked serve path); first_served_at is stamped once, on first serve.
--
--   (c) BATCH RESOLUTION + REOPEN. bank_batches gains resolved_by / resolved_at (who explicitly kept the
--       batch, via keep-all) and reopened_at (when an admin reversed the auto-keep). reopened_at is what
--       makes the "Reopen all" action one-shot — a batch already reopened can't be reopened again.
--
-- Additive / idempotent — safe to run repeatedly. MUST be applied to Neon.

-- (a) Never-reviewed state.
ALTER TABLE generated_questions ADD COLUMN IF NOT EXISTS auto_kept       BOOLEAN     NOT NULL DEFAULT false;
-- (b) Serve bookkeeping.
ALTER TABLE generated_questions ADD COLUMN IF NOT EXISTS served_count    INT         NOT NULL DEFAULT 0;
ALTER TABLE generated_questions ADD COLUMN IF NOT EXISTS first_served_at TIMESTAMPTZ;

-- (c) Batch resolution + reopen bookkeeping.
ALTER TABLE bank_batches ADD COLUMN IF NOT EXISTS resolved_by  INT;
ALTER TABLE bank_batches ADD COLUMN IF NOT EXISTS resolved_at  TIMESTAMPTZ;
ALTER TABLE bank_batches ADD COLUMN IF NOT EXISTS reopened_at  TIMESTAMPTZ;

-- Backfill served_count from the existing times_served soft counter, and first_served_at from the
-- earliest recorded view where one exists (best-effort; NULL otherwise).
UPDATE generated_questions
  SET served_count = COALESCE(times_served, 0)
  WHERE served_count = 0 AND COALESCE(times_served, 0) > 0;

UPDATE generated_questions g
  SET first_served_at = v.first_view
  FROM (
    SELECT question_id, MIN(first_seen_at) AS first_view
    FROM question_views GROUP BY question_id
  ) v
  WHERE g.question_id = v.question_id
    AND g.first_served_at IS NULL
    AND g.served_count > 0;

-- Backfill auto_kept: any kept item with no reviewer reached 'kept' implicitly (default / auto-keep),
-- so it has never actually been reviewed. reviewed_by stays NULL — that pairing is exactly what the
-- "Never reviewed" badge keys off.
UPDATE generated_questions
  SET auto_kept = true
  WHERE review_state = 'kept' AND reviewed_by IS NULL AND auto_kept = false;

-- The reopen endpoint and the recent-batches list filter on auto_kept + review_state.
CREATE INDEX IF NOT EXISTS idx_gq_auto_kept ON generated_questions (auto_kept, review_state);
CREATE INDEX IF NOT EXISTS idx_gq_batch_review ON generated_questions (batch_id, review_state);
