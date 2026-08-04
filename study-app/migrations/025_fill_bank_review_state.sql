-- Migration 025: "Fill the Bank" — spec alignment of the review gate + batch bookkeeping.
--
-- The bulk-generation review gate shipped in migration 022 as generated_questions.status
-- ('pending'|'approved'|'rejected') + bank_batches. The authoritative Fill-the-Bank spec names the
-- gate `review_state` ('pending'|'kept'|'binned') defaulting to 'kept', and requires the batch row to
-- carry a kept count, a replace_binned flag, and cent-denominated cost estimates. This migration adds
-- those spec columns additively and backfills them from the existing data so nothing currently
-- servable disappears.
--
-- CRITICAL: every candidate-facing bank read and question-count query filters review_state = 'kept'
--   (see src/lib/db.ts). Binned rows are HARD-DELETED by the review endpoint — 'binned' is only a
--   transient value; there is no resurrect path and no reason field.
--
-- Additive / idempotent — safe to run repeatedly.

-- (a) REVIEW GATE. review_state is the canonical gate. Default 'kept' so the on-the-fly study path
--     (which omits it) lands servable, exactly as status defaulted to 'approved' before.
ALTER TABLE generated_questions
  ADD COLUMN IF NOT EXISTS review_state TEXT NOT NULL DEFAULT 'kept';

DO $$ BEGIN
  ALTER TABLE generated_questions
    ADD CONSTRAINT generated_questions_review_state_check
    CHECK (review_state IN ('pending', 'kept', 'binned'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Backfill review_state from the migration-022 status column: approved -> kept, pending -> pending,
-- rejected -> binned. Any NULL/other lands 'kept' so historical servable rows stay servable.
UPDATE generated_questions
  SET review_state = CASE status
        WHEN 'pending'  THEN 'pending'
        WHEN 'rejected' THEN 'binned'
        ELSE 'kept'
      END
  WHERE review_state IS DISTINCT FROM CASE status
        WHEN 'pending'  THEN 'pending'
        WHEN 'rejected' THEN 'binned'
        ELSE 'kept'
      END;

CREATE INDEX IF NOT EXISTS idx_generated_questions_review_paper
  ON generated_questions (review_state, paper);
CREATE INDEX IF NOT EXISTS idx_generated_questions_batch
  ON generated_questions (batch_id);

-- (b) BATCH BOOKKEEPING. Spec columns on bank_batches.
ALTER TABLE bank_batches ADD COLUMN IF NOT EXISTS kept_count          INT NOT NULL DEFAULT 0;
ALTER TABLE bank_batches ADD COLUMN IF NOT EXISTS replace_binned      BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE bank_batches ADD COLUMN IF NOT EXISTS est_cost_min_cents  INT;
ALTER TABLE bank_batches ADD COLUMN IF NOT EXISTS est_cost_max_cents  INT;
ALTER TABLE bank_batches ADD COLUMN IF NOT EXISTS actual_cost_cents   INT;

-- Keep the spec flag aligned with the migration-022 replace_rejected flag for existing rows.
UPDATE bank_batches SET replace_binned = replace_rejected WHERE replace_binned IS DISTINCT FROM replace_rejected;

-- Backfill kept_count from the rows already kept in each batch.
UPDATE bank_batches b SET kept_count = sub.kept
  FROM (
    SELECT batch_id, COUNT(*)::int AS kept
    FROM generated_questions
    WHERE batch_id IS NOT NULL AND review_state = 'kept'
    GROUP BY batch_id
  ) sub
  WHERE b.id = sub.batch_id AND b.kept_count IS DISTINCT FROM sub.kept;

-- The spec's batch lifecycle is ('running','complete','failed'). Migration 022 used
-- ('running','ready','cancelled','error'); 'ready' is the spec's 'complete'. Relax the CHECK so both
-- vocabularies are valid rather than rewriting historical rows.
DO $$ BEGIN
  ALTER TABLE bank_batches DROP CONSTRAINT IF EXISTS bank_batches_status_check;
  ALTER TABLE bank_batches ADD CONSTRAINT bank_batches_status_check
    CHECK (status IN ('running', 'ready', 'complete', 'cancelled', 'error', 'failed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
