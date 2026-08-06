-- Migration 050: Shell-redesign preferences (IA redesign, docs/design/2026-08-06-shell-redesign/).
--
--   • intro_seen — the first-run intro presentation's "Don't show this again" checkbox. The intro
--     shows at every session start until this is true, then never again (design handoff §0).
--   • tour_seen — the one-time spotlight UI tour completed or was skipped. Settings can reset it
--     to false to re-run the tour.
--   • exam_date — the candidate's next Stage 2 sitting, for the home launcher countdown line.
--     Nullable; the countdown hides when unset.
--   • last_drill_config — the most recent Dry Flights configuration (paper, family, mode, stem
--     detail), written when a drill starts. Feeds the launcher's Continue card, server-side so it
--     follows the user across devices.
--
-- Additive / idempotent — safe to run repeatedly.

ALTER TABLE users ADD COLUMN IF NOT EXISTS intro_seen BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS tour_seen BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS exam_date DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_drill_config JSONB;
