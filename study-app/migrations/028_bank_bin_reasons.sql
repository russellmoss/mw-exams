-- Migration 028: Bin with a Reason — capture WHY a pending bank question was binned.
--
-- Binned questions are HARD-DELETED from generated_questions (no resurrect path), so the reason can't
-- hang off the item row — it would vanish with it. This is a standalone ledger keyed by the (now gone)
-- item_id plus enough context (paper, family) to drive:
--   • the SOFT feed-forward digest ("Previously rejected — avoid these faults") injected into the next
--     generation prompt for that paper, and
--   • the "Learned from your bins · Most common reason: …" line in the Fill-the-Bank row.
--
-- reason_tags / reason_note are BOTH optional — a reason is never required, so a plain bin still logs a
-- row with NULLs (useful for bin counts even without a stated fault). Everything here is additive and
-- idempotent — safe to run repeatedly.

CREATE TABLE IF NOT EXISTS bank_bin_reasons (
  id           BIGSERIAL PRIMARY KEY,
  item_id      TEXT        NOT NULL,          -- the hard-deleted generated_questions.question_id
  paper        INT         NOT NULL,
  family_id    TEXT,                          -- generated_questions.family (F1..F7), if known
  reason_tags  TEXT[],                        -- optional structured fault tags (may be NULL/empty)
  reason_note  TEXT,                          -- optional free-text note (<=500 chars, enforced at API)
  binned_by    INT,                           -- reviewer user_id
  binned_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The digest and learned-from queries both filter by paper and order/window by binned_at.
CREATE INDEX IF NOT EXISTS bank_bin_reasons_paper_binned_at_idx
  ON bank_bin_reasons (paper, binned_at DESC);
