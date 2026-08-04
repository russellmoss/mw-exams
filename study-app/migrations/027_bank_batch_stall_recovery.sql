-- Migration 027: "Fill the Bank" — STALL RECOVERY.
--
-- Root cause of "stuck on 3, nothing to review": a serverless invocation can die (killed before it
-- self-schedules a resume, deploy mid-run, platform freeze) leaving a bank_batches row 'running'
-- forever. getRunningBatchForPaper then treats the paper as busy and blocks every new Generate, while
-- the questions already persisted for that batch sit as review_state='pending' and are never
-- surfaced. There was no heartbeat on the batch row and therefore no way to tell a live run from a
-- dead one.
--
-- This migration adds the two timestamps that make liveness observable and widens the status CHECK to
-- carry 'stalled'. On every status poll and at the start of any new run we mark any batch whose
-- updated_at is older than 5 minutes as 'stalled' and release it (see releaseStalledBatches in
-- src/lib/db.ts); a new run can then start for that paper, and the stalled batch's already-persisted
-- questions stay reviewable (getReviewableBatches includes 'stalled').
--
--   started_at  — when the run first began (mirrors created_at for historical rows).
--   updated_at  — heartbeat: stamped NOW() on every counter increment and status change. The
--                 staleness check keys off this.
--
-- items_requested / items_done / items_skipped in the spec map onto the existing columns
-- requested_count / generated_count / failed_count (unchanged); the API surfaces them under the
-- spec names.
--
-- Additive / idempotent — safe to run repeatedly. MUST be applied to Neon.

ALTER TABLE bank_batches ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE bank_batches ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Backfill sensible values for rows that predate the columns.
UPDATE bank_batches SET started_at = created_at WHERE started_at IS DISTINCT FROM created_at AND created_at IS NOT NULL;
UPDATE bank_batches SET updated_at = COALESCE(completed_at, created_at) WHERE updated_at < COALESCE(completed_at, created_at);

-- Widen the lifecycle CHECK to carry 'stalled' (auto-released dead run) alongside the existing
-- vocabulary. 'done' is accepted as a synonym for the spec's terminal-success state so either name is
-- valid; the worker continues to write 'complete'.
DO $$ BEGIN
  ALTER TABLE bank_batches DROP CONSTRAINT IF EXISTS bank_batches_status_check;
  ALTER TABLE bank_batches ADD CONSTRAINT bank_batches_status_check
    CHECK (status IN ('running', 'ready', 'complete', 'done', 'cancelled', 'error', 'failed', 'stalled'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The staleness sweep filters status = 'running' and orders by updated_at.
CREATE INDEX IF NOT EXISTS idx_bank_batches_running_updated
  ON bank_batches (status, updated_at);
