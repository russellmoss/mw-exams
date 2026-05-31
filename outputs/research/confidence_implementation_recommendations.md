# Confidence Implementation Recommendations — making the graders / feedback / model-answer generators model examiner *confidence*

> **Project 9 capstone synthesis · recommendations only — no code changed.** This is the single
> build-from document for the changes needed to make the study app's LLM graders, feedback engine, and
> model-answer generator model **examiner confidence** (the latent trust account described in
> `examiner_confidence_construction_model.md`) rather than mere ID-against-a-key correctness. It reconciles
> the Project 9 prompt audit (`confidence_prompt_audit.md`) against the live code as it stands *today*
> (after commit d8c7e00), resolving every place the audit ran on a stale snapshot.
>
> **Authority note.** The "TRUE current state" lines below were verified against the live files this
> session. Where the audit and the live code disagree, the live code wins and the discrepancy is called out.

---

## 1 · Executive summary

The confidence model (`examiner_confidence_construction_model.md` §1, §4, §5) says an IMW examiner grades a
**trust account**, not a score: reasoning that runs visibly from the glass to a committed conclusion *credits*
the account; guessing/hedging/shoehorning/recycling *debit* it; a single factual howler *bankrupts* it and
retroactively re-prices every other answer (the contamination law, F-1, ≥10 reports — the best-attested finding
in the corpus). A grader faithful to this model must serve **both off-diagonals** of the §4 2×2:
*wrong-but-trusted* (5–6/8 for a well-argued wrong call) and *right-but-doubted* (a bare correct label scoring
*below* a well-argued wrong one).

The live prompts already lean toward confidence (the funnel, the survivable-miss/cascade asymmetry, internal
contradiction, cut-and-paste, and — as of commit d8c7e00 — the injected per-wine plausibility map). What remains
open is a set of mostly **prompt-text edits** that close the residual confidence-leaks, plus two pieces of real
engineering (a difficulty data field; validation-gated verdict enforcement).

### Reconciliation note — THREE audit items are ALREADY DONE. Do NOT redo them.

The Project 9 audit ran on a partly-stale snapshot. These three "gaps" it raised are **shipped in live code**;
they are recorded here as DONE / no-action so the build team does not redo them:

- **Plausibility-map injection (audit GAP 1, the injection half) — DONE.** `evaluate-full/route.ts:149-166`
  already derives the key via `deriveStemKey({paper, question_text, wines, wine_profiles:{}})`, injects the
  first 16 per-wine `plausible[]` entries as an `## Plausibility reference (INTERNAL …)` block, and at `:160`
  carries the latitude conditional ("a wrong call matching one of these … is a PLAUSIBLE miss earning real
  partial credit", citing EK-0112). `evaluate-full` is the **only live grader** — `study/page.tsx:280` posts
  the wines to it; `evaluate-answer` has **zero client callers** (effectively a dead route).
- **Pass standard in the grader rubric (audit GAP 2) — DONE.** `marking-principles.ts:15` already reads the
  corrected standard: "an AVERAGE, not per-paper … average 65% across the three practical papers, with a ~50%
  minimum floor … It is NOT 65% on every paper", with the three named IMW abilities at `:16`. The audit's
  "ABSOLUTE 65% per paper" quote is **stale/false** against the live file.
- **PG-2 plausibility telemetry (audit GAP 7, the detect half) — DONE.** `grading-telemetry.ts` already carries
  `GradingMeta.wrongCallPlausible` / `creditGiven` and detect-only `console.warn`s on howler+BORDERLINE and on
  plausibility over/under-credit (`:55-82`); both routes call `recordGradingOverrideCheck`. Nothing *acts* on
  the flags yet — that enforcement is R8 below.

What remains genuinely open is captured as **R1–R9** below.

---

## 2 · Ranking method

**ROI = confidence-fidelity impact ÷ effort.** *Impact* = how much closer the change moves the live grader to
modelling the trust account (weighted by the model's evidence tier — a STRONG/≥10-report finding outranks a
PLAUSIBLE one) and by whether it touches the **only live grader** (`evaluate-full`) vs a dead route. *Effort* =
files touched × data-model change × artifact-regeneration burden. Tiers: **ROI HIGH** (big fidelity gain,
prompt-only) / **MED** / **LOW** (small or blocked-by-data gain, or non-trivial effort for modest lift).

**Risk = blast radius × reversibility × evidence-certainty.** *Blast radius* = does it change verdicts users
see, generated artifacts, or a data model — or just internal grader instructions? *Reversibility* = can it be
reverted in one commit with no migration? *Evidence-certainty* = is the underlying finding STRONG and publicly
defensible, or corpus-strong-but-UNVERIFIED (encode-as-tendency)? Tiers: **Risk LOW** (prompt-text on a STRONG
finding, one-commit-revertible, no user-visible verdict change) / **MED** (changes generated artifacts or adds a
data field) / **HIGH** (flips user-visible verdicts and/or rests on an UNVERIFIED finding).

---

## 3 · Master recommendations table

| ID | Recommendation (one line) | Files touched | TRUE current state | Impact | Effort | ROI | Risk | Dependencies | Validation |
|----|---------------------------|---------------|--------------------|--------|--------|-----|------|--------------|------------|
| **R1** | Strengthen contamination law from "adjacent" → whole-script / retroactive / re-read sceptically | `marking-principles.ts:36` | "reduces confidence in adjacent claims" | HIGH (F-1, ≥10 reports — strongest finding) | Trivial (1 line, 1 file) | **HIGH** | **LOW** | none | Re-grade a howler-bearing exemplar; check feedback re-reads the whole script, not just the local sub-mark |
| **R2** | Add correct-ID-parity test to Cardinal Rule 1 (bare right label scores *below* well-argued wrong call) | `marking-principles.ts:19` | "a bare right answer with no argument earns little" (no ranking) | HIGH (closes right-but-doubted off-diagonal, F-9/F-2) | Trivial (add to Rule 1) | **HIGH** | **LOW** | none | 2024 Pinot Grigio A/B exemplar: un-argued correct must score below argued-wrong |
| **R3** | Add anti-volume / selectivity clause to top-band + reorder eval axes off ID-first/completeness | `marking-principles.ts:41-42`; `answer-evaluation-prompt.ts:33-36` | top-band has under-the-skin but no selectivity (S4); eval axes lead ID + list "What they missed" | MED-HIGH (S4, F-17, ≥6 reports) | Low (2 files, prompt-only) | **HIGH** (marking-principles half) | **LOW** | none — but note `answer-evaluation-prompt.ts` feeds the **dead** `evaluate-answer` route; the bite comes from the `marking-principles.ts` half (shared by live `evaluate-full`) | Selective causal answer must out-score an exhaustive name-drop catalogue |
| **R4** | Tell the model-answer generator to differentiate wines (AT-1/GAP 6) + do the reconcile move (AT-2) | `model-answer-prompt.ts:96` | funnelling only; no differentiation, no second-order reconcile instruction | MED-HIGH (stops generator modelling the failure the grader marks down) | Low (prompt-only, but regen risk) | **MED-HIGH** | **MED** (changes generated artifacts) | none (but regression-test exemplars) | Regenerate a multi-wine package; confirm techniques/structure vary and no two wines share a template |
| **R5** | Wire banker/curveball **difficulty** end-to-end so latitude modulates by difficulty, not just adjacency | `stem-answer-key.mjs:218-231` (emit); `stem-scoring.ts:26` `StemKey.ground` type (add field); `evaluate-full/route.ts:149-166` (inject); + a difficulty data source | builder never emits `difficulty`; `ground` bucket lacks it; scorer's `CURVEBALL_BONUS` (`stem-scoring.ts:65,284`) is **unfed**; injection latitude fires on adjacency only | MED (operationalises F-11 banker/curveball latitude) | **MED** (multi-file + data-model + no source data exists) | **MED** | **MED** | needs a per-wine difficulty source (none exists — `mock_wine_bank.json` has only descriptive `*_curveball` tag *strings*, not a structured field) | Backtest: curveball hits earn bonus; banker latitude visibly narrows; no false BANKER on genuinely hard wines |
| **R6** | Add structural-scaffold clause to Rule 9 (identical sentence-scaffold / maturity-commercial formula, not just content) | `marking-principles.ts:32` | covers content cut-and-paste only | LOW-MED (AT-3) | Low text, but **blocked** | **LOW** | **MED** | **BLOCKED on R4** AND a model-answer artifact regen — and **no batch regen script exists** in `study-app/scripts/` (live gen = per-question API route; offline = separate Python `scripts/generate_mock_answers.py`) | After R4 + regen: confirm exemplars don't share sentence scaffolds; re-grade for false scaffold flags |
| **R7** | Soft difficulty hint in pre-glass coach | `pre-glass-prompt.ts` | no difficulty hint | LOW | Low text | **LOW** | **LOW** | **GATED on R8/PG-2 data** accumulating (logs detect-only; needs data before tuning) | Once PG-2 data exists: A/B the hint vs baseline coach quality |
| **R8** | Move howler→FAIL / cascade→zero from detect-only to **enforced** (gated two-pass) | `grading-telemetry.ts:55-82`; `evaluate-full/route.ts` (two-pass verdict→prose) | detect-only `console.warn`; flags never mutate the streamed verdict | HIGH *if* validated | **HIGH** (re-architects grading to two passes) | **MED** (high impact, high effort/risk) | **HIGH** (flips user-visible verdicts; underlying override is corpus-strong but publicly **UNVERIFIED** — F-20) | needs validation of the howler-override tendency first; PG-2 telemetry to measure false-positive rate | Offline replay over historical attempts: false-positive howler rate acceptable before any verdict flips; ship behind a flag |
| **R9** | Fix stale "65% per paper" in the exam guide doc | `mw_exam_guide.md:233` | "absolute 65% pass per paper (not a curve)" — contradicts EK-0116/F-S1 | LOW (doc only) | Trivial (1 line) | **MED** (trivial effort, removes a wrong fact) | **LOW** (zero code risk) | none | Read-after: line states aggregate-65%-across-3-papers + ~50% floor |

---

## 4 · View A — ordered by ROI (highest → lowest)

1. **R1 — strengthen contamination law to whole-script/retroactive.** Highest ROI: a one-line edit to the
   single live grader, encoding the **strongest finding in the corpus** (F-1, ≥10 reports). Maximum fidelity gain
   per unit effort.
2. **R2 — correct-ID parity test.** One-line add to Cardinal Rule 1 that closes the *right-but-doubted*
   off-diagonal the model says graders systematically misgrade. Prompt-only, STRONG-backed.
3. **R9 — fix the stale "65% per paper" doc line.** Near-zero effort, removes a flatly wrong fact that
   contradicts EK-0116; ranks high purely on effort ÷ correctness even though impact is doc-scoped.
4. **R3 — anti-volume/selectivity + axis reorder.** Closes the completeness-rewards leak (S4, F-17, ≥6 reports).
   Prompt-only; the `marking-principles.ts` half hits the live grader (the `answer-evaluation-prompt.ts` half
   hits a dead route, so half the stated impact is latent).
5. **R4 — differentiate wines + reconcile move in the generator.** Stops the model-answer generator from
   modelling the very cut-and-paste the grader penalises, and teaches the reconcile move the grader rewards.
   Prompt-only but changes generated artifacts (regen/regression cost lowers ROI slightly).
6. **R5 — wire difficulty end-to-end.** Real fidelity gain (banker/curveball latitude) but multi-file + a
   data-model change + a missing data source pull effort up and ROI down to MED.
7. **R8 — enforce howler→FAIL / cascade→zero.** Potentially high impact but the highest effort (two-pass
   re-architecture) and is validation-gated, so net ROI is MED.
8. **R6 — structural-scaffold cut-and-paste clause.** Low marginal lift over R4, and blocked behind R4 + an
   artifact regen that has no batch script.
9. **R7 — pre-glass difficulty hint.** Lowest impact and blocked-by-data; do last.

---

## 5 · View B — ordered by risk (least → most risky)

1. **R9 — doc line fix.** Lowest risk: a non-code markdown file, one line, trivially revertible, zero runtime
   blast radius.
2. **R1 — contamination law text.** Prompt-only on a STRONG/≥10-report finding; one-commit revertible; no
   user-visible *verdict* mechanism changes (only how the grader reasons/feeds back).
3. **R2 — parity-test text.** Same risk profile as R1: prompt-only, STRONG-backed, revertible.
4. **R3 — selectivity clause + axis reorder.** Prompt-only on a STRONG finding; the axis reorder touches a dead
   route so blast radius is even smaller. Revertible.
5. **R7 — pre-glass hint.** Prompt-only, no marks issued by that coach, low blast radius — but gated by data so
   it sits mid-list to respect the gate, not because the edit itself is risky.
6. **R4 — generator differentiation/reconcile.** Changes **generated artifacts** users study from; needs
   exemplar regression-testing. Revertible but the artifacts it produced are not auto-reverted.
7. **R5 — difficulty data model.** Adds a `difficulty` field to `StemKey.ground` and a new data source; a
   data-model change with a wider revert surface, but it only *modulates* latitude (does not flip verdicts).
8. **R6 — structural-scaffold clause.** Risk compounded by its dependency chain (R4 → artifact regen with no
   batch script); the sequencing cost is itself the risk.
9. **R8 — enforced howler→FAIL / cascade→zero.** Highest risk: it **flips PASS/BORDERLINE/FAIL verdicts users
   see**, re-architects grading into a gated two-pass, and rests on a finding (F-20) that is corpus-strong but
   **publicly UNVERIFIED**. Must be validation-gated and flagged.

---

## 6 · Recommended sequencing

A single pragmatic apply-order that front-loads low-risk/high-ROI prompt edits, then the data work, then the
validation-gated enforcement.

**Batch 1 — "quick wins" (one commit/PR, all prompt-/doc-only, all LOW risk, all independent).**
`R1 + R2 + R3 + R9`. Four edits across `marking-principles.ts` (lines 36, 19, 41-42), `answer-evaluation-prompt.ts`
(33-36, dead-route half), and `mw_exam_guide.md` (233). No data-model or artifact changes; revert-in-one. This
ships the bulk of the confidence-fidelity gain with essentially no blast radius. (Note: because
`evaluate-answer` is a dead route, the live impact concentrates in the `marking-principles.ts` edits, which the
live `evaluate-full` grader consumes.)

**Batch 2 — generator (separate PR; regen + regression-test).** `R4`. Prompt-only but regenerate a sample
multi-wine package and confirm the exemplars differentiate and demonstrate the reconcile move before merging.
Keep it out of Batch 1 so a regression in generated artifacts can be isolated.

**Batch 3 — difficulty data work (separate PR).** `R5`. Sequence: (a) stand up / choose a per-wine difficulty
source (a structured field, not the `*_curveball` tag strings); (b) emit `difficulty` in the builder
(`stem-answer-key.mjs:218-231`); (c) add `difficulty?` to the `StemKey.ground` type (`stem-scoring.ts:26`
already accepts it on the consumer side); (d) inject it in the `evaluate-full` plausibility block and extend the
latitude conditional to fire on difficulty as well as adjacency. The scorer's `CURVEBALL_BONUS` becomes fed as a
by-product.

**Batch 4 — blocked-on-prior items.** `R6` (after R4 lands **and** an artifact regen path exists — note no batch
regen script exists today; this dependency must be resolved first). `R7` (after R8's PG-2 telemetry has
accumulated enough data to tune the hint).

**Batch 5 — validation-gated enforcement (last, behind a flag).** `R8`. Do **not** start until the
howler-override tendency (F-20) is validated and the PG-2 false-positive rate is measured. Implement as a gated
two-pass (decide verdict, then write prose) behind a feature flag; replay over historical attempts before
allowing any verdict to flip in production.

---

## 7 · Per-recommendation detail

### R1 — Strengthen the contamination law from "adjacent" → whole script / retroactive

- **Problem.** The model's best-attested finding (F-1, ≥10 reports; §3): a howler "undermines confidence in
  **everything** a candidate has written," *retroactively*, across sub-questions ("Douro, Spain … further
  shattered" — 2017). The live rubric localises this to "adjacent claims," under-encoding the strongest signal
  in the corpus.
- **TRUE current state.** `marking-principles.ts:36`: a howler "caps the affected sub-question's conclusion mark
  at zero AND **reduces confidence in adjacent claims**."
- **Suggested edit (extend L36).** Append: *"A howler does not just cap its own sub-question — it **undermines
  confidence in everything the candidate has written** (2023/2024), including answers you had already credited:
  re-read the whole script more sceptically after finding one, and say so in the feedback. Trust propagates
  across sub-questions, not just to adjacent ones."*
- **Why ROI HIGH / Risk LOW.** One line, single live-grader file, encodes the ≥10-report finding; revertible; no
  verdict-mechanism change (it sharpens reasoning/feedback, not the FAIL switch — that is R8).
- **Validation.** Re-grade a howler-bearing exemplar; confirm the feedback re-reads the whole script sceptically
  rather than docking only the local sub-mark.

### R2 — Add the correct-ID parity test to Cardinal Rule 1

- **Problem.** EK-0123 / F-9 / §2.11: the *right-but-doubted* off-diagonal. A bare correct label must score
  *below* a well-argued wrong call (2024 P1 Pinot Grigio: identical correct ID earned good marks *with*
  argument, lost many *without*). The rubric states the correct call is worth "little" but never that it should
  be **outscored by the wrong one** — so the LLM can still floor it at some positive partial "because the ID is
  right," inverting the intended ranking.
- **TRUE current state.** `marking-principles.ts:19` (Cardinal Rule 1): *"Reasoning > identification. Sound logic
  to a wrong-but-plausible call earns marks; a bare right answer with no argument earns little."*
- **Suggested edit (add to Rule 1).** *"Parity test: a correct identification stated with **no visible
  derivation** must score **below** a wrong-but-plausible call that shows sound structure and a terminated
  funnel — an un-argued right answer is, to the examiner, almost indistinguishable from a lucky guess (2024 P1
  Pinot Grigio: the same correct ID earned good marks *with* argument and lost many marks *without*)."*
- **Why ROI HIGH / Risk LOW.** Closes a documented off-diagonal with one sentence; prompt-only, STRONG-backed,
  revertible.
- **Validation.** Run the 2024 Pinot Grigio A/B pair; the un-argued-correct answer must score below the
  argued-wrong one.

### R3 — Anti-volume / selectivity rule + ID-first axis reorder

- **Problem.** S4 / F-17 (≥6 reports): "an overabundance of examples can sometimes mask a lack of fundamental
  understanding"; selectivity > completeness. The top-band differentiator has the under-the-skin lift but not the
  anti-volume half, and the single-answer grader's axes lead with ID and include "What they missed" — which
  *rewards* completeness, the opposite of S4.
- **TRUE current state.** `marking-principles.ts:41-42` (top-band) rewards "under the skin of the wine … second-
  order insight" but has no selectivity clause. `answer-evaluation-prompt.ts:33-36` lists axes as
  "Identification accuracy / Reasoning quality & funnelling / Specificity / What they missed."
- **Suggested edit.** Add to L41-42: *"Reward **selectivity over completeness**: 'an overabundance of examples
  can sometimes mask a lack of fundamental understanding' (2018). A focused, causal, second-order answer
  out-scores an exhaustive catalogue. Do not award marks for breadth of name-dropping; award them for the depth
  of the link to the glass."* And re-order `answer-evaluation-prompt.ts:33-36` so reasoning/funnelling leads and
  "Specificity" is framed as *causal* specificity (depth of the glass-link), not coverage.
- **Caveat (impact split).** `answer-evaluation-prompt.ts` feeds the **dead** `evaluate-answer` route (zero
  client callers); the live bite is the `marking-principles.ts:41-42` half, which the live `evaluate-full`
  grader consumes. Apply both for consistency, but expect the live effect from the marking-principles half.
- **Why ROI HIGH / Risk LOW.** Prompt-only on a STRONG finding; revertible.
- **Validation.** A selective causal answer must out-score an exhaustive name-drop catalogue on the same wine.

### R4 — Stop the model-answer generator modelling cut-and-paste; teach the reconcile move

- **Problem.** GAP 6/AT-1 and AT-2. The generator has funnelling only (`model-answer-prompt.ts:96`); it is never
  told to **differentiate the wines** (don't apply the same technique to every wine) nor to demonstrate the
  **reconcile / second-order** move. Yet the grader penalises cut-and-paste (`marking-principles.ts:32`, Rule 9)
  and rewards the reconcile move (`:42`) — so the generator is held to bars it is never told to clear, and can
  model the very failure the grader marks down.
- **TRUE current state.** `model-answer-prompt.ts:96` instructs only funnelling ("commit to the leading variety
  + broad-region call early, but visibly weigh the 1–2 plausible alternatives and rule them out … land it
  decisively"). No differentiation or reconcile instruction.
- **Suggested edit (add to §1 Model Answer).** *"Differentiate the wines: do not apply the same winemaking
  technique or commercial framing to every wine, and vary the argument structure — the grader penalises
  cut-and-paste, so the exemplar must not model it. Where the evidence conflicts, demonstrate the distinction
  move: reconcile the conflicting cues with one higher-order inference (e.g. why an exceptional producer exceeds
  a classification's minimum) rather than cataloguing."*
- **Why ROI MED-HIGH / Risk MED.** Prompt-only, but it changes **generated artifacts** users study from →
  regression-test the exemplars before merge.
- **Validation.** Regenerate a multi-wine package; confirm techniques/commercial framing/sentence structure vary
  across wines and at least one wine demonstrates a reconcile move.

### R5 — Wire banker/curveball difficulty end-to-end

- **Problem.** GAP 1 residual / F-11: latitude should be "generous on curveballs, strict on bankers," but the
  difficulty signal never reaches the grader. The builder emits no `difficulty`; the type has no such field; the
  scorer's `CURVEBALL_BONUS` is therefore unfed; and the injected latitude conditional currently fires on
  **adjacency only**, not difficulty.
- **TRUE current state.** `stem-answer-key.mjs:218-231` emits a `ground` bucket of `{slot, varieties, is_blend,
  region, country(, style…)}` — **no `difficulty`**. `stem-scoring.ts:26` already declares `difficulty?: Tier`
  on the consumer type and `:65/:284` apply `CURVEBALL_BONUS=2` on a curveball HIT — i.e. the **consumer side is
  ready; the producer side is unfed.** `evaluate-full/route.ts:160` latitude is adjacency-only.
- **Suggested edit (NOT prompt-only — multi-file + data-model).**
  1. Stand up a per-wine difficulty source (a structured field). **None exists today** — `mock_wine_bank.json`
     carries only descriptive `*_curveball` tag *strings*, not a structured `difficulty` field; do not infer
     difficulty from the tag strings.
  2. Emit `difficulty` in the builder `ground` bucket (`stem-answer-key.mjs:218-231`).
  3. Add `difficulty?: Tier` to the `StemKey.ground` bucket type (mirroring `stem-scoring.ts:26`).
  4. Inject difficulty into the `evaluate-full` plausibility block (`:149-166`) and extend the latitude
     conditional to fire on difficulty as well as adjacency: *"on a CURVEBALL a wrong-but-adjacent call earns
     near-full ID-argument marks; on a BANKER latitude shrinks toward correct/near-correct."*
- **Guardrail (carry).** Difficulty must only **modulate** latitude, **never hard-cap** it — do not encode
  "bankers get zero latitude" (EK-0118, UNPROVEN).
- **Why ROI MED / Risk MED.** Real fidelity gain, but multi-file + a data-model change + a missing source. Only
  modulates latitude (no verdict flip), so risk stays MED, not HIGH.
- **Validation.** Backtest: curveball hits earn the bonus; banker latitude visibly narrows; spot-check that
  genuinely hard wines aren't mis-flagged BANKER.

### R6 — Rule-9 structural-scaffold clause

- **Problem.** AT-3. `marking-principles.ts:32` (Rule 9) catches *content* cut-and-paste but not identical
  **sentence-scaffold / maturity-commercial-formula structure** repeated across wines.
- **TRUE current state.** `marking-principles.ts:32`: "near-identical wording, the same technique applied to
  every wine … recycled commercial boilerplate … Mark down failure to differentiate even when each statement is
  individually defensible." Content-level only.
- **Suggested edit (add to Rule 9).** *"This includes structural cut-and-paste: an identical sentence scaffold or
  the same maturity→commercial formula applied verbatim across wines is itself a doubt signal, even when the
  facts differ."*
- **Why ROI LOW / Risk MED.** Low marginal lift over R4, and **BLOCKED**: it must follow R4 **and** a
  model-answer artifact regeneration — and **no batch model-answer regen script exists** in
  `study-app/scripts/` (live generation is the per-question API route; offline answers come from a separate
  Python pipeline, `scripts/generate_mock_answers.py`). The dependency/sequencing cost is the risk.
- **Validation.** After R4 + a regen: confirm exemplars don't share sentence scaffolds; re-grade a clean answer
  to confirm no false scaffold flags.

### R7 — Soft difficulty hint in the pre-glass coach

- **Problem.** PG-3. The pre-glass coach (`pre-glass-prompt.ts`) gives no difficulty steer.
- **TRUE current state.** No difficulty hint in the stem coach.
- **Suggested edit.** A *soft* hint that on harder stems the coach should widen the plausible universe and resist
  premature fixation — wording to be tuned once data exists.
- **Why ROI LOW / Risk LOW (but gated).** Low impact; **GATED on PG-2 telemetry accumulating** (the code logs
  detect-only; needs data before tuning). Do last.
- **Validation.** Once PG-2 data exists, A/B the hint against the baseline coach.

### R8 — Enforce howler→FAIL / cascade→zero (gated two-pass)

- **Problem.** GAP 7 enforcement / F-20. The rubric *names* the hard rules (`marking-principles.ts:36` howler→
  FAIL at borderline; Rule 10 cascade→zero) but they are **detect-only** — `grading-telemetry.ts:55-82` only
  `console.warn`s a mismatch; nothing mutates the streamed verdict.
- **TRUE current state.** `recordGradingOverrideCheck` (`grading-telemetry.ts:58-82`) logs `console.warn` on
  howler+BORDERLINE and on plausibility over/under-credit; the verdict the user sees is whatever the model
  streamed.
- **Suggested change (structural, NOT prompt-text).** A gated **two-pass**: pass 1 decides the verdict (so a
  detected howler+borderline can resolve to FAIL and a cascade can zero the affected conclusion *before* prose is
  written); pass 2 writes the feedback consistent with the enforced verdict. Ship behind a feature flag.
- **Why ROI MED / Risk HIGH.** High potential impact but the **biggest blast radius — it flips PASS/BORDERLINE/
  FAIL verdicts users see** — and the underlying howler-override tendency is **corpus-strong but publicly
  UNVERIFIED** (F-20 / Project 8 F-20). Highest effort (re-architecture) and must be validation-gated.
- **Guardrail (carry).** Do **not** let enforcement flip verdicts until the howler-override tendency is
  validated. Encode it as a strong tendency, not an iron law (F-20).
- **Validation.** Offline replay over historical attempts to measure the howler false-positive rate *before* any
  verdict flips in production; gate behind a flag; compare verdict deltas against held-out human judgement.

### R9 — Fix the stale "65% per paper" doc line

- **Problem.** `mw_exam_guide.md:233` still asserts a per-paper 65% pass, contradicting EK-0116 / F-S1 (the real
  rule is aggregate 65% across the three papers with a ~50% per-paper floor). The grader rubric was already
  corrected (`marking-principles.ts:15`); this doc lags it.
- **TRUE current state.** `mw_exam_guide.md:233`: "absolute **65% pass** per paper (not a curve); FAIL < 50,
  BORDERLINE ~55–64."
- **Suggested edit.** *"absolute pass standard = an **aggregate ~65% across the three papers with a ~50%
  per-paper floor** (criterion-referenced, not a curve) — **not** 65% per paper; FAIL < 50, BORDERLINE ~55–64 as
  a single-paper proxy only."*
- **Why ROI MED / Risk LOW.** Trivial effort, removes a wrong fact; zero code risk (doc only).
- **Validation.** Read-after confirms the aggregate-with-floor wording.

---

## 8 · Guardrails / do-not-do (explicit non-recommendations)

- **Do NOT encode "bankers get zero latitude" as a hard rule.** EK-0118 is UNPROVEN. The difficulty flag (R5)
  must only **modulate** latitude (generous on curveballs, *narrower* on bankers), never hard-cap a banker's
  partial credit to zero.
- **Do NOT let R8 flip user-visible verdicts until the howler-override tendency is validated.** F-20 is
  corpus-strong but publicly UNVERIFIED; enforce only behind a flag, after offline false-positive measurement.
- **Do NOT reintroduce a per-paper 65% standard anywhere.** Respect EK-0116 / F-S1: any pass-standard text must
  be **aggregate 65% across three papers + ~50% per-paper floor**, anchored to the **minimum faculty**, never
  per-paper and never the average of faculties.
- **Do NOT re-do the three ALREADY-DONE items** (plausibility-map injection, corrected pass standard in the
  grader rubric, PG-2 plausibility telemetry) — they are shipped in live code (§1).
- **Do NOT spend effort hardening the `evaluate-answer` route as if it were live** — it has zero client callers.
  Direct grader-fidelity edits at the shared `marking-principles.ts` (consumed by the live `evaluate-full`).

---

*Output: `outputs/research/confidence_implementation_recommendations.md`. Synthesised from
`examiner_confidence_construction_model.md` (§1/§3/§4/§5/§6 ledger), `confidence_prompt_audit.md` (§3/§4 GAP
1–7), and live-code verification this session of `marking-principles.ts`, `answer-evaluation-prompt.ts`,
`model-answer-prompt.ts`, `funnelling.ts`, `grading-telemetry.ts`, `evaluate-full/route.ts`,
`stem-answer-key.mjs`, `stem-scoring.ts`, and `mw_exam_guide.md`. Recommendations only — no code changed.*
