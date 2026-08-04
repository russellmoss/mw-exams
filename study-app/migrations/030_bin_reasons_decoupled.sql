-- Migration 030: Instant Bin — decouple the bin action from reason capture, and make a bin reversible.
--
-- Two things change around the bin ledger + review gate:
--
--   1. REVERSIBLE BIN. The Fill-the-Bank review endpoint no longer HARD-DELETES a binned question; it
--      soft-deletes it (generated_questions.review_state = 'binned', a value already sanctioned by the
--      migration-025 CHECK). This is what lets the 10s "Undo" bar reverse a bin (review_state back to
--      'pending') and re-drive the reason ledger. No schema change is needed for that — 'binned' was
--      already legal — but this file documents the behavioural shift away from the migration-025 note
--      that called 'binned' a transient, unresurrectable value.
--
--   2. NULLABLE, DECOUPLED REASON. Reasons are captured AFTER the bin (fire-and-forget), so a bin row
--      routinely lands with no reason. bank_bin_reasons.reason_tags / reason_note (migration 028) are
--      already nullable; this re-asserts it idempotently and, defensively, migrates any legacy single
--      `reason` column into reason_tags should one exist in an older database.
--
-- Everything here is additive and idempotent — safe to run repeatedly.

-- (a) Ensure the decoupled reason columns exist and are nullable (no-op where migration 028 ran).
ALTER TABLE bank_bin_reasons ADD COLUMN IF NOT EXISTS reason_tags TEXT[];
ALTER TABLE bank_bin_reasons ADD COLUMN IF NOT EXISTS reason_note TEXT;
ALTER TABLE bank_bin_reasons ALTER COLUMN reason_tags DROP NOT NULL;
ALTER TABLE bank_bin_reasons ALTER COLUMN reason_note DROP NOT NULL;

-- (b) Migrate any legacy single-reason value into reason_tags, then drop the legacy column. Guarded so
--     it is a no-op on databases that never had a `reason` column.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bank_bin_reasons' AND column_name = 'reason'
  ) THEN
    UPDATE bank_bin_reasons
      SET reason_tags = ARRAY[reason]
      WHERE reason IS NOT NULL
        AND (reason_tags IS NULL OR array_length(reason_tags, 1) IS NULL);
    ALTER TABLE bank_bin_reasons DROP COLUMN reason;
  END IF;
END $$;
