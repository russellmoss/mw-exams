# Exam Gap Analysis — Where Our Study System Falls Short of the Real Exam

**Purpose.** This document is the honest audit of what our study system (question generation,
whole-test understanding, answer generation, grading) does *not yet* capture about the real MW
practical, measured against the statistical picture in `mw_exam_guide.md`. It is the actionable
companion to that guide.

**Method.** Stage A built a structured corpus from source — `data/structured/{corpus_wines,
corpus_questions,corpus_subquestions}.json` (504 wines / 153 Q / 462 sub-Q; last-10 subset 360 / 112 /
337), mirrored to the Neon `corpus` schema for future querying. Stage B ran six focused gap-hunter
agents (one per dimension the user prioritized), each comparing the corpus + the 13 examiner reports +
EK against the live code in `study-app/src/lib/`. Full per-dimension findings:
`outputs/gap_analysis/findings/01–06`.

---

## Executive summary

**The good news (don't re-build these):**
- **Grading is our strongest dimension.** All 17 reasoning-reward themes from the 291-principle examiner
  mining are implemented in `marking-principles.ts` + `funnelling.ts` and injected into both graders.
  Funnelling, plausibility-gradient credit, howler override, cascade detection, the four-dimension
  verdict — all present and cited. (Finding 05.)
- **Within-flight variety and country diversity are genuinely enforced** (R1–R4 + `validateOriginDiversity`).
- **The 25-marks/wine skeleton, banker minimum, flight-size distribution, and P3 style balance are
  enforced** and match the corpus.
- **We have a real tasting-descriptor + deductive-register lexicon** wired into model-answer generation.

**The gaps cluster in four places:**
1. **No whole-paper (12-wine) composition model exists at all** — every check is per-flight. This blocks
   the user's stated next step (building whole tests).
2. **Three first-order composition axes are untracked and unenforced:** Old-World/New-World balance,
   vintage/age spread, and **the modern mark TYPE-MIX** (commercial/style/maturity vs ID).
3. **Price diversity is documented in knowledge but enforced nowhere** in the path that serves users.
4. **The curveball is enforced only on the floor (≥1 banker), never the ceiling/target**, and grading's
   two HARD override rules are advisory prose, not mechanics.

Plus: **six knowledge corrections** the corpus forced (below) — including a wrong EK claim we'd otherwise
build position-logic on.

---

## Knowledge corrections (fix these in EK before building on them)

> **Confidence note (added after the 2026-05-31 council + corpus-verifier review, see below).** Every
> number here was **independently recomputed from the raw corpus and reproduced to the decimal** — the
> arithmetic is sound. But several "corrections" rest on small samples or needed a logical sharpening;
> those are flagged inline. Treat **directional** items as tentative corpus signal, not settled law.

| # | Old claim | Corrected by last-10 corpus | n / confidence | Action |
|---|---|---|---|---|
| 1 | **EK-0025:** curveballs cluster in the *last* question of P1/P2 | **Robust:** the "last-question" prior is NOT supported, and **P3 end-loads** (last Q 58.8% med+high). **Directional:** P1's hardest slot looks like the *middle* (q2 15.4% high) — but that's ~4–5 wines over 10 sittings | P3 strong; P1/P2 = small-n | Rewrite EK-0025 around the **negative** claim + P3 end-load; mark the q2 spike directional |
| 2 | **EK-0024:** the "1 in 4" curveball rule | **Sharpened (unit-of-analysis):** at the **flight** level, 54% are all-anchor; but at the **wine** level the curveball rate is ~21–27% ≈ **1 in 4–5**, which *confirms* the rule's spirit. So: 1-in-4 holds **per wine**; difficulty is concentrated into a minority of flights | robust (n=111 flights / 360 wines) | Reframe EK-0024, don't "overturn" it — distinguish per-wine density (holds) from per-flight shape (most flights all-anchor) |
| 3 | curveball rate higher in small flights (all-15-yr: 50% for 2-wine) | **Flat ~21–27% across 2/3/4-wine** (robust); 5-wine 28.6% / 6-wine 33.3% **directional only** | 2/3/4 robust; 5-wine **n=7**, 6-wine **n=6** | Refresh EK-0023 to last-10; caveat the 5/6-wine figures |
| 4 | breadth/mixed (F4) hosts the most curveballs | F4 is high *volume* but **F5 is denser per wine (61%)**; F1 safest (8%) — robust. **F6 38% is directional** | F5 robust (n=36 wines); **F6 n=4 questions** | Add to EK; F5/F1 firm, F6 directional |
| 5 | quality questions ladder broadly (EK-0028's two modes) | **Majority (51%) compress high**; broad ladder only 20%; compression valid *only* with a legal scaffold | directional (price_band is a coarse proxy, ~7% explicit) | Sharpen EK-0028; keep the proxy caveat |
| 6 | (new) post-2014 mark redistribution | **Robust under BOTH methods:** commercial **5.7%→17.9%** full-credit (2.6%→7.8% split-evenly); ID **59.7%→46.2%**; style ~10→20%; maturity ~5→13%. Verifier confirmed it is NOT a verbose-stem classifier artifact (stem length flat 69→67→67 chars across eras) | robust | Add new EK entries; state **both** methods, drop the loose "~0→18%" |

---

## Review & validation (council + corpus verifier, 2026-05-31)

This analysis was adversarially reviewed by an external model council (gpt-5.4 + Gemini 3.1 Pro) and a
corpus-grounded Claude verifier that re-ran every load-bearing number (`outputs/gap_analysis/findings/07_adversarial_corpus_review.md`).
Outcome: **arithmetic confirmed (nothing refuted)**; the corrections table above was sharpened for
small-n honesty and the 1-in-4 unit-of-analysis slip; and the review surfaced additional dimensions the
first pass missed (added to the gaps below as **REV-** items). The council's two strongest *rejected*
objections (recorded for transparency): "commercial-tripling is a verbose-stem classifier artifact"
(refuted — stem length is flat across eras) and "no color guardrail" (already a HARD rule,
`validatePaperScope`).

**Newly-surfaced gaps from the review:**

| ID | Gap | Pri | Source |
|---|---|---|---|
| REV-1 | **Whole-paper validator must also assert COLOR / macro-style** (P1 white, P2 red, P3 mixed) and a **single-country CEILING** (France is ~34% of the corpus; we have a ≥6-country floor but no cap) and a **blend-frequency target** (~29% of real wines are blends, currently treated as an F3-only niche). | **HIGH** `[whole-test]` | council (Gemini) + verifier |
| REV-2 | **Flight scaffolding / grouping-hint structure is untracked** — the exam routinely gives prompt scaffolds ("wines 1–3 are from the same region"; half-blind "here are the 4 grapes"). We model flights as bare collections of N wines and miss the comparative-task structure. | MED `[question-gen][whole-test]` | council (Gemini) |
| REV-3 | **Command-verb / comparative-task granularity** — our sub-question "type" is a keyword classifier; it doesn't distinguish *identify / comment / assess / justify / compare / rank* or whether a question demands true compare-vs-contrast vs serial wine-by-wine. A command-verb layer would sharpen both generation and grading. | MED `[question-gen][grading]` | council (Codex) |
| REV-4 | **No temporal weighting within the last 10** — 2015–2018 may differ from 2022–2025; for a *current* study app, recent years may deserve more weight than a flat 10-year pool. | LOW `[analysis]` | council (Codex) |

---

## Gaps by area

Priorities: **HIGH** = affects most generated content / a first-order axis; **MED** = real but
narrower; **LOW** = edge case or polish. Tags: `[question-gen]` `[whole-test]` `[answer-gen]` `[grading]`.

### A. Question generation (single-question path — what actually serves users)

| ID | Gap | Pri | Evidence |
|---|---|---|---|
| QG-1 | **No mark TYPE-MIX target.** Generator guarantees 25/wine + sub-q minimums but is silent on distribution. A P2 question can legally be 100% ID, zero commercial — a pre-2014 shape. The biggest post-2014 change is unrepresented. | **HIGH** | Finding 04 §3 |
| QG-2 | **Commercial under-representation.** Now ~18% of marks and present on most questions, but no rule requires it to appear; the prompt only sizes it *if* the model includes it. | **HIGH** | Finding 04 §3 |
| QG-3 | **No OW/NW awareness.** No code references `world`/OW:NW. Generator drifts to single-world flights (path of least resistance); real F4/F1/F6 flights mix ~60%+. | **HIGH** | Finding 01 §3 |
| QG-4 | **No within-question price-spread rule.** Zero price logic in `question-engine.ts`/`question-rules.mjs`; the RuleWine shape lacks a price field. Can emit a 4×super-premium "quality" flight (EK-0028 failure). | **HIGH** | Finding 02 §3 |
| QG-5 | **No curveball-count ceiling/target.** Hard-enforces ≥1 banker but never counts harder wines; flights drift to all-recognizable-benchmarks (the LLM's safe default), under-training discrimination. | **HIGH** | Finding 03 §3 |
| QG-6 | **No per-paper differentiation** of mark mix, price, or curveball density — prompt "typical ranges" are paper-agnostic, so P1/P2/P3 converge to one generic shape. | MED | Findings 02/03/04 |
| QG-7 | **No vintage/age diversity tracking** — `age_at_exam`/`vintage` never read at generation; a flight can be accidentally all-same-vintage, removing a maturity cue. | MED | Finding 01 §3 |
| QG-8 | **Family-uniform curveball guidance** — F1 should be curveball-free (8%), F5/F6 curveball-rich (61%/38%); the prompt doesn't steer by family. | MED | Finding 03 §3 |
| QG-9 | **ID share not capped** (~46% modern); nothing stops regression to ID-dominant. | MED | Finding 04 §3 |
| QG-10 | Quality-question mode (≥3 bands OR legal-tier scaffold) unvalidated; compare/contrast tariff (20–36) not size-checked; structure/RS "state" marks not gated to P3. | LOW | Findings 02/04 |

### B. Whole-test understanding & assembly (the user's stated next step)

| ID | Gap | Pri | Evidence |
|---|---|---|---|
| WT-1 | **No whole-paper composition validator exists, at all.** Every check is per-flight. `/generate-mock-exam` is agent-prose-driven on top of the single-question machinery; nothing verifies the 12 wines collectively hit the §8 targets. | **HIGH** | Findings 01/02/03/04 |
| WT-2 | **No per-paper OW:NW guard** — a mock could come out 50/50 or NW-majority (never happens in the real exam) and pass everything. Target: P1/P2 ≈⅔ OW, P3 ≈82% OW, never NW-majority. | **HIGH** | Finding 01 §4 |
| WT-3 | **No per-paper curveball budget** — P1≈2, P2≈1, P3≈6 harder/12. A suite giving every paper equal difficulty misrepresents the real P2-easy/P3-hard shape. | **HIGH** | Finding 03 §3 |
| WT-4 | **No per-paper price-ratio target** enforced (P1 value-tilted, P2 ~38% HIGH, P3 luxury-heavy); $300–400 ceiling and 20:1 sweet ratio live only as agent prose. | MED | Finding 02 §4 |
| WT-5 | **No per-paper mark-mix / commercial-presence enforcement** across the paper (commercial+style+maturity ≈45–55% of non-ID marks in the modern era). | MED | Finding 04 §4 |
| WT-6 | **No per-paper diversity/age-signature check** (≥~6 countries, 7–10 varieties, P1 young / P3 oldest+NV). | MED | Finding 01 §4 |

### C. Answer generation

| ID | Gap | Pri | Evidence |
|---|---|---|---|
| AG-1 | **Grader↔generator asymmetry.** `model-answer-prompt.ts` injects funnelling + the synthesis but **not** `MARKING_PRINCIPLES`; the agent instructions omit explicit anti-cut-and-paste differentiation, quality-over-calling avoidance, and the "under the skin" top-band move — three things the grader rewards/penalizes. The model answer a student studies may not model what the grader scores. | MED | Finding 05 §3 |
| AG-2 | **Engine path skips the lexicon.** `question-engine.ts:71` calls `buildModelAnswerPrompt` *without* `lexiconGuidance`; only the standalone route passes it → inconsistent register across the two paths. | MED | Finding 06 §3 |
| AG-3 | **No preferred-argumentation/connective palette** beyond SUGGESTS/PROVES descriptors (funnel connectives, named-tier quality phrasing, maturity-window templates are not curated). | MED | Finding 06 §3 |
| AG-4 | Model answer doesn't narrate its structure→identity consistency check; doesn't explicitly exploit a flight's OW/NW & young-vs-mature contrast as reasoning cues. | LOW | Findings 05/01 |

### D. Grading & feedback

| ID | Gap | Pri | Evidence |
|---|---|---|---|
| GR-1 | **Grading is prose-only; the two HARD overrides are advisory, not enforced.** Graders stream free text with no structured score. "Howler→FAIL" and "cascade→zero conclusion mark" depend on the model choosing to apply them; nothing checks a howler-flagged script didn't still print "BORDERLINE." | **HIGH** | Finding 05 §3 |
| GR-2 | **Feedback prompt never receives the wording lexicon and has no wording-scan pass.** The over-claim detector (our most distinctive wording rule) is taught to the *generator* but never to the *grader* — we coach the model answer to avoid over-claim but never tell the candidate when THEY over-claimed. | **HIGH** | Finding 06 §3 |
| GR-3 | **No single source-of-truth wording lexicon.** Preferred descriptors (JSON, generator-only), disliked phrases (marking-principles prose, grader-only), and funnel connectives (funnelling prose) are fragmented — no one artifact to edit, no shared injection. | MED | Finding 06 §3 |
| GR-4 | Pre-glass grader doesn't reward a plausibility-gradient candidate set; quality over-calling not surfaced to the generator. | LOW | Finding 05 §3 |

---

## Recommended roadmap (sequenced by value / effort)

**Phase 1 — knowledge hygiene (cheap, do first).** Apply the six knowledge corrections to EK
(§"Knowledge corrections"); add new EK entries for the post-2014 mark redistribution, the per-paper
OW:NW band, the per-paper curveball budget, and the per-paper age signature — all citing this analysis
and `data/structured/`. Prevents building on the wrong EK-0025 claim. *(docs only)*

**Phase 2 — the highest-value single-question fixes `[question-gen]`.** Extend the normalized RuleWine
shape with `world`, `price_band`, and a difficulty signal, then add three SOFT, tracked rules
(relax-on-retry like existing soft validators, never HARD):
- **R8 mark type-mix** — per-paper target shares (Finding 04 §1d); enforce ID-composite ≤ ~55%,
  commercial present, style present.
- **R9 price-spread** — quality flights need ≥3 bands *or* a legal-ladder signal; 4+ flights not
  price-homogeneous; ≤2 wines per tier.
- **R10 OW/NW + curveball count** — non-same-origin 3+ flights shouldn't be single-world; reject
  all-banker F5/F6/P3 flights and >2 harder wines in F1.
Differentiate the generation prompt by family and paper (QG-6/8/9).

**Phase 3 — build the whole-test composition validator `[whole-test]`** (unlocks the user's next step).
A deterministic post-assembly check over the 12 wines of a generated paper, asserting the §8 target
table: OW:NW band, distinct countries/varieties, age signature, price ratio, curveball budget, mark
type-mix. Emit a one-line composition report per paper so the spread is visible. Wire it into
`/generate-mock-exam`. This is the structural prerequisite for trustworthy whole-test generation.

**Phase 4 — grading mechanics + wording lexicon `[grading]` `[answer-gen]`.**
- **GR-1:** have graders emit a small trailing JSON block (per-sub-part marks, verdict, `howlerPresent`,
  `cascadeFlag`); post-validate in route code to mechanically enforce the two HARD overrides.
- **GR-2/3 + AG-1/2/3:** consolidate `tasting-lexicon.json` into the single wording source-of-truth with
  two new blocks (`disliked`, `preferred_argument`); inject a disliked-wording **scan instruction**
  (anchored by the over-claim detector) into the feedback prompt; append avoid/prefer steering to the
  generator; pass `lexiconGuidance` on the engine path; import `MARKING_PRINCIPLES` into the model-answer
  prompt so generator and grader share one rubric. (One artifact, both directions, via the existing
  sync→Neon→md pipeline.)

**Phase 5 — answer-gen polish `[answer-gen]`.** Add the three lines to `mockAnswerWriterAgent`
(differentiate every wine; one "under the skin" insight; calibrate quality both ways); have model
answers exploit OW/NW + age contrast and narrate the structure→identity consistency check.

---

## Traceability

- **Structured corpus:** `data/structured/*.json` (git-tracked, regenerable via
  `python scripts/build_structured_corpus.py`; assembly logic reuses the backtest-trusted
  `run_loyo` extractors).
- **Neon mirror:** project `MW-exam` (`wandering-feather-17026214`), schema `corpus`
  (`corpus.wines` / `corpus.questions` / `corpus.subquestions`) — queryable for future analysis,
  isolated from the app's `public.*` tables.
- **Per-dimension findings:** `outputs/gap_analysis/findings/01_diversity.md` … `06_lexicon.md`.
- **Companion guide:** `mw_exam_guide.md`.

*Generated 2026-05-31.*
