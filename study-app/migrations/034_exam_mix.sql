-- Migration 034: Exam Mix — the invisible composition-balancing layer over bank generation.
--
-- Two silent layers, no admin controls:
--   (a) Paper 3 category mix — the generator is steered toward the historical P3 category shares
--       (sparkling primary, then fortified/sweet, thin rosé/oxidative-orange-still remainder) and
--       every P3 flight must be category-COHERENT unless the stem intentionally frames a cross-
--       category comparison.
--   (b) Curveball difficulty mix — every paper is steered toward the historical low/medium/high
--       split (EK-0023: 75.9% low / 17.9% medium / 6.2% high).
--
-- The generator emits both tags as structured output fields at insert time (see
-- src/lib/bank/examMix.ts + saveGeneratedQuestion). Existing bank rows are NOT backfilled or
-- re-measured — these columns stay NULL for every pre-feature row, and the running-count math is
-- batch-scoped over the Exam-Mix-generated rows only.
--
-- Additive / idempotent — safe to run repeatedly.

-- (a) PER-ITEM TAGS on the bank item (generated_questions). Both nullable — NULL means "not tagged
--     by Exam Mix" (every legacy row, and any item the accept-anyway fallback deliberately excludes
--     from the mix counters).
ALTER TABLE generated_questions ADD COLUMN IF NOT EXISTS wine_category   TEXT;
ALTER TABLE generated_questions ADD COLUMN IF NOT EXISTS curveball_level TEXT;

DO $$ BEGIN
  ALTER TABLE generated_questions ADD CONSTRAINT generated_questions_wine_category_check
    CHECK (wine_category IS NULL OR wine_category IN
      ('sparkling','rose','fortified','sweet','oxidative','orange','still_white','still_red'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE generated_questions ADD CONSTRAINT generated_questions_curveball_level_check
    CHECK (curveball_level IS NULL OR curveball_level IN ('low','medium','high'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Fast running-count reads for the pre-generation targeting math (batch-scoped, but the paper
-- filter keeps the composite index selective).
CREATE INDEX IF NOT EXISTS idx_generated_questions_wine_category
  ON generated_questions (paper, wine_category);
CREATE INDEX IF NOT EXISTS idx_generated_questions_curveball_level
  ON generated_questions (paper, curveball_level);

-- (b) PER-BATCH bookkeeping on bank_batches.
--   mix_summary — the per-batch tally rendered in the review header, e.g.
--     { "paper": 3, "categories": { "sparkling": 4, "sweet": 3, ... },
--       "curveball": { "low": 9, "medium": 2, "high": 1 } }
--   retry_log  — internal-only [{ attempt, reason, targetedGap }] for debugging; never surfaced.
ALTER TABLE bank_batches ADD COLUMN IF NOT EXISTS mix_summary JSONB;
ALTER TABLE bank_batches ADD COLUMN IF NOT EXISTS retry_log   JSONB NOT NULL DEFAULT '[]'::jsonb;
