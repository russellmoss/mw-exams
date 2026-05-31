# Learning Extension — Build Plan (decided 2026-05-30)

Companion to `learning_extension_ideas.md`. This file is the **agreed architecture and
ordered build plan** for unifying question generation across all study tools and adding
the two-stage Reverse Tasting mode. Update it as units land.

## The vision (user, 2026-05-30)

Every study tool (study page, Stem Sniper, Reverse Tasting, future drills) should be a
**consumer AND producer** on ONE central question-generation engine — generating fresh
questions on demand (target **90% fresh / 10% banked**), stored in the DB, applying ALL
codified generation rules + EK, and feeding the ONE feedback→EK→git loop so every tool gets
smarter together from a single source of truth.

## North star — CONTINUITY (user clarification, 2026-05-30)

The "single source of truth" is **NOT a new abstraction to design**. It is the **study page's
existing, most-iterated generation + answer pipeline** — the one that's been refined to the point
where it's genuinely good. The principle is **continuity between systems and generations**: every
tool generates through that same proven path; nothing forks it.

Implications:
- The spine = the engine the study page already uses: `generateFreshQuestion` +
  `buildQuestionGenerationPrompt` + the validator suite + `enrichWineProfiles` +
  `generateModelAnswerInBackground` + `generate-tasting`. A drill question IS a study-page
  question, just consumed at a different stage.
- Drills must reuse the SAME answer/tasting generators — no bespoke drill versions.
- The **stem answer key is a DERIVED artifact**, not a source of truth: variety/region/style read
  off the `wine_profiles` the engine already produces. So it's not a parallel system to keep in
  sync — just a thin downstream read shared by the live path and the offline backfill.
- Feedback on a drill flows through the SAME `feedback-analysis → apply-change → auto-feedback.yml
  → EK` loop and improves the SAME engine — keeping generations of the system connected.

## Key finding from the codebase research

The central engine and the learning loop **already exist** — Stem Sniper just isn't plugged in:

- **Generation engine** lives inside `study-app/src/app/api/get-question/route.ts`
  (`generateFreshQuestion` + ~10 validators + `buildQuestionGenerationPrompt`). The study page
  uses it live; Stem Sniper reads a **pre-seeded pool only** (`stem-sniper/next`).
- **Feedback→EK→git loop is already Stem-Sniper-aware** (`apply-change.ts`: `[stem-sniper]`
  routing, `Kind: answer-key` STEM file-set, quarantine via `stem_answer_keys.validated=false`).
- **The only missing seam: live answer-key generation.** Keys are built ONLY by the offline
  script `study-app/scripts/build-stem-answer-keys.mjs` — but its core is already a pure,
  reusable `buildKeyForRow(row)` + `upsertKey()` (comment says it's meant to validate freshly
  generated questions before committing). It was just never called from the live path.

## Decisions

1. **Sequencing:** Foundation first (engine + live keys + 90/10 on Stem Sniper), THEN Reverse Tasting.
2. **Key readiness:** Background-during-stem — serve stem instantly, enrich `wine_profiles` + build
   key in background while candidate answers; synchronous build fallback at submit if not ready.
3. **Ratio:** Env-tunable constant, default 90/10 (`STEM_FRESH_RATIO` or similar).

## Foundation units (ordered continuity-first, verify each before next)

- **U1 — [DONE 2026-05-30] Make the study engine a shared service (THE SPINE).** Extract `generateFreshQuestion` +
  the validator suite + parser from `get-question/route.ts` into `study-app/src/lib/question-engine.ts`
  (pure refactor, no behavior change). The study-page route becomes a thin caller; drill routes call the
  IDENTICAL function. This is the continuity guarantee — one engine, every tool. **Verify the study page
  still generates + serves correctly after** (highest-blast-radius unit; gate carefully).
- **U2 — [DONE 2026-05-30] Drills reuse the same answer/tasting generators.** `generateFreshQuestion`
  now returns DATA (`GenerationOutcome`), not a `Response`, so any tool can call it as a function; the
  get-question route wraps it in `Response.json` (byte-identical HTTP). Its embedded generators
  (`enrichWineProfiles`, `generateModelAnswerInBackground`) fire for every caller — no bespoke copies.
  (Tasting-note reuse via the shared `/api/generate-tasting` route is a Reverse-Tasting-phase concern.)
  Original plan note below:
  Wire drill generation to the same
  `enrichWineProfiles` + `generateModelAnswerInBackground` + `generate-tasting` the study page uses —
  no bespoke drill copies.
- **U3 — [DONE 2026-05-30] Derive the stem key from engine output (downstream plumbing, additive).** Share ONE derivation
  step (variety/region/style off `wine_profiles`) between the live fresh path and the offline
  `build-stem-answer-keys.mjs` backfill, so they can't drift. Background-during-stem readiness: serve
  stem instantly, derive key in background while candidate answers, sync fallback at submit.
  **Data-path note (resolved):** the four lexicon files (`variety_lexicon`, `appellation_varieties`,
  `stem_proprietary_blends`, `stem_style_lexicon`) are NOT in study-app's bundle (`mock_wine_bank.json`
  already is). Sync them from repo-root `data/` into `study-app/public/data/` via the existing
  `package.json` `prebuild` step, and read via `process.cwd()/public/data` (the `wine-bank-lookup.ts`
  convention). Repo-root `data/` stays the source of truth (matches the feedback loop's edit paths).
- **U4 — [DONE 2026-05-30] `/api/stem-sniper/drill` with env-tunable 90/10.** 90% shared engine + derived key, 10% banked
  pool. Replaces pool-only `next`. Same paper/family filters.

## Reverse Tasting (after foundation)

Two-stage mode = add-on to Stem Sniper. Stage 1 Layer-A stem guess → Stage 2 reveal **sanitized**
`fullText` tasting notes (reuse `sanitizeTastingNote`) → re-guess → score movement + calibration
(calibrate on the Stage-2 / Layer-B tier, the honest one). Rides on the same generated question + key,
so no extra generation work. Units U1–U5 from the earlier scope (mode toggle, `notes` endpoint,
Stage-2 card, two-stage scoring+movement, result view); calibration history rollup is a follow-up.

## Learning loop — already done

Fresh drills persist as `user_attempts` (mode), accept feedback via the existing button, and route
through `feedback-analysis` → `apply-change` → `auto-feedback.yml` → EK sync automatically. As rules
get codified in `question-generation-prompt`/validators/EK, every tool inherits them.
