-- Migration 043: Pushback rebuttal — the admin can answer a challenged bin reason with clarifying
-- information and have the system RE-ADJUDICATE (the bin-side twin of a feedback-thread follow-up,
-- which can flip a verdict). The rebuttal is stored on the ledger row and folded into the re-check's
-- fingerprint, so an unchanged (tags, note, rebuttal) triple never re-runs. A re-verdict of
-- valid/uncertain withdraws the challenge (the reason feeds forward again); invalid means the
-- challenge stands, with the new analysis shown.
--
-- Additive and idempotent — safe to run repeatedly.

ALTER TABLE bank_bin_reasons ADD COLUMN IF NOT EXISTS rebuttal TEXT;
