-- 044: optional state/region for the Live Tasting market (users.live_state).
-- City and country stay the required pair; state refines the market string for
-- retail lookups ("New Hope, Pennsylvania" vs just "New Hope").

ALTER TABLE users ADD COLUMN IF NOT EXISTS live_state TEXT;
