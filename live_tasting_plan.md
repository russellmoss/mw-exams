# Live Tasting — Implementation Plan

**Status: v2 — COUNCIL-HARDENED (Codex gpt-5.4 + Gemini 3.1 Pro adversarial review, 2026-08-05)**
**Changelog from v1 at the bottom (§13).**

## 1. What this feature is

A new practice mode where the app generates a real MW-style question **around wines the user can
actually buy near where they live**, produces a shopping list with purchase links, hides the answer
key, and lets the candidate taste the flight blind at home — writing their own stem analysis and
full tasting note, graded by the existing full-answer grader with identification marks in play.

Core loop:

1. User sets **city, country, and budget** once (settings).
2. User hits **"Generate a Live Tasting"** → picks paper (1/2/3) and flight size (2–4 wines).
3. The app picks a question **archetype first**, selects budget-fitting benchmark candidates per
   slot, verifies availability in the user's market (Tavily, cached), and generates the question +
   answer key from the confirmed flight. The session is not created until the key validates.
4. Session starts in shopping mode: stem visible, wines hidden, shopping list behind an explicit
   "this reveals the wines" gate — or a partner share link so the user never sees labels.
5. Wines bought, bottles bagged/numbered, user tastes → writes stem analysis + full note. No
   "ready" step: grading is available as soon as the user has notes to submit.
6. Submit → graded server-side against the hidden key → full reveal + feedback → History.

## 2. Architectural decisions (the load-bearing ones)

### 2.1 Archetype-first; availability prunes within the archetype  ⟨council: both, top finding⟩

Ordering: **archetype → slot constraints → per-slot candidates → availability → generation.**
Availability never defines the flight shape; it only prunes within it. This preserves MW thematic
coherence (a "same variety, three origins" flight stays that) and caps Tavily fan-out.

```
selectArchetype(paper, flightSize)            -- §4.2; defines per-slot constraints
                                              -- (e.g. slot1: Chablis PC; slot2: Margaret River Chard…)
→ pickSlotCandidates(slotConstraints, budget) -- wine_bank, filtered by PRICE BAND (§2.2),
                                              -- ranked benchmark-first; 3 candidates per slot
→ confirmAvailability(slots, city, country)   -- cached; try candidate #1 per slot, fall to #2/#3
                                              -- ONLY on miss — worst case 3·flightSize searches,
                                              -- typical case ≈ flightSize (cache absorbs repeats)
→ generateAroundWines(confirmedFlight)        -- §4.1
→ deriveStemKey + auditAndQuarantine — AWAITED, not fire-and-forget   ⟨council: Gemini #1⟩
→ createSession(status: shopping)             -- only after the key is validated
```

If a slot exhausts all candidates, backtrack: relax that slot's constraint within the archetype
(e.g. different sub-region, same variety) before falling to mail-order-only stockists. If the
archetype itself can't be satisfied, pick the next archetype — never bend the flight to inventory.

**Replace-wine follows the same rule** ⟨council: Gemini #4⟩: a swap must satisfy the *departing
wine's slot constraint* (archetypal proxy — same variety/origin-role in the flight), then
availability → regeneration → key re-derivation. Substitution is a generation event producing a
**new question row**; the session's `question_id` is repointed, the old row is left quarantined
for audit, and the share token is **rotated** so stale partner links die ⟨council: Codex #13⟩.

### 2.2 Budget = deterministic price bands first; snippet prices refine  ⟨council: both⟩

`wine_bank` has no price data, and Tavily snippet prices are often missing — especially once the
quota latch trips, when *every* price becomes unknown. So the v1 "unknown price = keep but flag"
rule is dead. Replacing it:

- **Migration adds `wine_bank.price_band`** (`value|premium|super_premium|icon`, mapped to
  indicative per-bottle ranges per currency). Populated two ways: a one-time backfill script
  (Haiku batch-classifies existing rows — same pattern as the grapes/identity backfill), and
  `classifyWine()` sets it on every new insert.
- **Primary budget gate is the band**: a candidate enters the pool only if its band's indicative
  ceiling fits the user's per-bottle budget. Deterministic, testable, quota-independent.
- **Snippet prices refine**: when the availability parse finds a concrete same-currency price, it
  overrides the band (can rescue a wine the band excluded, or evict one it admitted).
- **No wine with an unknown band enters the candidate pool.** Fail generation with a clear
  message ("widen the budget or try a different paper") rather than silently overshooting
  ⟨council: Codex #4 hard-gate principle⟩.

### 2.3 Sessions table owns lifecycle as EVENT TIMESTAMPS, not a coarse status  ⟨council: Codex #9/#10, Gemini Q2⟩

The v1 `shopping → ready → tasted` machine conflated three independent facts (seen the list?
bottles in hand? graded?). v2 stores immutable event facts and derives display state:

- `user_revealed_at` — user opened the shopping list themselves
- `share_created_at`, `token_first_used_at` — partner flow
- `graded_at` — grading stream completed
- `abandoned_at` — user dismissed the session

Derived display state: *Shopping* (no `graded_at`), *Tasted* (`graded_at`), *Abandoned*. There is
**no 'ready' state** — grading is legal any time before `graded_at` (partner-bought wines never
require the user to touch the list). The **blind-integrity badge is derived at render time**, not
stored: `partner` iff `token_first_used_at IS NOT NULL AND user_revealed_at IS NULL`, else `self`
if revealed, else `unopened`. A later self-reveal automatically downgrades the badge — no stale
label ⟨council: Codex #10⟩.

### 2.4 Grading: server-side wrapper + one-shot semantics  ⟨council: Codex #8, Gemini #6⟩

- Refactor `evaluate-full/route.ts` core into shared `produceFullEvaluation()` (the
  `flash-notes/grade/produce.ts` pattern). New route `/api/live-tasting/[id]/grade` loads
  question, wines, appearances, model answer **from the DB**; client sends only
  `{userAnswer, preGlassReasoning, inputMethod}`. Pre-reveal serve payloads contain only question
  text, marks, flight size, slot numbers (the `toDrillStem` discipline).
- **Attempt-creation is a CAS lock**: `UPDATE live_tasting_sessions SET attempt_id = $new WHERE
  id = $id AND attempt_id IS NULL` — the row-level compare-and-set is the double-submit guard
  (Neon HTTP has no transactions to lean on).
- **`graded_at` is stamped only when the SSE stream completes** and the enriched feedback is
  saved. If the connection drops mid-stream, the session still has `attempt_id` set but no
  `graded_at`: the grade route detects this (attempt exists, `answer_feedback IS NULL`) and
  **re-runs grading against the same attempt** instead of refusing or duplicating. The user's
  submitted answer is persisted to the attempt row *before* the LLM call, so a retry never needs
  the client to still hold the text.

### 2.5 Honest blind + hardened share link  ⟨council: Codex #3, Gemini #5⟩

- Shopping list behind an explicit interstitial ("this reveals the wines — if solo, have someone
  bag and number the bottles"). Opening it stamps `user_revealed_at`.
- **Share token**: ≥128-bit crypto-random; **stored hashed** (sha-256) — DB read access never
  yields usable links; `expires_at` (90 days); **rotated on replace-wine**; page returns 404 once
  the session is graded or abandoned. Served with `Cache-Control: no-store`,
  `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex`, no third-party assets. The page shows
  wine names, stockists, budget, bagging instructions — never the question, key, or user identity.
- **Partner-mid-shop protection** ⟨Gemini #5⟩: once `token_first_used_at` is set, replace-wine
  requires an explicit confirm ("your partner may already be shopping — the old link will stop
  working") and the rotation makes the stale list impossible to act on silently: old link → 404
  with "this list was updated — ask for a fresh link."

### 2.6 Question rows: `scope` column, not a status overload  ⟨council: Codex #2/#11⟩

New `generated_questions.scope TEXT NOT NULL DEFAULT 'pool'` (`'pool' | 'live-tasting'`).
Lifecycle `status` keeps meaning lifecycle; audience is a separate axis. Every serving-pool query
adds `scope = 'pool'` (grep-audit of all pool queries in `db.ts:528–706` is an explicit task, plus
a regression test that a `scope='live-tasting'` row is never served by any pool path). Generic
question-reading surfaces (admin views are admin-only; History joins only the user's own graded
attempts) get a one-pass audit for pre-reveal leakage, recorded in the PR.

## 3. Schema (migration `041_live_tasting.sql`)

Idempotent per the migrate.mjs contract. CHECK constraints on existing tables use the guarded
`DO $$ … EXCEPTION WHEN duplicate_object` pattern already proven in `040_unreviewed_queue.sql`
⟨council: Gemini #3 — the concern is real, the codebase pattern already solves it⟩.

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS live_city TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS live_country TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS live_budget_amount NUMERIC;
ALTER TABLE users ADD COLUMN IF NOT EXISTS live_budget_currency TEXT;
-- currency whitelist enforced app-side (route validation), no DB CHECK on users

ALTER TABLE wine_bank ADD COLUMN IF NOT EXISTS price_band TEXT;   -- §2.2
ALTER TABLE generated_questions ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'pool';

CREATE TABLE IF NOT EXISTS live_tasting_sessions (
  id                  TEXT PRIMARY KEY,             -- lts_<random>
  user_id             INTEGER NOT NULL REFERENCES users(id),
  question_id         TEXT NOT NULL REFERENCES generated_questions(question_id),
  paper               INTEGER NOT NULL,
  flight_size         INTEGER NOT NULL,
  archetype           TEXT NOT NULL,
  city                TEXT NOT NULL,                -- snapshot at creation
  country             TEXT NOT NULL,
  budget_amount       NUMERIC,
  budget_currency     TEXT,
  availability        JSONB,                        -- per-slot stockists (§5 shape)
  share_token_hash    TEXT UNIQUE,                  -- sha-256; raw token shown once
  share_expires_at    TIMESTAMPTZ,
  attempt_id          INTEGER UNIQUE REFERENCES user_attempts(id),
  user_revealed_at    TIMESTAMPTZ,                  -- §2.3 event facts
  share_created_at    TIMESTAMPTZ,
  token_first_used_at TIMESTAMPTZ,
  graded_at           TIMESTAMPTZ,
  abandoned_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS retail_availability (
  cache_key     TEXT PRIMARY KEY,                   -- norm(wine)|norm(city)|norm(country)
  wine_key      TEXT NOT NULL,
  city          TEXT NOT NULL,
  country       TEXT NOT NULL,
  stockists     JSONB NOT NULL,  -- [{name, kind:'local'|'mail', url, price, currency, confidence}]
  searched_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  refreshing_at TIMESTAMPTZ,                        -- stampede lock (§5.3)
  hit_count     INTEGER NOT NULL DEFAULT 0,
  last_used_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS app_flags (              -- cross-instance latches (§5.3)
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`user_attempts` needs no new columns (`mode='live-tasting'`, standard result columns). The
`UNIQUE` on `attempt_id` is the session↔attempt one-to-one invariant ⟨council: Codex #8⟩.

## 4. Generation pipeline (new: `src/lib/live-tasting-engine.ts`)

Flow as in §2.1. Session creation is **blocked until** `deriveStemKey` returns a validated key
and `auditAndQuarantineQuestion` passes — the engine's existing `saveOpts.awaitBackgroundWork`
makes this a flag, not new machinery. On key failure: discard, swap the weakest candidate, retry
once; then friendly error. The user never shops for an ungradable flight ⟨council: Gemini #1⟩.
Generation runs as SSE with progress frames (archetype → candidates → availability per slot →
writing → validating), reusing the `ProgressEmitter` pattern.

### 4.1 `generateAroundWines()` — constrained entry into the existing engine

Takes the fixed confirmed flight; produces question text + model answer + stem variants. Reuses:
prompt scaffolding, `validateWineReferenceShape` / `validatePaperScope` /
`validateVarietyConsistency` / `validateMarkTypeMix`, `question-rules.mjs`, key derivation,
quarantine, `generation_attempts` telemetry. Skips: banker-minimum, novelty, flight-size
selection. Prompt hard-pins the flight ("EXACTLY these wines in these slots").

**New live-tasting-only validators** ⟨council: Codex #6, Q4⟩:

- **Blind-safety**: question stem and pre-reveal payloads must not contain producer names, cuvée
  names, vineyard names, or stockist-derived facts (checked against the confirmed flight's
  identity strings + stockist names, accent-normalized — the ASCII-regex-vs-accented-label bug
  class is a known trap here).
- **Slot-grounding**: each model-answer wine section must be consistent with the pinned wine in
  that slot (no slot-swapping; spot-checked by the same audit that catches answer↔key mismatch).
- **Archetype-fit**: asserted *before* prompting — the confirmed flight must still satisfy the
  archetype's slot constraints (guards the replace-wine path against thematic drift, which would
  otherwise send the repair loop into a doomed retry cycle ⟨Gemini #4⟩).

### 4.2 Archetypes v1

Same-variety-multiple-origins; same-region-quality-ladder; mixed-variety-identify-each. P3
restricted to wide-distribution categories (Champagne, Port, Sherry, late-harvest);
orange/oxidative deferred. Each archetype declares per-slot constraint templates the candidate
picker consumes.

### 4.3 Vintage drift  ⟨council: Codex #7 — adopted lightweight⟩

Availability accepts any recent vintage of the cuvée, and the model answer is already constrained
to avoid vintage-dependent claims (§8). Additionally: the shopping list (both views) includes an
optional per-slot "vintage bought" field; if filled (by user or partner via the share page —
token-write limited to vintage fields only), the recorded vintages are passed to the grading
prompt as context ("the candidate tasted the 2021"). Not required to grade.

## 5. Availability search (new: `src/lib/retail-availability.ts`)

### 5.1 Query ladder (per confirmed-candidate wine, stop at ≥2 confident stockists)

1. Local: `buy "{producer} {wine}" wine shop OR store "{city}"` (`searchTavily`, maxResults 6).
2. Aggregator: `site:wine-searcher.com "{producer} {wine}" {city|country}`.
3. Mail-order by country (US: wine.com/klwines/totalwine; UK: thewinesociety/majestic/bbr;
   extensible country→domains map). Mail-order results are labeled `kind:'mail'` — shipping-law
   nuance (US state lines, EU cross-border) is handled by honest labeling ("confirm they ship to
   you"), not by modeling alcohol law in v1 ⟨council: Codex #5 — acknowledged, deliberately cut;
   revisit if users report dead links; see §8⟩.

**US state-store markets**: when the Haiku location parse detects a control-state city (PA, UT,
NC, VA-adjacent…), the ladder adds the state system's searchable store site (PA →
`site:finewineandgoodspirits.com` — PLCB inventory is online and searchable). The local tier
also searches without hard state boundaries — for border towns the nearest good wine shop is
often across a state line (New Hope, PA's best options include Lambertville, NJ, one bridge
away), and a brick-and-mortar visit doesn't care about shipping law.

Fan-out is bounded by §2.1's candidate ordering: availability runs on ~flightSize wines (worst
case 3× on unlucky slots), not on an oversampled pool ⟨council: Gemini #2 — the v1 design's
36-call fan-out is gone⟩.

### 5.2 Parse and shape

One Haiku call per wine over collected snippets (model-selector + `logClaudeUsage` discipline):
`[{name, kind, url, price, currency, confidence: 'listed'|'likely'|'unverified'}]`. Always append
a wine-searcher deep link (`wine-searcher.com/find/{slug}` — free, no API) as a guaranteed
fallback row. UI copy: "likely to carry this — call ahead"; never claim live inventory.

### 5.3 Cache, quota, stampede  ⟨council: Codex #14⟩

- Cache in `retail_availability`, 30-day TTL checked on read; `hit_count`/`last_used_at` stats.
- **Quota latch persisted cross-instance**: on HTTP 432, write `app_flags['tavily_quota'] =
  {exhausted_until}` — the in-process latch alone doesn't survive serverless cold starts. All
  availability callers check the flag first; on exhaustion, degrade to deep-links-only + banner.
- **Refresh lock**: before a live search, CAS `refreshing_at` on the cache row (`WHERE
  refreshing_at IS NULL OR refreshing_at < now() - interval '2 minutes'`); losers serve stale or
  deep-link fallback. Cheap insurance against concurrent-miss stampedes.
- Log every call via `logTavilyUsage({taskType:'retail_availability'})` for `/optimize-costs`.
- Rate limit: 2 session generations/user/day (count `live_tasting_sessions.created_at`).

## 6. API routes

| Route | Method | Purpose |
|---|---|---|
| `/api/user/live-tasting-prefs` | GET/PATCH | city/country/budget/currency — one route for the related cluster, matching the pace-preference precedent (one route already owns `pace_default` + `pace_speed_seconds`); currency whitelist validated here |
| `/api/live-tasting` | GET | list my sessions (id, derived state, paper, created — no wines) |
| `/api/live-tasting` | POST | create — runs §4 pipeline as SSE progress; rate-limited |
| `/api/live-tasting/[id]` | GET | state-dependent payload (§6.1) |
| `/api/live-tasting/[id]/shopping` | POST | explicit reveal; stamps `user_revealed_at`; returns wines+stockists |
| `/api/live-tasting/[id]/share` | POST | mint token (returns raw token once; stores hash); stamps `share_created_at` |
| `/api/live-tasting/[id]/replace-wine` | POST | archetype-constrained swap (§2.1); confirm-gated if partner active; rotates token |
| `/api/live-tasting/[id]/grade` | POST | SSE; CAS attempt creation; `graded_at` on stream completion; retry-safe (§2.4) |
| `/api/live-tasting/[id]/abandon` | POST | stamps `abandoned_at`; share page → 404 |
| `/shop/[token]` | page | no-auth partner list; hashed-token lookup; hardened headers; optional vintage-bought write |

### 6.1 State-dependent serve payload

- Pre-`graded_at`: question text, total marks, flight size, slot numbers, per-slot stockist
  count. Never wine identity, notes, key, or model answer.
- Post-`graded_at`: everything (wines, feedback, model answer, blind-integrity badge).

## 7. UI (per DESIGN.md — Cellar system)

- **`/live-tasting`** — session list (derived-state chips) + create flow (paper, flight size,
  budget override). Empty state explains the feature + partner concept.
- **`/live-tasting/[id]`** — state-machine page:
  - *Shopping*: stem visible; "Get the wines" panel → interstitial → stockist cards (name,
    local/mail badge, price if known, confidence label, link) + "Share with a partner" + bagging
    instructions ("number the bags 1–N; pour in slot order"). Grading entry is available here too
    (partner-bought path — no forced reveal, no 'ready' gate).
  - *Tasting entry*: stem-analysis box + full-note `AnswerInput` (mic supported); optional
    exam-pace `StudyTimer`.
  - *Tasted*: `StreamingFeedback` + `WineReveal` + section marks + derived blind-integrity badge.
- **Settings** — "Live Tasting" card: city, country, currency, per-bottle budget.
- **Nav** — "Live Tasting" after Stem Sniper in `NavBar.tsx` (~:60); it is a study surface, so it
  complies with the nav rule at `NavBar.tsx:81-84`; flagged for user sign-off in the PR.
- **History** — `MODE_LABEL['live-tasting']`, mode branch reusing the study renderer + session
  header (city, flight, blind badge).

## 8. v1 scope cuts (explicit)

- No live inventory / stock checking; stockists are leads, not guarantees.
- No multi-currency conversion (same-currency comparison only).
- No alcohol-shipping-law modeling (honest "confirm they ship to you" labeling instead; the
  location model stays city+country in v1 — state/province+metro-radius is the v2 upgrade if
  dead-link reports warrant it).
- No cron jobs of any kind (Hobby-plan constraint untouched; cache fills on demand).
- No vintage-exact availability matching (mitigated per §4.3).
- No P3 curveball styles (orange/oxidative).

## 9. Testing — three layers: unit, agentic E2E self-test, live pilot

### 9.1 Unit + regression (deterministic, run in CI on every build)

- Stockist parser fixtures; cache key normalization + TTL; **price-band budget gate** (band fits
  / band excluded / snippet-price override in both directions); archetype slot-constraint
  matching incl. replace-wine proxy rule; event-fact → derived-state + blind-badge derivation;
  CAS grading lock (second submit attaches, doesn't duplicate).
- **Redaction tests (dedicated)**: pre-reveal session payloads contain no wine identity/key;
  `scope='live-tasting'` rows never surface from any pool query; blind-safety validator catches
  accented producer names.
- Share page: hashed lookup, expiry, 404 after grade/abandon, header assertions.
- Migration 041 idempotency (run twice); `vercel-crons.test.ts` stays green.

### 9.2 Agentic E2E self-test loop (`scripts/live-tasting-e2e.mjs`)

A script that exercises the **real pipeline against the real world** — real Tavily searches, real
generation, real grading — as a seeded test user, then asserts invariants and cleans up after
itself (per the no-real-user-test-pollution rule: dedicated `is_test` user, all session/attempt/
question rows deleted at the end of each run; the `retail_availability` cache rows are
deliberately KEPT — a warm cache for the pilot market is a feature, not pollution).

Test user profile: **New Hope, Pennsylvania, USA — $40/bottle budget** (the pilot user's real
market, and an adversarial one: PLCB control state, no out-of-state retailer shipping,
cross-river NJ shops — if availability is honest here it's honest anywhere).

Per run, for each paper 1/2/3:

1. **Create session** → assert: validated key exists before the session row does; `scope=
   'live-tasting'`; question passes quarantine; generation telemetry row written.
2. **Redaction probe**: fetch the pre-reveal payload as the test user → assert no wine identity,
   no key, no model answer, no stockist names (machine-checked string search against the
   confirmed flight's identity strings, accent-normalized).
3. **Shopping list**: open reveal → assert every slot has ≥1 stockist + the wine-searcher
   fallback row; **link liveness**: HEAD/GET each stockist URL, assert non-404 (dead links are
   the feature's #1 credibility risk); assert same-currency prices ≤ budget where present.
4. **LLM-judge audit** (one Sonnet call per session, logged like all usage): given the generated
   question + flight + stockist list, judge (a) archetype coherence — is this a real MW-style
   flight, not an inventory accident; (b) blind-safety — does the stem leak identity; (c)
   stockist plausibility — are these real merchants that plausibly serve New Hope, PA (PLCB
   stores and Lambertville/Philadelphia-area shops = pass; a Sydney bottle shop = fail); (d)
   budget sanity. Any FAIL verdict fails the run with the judge's reasoning in the report.
5. **Grade a good and a bad candidate**: the harness (which, unlike a user, may see the wines)
   has an LLM write two answers — a competent blind-tasting note consistent with the actual
   flight, and a plausible-sounding but wrong note (wrong varieties/origins). Grade both through
   `/grade` → assert good-score > bad-score by a sane margin, `graded_at` stamped only on stream
   completion, session↔attempt UNIQUE holds, post-grade payload now contains the reveal.
6. **Lifecycle probes**: partner token mint → fetch → `token_first_used_at` stamped → grade →
   share page 404s. Replace-wine on a fresh session → new question row, old row quarantined,
   token rotated, archetype still satisfied.

Output: a markdown report (`outputs/live_tasting_e2e/{date}.md`) — pass/fail per assertion,
judge verdicts, Tavily/LLM spend for the run. The run is budget-capped (~15 Tavily searches,
~10 LLM calls) and respects the quota latch (skips with a SKIPPED report rather than burning a
latched quota).

### 9.3 Recurring loop

The E2E script runs as a **GitHub Actions `schedule:` workflow, weekly** (the
`bank-worker-hourly.yml` pattern — NOT a Vercel cron; Hobby-plan cron budget stays untouched),
plus manually via `workflow_dispatch` before any deploy that touches the feature. Failures open
a report the same way the nightly question audit does. This is the standing "tests itself"
loop: it catches Tavily result drift, retailer site changes, model regressions in generation or
grading — the failure modes unit tests structurally cannot see.

### 9.4 Live pilot — user 1 protocol

**Russell Moss (russellmoss87@gmail.com) is user 1**, New Hope, Pennsylvania, USA. The pilot is
real usage, not simulation:

- Feature ships behind an **admin-only gate** initially (the existing `is_admin` check — no new
  flag infrastructure); nav entry visible to admins only until the pilot session completes.
- Settings pre-seeded for user 1: New Hope, PA / USA / USD (budget set by Russell in the UI).
- **Acceptance gate for Phase C**: one full real session — generate → shop from the actual list
  (does a New Hope resident actually find these wines? PLCB + Lambertville reality check) →
  blind taste → grade → History renders. Friction notes go through the existing FeedbackButton
  so they land in the `feedback_analyses` loop like all other feedback.
- Only after user-1 acceptance does the admin gate open to all users.

This ordering means the agentic loop (9.2) proves the plumbing before any bottle is bought, and
the pilot (9.4) proves the *shopping reality* the agents can only judge, not experience.

## 10. Rollout phases

1. **Phase A** — migration 041; price-band backfill script + classifyWine change; prefs card +
   route; retail-availability lib (cache, quota flag, stampede lock) + unit tests. Availability
   lib smoke-tested standalone against the New Hope, PA market before anything is built on it.
2. **Phase B** — archetype definitions + candidate picker; `generateAroundWines` + new
   validators; session create pipeline (awaited key); `evaluate-full` refactor + grade wrapper
   with CAS/retry; session pages (shopping + tasting + reveal). **E2E harness (§9.2) built here
   and passing before Phase C starts** — it is the definition of "Phase B done".
3. **Phase C** — share link (hashing, headers, vintage-bought write) + replace-wine (proxy rule,
   token rotation, partner confirm) + abandon; History + nav; weekly E2E workflow (§9.3);
   deploy behind admin gate → **user-1 pilot (§9.4) is the acceptance gate** → open to all.

## 11. Risks (post-hardening)

| Risk | Mitigation |
|---|---|
| Listings ≠ stock | Confidence labels; deep-link fallback always present; "call ahead" framing |
| Sparse local retail | Mail-order tier first-class; archetype backtracking before failure |
| Budget overshoot | Deterministic band gate + snippet refinement; unknown-band wines excluded |
| Key leak | Server-side grading; redaction tests; scope column + pool-query audit |
| Blind broken silently | Event facts → derived badge; can only downgrade, never overstate |
| SSE drop mid-grade | Attempt persisted first; `graded_at` only on completion; retry reattaches |
| Repair-loop deadlock on pinned wines | Archetype-fit asserted pre-prompt; proxy rule on swaps |
| Quota exhaustion | Bounded fan-out; persisted cross-instance latch; degrade + banner; rate limit |
| Stale partner links | Token rotation on swap; 404 after grade/abandon; confirm gate mid-shop |

## 12. Council recommendations NOT adopted (and why)

- **Full workflow-versioning machinery** (Codex #1: `generation_version`, `workflow_nonce`,
  `locked_at` on every step): overweight at ~100 users. The load-bearing subset was kept —
  awaited key before session creation, CAS on grading, immutable new-row-per-regeneration,
  token rotation.
- **Separate PATCH route per preference** (Gemini #7): the codebase's own pace-preference route
  already owns two related columns; one route for the live-tasting cluster follows that precedent.
- **State/province + metro-radius location model** (Codex #5): correct observation, deferred to
  v2 behind honest shipping labels (§8) — the cost/benefit at 100 users doesn't justify modeling
  US state alcohol law in v1.
- **Single-use share tokens** (Codex #3, partially): expiry + rotation + hashing adopted;
  single-use rejected (a partner legitimately reopens the list across shopping trips).

## 13. Changelog v1 → v2 (what the council changed)

1. **Pipeline inverted**: availability-first → **archetype-first with per-slot availability
   pruning + backtracking** (both councils' top structural finding; also kills the ~36-call
   Tavily fan-out).
2. **Budget gate redesigned**: snippet-price "keep but flag" → **`wine_bank.price_band` as the
   deterministic primary gate**, snippet prices refine, unknown-band excluded.
3. **Session creation now blocks on key validation** (`awaitBackgroundWork`) — no shopping for
   ungradable flights.
4. **Status machine → event timestamps**; 'ready' state deleted; blind-integrity stored enum →
   derived badge.
5. **Grading one-shot semantics**: CAS attempt lock, UNIQUE session↔attempt, `graded_at` on
   stream completion, dropped-connection retry reattaches.
6. **Share token hardened**: hashed at rest, 128-bit, expiry, rotation on swap, 404 after
   grade/abandon, no-store/no-referrer/noindex, partner-mid-shop confirm gate.
7. **`scope` column** on `generated_questions` instead of overloading `status`; pool-query audit
   + regression test.
8. **Three new validators** for the pinned-flight path: blind-safety (accent-normalized),
   slot-grounding, archetype-fit.
9. **Quota latch persisted cross-instance** (`app_flags`) + per-cache-key refresh lock.
10. **Replace-wine constrained to archetypal proxy** of the departing wine (prevents
    repair-loop deadlock) + token rotation + partner confirm.
11. **Vintage capture** added as optional per-slot field feeding the grading prompt.
12. **users CHECK constraint** moved to app-layer validation (migration simplicity).

## 14. Changelog v2 → v2.1 (agentic testing + pilot)

1. **§9 rebuilt as three layers**: deterministic unit/regression tests; an **agentic E2E
   self-test loop** (`scripts/live-tasting-e2e.mjs`) that runs the real pipeline — real Tavily,
   real generation, real grading — as a seeded `is_test` user in New Hope, PA, with link-liveness
   checks, an LLM-judge audit (archetype coherence, blind-safety, stockist plausibility, budget
   sanity), and a good-vs-bad candidate grading discrimination test; and a **live user-1 pilot**.
2. **Weekly GitHub Actions schedule** (bank-worker pattern, no Vercel cron) runs the E2E loop as
   the standing drift detector; also runnable via `workflow_dispatch` pre-deploy.
3. **User-1 pilot protocol**: Russell Moss (russellmoss87@gmail.com), New Hope, PA, USA; feature
   ships behind the existing admin gate; one full real session (shop → blind taste → grade) is
   the acceptance gate before general release.
4. **US control-state handling in the search ladder** (§5.1): PLCB / state-store site tier when
   the city parse detects one, and no hard state boundary on the local tier (border towns:
   New Hope → Lambertville, NJ).
5. **Phase gates tightened** (§10): E2E harness passing = Phase B done; user-1 acceptance =
   release gate.
