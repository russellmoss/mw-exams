-- Migration 055: exactly-once execution for Coach write proposals.
--
-- The Coach never mutates on its own: a write tool returns a signed proposal, the candidate presses
-- Confirm, and POST /api/coach/confirm executes it. That token is a bearer credential held by the
-- client, so nothing stops it being submitted twice — a double-click, a retried request, a browser
-- replaying on reconnect.
--
-- The nonce row IS the lock. Commit inserts it first; the UNIQUE primary key means a second attempt
-- raises a duplicate-key error, which the commit path translates into "this was already confirmed"
-- rather than filing a second piece of feedback. Checking "have I seen this nonce?" with a SELECT
-- would leave a window between the read and the write; the constraint has no window.
--
-- Rows are kept (not deleted after use) because that is the whole point — a burned nonce must stay
-- burned. Tokens expire in 5 minutes, so a sweep of rows older than a day is safe whenever the table
-- needs trimming.
--
-- Additive / idempotent — safe to run repeatedly.

CREATE TABLE IF NOT EXISTS coach_confirmations (
  nonce        TEXT PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tool         TEXT NOT NULL,
  args         JSONB,
  -- What the write produced (an attempt id, a session id), for tracing a committed action back to
  -- the card the candidate actually approved.
  result       JSONB,
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coach_confirmations_user
  ON coach_confirmations (user_id, confirmed_at DESC);
