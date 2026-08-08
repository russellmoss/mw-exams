-- Migration 067: Question Review works in BLOCKS — one paper × family at a time.
--
-- The queue shipped in 066 ordered purely by served_count, which walks the reviewer across papers
-- and question families at random: a Paper 1 same-variety flight, then a Paper 3 fortified style
-- question, then a Paper 2 blend. Every card was a context switch, and judging whether a question is
-- exam-realistic is exactly the kind of call that needs a settled frame of reference.
--
-- The default is now a fixed walk: P1 F1 → P1 F2 → … → P3 F7, twenty-one blocks, most-served first
-- inside each. The reviewer can narrow to particular papers/families, or ask for a shuffle.
--
-- Only one thing needs storing: the selection, so it survives a reload and follows them to another
-- device mid-pass. Shape:
--
--   { "papers": [1,2,3], "families": ["F1",…,"F7"], "order": "grouped" | "random" }
--
-- NULL means "no explicit selection yet" and is read as the default (everything, grouped). Stored as
-- JSONB rather than three columns because it is one preference that is always read and written
-- together, and because adding a fourth facet later must not mean another migration — the same
-- reasoning as users.last_drill_config (migration 050).
--
-- Additive / idempotent — safe to run repeatedly. MUST be applied to Neon.

ALTER TABLE users ADD COLUMN IF NOT EXISTS review_filter JSONB;

-- The block walk groups by (paper, family) and, within a block, orders by served_count. The queue
-- read also excludes anything this reviewer has already voted on, which is a NOT EXISTS against
-- question_reviews (already indexed on the pair by 066).
--
-- Partial, matching the servable predicate: the review queue never looks at quarantined, binned,
-- retired or live-tasting rows, so indexing them would just make the index bigger than it needs to be.
CREATE INDEX IF NOT EXISTS idx_generated_questions_review_blocks
  ON generated_questions (paper, family, served_count DESC, created_at DESC, question_id)
  WHERE invalid_reasons IS NULL
    AND review_state = 'kept'
    AND is_retired IS NOT TRUE
    AND scope = 'pool';
