-- Migration 018: stamp the build that produced each attempt.
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
