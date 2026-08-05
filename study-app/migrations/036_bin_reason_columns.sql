-- Migration 036: "Bin & Bin with reason" — guarantee the reason columns behind the two-button bin flow.
--
-- Feature #33 restores the two-button bin flow on the bank review card: a plain "Bin" (empty reasons)
-- and "Bin with reason", which POSTs { reasons: string[], note: string|null } to
-- /api/admin/bank/item/[id]/bin. Those land in the bank_bin_reasons ledger (migrations 028/030/031):
--
--   • reason_tags  TEXT[]  — the multi-select fault CODES (spec's "reason_codes"); NULL for a plain bin.
--   • reason_note  TEXT    — the optional single-line note (<=200 chars, enforced at the API).
--
-- Both are ALSO aggregated by the "Why wines get binned" learning-loop card (reason counts over the
-- last N batches + the 3 most-recent notes) and fed into the generation prompt. This migration makes
-- the columns' existence explicit and idempotent so a database that somehow skipped 028/030 still has
-- them. Additive / idempotent — safe to run repeatedly. MUST be applied to Neon.

-- The ledger itself (no-op where migration 028/031 already created it).
CREATE TABLE IF NOT EXISTS bank_bin_reasons (
  id           BIGSERIAL PRIMARY KEY,
  item_id      TEXT        NOT NULL,
  paper        INT         NOT NULL,
  family_id    TEXT,
  reason_tags  TEXT[],
  reason_note  TEXT,
  binned_by    INT,
  binned_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The reason columns (spec's reason_codes + reason_note), nullable — a reason is never required.
ALTER TABLE bank_bin_reasons ADD COLUMN IF NOT EXISTS reason_tags TEXT[];
ALTER TABLE bank_bin_reasons ADD COLUMN IF NOT EXISTS reason_note TEXT;
ALTER TABLE bank_bin_reasons ALTER COLUMN reason_tags DROP NOT NULL;
ALTER TABLE bank_bin_reasons ALTER COLUMN reason_note DROP NOT NULL;

-- The learning-loop aggregation joins the ledger to generated_questions by item_id to scope reasons to
-- recent batches; the newest-first ordering and this join both benefit from these indexes (idempotent).
CREATE INDEX IF NOT EXISTS bank_bin_reasons_binned_at_idx ON bank_bin_reasons (binned_at DESC);
CREATE INDEX IF NOT EXISTS bank_bin_reasons_item_id_idx   ON bank_bin_reasons (item_id);
