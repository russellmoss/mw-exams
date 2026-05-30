-- 006_media_cache.sql — cache of web images used to illustrate generated feedback.
--
-- When answer feedback is generated, the model marks up to 3 spots with image tokens; the server
-- fetches a relevant image per spot via Tavily, downloads the bytes, and stores them here keyed by a
-- NORMALIZED search query. Subsequent feedback that wants the same topic (e.g. "Clare Valley Riesling
-- vineyard") reuses the cached row and makes ZERO Tavily calls. Captions are NOT stored here — the
-- same image gets a context-specific subtitle per feedback, kept inline in the feedback markdown.
--
-- Bytes live inline (base64), matching the existing narration-audio pattern (feedback_analyses.narration_audio).
-- Apply: psql "$DATABASE_URL" -f migrations/006_media_cache.sql   (idempotent)

CREATE TABLE IF NOT EXISTS media_cache (
  id            BIGSERIAL PRIMARY KEY,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  query_key     TEXT NOT NULL UNIQUE,            -- normalized search query (the cache key)
  query         TEXT NOT NULL,                   -- original query the model asked for
  source_url    TEXT,                            -- where the image came from (Tavily result)
  content_type  TEXT NOT NULL DEFAULT 'image/jpeg',
  image_base64  TEXT,                            -- the downloaded image bytes, base64
  usage_count   INTEGER NOT NULL DEFAULT 0,      -- how many times reused (cache effectiveness)
  last_used_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_media_cache_query_key ON media_cache (query_key);
CREATE INDEX IF NOT EXISTS idx_media_cache_last_used ON media_cache (last_used_at DESC);
