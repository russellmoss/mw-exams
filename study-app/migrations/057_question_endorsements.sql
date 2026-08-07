-- 057: question endorsements — positive user feedback becomes a first-class signal.
--
-- Before this, praise ("this is a good question") had no bucket: the feedback analyzer's only
-- terminal recommendations were accept/reject/partial, so praise was auto-REJECTED — wrong in the
-- ledger (it pollutes the reject stats) and wrong in the UI (the user who complimented a question
-- is told "Auto-rejected"). Endorsed questions are also the generation pipeline's only POSITIVE
-- training signal: they are injected into the question-generation prompt as exemplars and included
-- in the root-cause miner's feedback stream as a contrast class.
--
-- endorsed_at         — when the question was endorsed (NULL = never endorsed).
-- endorsement_note    — the praise text (verbatim user feedback excerpt) shown to the generator.
-- endorsement_source  — provenance, e.g. 'user_feedback:368'.

ALTER TABLE generated_questions ADD COLUMN IF NOT EXISTS endorsed_at timestamptz;
ALTER TABLE generated_questions ADD COLUMN IF NOT EXISTS endorsement_note text;
ALTER TABLE generated_questions ADD COLUMN IF NOT EXISTS endorsement_source text;

-- feedback_analyses.recommendation carries a CHECK constraint that predates the migration runner
-- (the table has no CREATE TABLE in this repo), so it is invisible in migration history: it allowed
-- only accept/reject/pending/partial. Writing 'endorse' throws — which would have taken down the
-- whole analysis write the FIRST time the analyzer endorsed anything, since updateFeedbackAnalysis
-- writes status and recommendation together. Widen it here rather than dropping it: the constraint
-- is what makes a typo'd verdict fail loudly instead of silently becoming an unknown status.
ALTER TABLE feedback_analyses DROP CONSTRAINT IF EXISTS feedback_analyses_recommendation_check;
ALTER TABLE feedback_analyses ADD CONSTRAINT feedback_analyses_recommendation_check
  CHECK (recommendation = ANY (ARRAY['accept', 'reject', 'pending', 'partial', 'endorse']));

-- Index the exemplar lookup the generation prompt runs on every generation (paper + endorsed,
-- newest first). Partial: endorsed rows are a small minority of the bank.
CREATE INDEX IF NOT EXISTS idx_generated_questions_endorsed
  ON generated_questions (paper, endorsed_at DESC)
  WHERE endorsed_at IS NOT NULL;
