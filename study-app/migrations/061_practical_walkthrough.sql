-- Migration 061: the guided Practical-drills walkthrough flag.
--
--   • practical_walkthrough_seen — the one-time "how the drills work" walkthrough, which teaches
--     Dry Flights and Live Tastings. Same contract as walkthrough_seen (051) and
--     coach_walkthrough_seen (056): shown ONCE, never automatically again, replayable on demand.
--
-- PAGE-SCOPED, NOT PART OF THE FIRST-RUN CHAIN. The other three walkthroughs fire from
-- ShellOnboarding on the launcher; this one fires the first time a candidate opens /practical,
-- because that is the moment the teach is useful and because the launcher chain is already four
-- stages long. A candidate who never opens Practical is never shown it.
--
-- A SEPARATE FLAG, for the same reason 056 was: every existing user has the earlier flags set, so
-- folding this into one of them would mean nobody currently on the app ever sees it.
--
-- Additive / idempotent — safe to run repeatedly.

ALTER TABLE users ADD COLUMN IF NOT EXISTS practical_walkthrough_seen BOOLEAN NOT NULL DEFAULT false;
