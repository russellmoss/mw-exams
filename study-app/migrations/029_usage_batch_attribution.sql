-- Migration 029: attribute bulk-run spend to its batch even when nothing is banked.
--
-- getBatchActualCost sums model_usage by joining generated_questions on batch_id. A FAILED generation
-- attempt never saves a question row, so its spend has nothing to join to and disappears from the
-- total. Migration 5e33768 hoisted the question_id above the attempt loop, which fixed the common
-- case — a batch with successes now reports real money — but a batch that fails outright still reads
-- as free. On 2026-08-04 a Paper 1 batch burned twenty failed attempts and reconciled to $0.00.
-- A run that is going badly is exactly when the number matters, and that is precisely when it lied.
--
-- batch_id is stamped on every call a bulk run makes, successful or not, so spend is attributable
-- without a surviving question. Rows from the interactive study path leave it NULL.
--
-- tavily_usage gets the same column: wine enrichment researches unknown wines over Tavily, so a
-- bulk run's true cost is Claude + Tavily. Same attribution gap, same fix.
--
-- NOTE: these columns already exist in production — they were applied by an earlier branch whose
-- migration file was dropped when that branch was reconciled onto master. Written idempotently so
-- this is a no-op there and correct everywhere else.

ALTER TABLE model_usage  ADD COLUMN IF NOT EXISTS batch_id UUID;
ALTER TABLE tavily_usage ADD COLUMN IF NOT EXISTS batch_id UUID;

CREATE INDEX IF NOT EXISTS idx_model_usage_batch  ON model_usage  (batch_id);
CREATE INDEX IF NOT EXISTS idx_tavily_usage_batch ON tavily_usage (batch_id);
