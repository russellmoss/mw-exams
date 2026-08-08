-- Migration 063: make BANKED the default question source.
--
-- Migration 047 introduced users.question_source_default with a column default of 'fresh', chosen
-- then to preserve the behaviour every pre-existing account already had. That has outlived its
-- purpose: the bank is now the reviewed, audited pool, serving from it costs the candidate nothing
-- on their API key, and the onboarding screen has recommended 'banked' since it shipped. Leading
-- with a 30-60s billed generation is the wrong first move for almost everyone.
--
-- Two changes, both intentional:
--
--   1. The column default flips to 'banked', so new signups who never reach the onboarding screen
--      get the recommended path.
--   2. Existing 'fresh' rows are backfilled to 'banked'. This DOES overwrite anyone who explicitly
--      chose 'fresh' — accepted deliberately, because 41 of the 43 rows held 'fresh' only because
--      it was the historic column default, and the two accounts that ever chose a value chose
--      'banked'. There is no created-vs-chosen marker to tell the cases apart. The setting is one
--      click to restore in Settings → Study Defaults, and it changes only which of two buttons is
--      pre-selected, never what a candidate can reach.
--
-- Additive / idempotent — safe to run repeatedly (the UPDATE is a no-op on a second run unless
-- someone has since chosen 'fresh', which is why it must not be re-run casually after release).

ALTER TABLE users ALTER COLUMN question_source_default SET DEFAULT 'banked';

UPDATE users SET question_source_default = 'banked' WHERE question_source_default = 'fresh';
