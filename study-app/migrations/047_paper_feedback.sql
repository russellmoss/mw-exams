-- Migration 047: paper-level feedback (user-1 report, 2026-08-06).
--
-- The FeedbackButton anchors feedback to an attempt (creating one from a question when needed),
-- but a BYO paper in prep has NO questions yet — the pilot tried to report a paper-generation
-- problem and the submit button was dead. Paper feedback gets its own home (appended JSONB) and
-- is ALSO emailed to admins so it is seen without a new review surface.
--
-- Additive / idempotent — safe to run repeatedly. MUST be applied to Neon.

ALTER TABLE live_tasting_papers ADD COLUMN IF NOT EXISTS user_feedback JSONB;
