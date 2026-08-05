-- Migration 040: "Unreviewed Queue" — a standing review surface for banked questions that have never
-- been explicitly approved or binned by an admin.
--
-- The bank items live in generated_questions. Two review signals already exist:
--   * review_state ('pending'|'kept'|'binned') — the BATCH review gate. Defaults 'kept', so an
--     on-the-fly study-path generation lands servable without anyone ever looking at it.
--   * auto_kept (migration 033) — true when an item reached 'kept' without an admin decision.
--
-- Neither is a per-item record of "an admin has (or has not) made a keep/bin call on THIS item,
-- independent of any batch". The Unreviewed Queue needs exactly that, so this adds review_status:
--
--   review_status ('unreviewed'|'kept'|'binned') DEFAULT 'unreviewed'
--
-- Every new generation lands 'unreviewed' and surfaces in the queue until an admin keeps or bins it
-- (via the reused /api/admin/bank/item/[id]/keep|bin endpoints, which now stamp review_status too).
-- reviewed_at / reviewed_by already exist (migration 022); re-declared IF NOT EXISTS for safety.
--
-- Backfill (spec): anything previously KEPT via batch review => 'kept'; anything BINNED => 'binned';
-- everything else (auto-kept on-the-fly items, still-pending items) => 'unreviewed' (the default).
-- "Kept via batch review" is exactly the reviewed keep — review_state='kept' with auto_kept=false
-- (an explicit admin keep / keep-all clears auto_kept; an implicit auto-keep leaves it true).
--
-- Additive / idempotent — safe to run repeatedly. MUST be applied to Neon.

ALTER TABLE generated_questions ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'unreviewed';
ALTER TABLE generated_questions ADD COLUMN IF NOT EXISTS reviewed_at   TIMESTAMPTZ;
ALTER TABLE generated_questions ADD COLUMN IF NOT EXISTS reviewed_by   INT;

DO $$ BEGIN
  ALTER TABLE generated_questions
    ADD CONSTRAINT generated_questions_review_status_check
    CHECK (review_status IN ('unreviewed', 'kept', 'binned'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Backfill: explicit batch keeps -> 'kept'.
UPDATE generated_questions
  SET review_status = 'kept'
  WHERE review_status = 'unreviewed' AND review_state = 'kept' AND auto_kept = false;

-- Backfill: binned items -> 'binned'.
UPDATE generated_questions
  SET review_status = 'binned'
  WHERE review_status = 'unreviewed' AND review_state = 'binned';

-- The queue and its count badge read oldest-first over unreviewed rows.
CREATE INDEX IF NOT EXISTS idx_gq_review_status_created
  ON generated_questions (review_status, created_at, question_id);
