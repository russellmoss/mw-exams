-- Migration 051: the guided diagram walkthrough flag.
--
--   • walkthrough_seen — the one-time "how the study diagrams work" walkthrough, which runs
--     between the first-run intro presentation and the spotlight UI tour. Unlike intro_seen
--     (every session until dismissed) this is shown ONCE and then never automatically again:
--     it is a dense 7-step teach, not a splash. Replayable on demand from the Library header.
--
-- Additive / idempotent — safe to run repeatedly.

ALTER TABLE users ADD COLUMN IF NOT EXISTS walkthrough_seen BOOLEAN NOT NULL DEFAULT false;
