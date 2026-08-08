-- Migration 062: the guided Theory walkthrough flag.
--
--   • theory_walkthrough_seen — the one-time "how Theory works" walkthrough. Same contract as
--     practical_walkthrough_seen (061): fires on the first visit to /theory, never automatically
--     again, replayable from the Theory header and the Library.
--
-- The second page-scoped walkthrough. Both halves of Stage 2 now teach themselves on first contact
-- rather than adding stages to the launcher chain, which is already four deep.
--
-- A SEPARATE FLAG, for the same reason 056 and 061 were: every existing user has the earlier flags
-- set, so folding this into one of them would mean nobody currently on the app ever sees it.
--
-- Additive / idempotent — safe to run repeatedly.

ALTER TABLE users ADD COLUMN IF NOT EXISTS theory_walkthrough_seen BOOLEAN NOT NULL DEFAULT false;
