-- Re-baseline the schema_migrations checksums for 001-013.
--
-- These thirteen were applied in one batch from a Windows machine on 2026-08-02T19:17. Git is
-- checked out there with core.autocrlf=true, so the runner read CRLF text and stored a CRLF hash.
-- Every build since has run on Vercel's Linux builders, read the same committed blobs as LF, and
-- warned that thirteen unchanged files had "changed". 014+ were first applied by a Linux build and
-- never drifted.
--
-- scripts/migrate.mjs now normalises line endings before hashing, so the computed value is the LF
-- hash on every platform. This aligns the stored rows with that value.
--
-- The migration files themselves are untouched: `new` below is the sha256 of the exact committed
-- blob, LF-normalised, truncated to 16 chars — the same value the fixed runner computes.
--
-- Idempotent, and safe by construction: each row only updates when the stored checksum is still the
-- known CRLF value, so a re-run is a no-op and a migration that genuinely changed is left alone to
-- keep warning.
UPDATE schema_migrations AS m
SET checksum = v.new
FROM (
  VALUES
    ('001_usage_tracking.sql', '85a741e8b0e86507', 'f214d3a1bd8ddd02'),
    ('002_notification_narration.sql', 'dffbfee60749ee78', '070b7097b5233317'),
    ('003_narration_played.sql', '6174f6b020837a25', 'd083b1097268b24d'),
    ('004_feedback_submitted_at.sql', 'bbdfd8e82742b5e9', '2f9d0a70277dbd78'),
    ('005_empirical_knowledge.sql', 'a809d0502b921cc1', '89b67d2a1f5bf642'),
    ('006_media_cache.sql', '8ab1db325f00b9d7', '6728a3590d4b4ee0'),
    ('007_tasting_lexicon.sql', 'd639044c227e437a', '429e79104bc01721'),
    ('008_grading_telemetry.sql', '1c710c8f9fda3f33', 'a5b3c3ac4da740e0'),
    ('009_feedback_analyzed_snapshot.sql', 'bc4a5c661ba1d51f', 'caa51c802dcb95ae'),
    ('010_feature_requests.sql', '9b54289b0dc5bb4a', '76c92f3d44dba3dd'),
    ('011_flash_notes.sql', '5d42611ef4ea7759', '2c2aee3d3e79839b'),
    ('012_mode_not_null.sql', '5944b6a38947e48f', '0c1d9a244ac79187'),
    ('013_stem_detail.sql', 'b5ccf5a57b8d98e4', 'aa6a1cbd6a4aa15b')
) AS v(version, old, new)
WHERE m.version = v.version
  AND m.checksum = v.old;
