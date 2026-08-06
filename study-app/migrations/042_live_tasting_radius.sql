-- Migration 042: Live Tasting travel radius (user-1 pilot feedback, 2026-08-05).
--
-- "How far will you go for a bottle?" — the local availability tier now searches within the
-- user's stated drive time instead of a fuzzy "near {city}". NULL = the default catchment
-- (~30 minutes). Whitelist (15/30/60/90) enforced app-side, matching the users-prefs convention.
--
-- Additive / idempotent — safe to run repeatedly. MUST be applied to Neon.

ALTER TABLE users ADD COLUMN IF NOT EXISTS live_radius_minutes INTEGER;
