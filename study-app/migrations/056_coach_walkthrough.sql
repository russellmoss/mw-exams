-- Migration 056: the guided Coach walkthrough flag.
--
--   • coach_walkthrough_seen — the one-time "what the Coach can do" walkthrough, which runs after
--     the diagram walkthrough and before the spotlight UI tour. Same contract as walkthrough_seen
--     (migration 051): shown ONCE, never automatically again, replayable on demand.
--
-- A SEPARATE FLAG, not a reuse of walkthrough_seen. Every user who already finished the diagram
-- walkthrough has walkthrough_seen = true, so folding the Coach teach into that flag would mean
-- nobody currently on the app ever sees it — the people most likely to have opinions worth filing.
--
-- Additive / idempotent — safe to run repeatedly.

ALTER TABLE users ADD COLUMN IF NOT EXISTS coach_walkthrough_seen BOOLEAN NOT NULL DEFAULT false;
