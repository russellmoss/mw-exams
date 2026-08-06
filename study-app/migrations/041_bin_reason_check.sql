-- Migration 041: Bin-Reason Pushback — adjudicate "Bin with reason" against the corpus/EK, like feedback.
--
-- Bin reasons feed two prompt injections (the per-paper digest and the distilled "Lessons for new
-- questions" block), so an unvalidated wrong reason doesn't just go unchallenged — it actively
-- mis-trains the generator. This adds a verdict on the LEDGER ROW (never on the bin itself: the bin
-- always stands; the admin keeps final say):
--
--   check_verdict     — 'valid' | 'invalid' | 'uncertain' | 'upheld' (NULL = not yet checked)
--                       'invalid' rows are EXCLUDED from the digest/lessons prompt feeds and surface
--                       in the admin "Pushback" strip. 'upheld' = the admin overrode the challenge,
--                       so the reason feeds forward again.
--   check_analysis    — the short plain-language adjudication shown to the admin.
--   check_fingerprint — fingerprint of the (tags, note) the verdict was computed for; reasons are
--                       re-applied per chip tap, so this is what makes re-checks idempotent.
--   checked_at        — when the verdict landed.
--
-- Additive and idempotent — safe to run repeatedly.

ALTER TABLE bank_bin_reasons ADD COLUMN IF NOT EXISTS check_verdict TEXT;
ALTER TABLE bank_bin_reasons ADD COLUMN IF NOT EXISTS check_analysis TEXT;
ALTER TABLE bank_bin_reasons ADD COLUMN IF NOT EXISTS check_fingerprint TEXT;
ALTER TABLE bank_bin_reasons ADD COLUMN IF NOT EXISTS checked_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bank_bin_reasons_check_verdict_chk'
  ) THEN
    ALTER TABLE bank_bin_reasons ADD CONSTRAINT bank_bin_reasons_check_verdict_chk
      CHECK (check_verdict IS NULL OR check_verdict IN ('valid', 'invalid', 'uncertain', 'upheld'));
  END IF;
END $$;
