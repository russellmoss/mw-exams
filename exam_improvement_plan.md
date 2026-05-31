# Exam System Improvement Plan — Phased, Step-by-Step

**What this is.** The executable playbook that turns `exam_gap_analysis.md` into shipped changes. Each
phase has: a goal, the exact files + line anchors it touches, numbered steps with **ready-to-paste
Claude Code prompts** and **code snippets** (so a future session edits real anchors and doesn't
hallucinate), and a **Verification & acceptance** block. Work it **one phase at a time, in order**;
do not start a phase until the previous phase's acceptance checks pass.

**Source of truth for the numbers:** `mw_exam_guide.md` (the target picture) + `data/structured/*.json`
(the corpus, regenerate with `python scripts/build_structured_corpus.py`) + the six findings in
`outputs/gap_analysis/findings/`. Cite these in commits.

## Global conventions (read once)

- **Branch per phase.** `git checkout -b phaseN-<slug>`; PR into `master`. Never force-push (the
  auto-feedback bot pushes to master — always `git pull --rebase origin master` first).
- **Soft, not hard.** Every new generation rule is a **soft/important-tier** validator that relaxes on
  retry (like `validateOriginDiversity`). Never make these HARD — individual real questions legitimately
  violate any single composition target. The only HARD rules stay as they are (25/wine, paper scope,
  variety/country contradiction).
- **Don't regress the strong area.** Grading (`marking-principles.ts` + `funnelling.ts`) is our best
  dimension — Phase 4 *adds enforcement mechanics*, it does not rewrite the rubric.
- **Deploy.** Code changes under `study-app/` auto-deploy via Vercel git. Docs/`data/`/`outputs/`-only
  commits don't build. Phase-1 EK edits should carry `[skip ci]`.
- **Verification discipline.** A phase is "done" only when its acceptance checks produce the stated
  output. Where a check is "generate N questions and inspect," actually run the generator.

---

## Execution order — REVISED after the Round 2 council review (2026-05-31)

The naive order is 1→2→3→4→5. The council (gpt-5.4 + Gemini 3.1 Pro) + a corpus-grounded
implementability check (`outputs/gap_analysis/findings/08_plan_implementability.md`) converged on a
better order and several corrections. **Recommended order:**

> **Phase 1 → Phase 4a → Phase 5 → Phase 2 → Phase 3 → Phase 4b**

- **4a (cheap, high pedagogical value, do early):** import the marking rubric into the model-answer
  prompt; consolidate the wording lexicon + add the disliked-wording **deterministic linter**; wire the
  lexicon to both generation paths. Candidates learn from feedback + model answers, not from a paper's
  statistical balance — both models ranked this above whole-test composition.
- **Phase 5** (answer-gen polish) rides along with 4a (same files/spirit).
- **Phase 2 then Phase 3:** single-question rules, then whole-paper. **Major design change (both models):
  Phase 3 should be a PLANNER/ALLOCATOR ("blueprint-first"), not just a validator** — see Phase 3.
- **4b (gated, riskiest, do last):** the structured grading-override telemetry. **This is the single
  riskiest step in the plan** — keep it detect-only, never ship a verdict-flipping banner.

**Corrections folded into the steps below (all data-backed by findings/08):**
1. **R8:** drop the per-question "commercial/style must be present" checks — they WARN on **57%/51% of
   REAL last-10 questions** (those are *paper-level* shares). Keep only the ID-composite ≤55% cap
   (trips a healthy 40% of real questions; median real share 44%). Move presence to Phase 3.
2. **R10:** keep the OW/NW check (robust); **demote the curveball-count axis to advisory/telemetry** —
   the "harder = not a benchmark appellation" proxy mislabels **63%** of real anchor wines, so any
   acceptance criterion phrased on "harder count" measures noise.
3. **Phase 4 grading override:** detect-only + telemetry ONLY; **no corrective SSE banner** (whiplash
   UX); require narrow written definitions of "howler"/"cascade" + a few-hundred-answer false-positive
   calibration before *any* enforcement (a separate two-pass project).
4. **Phase 4 wording scan:** implement as a **deterministic regex linter** over the candidate text that
   passes found phrases to the grader — don't make the LLM scan natively (attention dilution).

---

# Phase 1 — Knowledge hygiene (docs only; do first, cheapest)

> **✅ EXECUTED 2026-05-31.** EK-0024/EK-0025 superseded; EK-0023/EK-0028 refreshed; EK-0096–EK-0101
> added; changelog updated; `empirical_sync_state.json` untouched; all 5 verification checks passed. The
> entries were written with the **Round-1-sharpened** claims (q2-spike marked directional/small-n; the
> "1 in 4" reframed as holds-per-wine / anchor-heavy-per-flight), not the pre-review snippet text below —
> see the EK doc for the final wording.

**Goal.** Correct the wrong/stale EK entries the corpus overturned, and add new EK entries for the
quantified facts, so nothing downstream is built on a false claim (esp. EK-0025).

**Why first.** Phase 2/3 prompts will *cite* these EK entries. If EK-0025 still says "curveballs cluster
in the last question," a future session will build position logic on a falsehood.

**Files.** `mw_exam_empirical_knowledge.md` only. (Also `data/empirical_sync_state.json` — **do NOT
touch it.**)

**Important workflow note.** EK is normally maintained by `sync-empirical-knowledge.mjs`, which ingests
*resolved feedback*. These are **corrections + analysis-sourced facts**, not feedback items, so the sync
script doesn't apply — use the skill's explicit carve-out: *"fixing a typo or reverting a bad entry by
hand is fine."* Hand-edit, match the format exactly, add the changelog line yourself, commit `[skip ci]`,
and leave `data/empirical_sync_state.json` alone.

**EK entry format (copy exactly):**
```
### EK-#### · short title
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** `path/to/artifact`
- **claim:** the thing we believe is true.
```
Highest existing id is **EK-0095** → new entries take **EK-0096+**. To supersede a wrong entry: flip its
`status:` to `superseded` and write a new entry whose evidence/claim references `supersedes: EK-####`.

### Step 1.1 — Supersede the two genuinely-wrong entries (EK-0025, EK-0024)

> **Claude Code prompt:**
> "In `mw_exam_empirical_knowledge.md`, supersede two entries with corrected versions, matching the exact
> 4-line EK format. (1) EK-0025 (lines ~385–391) and (2) EK-0024 (lines ~377–383): change each one's
> `**status:** live` to `**status:** superseded` (leave the rest of the old entry intact). Then add two
> NEW entries EK-0096 and EK-0097 immediately after EK-0095 (currently the last entry, ~line 910), using
> the text below verbatim. Do not touch `data/empirical_sync_state.json`."

New entries to add (verbatim):
```
### EK-0096 · Curveball position: P1 hardest mid-paper, P3 rises to the end (supersedes EK-0025)
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** `outputs/gap_analysis/findings/03_flight_curveball.md` §1.3; `data/structured/corpus_*.json` (last-10 sat years, 360 wines); supersedes EK-0025
- **claim:** On the last-10 corpus the "curveballs cluster in the final question of P1/P2" claim is FALSE.
  **P1's hardest slot is the MIDDLE question (q2: 15.4% high), not the last (6.1%).** P2 is only mildly
  back-loaded (last 14.3% med+high vs 8.6% first; high-curveballs flat). **Only P3 rises monotonically to
  the end** (last question 58.8% med+high — the oxidative/orange/unusual-rosé slot). q2 is the single
  hardest position overall. Per-paper med+high rate: P3 49.2% ≫ P1 15.0% > P2 9.2% (ordering from EK-0025
  holds; magnitudes larger than the all-years high-only averages).
```
```
### EK-0097 · The "1 in 4" curveball rule is the modal NON-ZERO shape, not the majority (supersedes EK-0024)
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** `outputs/gap_analysis/findings/03_flight_curveball.md` §1.6; `data/structured/corpus_*.json` (last-10); supersedes EK-0024
- **claim:** Across multi-wine flights, **54% contain ZERO medium/high wines (all-anchor)**, 28% exactly
  one, 10% two, 9% three+. So "exactly one curveball + rest anchors" is the most common *non-zero* shape
  but NOT the majority case. Cleanest for 3-wine flights (43% have exactly one). Per-wine curveball rate
  is roughly **flat (~21–27%) across 2/3/4-wine flights** — large flights do NOT "stick to classics"
  (corrects the all-years 50% figure for 2-wine pairs). Curveball ID marks remain downweighted in favour
  of style/winemaking/quality/commercial.
```

### Step 1.2 — Enrich (in place) the two entries that need last-10 refresh (EK-0023, EK-0028)

> **Claude Code prompt:**
> "In `mw_exam_empirical_knowledge.md`, append one bracketed last-10 note to the `claim:` of EK-0023
> (~lines 370–375) and EK-0028 (~lines 409–416), keeping them `status: live`. Use the exact text below.
> Do not change their evidence lines except to append the new citation."

- EK-0023 — append to claim: `**[Last-10 refresh, 2026-05:** by flight size the per-wine harder rate is flat ~21–27% (2/3/4-wine); F5 method (61%) and F6 style (38%) are the densest curveball families, denser per-wine than F4 breadth (24%); F1 same-variety is safest (8%). Source: outputs/gap_analysis/findings/03.]`
- EK-0028 — append to claim: `**[Last-10 refresh, 2026-05:** the majority of quality questions (51%) are compressed-high (<3 bands), only 20% ladder across ≥3 bands; compression is legitimate ONLY when a legal classification scaffold carries the hierarchy (14/18 historical ladders rest on AOC/DOCG/Prädikat/1855 tiers). Source: outputs/gap_analysis/findings/02.]`

### Step 1.3 — Add the net-new quantified facts (EK-0098…EK-0101)

> **Claude Code prompt:**
> "Add four new entries EK-0098–EK-0101 after EK-0097 in `mw_exam_empirical_knowledge.md`, verbatim from
> the text below."

```
### EK-0098 · Post-2014 mark redistribution: ID down, commercial/style/maturity up
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** `outputs/gap_analysis/findings/04_marks.md` §1b–1d; `data/structured/corpus_subquestions.json`
- **claim:** After 2014 the per-paper denominator locked at 900 (exactly 25/wine). Mark-share shifted
  (full-credit-per-type, pre-2014 → 2020–2025): **ID composite 59.7% → 46.2%**, **commercial 5.7% → 17.9%
  (~tripled)**, **style 10.1% → 20.1% (~doubled)**, **maturity 4.6% → 13.1% (~tripled)**, quality stable
  ~33–36%. Per-paper modern shape (2018–2025, share of paper marks): **P1** origin~38/quality~39/variety~30/
  winemaking~22/maturity~20/commercial~13; **P2** origin~50/quality~38/style~23/winemaking~16/commercial~16/
  maturity~9; **P3** quality~37/origin~36/winemaking~27/commercial~21/style~18 (sweetness/structure P3-only).
  Tariff rules confirmed: 2–3 marks = numeric "state RS/ABV" only; commercial never <5; compare/contrast
  20–36 marks; variety-ID size signals difficulty (10–15 mainstream, 16–25 harder). Structure stable:
  3–4 questions/paper, ~3 sub-questions each.
```
```
### EK-0099 · Per-paper Old-World : New-World band (never NW-majority)
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** `outputs/gap_analysis/findings/01_diversity.md` §1.3; `data/structured/corpus_wines.json` (last-10)
- **claim:** Per 12-wine paper: **P1 ≈ 7.8 OW : 4.2 NW (65% OW), P2 ≈ 7.6 : 4.4 (63%), P3 ≈ 9.8 : 2.2
  (82%)**; corpus-wide 70% OW. **No paper is ever majority New-World.** Within a flight, outside the
  same-origin families (F2/F7, which are single-world by design), mixing OW+NW is the norm — F4 61%,
  F1 64%, F6 75% mixed; mixing scales with flight size (19% at size-2 → 71% at size-5). A whole paper
  spans ~6 countries (P1 5.9 / P2 6.7 / P3 6.2) and 7–10 varieties.
```
```
### EK-0100 · Per-paper curveball budget (P1≈2, P2≈1, P3≈6 per 12 wines)
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** `outputs/gap_analysis/findings/03_flight_curveball.md` §1.7; `data/structured/corpus_wines.json` (last-10)
- **claim:** Harder (medium+high) wines per 12-wine paper: **P1 ≈ 1.8, P2 ≈ 1.1 (the bankers' paper),
  P3 ≈ 5.9 (half the flight is "unusual" — P3's identity)**. A 36-wine mock suite should carry ~9 harder
  wines, heavily weighted to P3. Benchmark density is high and stable (~75–86%) at every flight size.
```
```
### EK-0101 · Per-paper age signature; price ratio
- **tier:** PLAUSIBLE · **status:** live
- **evidence:** `outputs/gap_analysis/findings/01_diversity.md` §1.4, `02_price.md` §1b; `data/structured/corpus_wines.json` (last-10)
- **claim:** Age: **P1 young-skewed** (avg 3.4y, mostly ≤7y), **P2 mid-aged** (avg 4.7y), **P3 oldest +
  ~26% non-vintage** (Champagne NV, Tawny, Sherry, Madeira). 85% of dated flights mix ages; ~20%
  deliberately pair a young (≤3y) with an aged (≥8y) wine. Vintage is rarely *asked* (7 sub-questions in
  10 years) — age is a composition/maturity axis, not an ID target. Price HIGH (super-premium+luxury)
  share per paper: P1 ~22%, **P2 ~38% (classed reds)**, **P3 ~30% (fortified/sweet icons)**; treat as a
  target band with tolerance (price_band is a coarse proxy; see findings/02 caveat).
```

### Step 1.4 — Changelog

> **Claude Code prompt:**
> "At the TOP of the §0 Changelog list in `mw_exam_empirical_knowledge.md` (directly under the
> `**Changelog**` heading, ~line 39), add this bold bullet verbatim:"
```
- **2026-05-31 — gap analysis: superseded EK-0024/EK-0025 (curveball position + "1 in 4" were wrong on last-10 data); refreshed EK-0023/EK-0028 to last-10; added EK-0096…EK-0101 (curveball position/budget, post-2014 mark redistribution, OW:NW band, age/price signatures) from `outputs/gap_analysis/findings/*` + `data/structured/*`.**
```

### ✅ Phase 1 — Verification & acceptance

> **Claude Code prompt:** "Run these checks and report pass/fail for each."

```bash
cd C:/Users/russe/Documents/MW_exam
# 1. The two wrong entries are now superseded (expect 2):
grep -nE "EK-002[45] ·" mw_exam_empirical_knowledge.md
grep -n "status:\*\* superseded" mw_exam_empirical_knowledge.md   # expect EK-0024 + EK-0025 lines
# 2. All six new entries exist (expect EK-0096..EK-0101 = 6 hits):
grep -coE "### EK-009[6-9]|### EK-010[01]" mw_exam_empirical_knowledge.md
# 3. No duplicate EK ids introduced (each id appears once as a header):
grep -oE "### EK-[0-9]{4}" mw_exam_empirical_knowledge.md | sort | uniq -d   # expect: (no output)
# 4. Changelog has today's line:
grep -n "2026-05-31 — gap analysis" mw_exam_empirical_knowledge.md
# 5. Sync cursor untouched:
git status --porcelain data/empirical_sync_state.json   # expect: (no output)
```
**Acceptance:** checks 1–4 produce the expected hits; check 3 and 5 produce **no** output. Commit with
`[skip ci]`: `docs(ek): correct curveball/mark/diversity entries from gap analysis [skip ci]`.

---

# Phase 2 — Highest-value single-question generation fixes `[question-gen]`

**Goal.** Make the in-app generator (the path that serves every drill/question) replicate the modern
shape on the axes derivable from the question text + wine labels: **mark type-mix (R8)** and
**OW/NW + curveball balance (R10)**, plus a **coarse price-spread proxy (R9)**. Differentiate prompt
guidance by paper and family.

**Reality check (don't fight it).** The engine's generated wine is only `{slot, fullText}`
(`question-engine.ts:43-51`, parsed at `:962`); variety/country/blend are derived from `fullText` at
runtime. So:
- **R8 (mark type-mix)** uses `questionText` only → fully tractable.
- **R10 (OW/NW + curveball)** uses `fullText` → tractable via the existing `detectCountryName` +
  `BENCHMARK_APPELLATIONS`.
- **R9 (price)** is NOT reliably derivable from a wine label (no price in text). Implement only a
  **coarse proxy** (iconic-appellation cue ≈ high tier) and keep it soft/advisory; **real price
  enforcement is deferred to Phase 3** (whole-test), where the mock-exam-writer sources wines with known
  tiers. Be honest about this in the rule's message.

**Files.** `study-app/src/lib/question-engine.ts` (new validators + wire into the relax loop),
`study-app/src/lib/prompts/question-generation-prompt.ts` (per-paper/family guidance). Engine validators
return the engine's uniform shape `{ valid: boolean; violations: string[] }` (NOT the `.mjs`
`{rule,severity,detail}` shape) — match `validateBankerMinimum`/`validateFlightSize`.

### Step 2.1 — Add a sub-question type classifier (port from the corpus builder)

The corpus builder's classifier is the validated source of truth. Port its regex map to TS.

> **Claude Code prompt:**
> "In `study-app/src/lib/question-engine.ts`, add a private function `classifySubquestionTypes(text)` and
> `computeMarkTypeMix(questionText)` near the other validators (after `validateFlightSize`, ~line 924).
> Use the regex map below verbatim — it is ported from `scripts/build_structured_corpus.py` (TYPE_RULES),
> which is the validated classifier behind `data/structured/corpus_subquestions.json`. Parse mark tokens
> with the regex `/\(\s*(?:(\d+)\s*[x×]\s*)?(\d+)\s*marks?\s*\)/gi` (count defaults to 1). Split
> sub-questions on `/^\s*([a-h])\)\s*/m`. For each sub-question, collect ALL matching type labels
> (multi-label), and credit its full mark sum to every label it matches (full-credit-per-hit, matching
> the corpus method). Return `{ totalMarks, shareByType: Record<type, pct> }`."

Snippet to paste (the canonical type rules — keep the order; stems are word-START anchored, no trailing `\b`):
```ts
// Ported from scripts/build_structured_corpus.py TYPE_RULES (validated against the corpus).
const SUBQ_TYPE_RULES: [string, RegExp][] = [
  ["variety_id",  /\bgrape\b|\bvariet(y|ies)|\bgrapes\b/i],
  ["vintage_id",  /\bvintage/i],
  ["origin_id",   /\borigin|\bregion|\bcountr|\bappellation|\bprovenance|\bgeograph/i],
  ["maturity",    /\bmaturit|\bageing|\baging|\bcellar|\bdrink|\bdevelopmen|\bevolv|\bhow (much )?longer|\bhold\b|\bready\b/i],
  ["commercial",  /\bcommercial|\bmarket|\bprice|\bsell|\bpositioning|\bconsumer|\bretail|\bwho would buy|\bbuy this|\bbuy these|\bsales\b/i],
  ["quality",     /\bquality|\bstandard|\bfinesse|\bmerit/i],
  ["winemaking",  /\bwinemak|\bvinif|\bproduction\b|\bproduced\b|\bmade\b|\bmethod|\boak\b|\bmaturation|\bfermentat|\belevage|\blees\b|\bmalolactic|\btechnique/i],
  ["style",       /\bstyle|\btypicity/i],
  ["sweetness_rs",/\bresidual sugar|\bsweetness|\brs\b|\bsugar/i],
  ["structure",   /\bstructure|\btannin|\bacidit|\balcohol|\bbody\b|\bbalance/i],
  ["comparative", /\bcompare|\bcontrast|\bdiffer|\bsimilar/i],
];
```

### Step 2.2 — Add `validateMarkTypeMix` (R8), per paper

> **Claude Code prompt:**
> "Add `validateMarkTypeMix(questionText, paper)` returning `{valid, violations: string[]}`. Compute the
> mix via `computeMarkTypeMix`. Apply ONE SOFT check (per `outputs/gap_analysis/findings/04_marks.md` §1d
> / EK-0098): ID composite (variety_id ∪ origin_id ∪ vintage_id share) must be ≤ 55%. Push a descriptive
> violation, e.g. `mark type-mix: ID composite 71% > 55% cap (EK-0098; modern papers ~46%)`."
>
> **⚠ Round-2 correction (findings/08):** do NOT add per-question "commercial must be present" / "style
> must be present" checks here — the implementability check found they would WARN on **57% / 51% of REAL
> last-10 questions** (commercial & style are *paper-level* shares, not per-question requirements; real
> exams legitimately have ID/winemaking-only questions). The ≤55% ID cap alone is well-calibrated (trips
> ~40% of real questions, median real share 44%). **Commercial/style PRESENCE moves to Phase 3
> (whole-paper).**

### Step 2.3 — Add `validateCompositionBalance` (R10): OW/NW + curveball count

> **Claude Code prompt:**
> "Add `validateCompositionBalance(family, paper, wines)` returning `{valid, violations: string[]}`.
> Derive each wine's country via the existing `detectCountryName(w.fullText)` and map to world using the
> OLD_WORLD/NEW_WORLD sets below. **ROBUST SOFT check (ship this):** for non-same-origin families
> (exclude F2, F7) with ≥3 wines, warn if ALL wines are single-world (real F1/F4/F6 mix ~60%+;
> EK-0099). World detection from country is reliable."
>
> **⚠ Round-2 correction (findings/08):** the curveball-count axis is **advisory/telemetry only, NOT an
> acceptance gate.** The `harder = !BENCHMARK_APPELLATIONS` proxy mislabels **63% of real anchor wines as
> 'harder'** — so a "warn if F1 has >2 harder" or "warn if F5/F6/P3 has zero harder" check fires on noise
> (R10c fired 10% vs 25% ground truth). EITHER widen the benchmark regex substantially first, OR log the
> harder-count as telemetry and rely on Phase 3's blueprint (which *assigns* curveball slots from real
> metadata) for actual curveball-budget enforcement. Do not phrase Phase 2 acceptance around it."

Snippet (the world sets — from `scripts/build_structured_corpus.py`):
```ts
const OLD_WORLD = new Set(["France","Italy","Spain","Germany","Portugal","Austria","Hungary","Greece","England","Georgia","Switzerland","Slovenia","Croatia","Romania","Bulgaria","Moldova","Lebanon"]);
const NEW_WORLD = new Set(["Australia","New Zealand","USA","South Africa","Argentina","Chile","Canada","Uruguay","Brazil","Mexico","China","India","Japan"]);
// detectCountryName returns lowercase keys like "usa"/"france"; normalize with a small map before lookup.
```
> Note: `detectCountryName` (`question-rules.mjs:240`) returns lowercased names (`"usa"`, `"france"`).
> Title-case / map them before the Set lookup (`"usa"→"USA"`, `"new zealand"→"New Zealand"`, etc.).

### Step 2.4 — Add `validatePriceSpread` (R9) — coarse proxy only

> **Claude Code prompt:**
> "Add `validatePriceSpread(questionText, family, wines)` returning `{valid, violations}`. Since wine
> labels carry no price, use only a coarse proxy: tier ≈ 'high' if `BENCHMARK_APPELLATIONS` matches a
> known iconic cue (grand cru, classed growth, vintage port, grand cru classé, sauternes, etc.), else
> 'mid/low'. SOFT check (per findings/02 §3, EK-0028): for a quality/F7 stem (stem mentions quality OR
> family==='F7'), warn if EVERY wine reads as 'high' AND the stem contains no legal-ladder signal
> (regex: `/cru|classé|classico|docg|prädikat|pradikat|kabinett|spätlese|auslese|reserva|gran reserva|1855|premier|grand/i`).
> Add a comment that real price enforcement lives in Phase 3 (whole-test), this is a best-effort proxy."

### Step 2.5 — Wire R8/R9/R10 into the relax loop

> **Claude Code prompt:**
> "In `question-engine.ts`, in the generation loop (~lines 404–418), add the three new validators in the
> **important tier** (relax when `attempt >= 6`, same as `validateOriginDiversity`). Mirror the existing
> pattern exactly:"
```ts
    const markMixCheck = relaxImportant
      ? { valid: true, violations: [] as string[] }
      : validateMarkTypeMix(candidate.questionText, paper);
    const compositionCheck = relaxImportant
      ? { valid: true, violations: [] as string[] }
      : validateCompositionBalance(candidate.family, paper, candidate.wines);
    const priceCheck = relaxImportant
      ? { valid: true, violations: [] as string[] }
      : validatePriceSpread(candidate.questionText, candidate.family, candidate.wines);
```
> "Then add their `.violations` to the concatenation at ~line 430–440 alongside the others, and include
> them in the relaxed-tier log line (~447)."

### Step 2.6 — Differentiate the generation prompt by paper & family (QG-6/8/9)

> **Claude Code prompt:**
> "In `study-app/src/lib/prompts/question-generation-prompt.ts`, add a per-paper mark-emphasis block to
> the `system` template. Follow the existing `paperScope` ternary pattern (lines 222–226): compute a
> `const markEmphasis = paper === 1 ? '...' : paper === 2 ? '...' : '...'` before line 233 and
> interpolate it into `system` right after the existing `## MARK ALLOCATION RULES` block (ends ~line
> 393). Use the figures from EK-0098 below. Also extend the existing F4 quality-tier-cap block (lines
> 347–355) with one line per the family curveball steer."

Content to insert (`markEmphasis`):
```
## MARK EMPHASIS FOR THIS PAPER (target the modern 2018–2025 shape — EK-0098)
- P1 (whites): lean MATURITY (~20% of marks) and quality; commercial is the LOWEST (~13%). Include ageing/drink-window asks.
- P2 (reds): most ORIGIN-driven (~50%) and STYLE-driven (~23%); maturity low (~9%). Include a precise-origin ask.
- P3 (special): highest COMMERCIAL (~21%) and WINEMAKING (~27%); sweetness/RS + structure "state" asks belong here.
Across any paper: commercial should appear in most questions (never 0% of marks); style on nearly every question; keep ID-composite ≤ ~46–55% of marks; include a compare/contrast item (20–36 marks) where the flight invites it.
```
Family curveball steer (append to the F4 block / add near banker rule):
```
## CURVEBALL DENSITY BY FAMILY (EK-0100, findings/03)
- F1 (same variety): all wines should be confidently identifiable benchmarks of the stated variety — keep it banker-clean, no curveballs.
- F5 (method) / F6 (style) / any P3 flight: expect ≥1 genuinely harder wine — the difficulty is the point.
- 54% of real flights are all-anchor; do not force a curveball into F1/F2/F7, but do not make F5/F6/P3 all-banker.
```

### ✅ Phase 2 — Verification & acceptance

> **Claude Code prompt:** "Run these and report results."

```bash
cd C:/Users/russe/Documents/MW_exam/study-app
npx tsc --noEmit      # type-check: expect no new errors
npm run lint          # expect clean (or no new warnings)
```
**Behavioural check (must actually generate):**
> **Claude Code prompt:**
> "Write a tiny throwaway script `study-app/scripts/_phase2_probe.mjs` that imports the three new
> validators (or calls `generateFreshQuestion` if importing internals is hard) and prints, for 15
> generated questions across P1/P2/P3, each question's: family, flight size, ID-composite %, whether
> commercial+style are present, OW/NW split, and harder-wine count. Run it. Then DELETE the probe script.
> Confirm against acceptance below; if the live mix is wildly off (e.g. most questions still ID>60% or
> commercial absent), report it — the soft rules should be nudging the distribution."

**Acceptance (revised after Round 2 — only gate on the robust signals):**
- `tsc`/lint clean.
- Over ~15 generated questions: **ID-composite median ≤ ~55%** (the calibrated cap); **non-same-origin
  3+ flights are not uniformly single-world** (the robust OW/NW check). Log harder-count + commercial/
  style presence as **telemetry**, do NOT gate on them here (per the corrections above — they're
  paper-level / noisy at single-question altitude).
- Generation still succeeds (no spike in fallback-to-banked) — confirm the relax loop isn't tripping
  constantly (check server logs for `relaxed=important` frequency; if most questions need relaxation,
  the thresholds are too tight — loosen). The implementability check confirmed ID≤55% trips ~40% of even
  REAL questions, so expect it to nudge, not dominate.

---

# Phase 3 — Whole-test composition validator `[whole-test]`

**Goal.** Make a full 12-wine paper hit the §8 composition targets from `mw_exam_guide.md`. This is the
structural prerequisite for trustworthy whole-test generation (your stated next step).

> **⚠ Major design change from Round 2 (both models, independently):** build this **blueprint-first
> (planner/allocator), not generate-then-validate.** If you generate 12 independent questions and then
> validate against ~10 coupled targets, the chance of passing all simultaneously is near zero → either a
> retry death-spiral or a validator that "warns on everything." Instead: (1) **deal a blueprint** — a
> deterministic/cheap-LLM pass that pre-assigns each of the 12 slots its country, OW/NW, macro-style/
> colour, price tier, blend-or-not, and curveball flag, so the blueprint *as a whole* satisfies the
> targets; (2) **generate each question to fill its assigned slots**; (3) **then run the validator** as a
> confirmation + report. This also fixes a real measurement gap the implementability check found:
> generated wines don't carry `price_band`/`curveball_level` (those come from enriched metadata) — but a
> **blueprint assigns them**, so the validator finally has something truthful to check. **This is where
> commercial/style PRESENCE and the curveball BUDGET get enforced** (moved here from Phase 2), at the
> altitude they actually live.

**Approach.** Mock-exam generation is agent-driven (`.claude/agents/mock-exam-writer.md` +
`/generate-mock-exam`); there is no in-app whole-test assembler. Build BOTH: (a) the **blueprint
allocator** (the agent emits a 12-slot blueprint JSON first), and (b) a **standalone Python validator**
that reads the assembled paper (+ its blueprint) and reports composition vs targets — reusing the
`run_loyo` extractors so world/variety detection matches the corpus exactly.

> **Tolerance + warning-density (Round 2 — Codex):** with ~10 coupled targets, keep tolerance bands WIDE
> and add an acceptance requirement beyond "pass real / warn on broken": **measure warning density on a
> sample of human-acceptable generated papers** — if it warns on most of them, the config is too tight.
> Add macro-style/colour, a single-country CEILING (France ~34% of corpus → cap one country's share),
> and a blend-frequency target (~29% blends) to the target JSON (REV-1).

**Files.** New `scripts/validate_mock_paper.py`; edit `.claude/agents/mock-exam-writer.md` (add the
self-check checklist); edit `.claude/commands/generate-mock-exam.md` (call the validator).

### Step 3.1 — Define the target table as data

> **Claude Code prompt:**
> "Create `data/structured/whole_test_targets.json` with the per-paper target bands from
> `mw_exam_guide.md` §8 (verbatim numbers below). This is the single source of truth the validator reads."
```json
{
  "P1": {"ow_nw_min_ow_frac": 0.55, "never_nw_majority": true, "min_countries": 5, "min_varieties": 7,
         "curveball_budget": [1, 3], "high_price_share": [0.10, 0.33], "age_profile": "young",
         "mark_mix": {"commercial_min": 0.05, "id_composite_max": 0.55, "style_present": true}},
  "P2": {"ow_nw_min_ow_frac": 0.50, "never_nw_majority": true, "min_countries": 5, "min_varieties": 7,
         "curveball_budget": [0, 3], "high_price_share": [0.25, 0.50], "age_profile": "mid",
         "mark_mix": {"commercial_min": 0.05, "id_composite_max": 0.60, "style_present": true}},
  "P3": {"ow_nw_min_ow_frac": 0.70, "never_nw_majority": true, "min_countries": 4, "min_varieties": 7,
         "curveball_budget": [3, 9], "high_price_share": [0.17, 0.42], "age_profile": "oldest_plus_nv",
         "mark_mix": {"commercial_min": 0.10, "id_composite_max": 0.55, "style_present": true}}
}
```

### Step 3.2 — Build the validator

> **Claude Code prompt:**
> "Create `scripts/validate_mock_paper.py`. Input: a JSON describing one generated paper —
> `{paper:int, wines:[{slot, full_text}], questions:[{n, wines:[slots], text}]}` (the same shape as
> `data/exams.json` per-paper). Reuse `from run_loyo import extract_variety_from_text,
> extract_country_from_text` and the OLD_WORLD/NEW_WORLD sets + mark/sub-question parser from
> `build_structured_corpus.py` (import or copy the helpers — do not re-derive). Compute for the paper:
> OW:NW split, distinct countries, distinct varieties, curveball count (reuse a benchmark/curveball
> heuristic — if a `curveball_level`/`benchmark` field is provided per wine use it, else fall back to the
> BENCHMARK_APPELLATIONS-style proxy), high-price share (if price provided), and the mark type-mix.
> Compare against `data/structured/whole_test_targets.json` and print a one-line PASS/WARN report per
> axis plus an overall verdict. Exit 0 always (advisory), but print `COMPOSITION WARNINGS: N`. Include a
> `--suite` mode that takes three papers and also checks the 36-wine curveball total (~9, weighted to P3,
> P2 the lowest)."

### Step 3.3 — Wire it into the mock-exam workflow

> **Claude Code prompt:**
> "In `.claude/agents/mock-exam-writer.md`, add a 'Self-check before finishing' section instructing the
> agent to emit the paper as the JSON shape above and state it must satisfy
> `data/structured/whole_test_targets.json` (paraphrase the bands). In
> `.claude/commands/generate-mock-exam.md`, add a final step: after generating, write each paper's JSON
> to a temp file and run `python scripts/validate_mock_paper.py <file>`; if WARNINGS > 0, revise the
> offending question(s) and re-run until clean or explained."

### ✅ Phase 3 — Verification & acceptance

> **Claude Code prompt:** "Validate the validator against ground truth before trusting it."

```bash
cd C:/Users/russe/Documents/MW_exam
# 1. Self-test on REAL papers (should mostly PASS — they ARE the target distribution):
python - <<'PY'
import json,io,subprocess
ex=json.load(io.open('data/exams.json',encoding='utf-8'))
# emit 2024 P1/P2/P3 as the validator's input shape and run it
for y in ex:
    if y['year']!=2024: continue
    for p in y['papers']:
        rec={"paper":p['paper'],"wines":p['wines'],"questions":p['questions']}
        io.open(f"/tmp/2024_p{p['paper']}.json","w",encoding='utf-8').write(json.dumps(rec,ensure_ascii=False))
PY
python scripts/validate_mock_paper.py /tmp/2024_p1.json
python scripts/validate_mock_paper.py /tmp/2024_p2.json
python scripts/validate_mock_paper.py /tmp/2024_p3.json
```
**Acceptance:**
- Run on **3–4 real historical papers** (2024, 2022, 2018): they should come back **mostly PASS** (a real
  exam paper IS the target). If a real paper throws many WARNINGs, the *targets* are mis-set — fix the
  targets, not the paper.
- Run on a **deliberately broken paper** (hand-make one: all-French P1, all-iconic, no commercial marks):
  it must WARN on OW/NW, price, and mark-mix. (This proves the validator catches what it should.)
- Generate one fresh mock paper via `/generate-mock-exam` and confirm the command runs the validator and
  reports composition.

---

# Phase 4 — Grading mechanics + wording lexicon `[grading]` `[answer-gen]`

**Goal.** (GR-1) Make the two HARD grading overrides *mechanical*, not advisory. (GR-2/3, AG-1/2/3)
Consolidate the wording lexicon into one source feeding BOTH the generator (steer) and grader (detect).

**Files.** `study-app/src/app/api/evaluate-answer/route.ts`, `evaluate-full/route.ts`;
`study-app/src/lib/prompts/tasting-lexicon.json`, `tasting-lexicon.ts`;
`study-app/scripts/sync-tasting-lexicon.mjs`; `answer-evaluation-prompt.ts`; `model-answer-prompt.ts`;
`study-app/src/lib/question-engine.ts` (engine-path lexicon wiring).

### Step 4.1 — Graders emit a structured verdict block (GR-1)

Both graders **stream** and assemble a complete server-side `fullText` after the loop
(`evaluate-answer/route.ts:72`, `evaluate-full/route.ts` ~181). Add a trailing fenced JSON block to the
prompt, parse it from `fullText`, log + (optionally) emit a correction event.

> **Claude Code prompt:**
> **Prerequisite (Round 2 — both models):** FIRST write a narrow, operational definition of "howler" and
> "cascade" (concrete tests + examples + counterexamples) in `marking-principles.ts`. The flag is only as
> good as its definition; a vague "howler" will false-fire on the model's own knowledge gaps, and
> borderline scripts are exactly where a false fail does most harm.
>
> "In `answer-evaluation-prompt.ts` (and the inline system prompt in `evaluate-full/route.ts`, ~lines
> 40–115 — note evaluate-full builds its prompt INLINE, a separate edit from the shared builder), append:
> 'End your response with a fenced ```json block:
> `{"verdict":"PASS|BORDERLINE|FAIL","marks":{"<subpart>":<n>},"howlerPresent":<bool>,"howler":"<text|null>","cascadeFlag":<bool>}`.'
> Then in BOTH routes, after the `for await` loop where `fullText` is complete (evaluate-answer line ~72;
> evaluate-full `finalMessage` at ~line 182), parse the LAST ```json fence. **DETECT-ONLY:** compute
> whether a HARD override SHOULD have fired (`howlerPresent && verdict==='BORDERLINE'` ⇒ should be FAIL;
> `cascadeFlag` ⇒ conclusion mark should be 0) and **`console.warn` the disagreement to telemetry only.**
> Keep parsing fully defensive: missing/malformed JSON → skip silently, NEVER break the stream (watch
> `max_tokens` truncation eating the JSON — give headroom). Tag telemetry with grader (Sonnet vs Opus)
> and verdict band so we can measure the false-positive rate."
>
> **⚠ Do NOT, in this iteration:** emit a verdict-flipping SSE banner. Both models flagged the
> "whiplash UX" (stream "your logic is sound" then pop "actually you failed") as a worse failure than the
> gap it fixes. **Auto-override is a SEPARATE, gated project:** only after telemetry on a few hundred real
> answers shows an acceptably low false-positive `howlerPresent` rate, and implemented as a **two-pass
> grader** (Pass 1 emits the verdict JSON; Pass 2 streams prose conditioned on it) so prose and verdict
> can never disagree. Until then this step is pure observability.

> **Follow-up (client, optional, separate step):** render the `override` SSE event as a verdict-correction
> banner. Note this in the plan but it's a UI task; the server-side detection + telemetry is the
> acceptance-critical part.

### Step 4.2 — Add `DISLIKED` + `PREFERRED_ARGUMENT` to the lexicon (under `rhetoric`)

A new TOP-LEVEL key won't be picked up (interface/sync/`getTastingLexicon` hardcode `dimensions`/
`rhetoric`). Add the new content as **sub-keys under `rhetoric`** so it flows through unchanged.

> **Claude Code prompt:**
> "In `study-app/src/lib/prompts/tasting-lexicon.json`, under the existing `rhetoric` object, add two new
> sub-keys `DISLIKED` and `PREFERRED_ARGUMENT` (arrays of strings) using the inventory from
> `outputs/gap_analysis/findings/06_lexicon.md` §1 (verbatim list below). Do NOT add a new top-level key.
> Then run `node study-app/scripts/sync-tasting-lexicon.mjs --dry-run` and confirm the MD mirror renders
> the new categories; add labels for them to `RHET_LABELS` in the sync script (~lines 47–53) so they get
> readable headings."
```json
"DISLIKED": ["stonking","icon","Goldilocks","good (no tier)","very good (no context)","PREMIUM (caps, no context)","definitely","obviously","confirms (on suggestive evidence)","matured for many years","aged well (no window)","sell it in a steakhouse","by-the-glass to affluent connoisseurs","pairs well with red meat","bullet-point arguments","phantom oak"],
"PREFERRED_ARGUMENT": ["what it might have been, but was not","this rules out X because","I would expect to see","narrows to","consistent with X, not Y","unlike wine 2","in contrast to the flight","at the top of its appellation","name the legal tier (Grand Cru Classé / DOCG / Prädikat / VORS)","drink now to {year}","will improve {n} years then hold {n}"]
```

### Step 4.3 — Render the new blocks: steer the generator, scan in the grader

> **Claude Code prompt:**
> "In `tasting-lexicon.ts`: (1) extend `buildTastingLexiconGuidance` (lines ~33–37, where it reads
> rhetoric keys) to also append a 'Prefer these argument connectives' line from
> `lex.rhetoric.PREFERRED_ARGUMENT` and an 'Avoid these registers' line from `lex.rhetoric.DISLIKED`.
> (2) Add a NEW exported `buildLexiconCritiqueGuidance(lex = BUNDLED_TASTING_LEXICON): string` that
> renders ONLY the `DISLIKED` list plus the suggest-vs-confirm over-claim rule, framed as a scan
> instruction (use the draft from findings/06 §4B). Then inject it: in `answer-evaluation-prompt.ts`
> import `buildLexiconCritiqueGuidance` and append its output to the system prompt (it's a string-return
> builder), and do the same in the inline `evaluate-full/route.ts` system prompt."
>
> **⚠ Round-2 refinement (Gemini + Codex):** prefer a **deterministic linter** over asking the LLM to
> scan natively (native scanning dilutes the grader's attention onto pedantic vocabulary and away from
> the reasoning/funnelling logic). Add a tiny pre-pass that regex-matches the candidate's answer text
> against the `DISLIKED` list and injects the FOUND phrases into the grader prompt as a short
> `Phrases detected to comment on: [...]` line. The grader then explains *why* each is weak (using the
> rubric) rather than hunting for them. The over-claim ("confirms" on suggestive evidence) is the one
> case worth keeping as an LLM judgement, since it's context-dependent, not a literal phrase match.

### Step 4.4 — Close the model-answer asymmetry (AG-1/2)

> **Claude Code prompt:**
> "(AG-2) In `study-app/src/lib/question-engine.ts:71`, the engine path calls `buildModelAnswerPrompt(questionText, wines, paper)`
> WITHOUT lexicon guidance. Change it to fetch + pass guidance like the standalone route does:
> `import { getTastingLexicon } from '@/lib/db'` and `import { buildTastingLexiconGuidance } from '@/lib/prompts/tasting-lexicon'`,
> then `const lex = buildTastingLexiconGuidance(await getTastingLexicon()); const prompt = buildModelAnswerPrompt(questionText, wines, paper, lex);`.
> (AG-1) In `model-answer-prompt.ts`, import `MARKING_PRINCIPLES` and inject it into the system prompt so
> the generator and grader share one rubric (it currently only imports FUNNELLING_PRINCIPLE, line 3)."

### ✅ Phase 4 — Verification & acceptance

```bash
cd C:/Users/russe/Documents/MW_exam/study-app
npx tsc --noEmit && npm run lint
node scripts/sync-tasting-lexicon.mjs --dry-run   # MD mirror shows DISLIKED + PREFERRED_ARGUMENT
```
> **Claude Code prompt:** "Then: (1) run `node scripts/sync-tasting-lexicon.mjs` (no --dry-run) to update
> Neon + the MD mirror; confirm `outputs/heuristics/tasting_lexicon.md` now lists both new categories.
> (2) Submit a deliberately-flawed answer through the per-answer grader (an answer that says 'this is
> definitely a good quality wine, sell it in a steakhouse' and contains a howler like 'Tawny aged in a
> solera') and confirm: the feedback explicitly flags the over-claim ('definitely'), the bare-quality
> ('good quality'), and the boilerplate ('steakhouse'); and the trailing JSON has `howlerPresent:true`
> and the override event fires if the verdict was BORDERLINE. (3) Generate a model answer via BOTH paths
> (the engine background path and the standalone route) and confirm both now use the lexicon register
> (preferred connectives present, no disliked wording)."

**Acceptance:**
- `tsc`/lint clean; sync writes both new categories to the MD mirror + Neon `tasting_lexicon`.
- Grader feedback **names** the disliked wording in the flawed answer; JSON block parses; override fires
  on howler+BORDERLINE (telemetry warn logged).
- Both model-answer paths emit the lexicon register.

---

# Phase 5 — Answer-generation polish `[answer-gen]`

**Goal.** Make the model answer demonstrate the three things the grader rewards but the generator doesn't
yet model: per-wine differentiation, an "under the skin" insight, and calibrated-both-ways quality; plus
exploit OW/NW + age contrast and narrate the structure→identity consistency check.

**Files.** `public/data/pipeline-context.json` (the `mockAnswerWriterAgent` text) and its source
`.claude/agents/mock-answer-writer.md` (keep them in sync).

### Step 5.1 — Add the three reasoning-demonstration lines

> **Claude Code prompt:**
> "In `.claude/agents/mock-answer-writer.md` AND the `mockAnswerWriterAgent` string inside
> `public/data/pipeline-context.json` (keep both identical), add these instructions to the model-answer
> guidance:
> 1. 'In a multi-wine flight, make each wine's answer visibly differentiated — never reuse the same
>    technique or phrasing across wines (examiners penalize cut-and-paste, EK §3 Rule 9).'
> 2. 'Include at least one second-order, "under the skin of the wine" insight on the strongest wine
>    (the top-band differentiator).'
> 3. 'Calibrate quality both ways — never inflate a lesser wine to a prestige tier; name the actual legal
>    tier.'
> 4. 'Where the flight has an Old-World/New-World split or a young-vs-mature contrast, use it explicitly
>    as a reasoning cue — it is how the examiner built the flight (EK-0099/EK-0101).'
> 5. 'Narrate the structure→identity consistency check (e.g. "13% alcohol, high acid, no RS rules out a
>    botrytis style, confirming the dry call").'"

### Step 5.2 — Keep pipeline-context in sync

> **Claude Code prompt:**
> "Confirm how `public/data/pipeline-context.json` is generated/synced from the `.claude/agents/*.md`
> files (search for a build script, e.g. `build*pipeline*context*` or a generator in `scripts/`). If a
> sync script exists, run it; if the JSON is hand-maintained, edit both files identically. Report which."

### ✅ Phase 5 — Verification & acceptance

> **Claude Code prompt:**
> "Generate model answers for two multi-wine historical questions — one with a clear OW/NW split (e.g. a
> 2024 P2 multi-country flight) and one quality/hierarchy flight. Confirm each model answer: (a)
> differentiates every wine (no repeated technique boilerplate); (b) contains one 'under the skin'
> insight; (c) names legal tiers and doesn't over-inflate; (d) explicitly uses the OW/NW or age contrast;
> (e) shows a structure→identity consistency line. Report any answer that misses one."

**Acceptance:** both generated answers exhibit (a)–(e); spot-check against `mw_exam_guide.md` §9.

---

# Cross-phase final validation (after all five phases)

> **Claude Code prompt:** "Run the end-to-end alignment check and report."

1. **Regenerate the corpus** (`python scripts/build_structured_corpus.py`) — confirms the pipeline still
   runs and the structured data is unchanged (no accidental edits to source).
2. **Generate a full mock suite** via `/generate-mock-exam` for all three papers; run
   `python scripts/validate_mock_paper.py --suite` over them. **Acceptance:** the suite passes the §8
   composition targets (≤ a couple of explained WARNINGs), the per-paper curveball budget is right
   (P3 ≫ P1 > P2), OW:NW is in band and never NW-majority, and the mark type-mix matches the modern
   per-paper shape.
3. **Grade a known-flawed answer** and confirm the wording scan + howler override both fire.
4. **Diff a generated paper against the guide:** pick one generated P2, manually check it against
   `mw_exam_guide.md` §8's P2 row (varieties, countries, OW:NW, price HIGH share, curveball count, mark
   mix). It should read like a real P2.
5. **Update the gap analysis status:** in `exam_gap_analysis.md`, tick the gaps now closed and note any
   that proved harder than expected (esp. R9 price, which is inherently coarse at single-question level).

---

## Appendix — the target numbers (quick reference)

| Axis | P1 | P2 | P3 | Source |
|---|---|---|---|---|
| OW : NW (per 12) | ~8:4 (≥55% OW) | ~8:4 (≥50% OW) | ~10:2 (≥70% OW) | EK-0099 |
| Never NW-majority | yes | yes | yes | EK-0099 |
| Distinct countries | ≥5 | ≥5 | ≥4 | findings/01 |
| Distinct varieties | 7–10 | 7–10 | 7–11 | findings/01 |
| Curveball budget (per 12) | ~2 (1–3) | ~1 (0–3) | ~6 (3–9) | EK-0100 |
| Price HIGH share | ~22% | ~38% | ~30% | EK-0101 |
| Age profile | young (≤7y) | mid | oldest + ~26% NV | EK-0101 |
| ID-composite share (cap) | ≤~55% | ≤~60% | ≤~55% | EK-0098 |
| Commercial | ~13% (present) | ~16% | ~21% | EK-0098 |
| Style | ~15% (most Qs) | ~23% | ~18% | EK-0098 |
| Maturity | ~20% | ~9% | ~8% | EK-0098 |
| Curveball-dense families | — | — | F5 61% / F6 38% (F1 8% = clean) | findings/03 |

*Plan generated 2026-05-31. Code anchors verified against `master` on that date — re-confirm line numbers
before editing (files drift). Findings: `outputs/gap_analysis/findings/01–06`.*
