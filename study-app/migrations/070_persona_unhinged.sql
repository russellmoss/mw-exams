-- Migration 070: add the 'unhinged' persona to the allowed set.
--
-- Numbered 070, not 069: 069 was taken by 069_wine_role_rulings.sql while this branch was open.
-- Renumbering THIS file is safe and renumbering that one would not be — it is already applied to
-- production and the ledger keys on the filename, so a rename there would re-apply it.
--
-- A CHECK constraint cannot be widened in place, so this DROPs and re-ADDs it. That is safe here
-- and would not be for a narrowing change: every value the old constraint permitted is still
-- permitted, so no existing row can be invalidated by the gap between the two statements.
--
-- Idempotent in both directions — DROP IF EXISTS, then re-create only when absent — so a re-run
-- against an already-migrated database is a no-op rather than an error.

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_persona_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_persona_check'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_persona_check
      CHECK (persona IN ('mentor','examiner','wit','roast','unhinged'));
  END IF;
END $$;
