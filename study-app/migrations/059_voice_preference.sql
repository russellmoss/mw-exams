-- Migration 059: per-user narration voice.
--
--   • elevenlabs_voice_id — the ElevenLabs voice this user wants to hear. NULL means "never chose",
--     which resolves to the app default (src/lib/voices.ts). Deliberately a free TEXT column with
--     NO check constraint or foreign key: Settings lets any user paste their own voice ID from the
--     ElevenLabs voice library, so the set of legal values is not ours to enumerate. The synthesis
--     path already degrades to a silent notification when a voice ID is rejected upstream, so a bad
--     value costs an unspoken notification, not an error.
--
-- Additive / idempotent — safe to run repeatedly.

ALTER TABLE users ADD COLUMN IF NOT EXISTS elevenlabs_voice_id TEXT;
