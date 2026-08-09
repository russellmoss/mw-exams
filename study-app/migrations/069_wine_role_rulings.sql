-- Migration 069: the banker/curveball ruling loop.
--
-- WHAT PROBLEM THIS SOLVES. The reviewers' single most repeated verdict is about a wine's ROLE — "a
-- flight like this would likely have a banker", "three out of the four are curveballs, normally you
-- would see one, two at best". That judgement was arriving as free prose in a rejection note, being
-- read by a human, and being hand-transcribed into a regex table in question-validator.ts. Several
-- entries in data/banker_signals.json still carry the reviewer's name in their note because that is
-- literally how they got there. Hand-transcription does not scale, is not auditable, and never reaches
-- the questions ALREADY IN THE BANK that the corrected calibration would now reject.
--
-- This migration is the ledger that closes that loop:
--
--   question_reviews.role_overrides   the reviewer's per-wine call, captured as DATA at vote time
--                                     instead of being buried in prose.
--   wine_role_rulings                 one adjudicated claim: what was asserted, what the analysis
--                                     ruled, and (when upheld) what it changed in the signal table.
--   question_repairs                  one attempted wine swap on one banked question, with the
--                                     before/after and the validator verdict that gated it.
--   question_reviews.superseded_at    lets a repaired question re-enter the review queue WITHOUT
--                                     deleting the vote that caused the repair.
--
-- Additive / idempotent — safe to run repeatedly. MUST be applied to Neon.

-- ── 1. The reviewer's per-wine call ──────────────────────────────────────────────────────────────
--
-- Shape: [{"slot": 3, "keyed": "banker", "reviewer": "curveball"}]. Only DISAGREEMENTS are stored —
-- a reviewer who leaves the roles alone writes NULL, which is meaningfully different from a reviewer
-- who inspected every wine and endorsed every role. We do not have evidence for the latter and must
-- not manufacture it: an "agreed" record would be read downstream as positive calibration evidence
-- for a wine nobody actually thought about.
--
-- `keyed` is snapshotted at vote time rather than re-derived later, because the whole point of the
-- loop is that the calibration CHANGES. Re-deriving would make a historical ruling read as though the
-- reviewer had been disputing whatever the table says today.
ALTER TABLE question_reviews ADD COLUMN IF NOT EXISTS role_overrides JSONB;

-- ── 2. Linking a repaired question back to the votes that caused it ──────────────────────────────
--
-- A repair mints a NEW question_id (the old row is retired, never edited in place — attempts,
-- feedback and rulings all reference it and are about the wines it actually had). So the rebuilt
-- question reaches both reviewers by itself; nothing needs "resurfacing".
--
-- What would otherwise be lost is the LINK. The reviewer who rejected the predecessor last week meets
-- the replacement as an ordinary unseen card, with no way to know it is the answer to their
-- complaint — and will reasonably reject it again on the strength of their own earlier reasoning.
--
-- So carryReviewsForward() COPIES the predecessor's votes onto the new id with superseded_at set.
-- The queue ignores superseded rows (so the copy does not mark the question already-ruled-on), the
-- originals stay live on the retired row (so nobody's completed count drops for work they did), and
-- superseded_reason carries the audit trail from the rebuilt question back to the judgement behind it.
ALTER TABLE question_reviews ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ;
ALTER TABLE question_reviews ADD COLUMN IF NOT EXISTS superseded_reason TEXT;

-- ── 3. The adjudicated rulings ───────────────────────────────────────────────────────────────────
--
-- One row per adjudicated role claim. The claim is stored SEPARATELY from the verdict on purpose:
-- an overruled claim is as valuable as an upheld one. It is the record that the system pushed back,
-- it is what stops the same disputed wine being re-litigated every pass, and it is the only way to
-- measure whether the adjudicator is deferring to the reviewer on everything (which would make the
-- whole loop an expensive way to rubber-stamp one expert's opinion).
CREATE TABLE IF NOT EXISTS wine_role_rulings (
  id             SERIAL PRIMARY KEY,

  -- Provenance: which vote, which analysis, which reviewer, which question and slot.
  review_id      INTEGER,
  attempt_id     INTEGER,
  analysis_id    INTEGER,
  reviewer_id    INTEGER REFERENCES users(id),
  question_id    TEXT        NOT NULL,
  slot           INTEGER     NOT NULL,

  -- The wine, denormalised. The question can be repaired out from under this row (that is the point),
  -- so the ruling has to remember which wine it was about.
  wine_label     TEXT,
  variety        TEXT,
  region         TEXT,
  country        TEXT,

  -- The claim: what the table said, and what the reviewer said.
  keyed_role     TEXT        NOT NULL CHECK (keyed_role IN ('banker', 'curveball')),
  claimed_role   TEXT        NOT NULL CHECK (claimed_role IN ('banker', 'curveball')),

  -- The verdict. 'pending' until the analysis lands; 'upheld' means the reviewer was right and the
  -- calibration must change; 'overruled' means the system pushed back and the table stands;
  -- 'inconclusive' means the analysis could not decide on the evidence and a human should look.
  verdict        TEXT        NOT NULL DEFAULT 'pending'
                 CHECK (verdict IN ('pending', 'upheld', 'overruled', 'inconclusive')),
  rationale      TEXT,
  -- What the adjudicator proposed doing to data/banker_signals.json: 'add_signal', 'remove_signal',
  -- 'narrow_signal' (add a variety/exclude gate), 'add_exclusion', or 'none'.
  proposed_edit  TEXT,
  -- The signal id the edit targets, where the adjudicator named one.
  target_signal  TEXT,

  -- Codification: the PR that carried the edit into data/banker_signals.json, and when it landed.
  -- NULL on an overruled ruling, and on an upheld one nobody has dispatched yet.
  pr_url         TEXT,
  codified_at    TIMESTAMPTZ,

  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One ruling per (question, slot, reviewer). A reviewer who re-votes on the same question re-states
-- the same claim; that is an update, not a second piece of evidence.
CREATE UNIQUE INDEX IF NOT EXISTS idx_wine_role_rulings_claim
  ON wine_role_rulings (question_id, slot, reviewer_id);

-- The sweep reads "upheld but not yet codified", and the admin view reads by verdict, newest first.
CREATE INDEX IF NOT EXISTS idx_wine_role_rulings_verdict
  ON wine_role_rulings (verdict, created_at DESC);

-- ── 4. The repair ledger ─────────────────────────────────────────────────────────────────────────
--
-- One row per attempted wine swap. Every attempt is recorded, including the ones that FAIL the
-- validator gate — a repair that could not produce a valid question is the single most useful thing
-- to know about a ruling, because it means the corrected calibration has left that flight with no
-- legal composition and the question needs a human, not another retry.
CREATE TABLE IF NOT EXISTS question_repairs (
  id               SERIAL PRIMARY KEY,
  question_id      TEXT        NOT NULL,
  -- The ruling that made this question invalid. Nullable: the same machinery is useful for a manual
  -- admin-initiated swap, which has no ruling behind it.
  ruling_id        INTEGER     REFERENCES wine_role_rulings(id),
  slot             INTEGER     NOT NULL,

  wine_before      TEXT,
  wine_after       TEXT,
  -- Why this question was in the queue: the hard violations that the ruling introduced.
  trigger_reasons  JSONB,

  -- 'queued' → previewed and awaiting approval; 'applied' → the rebuilt question passed the validator
  -- and replaced the old one; 'failed' → the rebuild produced hard violations and nothing changed;
  -- 'skipped' → an admin declined it.
  status           TEXT        NOT NULL DEFAULT 'queued'
                   CHECK (status IN ('queued', 'applied', 'failed', 'skipped')),
  -- The validator's verdict on the REBUILT question. Kept on failure too — it is the diagnosis.
  verdict          JSONB,
  error_message    TEXT,
  cost_usd         NUMERIC(10, 4),

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_question_repairs_status
  ON question_repairs (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_question_repairs_question
  ON question_repairs (question_id);

-- ── 5. Repair provenance on the question itself ──────────────────────────────────────────────────
--
-- The review card needs to say "wine 3 was swapped after your ruling, here is what changed" — a
-- reviewer shown a question they have already rejected, with no explanation of what moved, will
-- reasonably reject it again. repair_count also bounds the loop: a question that has been repaired
-- twice and rejected twice is not converging and should stop consuming reviewer time and tokens.
ALTER TABLE generated_questions ADD COLUMN IF NOT EXISTS repair_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE generated_questions ADD COLUMN IF NOT EXISTS last_repaired_at TIMESTAMPTZ;
ALTER TABLE generated_questions ADD COLUMN IF NOT EXISTS last_repair_note TEXT;

COMMENT ON TABLE wine_role_rulings IS
  'Adjudicated banker/curveball claims from the Question Review surface. Upheld rulings are codified '
  'into data/banker_signals.json by PR; overruled ones are kept as the record that the system pushed back.';
COMMENT ON TABLE question_repairs IS
  'One attempted wine swap on one banked question. Failures are retained deliberately — a repair that '
  'cannot produce a valid flight is the signal that the question needs a human.';
