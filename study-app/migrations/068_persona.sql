-- Migration 068: AI persona — the voice the app uses when it talks to this candidate.
--
-- One of four ids from src/lib/personas.ts: 'mentor' (the warm, thorough default and the
-- behaviour every existing account already has), 'examiner' (blunt and brief), 'wit' (funny,
-- never at the candidate), 'roast' (funny, entirely at the candidate).
--
-- NOT NULL DEFAULT 'mentor' rather than a nullable "never chose" column, unlike
-- elevenlabs_voice_id (059): there is no app-level fallback to defer to here — every prompt
-- builder needs a concrete voice on every call, so the resolution belongs in the schema rather
-- than repeated at each of the seven call sites.
--
-- The CHECK is the reason this is a typed column and not another key in a settings blob: the
-- value is interpolated into a model prompt, so an unrecognised one must fail at the write rather
-- than surface as a persona nobody wrote. Application code validates too (isPersonaId), but the
-- constraint is what holds when a backfill or a psql session goes around it.
--
-- Additive / idempotent — safe to run repeatedly.

ALTER TABLE users ADD COLUMN IF NOT EXISTS persona TEXT NOT NULL DEFAULT 'mentor';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_persona_check'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_persona_check
      CHECK (persona IN ('mentor','examiner','wit','roast'));
  END IF;
END $$;
