-- Migration 022: "Fill the Bank" — admin-only bulk question generation with a per-question
-- approve/reject gate.
--
-- (a) A REVIEW GATE on the bank. `generated_questions` is the question bank (see migration 020).
--     Until now every generated row was immediately servable. Bulk generation needs a holding
--     state: a freshly generated question lands as 'pending' and is served to NO candidate until an
--     admin approves it. `status` gates that. EXISTING rows must keep behaving exactly as before, so
--     the column defaults to 'approved' and every historical row is backfilled to 'approved'.
--     CRITICAL: every candidate-facing bank read filters status = 'approved' (see src/lib/db.ts).
--
-- (b) BATCH BOOKKEEPING. `bank_batches` is one row per bulk run: how many were requested, how many
--     have generated, how many failed validation, whether the admin asked us to auto-replace binned
--     questions, and a running/ready/cancelled/error lifecycle the Admin card and /admin/bank poll.
--
-- Additive / idempotent — safe to run repeatedly.

ALTER TABLE generated_questions ADD COLUMN IF NOT EXISTS status      TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE generated_questions ADD COLUMN IF NOT EXISTS batch_id    UUID;
ALTER TABLE generated_questions ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE generated_questions ADD COLUMN IF NOT EXISTS reviewed_by INT;

-- CHECK constraint added out-of-band so the migration is idempotent (ADD COLUMN can't carry an
-- IF NOT EXISTS constraint clause).
DO $$ BEGIN
  ALTER TABLE generated_questions
    ADD CONSTRAINT generated_questions_status_check
    CHECK (status IN ('pending', 'approved', 'rejected'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Belt-and-braces: the DEFAULT already stamps existing rows 'approved' on ALTER, but make the
-- backfill explicit and re-runnable for any row that predates / slipped past the default.
UPDATE generated_questions SET status = 'approved' WHERE status IS NULL;

CREATE INDEX IF NOT EXISTS idx_generated_questions_status ON generated_questions (status);
CREATE INDEX IF NOT EXISTS idx_generated_questions_batch  ON generated_questions (batch_id);

CREATE TABLE IF NOT EXISTS bank_batches (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paper            INT         NOT NULL CHECK (paper IN (1, 2, 3)),
  requested_count  INT         NOT NULL,
  generated_count  INT         NOT NULL DEFAULT 0,
  failed_count     INT         NOT NULL DEFAULT 0,
  status           TEXT        NOT NULL DEFAULT 'running'
                     CHECK (status IN ('running', 'ready', 'cancelled', 'error')),
  replace_rejected BOOLEAN     NOT NULL DEFAULT false,
  created_by       INT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at     TIMESTAMPTZ,
  est_cost_usd     NUMERIC,
  actual_cost_usd  NUMERIC
);

CREATE INDEX IF NOT EXISTS idx_bank_batches_status ON bank_batches (status);
CREATE INDEX IF NOT EXISTS idx_bank_batches_paper  ON bank_batches (paper);
