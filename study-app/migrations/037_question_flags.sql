-- Migration 037: "Flag Question" — candidate-flagged questions withdraw from rotation and route into
-- the existing admin bank review queue tagged 'Flagged by candidate' for a Delete/Keep decision.
--
-- A candidate flags a served question as unrealistic/broken from the debrief. That immediately:
--   • withdraws the bank item from rotation — generated_questions.review_state goes back to the
--     'pending' review gate (every servable read filters review_state='kept', so it stops being
--     served by /api/get-question and /banked), plus a flagged_by_candidate marker so the review
--     queue can render the "Flagged by candidate" tag and sort these to the top;
--   • preserves the candidate's attempt (NEVER deleted) — user_attempts.flagged=true so History can
--     show a small amber "Flagged" tag next to the verdict pill;
--   • records a question_flags row (status 'pending') carrying the SAME reason keys the admin bin flow
--     uses (bin-reasons.ts), an optional note, and who flagged it — resolved to 'deleted' / 'kept' by
--     the existing /api/admin/bank/item/[id]/bin and /keep decision (reviewBankQuestion).
--
-- Additive / idempotent — safe to run repeatedly. MUST be applied to Neon.

-- (a) THE FLAG LEDGER. One row per candidate flag. reasons reuses the admin BinReasonChips codes
--     (bin-reasons.ts BIN_REASON_OPTIONS); note is the optional free-text line. status is the review
--     lifecycle: 'pending' until an admin bins ('deleted') or keeps ('kept') the item.
CREATE TABLE IF NOT EXISTS question_flags (
  id           BIGSERIAL   PRIMARY KEY,
  question_id  TEXT        NOT NULL,          -- generated_questions.question_id (the banked item)
  attempt_id   BIGINT,                        -- user_attempts.id the flag came from (nullable)
  user_id      INT         NOT NULL,          -- who flagged it
  reasons      TEXT[],                        -- BinReasonChips codes (may be NULL/empty)
  note         TEXT,                          -- optional free-text (<=200 chars, enforced at API)
  status       TEXT        NOT NULL DEFAULT 'pending',
  resolved_by  INT,                           -- admin user_id who binned/kept (nullable)
  resolved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
  ALTER TABLE question_flags
    ADD CONSTRAINT question_flags_status_check
    CHECK (status IN ('pending', 'deleted', 'kept'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The queue reads pending flags newest-first and joins back to the item by question_id.
CREATE INDEX IF NOT EXISTS question_flags_status_created_idx ON question_flags (status, created_at DESC);
CREATE INDEX IF NOT EXISTS question_flags_question_id_idx    ON question_flags (question_id);

-- (b) BANK ITEM MARKER. A boolean source marker so the review queue can render the tag and sort
--     candidate-flagged items to the top. The withdrawal itself is carried by review_state='pending'
--     (migration 025); this only records WHY the item is back in the queue.
ALTER TABLE generated_questions ADD COLUMN IF NOT EXISTS flagged_by_candidate BOOLEAN NOT NULL DEFAULT false;

-- (c) ATTEMPT MARKER. The attempt is preserved (never deleted); this tag drives the History "Flagged"
--     pill. Defaults false so every historical attempt reads un-flagged.
ALTER TABLE user_attempts ADD COLUMN IF NOT EXISTS flagged BOOLEAN NOT NULL DEFAULT false;
