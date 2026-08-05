-- 038_parse_failure_sample.sql
--
-- generation_attempts records parse_failed as a boolean and nothing else, so a parse failure is
-- countable but not diagnosable. Nobody can tell whether a malformed draft was truncated, missing
-- its "## Wines" heading, wrapped in prose, or something else entirely.
--
-- That gap cost real effort: parse failures ran at 14.2% of worker attempts, a plausible-sounding
-- cause was proposed (an agent tool-grant leaking into the system prompt), and settling whether it
-- was actually responsible would have taken ~4,000 attempts per arm to reach significance — forty
-- batches of paid generation to answer a question a single stored sample answers directly.
--
-- Store a bounded head of the offending response instead. 2000 chars is enough to see the shape of
-- the output (which headings are present, whether it opens with prose, whether it stops mid-way)
-- without turning the telemetry table into a transcript store.
--
-- Idempotent, per the migration-runner convention.
ALTER TABLE generation_attempts
  ADD COLUMN IF NOT EXISTS parse_failure_sample text;

COMMENT ON COLUMN generation_attempts.parse_failure_sample IS
  'First ~2000 chars of a response that failed to parse. NULL unless parse_failed. Diagnostic only.';

-- Only ever populated on parse failures, so a partial index keeps it off the hot path.
CREATE INDEX IF NOT EXISTS idx_generation_attempts_parse_failed
  ON generation_attempts (created_at DESC)
  WHERE parse_failed;
