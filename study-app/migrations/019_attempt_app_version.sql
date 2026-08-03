-- Migration 019: stamp the build that produced each attempt.
--
-- Numbered 019, not 018: this shipped as 018_attempt_app_version.sql first, and a preview build
-- applied it before another in-flight branch was found to have already taken 018
-- (018_generation_telemetry.sql, applied to the shared database at 12:11 on 2026-08-03). The
-- schema_migrations row for the old 018 filename is inert — the runner iterates files on disk — and
-- this file re-applies harmlessly under its new name because every statement is IF NOT EXISTS.
--
-- A bug report ("the tasting note was wrong", "this button did nothing") is only debuggable if we
-- know WHICH build the candidate was on. Without it, a fix that shipped between the attempt and the
-- report is indistinguishable from a bug that is still live, and preview deployments — which share
-- the production database — are indistinguishable from production traffic.
--
-- Short git sha (7 chars), from VERCEL_GIT_COMMIT_SHA at request time. NULL for local dev and for
-- every attempt that predates this migration.
--
-- Additive / idempotent — safe to run repeatedly.

ALTER TABLE user_attempts ADD COLUMN IF NOT EXISTS app_version TEXT;

CREATE INDEX IF NOT EXISTS idx_user_attempts_app_version ON user_attempts (app_version);
