# Plan — Google OAuth sign-in + branded password reset

**Status:** awaiting secrets, then fully executable
**Branch:** `claude/password-reset-user-97eb6d`
**Target:** https://study-app-blond-nine.vercel.app
**Written:** 2026-08-02

---

## 1. What you do vs what I do

**You do exactly three things (~10 minutes, all copy-paste):**

| # | Thing | Where | What I need back |
|---|---|---|---|
| 1 | Create a Brevo account, verify `russellmoss87@gmail.com` as a sender (click a link in an email), create an API key | brevo.com — free, no card | the API key (`xkeysib-…`) |
| 2 | Create a Google OAuth client (type: Web application) | console.cloud.google.com | Client ID + Client Secret |
| 3 | Create a Vercel API token | vercel.com/account/tokens | the token |

**I do everything else:** schema migration on prod, all code, the email template, all tests, setting every env var via the Vercel CLI, deploying, and verifying the live flows end to end.

On #2 — if you're signed into Google in Chrome, I can drive the Cloud Console myself with the browser tools and create the OAuth client without you touching it. I can never enter your password; I'd just be clicking through an already-authenticated session. Your call which is less annoying.

---

## 2. Decisions locked (and why)

**Email: Brevo HTTP API.** This was the binding constraint. Resend and Mailgun both require DNS domain verification before they'll send to anyone but you, and you can't add DNS records to a `vercel.app` subdomain. Brevo's free tier does **single-sender verification** — you verify one plain Gmail address by clicking a link, then send to anyone, 300/day forever, no DNS, no card. At 50 users doing occasional resets, 300/day is ~100× headroom. Using the HTTP API rather than SMTP because SMTP connections are unreliable from serverless functions.

Rejected: Gmail SMTP + App Password (needs 2FA setup on your account, and a personal mailbox isn't a transactional sender); Resend (DNS); Gmail API send scope (it's a *sensitive* scope — in Testing mode the refresh token expires every 7 days, so mail would silently break weekly).

**OAuth: hand-rolled authorization-code flow, not NextAuth/Auth.js.** The app already has a working custom auth stack — `signToken`/`createSessionCookie`/`getUser` in [auth.ts](study-app/src/lib/auth.ts), with `getUser(request)` called across essentially every API route. Dropping NextAuth in means rewriting session handling everywhere and re-testing every protected route. The hand-rolled flow is ~200 lines, touches nothing existing, and mints the exact same `mw-session` JWT cookie the app already understands. Lower risk, less code.

**Google scopes: `openid email profile` only.** These are *non-sensitive*, which means the consent screen can be published to External with **no Google review and no 100-user cap**. Any Gmail address can sign in, which is what you asked for. Requesting anything more would trigger a multi-week verification.

---

## 3. Architecture

```
Google sign-in
  /login  →  [Continue with Google]
          →  GET  /api/auth/google          (redirect to Google, signed state cookie)
          →  Google consent
          →  GET  /api/auth/google/callback (code→tokens, verify id_token, upsert user)
          →  Set-Cookie: mw-session=<same JWT as password login>  →  /

Password reset
  /login  →  [Forgot password?]  →  /forgot-password
          →  POST /api/auth/forgot-password  (always 200, enumeration-safe)
          →  Brevo API  →  branded email  →  /reset-password?token=…
          →  POST /api/auth/reset-password   (verify, bcrypt, single-use burn)
          →  auto sign-in  →  /
```

### Schema changes (migration `013_oauth_and_reset.sql`)

```sql
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;   -- Google-only users have no password
ALTER TABLE users ADD COLUMN google_sub  TEXT UNIQUE;         -- Google's stable subject id
ALTER TABLE users ADD COLUMN avatar_url  TEXT;

CREATE TABLE password_reset_tokens (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,        -- SHA-256 of the token; raw token never stored
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_prt_user  ON password_reset_tokens(user_id);
CREATE INDEX idx_prt_token ON password_reset_tokens(token_hash);
```

⚠️ **Prod schema drift is a known hazard here.** Migration 011 was never applied to prod, and a manual `NOT NULL` on `mode` caused the 500s fixed in `d15e107`. So this migration gets applied to prod **explicitly via the Neon MCP**, and verified by re-reading `information_schema` — not assumed.

### Security properties (non-negotiable, each gets a test)

- Reset token = 32 random bytes (`crypto.randomBytes`), base64url. Only its SHA-256 lands in the DB.
- 60-minute expiry, **single use** (`used_at` stamped in the same transaction as the password write).
- Issuing a new token invalidates that user's outstanding ones; a successful reset invalidates all of them.
- `/api/auth/forgot-password` returns an identical 200 + identical timing whether or not the account exists — no account enumeration.
- Rate limit: 3 requests per email per hour, 10 per IP per hour, enforced in the DB.
- OAuth CSRF: `state` is a short-lived signed JWT stored in an HttpOnly cookie and compared on callback.
- **Account linking only on `email_verified === true` from Google.** Without that check, someone could register an unverified Google account with your email and take over the account. This is the single most dangerous line in the feature.
- `bcrypt.compare(password, null)` throws — so [login/route.ts](study-app/src/app/api/auth/login/route.ts:32) gets a guard: a Google-only user attempting password login gets the normal "Invalid email or password", not a 500.

---

## 4. Files

**New**
```
study-app/migrations/013_oauth_and_reset.sql
study-app/src/lib/email.ts                        Brevo client + send wrapper
study-app/src/lib/email-templates/reset-password.ts   Cellar-styled HTML + plaintext
study-app/src/lib/reset-tokens.ts                 create / verify / burn
study-app/src/lib/google-oauth.ts                 URL builder, code exchange, id_token verify
study-app/src/app/api/auth/google/route.ts
study-app/src/app/api/auth/google/callback/route.ts
study-app/src/app/api/auth/forgot-password/route.ts
study-app/src/app/api/auth/reset-password/route.ts
study-app/src/app/forgot-password/page.tsx
study-app/src/app/reset-password/page.tsx
study-app/tests/*.test.ts                         vitest
```

**Modified:** `login/page.tsx` (Google button + forgot link), `api/auth/login/route.ts` (null-hash guard), `package.json` (vitest), `.env.example`.

### The email template

Email clients strip `<style>` blocks and don't support CSS variables, Tailwind, or webfonts — so the Cellar look is hand-inlined: table-based layout, hex literals straight from [DESIGN.md](DESIGN.md) (`#0c0a09` bg, `#1c1917` card, `#44403c` border, `#d97706` amber CTA, `#e7e5e4` text), Georgia as the Fraunces stand-in for the display heading, system sans for body. Bulletproof VML button so Outlook renders it. Plaintext alternative always included. Dark-background emails need explicit `bgcolor` on the outer table or Gmail's light mode washes them out — that's handled.

---

## 5. Execution phases

Each phase ends green before the next starts.

**Phase 0 — Setup.** `npm install` in this worktree (it has no `node_modules` yet), add vitest, write `.env.local` from your three secrets, push all env vars to Vercel via `vercel env add` with your token (production + preview + development).

**Phase 1 — Migration.** Write `013`, apply to a **Neon test branch first**, verify, then apply to prod via Neon MCP and re-read `information_schema` to confirm. Zero downtime — all changes are additive except the `DROP NOT NULL`, which cannot break existing rows.

**Phase 2 — Email.** Brevo client + template. Verify by sending one real email to you and eyeballing it in Gmail.

**Phase 3 — Password reset.** Token lib, both API routes, both pages, wire the login-page link.

**Phase 4 — Google OAuth.** OAuth lib, both routes, upsert + linking logic, login-page button, null-hash guard on password login.

**Phase 5 — Test.** Full suite, below.

**Phase 6 — Ship.** Merge to `master`, push (Vercel git auto-deploy picks it up because `study-app/` changed), verify live.

---

## 6. Testing

**Unit (vitest)** — token generation randomness, SHA-256 storage never equals the raw token, expiry boundary, single-use burn, rate-limit counting, OAuth state sign/verify (including a tampered state), account-linking decision table (new user / existing password user / existing Google user / **unverified email → must refuse to link**), email template renders with no unsubstituted placeholders.

**Integration (real Postgres, isolated)** — spin up a **Neon branch** via MCP, apply the migration, run the real routes against it, drop the branch after. Covers: full request→reset→login cycle; expired token rejected; reused token rejected; nonexistent email still returns 200; Google-only user's password login fails cleanly instead of 500ing.

This uses a throwaway branch specifically so no test rows land in prod under your account — the mistake worth not repeating.

**End-to-end (live, in-app browser)** — against the deployed preview/prod: request a reset for a throwaway test user, pull the token from the DB (and confirm via Brevo's event log that the mail actually sent), open the reset link, set a new password, confirm sign-in, confirm the old password now fails, then delete the test user.

**Honest limitation:** I can drive the Google flow up to the consent screen, but completing it requires signing into a Google account, and I can't enter credentials. So the last click of the OAuth e2e is yours — about 15 seconds. If you're already signed into Google in Chrome, the consent screen may just pass through and I can finish it. Everything else is fully automated.

**Gotcha to design around:** Vercel preview deployments get dynamic URLs, which won't match a fixed OAuth redirect URI. So I register `https://study-app-blond-nine.vercel.app/api/auth/google/callback` and `http://localhost:3000/...`, test OAuth locally + on prod, and use previews only for the reset flow.

---

## 7. Risks

| Risk | Handling |
|---|---|
| Prod schema drift bites again | Test branch first; verify `information_schema` after; migration is additive |
| Account takeover via unverified Google email | Hard `email_verified` check + explicit test |
| Google-only user 500s the login route | Null-hash guard + explicit test |
| Brevo mail lands in spam | Sender is a verified real Gmail address; plaintext alt; I check inbox placement during e2e |
| Reset link leaks via referrer | Token in query is consumed and burned immediately; `Referrer-Policy: no-referrer` on the reset page |
| 300/day cap | ~100× headroom at 50 users; rate limiting makes abuse-driven exhaustion impractical |

**Rollback:** the feature is purely additive — revert the commit and the app returns to password-only login. The migration can stay (nullable column + unused table harm nothing).

---

## 8. Not in scope

Email verification for new signups, "sign in with Google" on the register form's extra fields (Google users get `address`/`business` as null and can fill them in Settings), password-strength rules beyond the existing 6-char minimum, and resets for the other 7 locked-out users — once this ships they can self-serve, which solves that problem on its own.
