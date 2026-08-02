-- Migration 014: Google OAuth sign-in + self-serve password reset.
--
-- Additive / idempotent — safe to run repeatedly.

-- 1. Google-only users have no password. The column was NOT NULL because every account was
--    created through the register form; an OAuth account has nothing to put there, and storing a
--    dummy hash would make "does this user have a password?" unanswerable.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- 2. Google's `sub` claim: the stable per-user identifier. Email can change on a Google account,
--    sub cannot, so this is what we match on once an account is linked. UNIQUE prevents two local
--    accounts from claiming the same Google identity.
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_google_sub_key') THEN
    ALTER TABLE users ADD CONSTRAINT users_google_sub_key UNIQUE (google_sub);
  END IF;
END $$;

-- 3. Password reset tokens.
--
--    token_hash, never the token: this table is the one place an attacker with read access could
--    mint a working reset link, so we store only SHA-256 of the token and compare hashes. A leaked
--    database dump then yields nothing usable.
--
--    used_at rather than DELETE: keeps a single-use token auditable after redemption, and lets us
--    distinguish "expired" from "already used" when someone clicks an old link twice.
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  request_ip TEXT
);

-- Lookup on redeem is by token_hash; the user_id index serves both invalidate-outstanding-tokens
-- and the per-email rate limit.
CREATE INDEX IF NOT EXISTS idx_prt_token   ON password_reset_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_prt_user    ON password_reset_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_prt_created ON password_reset_tokens (created_at);
