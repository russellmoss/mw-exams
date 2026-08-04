-- Migration 031: Bin with Reason — lessons feed + settings.
--
-- Feature "Bin with Reason" (#26) builds on the existing bank_bin_reasons ledger (migrations 028/030),
-- adding a distilled, plain-English "Lessons for new questions" summary that is regenerated (debounced)
-- from the most recent bins and injected into question generation as an "Avoid these known failure
-- patterns" block. Three app_settings keys back it (app_settings is the generic jsonb key/value store
-- from migration 011, so no new columns are needed):
--
--   • use_bin_lessons        BOOLEAN  — toggle: inject the summary into new-question prompts. Default ON.
--   • bin_lessons_summary    TEXT     — the LLM-distilled bullet summary (stored as a jsonb string).
--   • bin_lessons_updated_at TEXT     — ISO timestamp of the last regeneration (jsonb string).
--
-- Only the toggle is seeded (default ON, so an absent row reads as "as built"); the summary/updated_at
-- rows are written the first time the digest regenerates. Everything here is additive and idempotent.

-- Ensure the reason ledger exists (no-op where migration 028 already ran) — the Bin page + lessons feed
-- both read it, so guard against a database that skipped 028.
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
CREATE INDEX IF NOT EXISTS bank_bin_reasons_paper_binned_at_idx
  ON bank_bin_reasons (paper, binned_at DESC);
-- The Bin page lists newest-first across all papers.
CREATE INDEX IF NOT EXISTS bank_bin_reasons_binned_at_idx
  ON bank_bin_reasons (binned_at DESC);

-- Seed the toggle ON. ON CONFLICT DO NOTHING so a later admin change is never clobbered by a re-run.
INSERT INTO app_settings (key, value, updated_at)
  VALUES ('use_bin_lessons', 'true'::jsonb, NOW())
  ON CONFLICT (key) DO NOTHING;
