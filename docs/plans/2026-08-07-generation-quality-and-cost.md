# Question & Answer Generation: Quality + Cost Remediation

**Date:** 2026-08-07
**Status:** v5 — Phase 0 built and RUN; the first cross-family calibration reordered the plan
**Branch:** `claude/question-generation-quality-132871`

> **Changelog.** Council review overturned **two** headline findings and forced five structural
> changes. See §10 for the full record of what was accepted, rejected, and why.
> - **CORRECTED (v2):** "the repair loop adds nothing" was a confounded aggregate. Stratified,
>   repair is **2.4–3× better** than a blind re-roll on attempts 2–3 (§1.3). But the sample is
>   selection-biased, so the plan now *investigates and RCTs* repair rather than expanding it.
> - **CORRECTED (v3):** "685 banked, 14 ever served — 2% consumption" was based on a **broken
>   counter**. `served_count` under-records by ~7.5×. True consumption is **126 distinct questions
>   all-time (18%)**, running at **68 distinct/week** most recently (§1.7). Oversupply is ~2×, not
>   ~50×. Phase −1's throttle is correspondingly gentler and Phase 4 is re-scoped.
> - **NEW (v4):** the question *"will this make our questions more often right?"* exposed two gaps
>   the plan had not addressed at all. **§1.6c / §6.2a — 79% of served questions had never been
>   human-reviewed** (`review_state` defaults to `'kept'`; only `review_status` records a human
>   decision), and recency ordering actively preferred them. **Fixed and shipped in this branch.**
>   **§1.6b / Phase 5 — nothing in the system verifies that any claim is true**; 307 banked wines
>   have no external grounding. Added as a new phase.
> - Generation throttle moved to **Phase −1** (immediate) — was Phase 4.
> - The judge must be a **different model family** — Claude cannot grade Claude.
> - The CI hard gate is now a **deterministic replay on frozen artifacts**, because a live-generation
>   gate at N=20 is statistically indefensible — plus a **schema smoke test** that does call a model.

---

## 1. The measured problem

All figures from `generation_attempts`, `generated_questions`, `model_usage`, `bank_bin_reasons`
on the production Neon DB (`wandering-feather-17026214`), 30-day window ending 2026-08-07.

### 1.1 The funnel

| Stage | Count | Note |
|---|---|---|
| Generation attempts (model calls) | 3,422 | |
| Questions created (persisted) | 592 | |
| Passed validators, not retired | 404 | |
| Human-reviewed | 466 (all-time) | 225 still unreviewed |
| **Binned by human on review** | **157 → 33.7%** | |
| Distinct questions actually attempted | **75** | from `user_attempts`, 2 users |

**Cost:** $1,434 / 30 days. $3.55 per usable question; **~$19 per distinct question consumed.**

> ⚠️ **Do not use `generated_questions.served_count`.** It reports 14 all-time serves; `user_attempts`
> reports 126 distinct questions attempted all-time. Of the 75 distinct questions attempted in the
> last 30 days, only **10** carry `served_count > 0` — the counter under-records by ~7.5×. Fixing it
> is a Phase −1 item (§3); every consumption figure in this document comes from `user_attempts`.

### 1.2 Root cause A — prompt caching is off entirely

0.0% cache hit across 3,358 calls. `grep -rn "cache_control" src/` returns nothing.

`empiricalKnowledgeDigest` is *not* used by the generation prompt (only `feedback-analysis-prompt.ts`),
so the static payload is:

```
mockExamWriterAgent        12,859      examinerReportSynthesis  3,693
wineCompositionAnalysis     7,161      sourcingGuide            3,373
curveballAnalysis           1,950      historicalQuestionExamples 1,813
sharedRules                   434      inline static rules     ~5,000
                                                          ───────────
                                                             ~35,000 tokens
```

Against a Sonnet median input of 42,376, **~83% of input is cacheable**. It is loaded once from disk
and memoised in module scope — byte-identical on every call in the process.

The repair path (`question-engine.ts:1255`) already carries the comment *"the system prompt stays
byte-identical as the cacheable prefix."* The intent was there; the breakpoint was never added.

**Blocker:** the system prompt interpolates `${paper}` on its first line
(`question-generation-prompt.ts:492`) and flight size / P3 style / exam-mix before the static bulk at
line 524. The prefix varies per question, so a breakpoint alone would not help.

### 1.3 Root cause B — the retry ladder ⚠️ **CORRECTED IN v2**

`MAX_ATTEMPTS = 8` (`question-engine.ts:1235`). Pass rate declines monotonically:

| Attempt | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| Calls | 1,318 | 1,011 | 524 | 263 | 153 | 87 | 46 | 22 |
| Pass % | 20.5 | 13.0 | 11.6 | 12.5 | 10.5 | 12.6 | 4.3 | **0.0** |

**The v1 claim that "repair adds nothing (15.4% vs 15.3%)" was wrong.** That aggregate compared
repair (which only ever runs *after* a failure) against all blind re-rolls *including attempt 1*.
Council flagged the confound; stratifying by attempt reverses the conclusion:

| Attempt | Blind re-roll | **Repair** | |
|---|---|---|---|
| 2 | 12.3% (119/968) | **29.2% (14/48)** | 2.4× |
| 3 | 10.4% (51/489) | **31.6% (12/38)** | 3.0× |
| 4 | 13.4% (32/239) | 8.0% (2/25) | 0.6× |
| 5 | 11.5% (15/130) | 4.3% (1/23) | 0.4× |
| 6–8 | 10.6% (11/111) | 4.5% (2/44) | 0.4× |

Attempts 2–3 pooled: **repair 30.2% (26/86) vs blind 11.7% (170/1,457)**. Two-proportion z ≈ 5.0,
p < 0.0001. The effect is large and significant.

**Repair works — early. It stops working from attempt 4 on.** And it is barely used: only **48 of
1,016 attempt-2s (4.7%)** were repairs, despite **652 attempt-1 failures being validation failures**
that should have armed `repairContext` (`question-engine.ts:1685`). Roughly 600 retries per month
are being thrown away as blind re-rolls when the evidence says a repair would have tripled their
yield.

**Caveat, and why this is investigation item #1 rather than a fix to ship blind:** the 4.7% figure
may indicate a *telemetry* bug (`isRepair` under-recorded) rather than a *logic* bug. If `isRepair`
is mis-recorded, the 48 observed repairs are a biased subsample and the 3× effect may be an
artifact. Both branches are high-value:
- **Logic bug** → turning repair on properly roughly triples retry yield.
- **Telemetry bug** → every repair measurement in this document is untrustworthy and must be fixed
  before Phase 1 decides anything about the retry ladder.

Separately, **61% of retries re-trip a rule that fired on the immediately preceding attempt**
(1,023 of 1,668 transitions) — consistent with most retries being blind.

### 1.4 Root cause C — Opus parse failures

| model | calls | parse_failed | rate | $/call |
|---|---|---|---|---|
| claude-opus-5 | 522 | 219 | **42.0%** | $1.122 |
| claude-sonnet-4-6 | 2,684 | 33 | 1.2% | $0.148 |

~$245/month buying nothing. Cause documented in the code's own comments
(`question-engine.ts:575–600`): `max_tokens` covers thinking + JSON together, and reasoning consumes
the whole budget — observed `stop_reason=max_tokens`, `blocks=[thinking]`, zero characters of output.
The same comment block notes that **`effort`, not `max_tokens`, is the control that actually moves
generation behaviour** — which is the fix (§5.3), not a bigger buffer.

Sonnet additionally carries a 17% `model_error` rate (458/2,684), undiagnosed.

### 1.5 Root cause D — validators are necessary but insufficient

| rule | fires | distinct questions |
|---|---|---|
| novelty | 794 | 334 |
| variety | 724 | 389 |
| paperScope | 455 | 195 |
| banker | 372 | 276 |
| markMix | 353 | 272 |
| marks | 250 | 201 |

These are real defects. But **33.7% of questions that pass every validator are still binned by the
human**, and `bin_reason_check` upholds the human: 67 of 69 checked bins came back `valid`/`upheld`,
2 `uncertain`, **0 overturned**. Bin reasons: `too_obscure` (18), `duplicate_wine` (7), `too_easy`
(7), `not_realistic` (7), `weak_stem` (6), `factually_wrong` (5).

> ⚠️ Council note: that 67/69 figure is **Claude grading Claude** and is therefore weak evidence for
> the human's correctness. It is treated here as evidence that the checker agrees with the reviewer,
> nothing more. See §4.2.

### 1.6 Root cause E — the answer side

78% of model answers (456/585) need a second LLM pass to fix word count; only 21% come out `clean`.
`answer-length` + `length-check` cost $87/month cleaning up after the generator.

### 1.6b Root cause E2 — **nothing verifies that anything is true** ⚠️ **ADDED IN v4**

Every rule in `answer-content-rules.mjs` checks *structure*: `answer-too-short`,
`answer-missing-wine`, `answer-no-wine-structure`, `answer-misses-identity`,
`answer-identity-partial`, `answer-subpart-coverage`, `answer-placeholder`,
`answer-citation-offtopic`, `answer-truncated`. Not one checks whether a claim is **correct**.

The same holds on the wine side. `wine_bank` provenance:

| source | wines |
|---|---|
| `tavily_research` | 852 |
| `llm_enrichment` | **307** |
| `s1a_import` | 124 |

307 wines carry **no external grounding at all** — pure model recall. Nothing verifies that the
wine exists, that the appellation permits the stated variety, that the ABV is plausible, or that the
vintage was made. `factually_wrong` appears in only 5 of 58 human bin tags, but that is a measure of
*what the reviewer happened to catch*, not of what is actually wrong.

The theory pipeline already solved the shape of this problem — `claims_to_verify` registers every
checkable assertion, and `.claude/agents/claim-verifier.md` checks them against `kb_chunk` and
tier-1 web sources. **The practical pipeline has no equivalent, not even the registry.** This is the
single largest gap between "questions that pass our checks" and "questions that are right", and
Phases 0–3 as originally drafted did not address it at all. It is now Phase 5 (§8b).

### 1.6c Root cause E3 — the review gate never ran on served questions ⚠️ **ADDED IN v4, FIXED**

`generated_questions` has **two** review columns:

| column | default | meaning |
|---|---|---|
| `review_state` | **`'kept'`** | batch-workflow state |
| `review_status` | `'unreviewed'` | whether a human actually decided |

Every serve path gates on `review_state = 'kept'` — which a question satisfies **the instant it is
inserted**. So "passed the review gate" never meant "a human looked at it".

Measured: of the 126 distinct questions ever served, **99 (79%) were `unreviewed`**; 260 of 307
attempts (85%). Against a 33.7% human bin rate, roughly a third of everything studied was material
the reviewer would have thrown away.

Recency ordering made it worse rather than better: unreviewed questions are by definition the
newest, so `ORDER BY created_at DESC` **served the least-vetted material first**.

Separately, `src/app/api/stem-sniper/next/route.ts` had **no review filter at all** — 22 *binned*
questions were reachable through it and no other path.

**Fixed in this branch** (§6.2a), with `tests/serve-reviewed-first.test.ts` pinning it.

### 1.7 Root cause F — oversupply (⚠️ **RESCOPED IN v3**)

The v1/v2 claim of "2% consumption" came from the broken `served_count` counter. From
`user_attempts`, the real picture:

| | value |
|---|---|
| Banked all-time | 685 |
| **Distinct questions attempted all-time** | **126 (18%)** |
| Distinct attempted, last 30d | 75 |
| Distinct attempted, most recent week | **68** |
| Generation rate | ~592/month |
| Consumption rate at current pace | ~295/month |

**Oversupply is ~2×, not ~50×.** Consumption is also *ramping steeply* — 68 distinct questions in
the most recent week versus 12 the week before — so the bank is not dead inventory, it is roughly
10 weeks of runway at current pace.

This materially de-escalates Phase −1 (throttle gently, don't slam the brakes) and re-scopes Phase 4
from "why does nothing get served" to "fix the counter, then right-size supply." It does **not**
change Phases 0–3: caching is still free money, `novelty` is still the #1 blocking rule at 794
fires, and the 33.7% human bin rate is still the real quality problem.

Caveat: 4 users all-time, 2 active. All consumption figures rest on a very small user base and
should be re-read monthly rather than treated as a stable rate.

---

## 2. Strategy

```
Phase −1  Stop the bleeding          ── hours. Throttle generation. Do this today.
Phase  0  Build the measurement loop ── prerequisite for every quality claim
Phase  1  Cost + retry structure     ── ~55% spend cut, quality-gated
Phase  2  Quality at source          ── raise first-pass, cut human bin rate
                                        §6.2a (serve reviewed-first) ALREADY SHIPPED
Phase  3  Close the loop             ── CI + weekly regression
Phase  4  Right-size supply          ── match generation to consumption
Phase  5  Fact verification          ── the only phase that makes answers TRUER
```

**A note on what this plan does and does not do.** Phases −1 through 4 make the pipeline cheaper,
more structurally valid, and better gated. They do **not** make a wine fact correct. Only §6.2a
(shipped) and Phase 5 change how often what reaches a candidate is actually *true*:

| goal | which phase | status |
|---|---|---|
| Cheaper | 1 | ~$1,000/mo |
| Structurally valid (scope, marks, variety) | 2 | first-pass 20.5% → 40% target |
| Fewer *bad* questions reaching the candidate | **6.2a** | **shipped** — was 79% unreviewed |
| Claims that are actually **true** | **5** | not started; error rate unmeasured |

Council pressed hard for throttling first. With the v3 correction the case is weaker than it looked
(2× oversupply, not 50×) but still holds: generation outruns consumption ~2:1, and `MAX_ATTEMPTS=8`
is pure waste regardless of demand.

---

## 3. Phase −1 — Stop the bleeding (today, hours)

1. **`MAX_ATTEMPTS: 8 → 3`.** Attempts 4–8 (571 calls) produced 62 questions at 9.2 calls each vs
   4.9 on attempt 1, and repair is actively harmful past attempt 3 (§1.3). Unconditional win.
2. **Fix `served_count`.** It under-records ~7.5× (§1.1) and every supply-sizing decision downstream
   depends on it. Backfill from `user_attempts`, then fix the increment path.
3. **Throttle the bank worker to ~1.2× measured consumption** — roughly 350/month against the
   current ~295/month, re-read weekly. Do *not* stop generation: user-triggered generation, Live
   Tasting, and the banked-fallback path in `generateFreshQuestion` all need a working generator, and
   consumption is ramping steeply (68 distinct in the most recent week vs 12 the week before).
4. **Resolve the repair telemetry question** (§1.3 caveat) — a read of `question-engine.ts:1263–1690`
   plus a targeted query. Gates Phase 1's retry design.
5. **Verify attempt-4 context hygiene** (council): with repair disabled past attempt 3, confirm that
   attempt 4's blind re-roll starts from a genuinely clean context and does not carry the three prior
   failed drafts. If it does, that is context poisoning and likely explains the late-attempt collapse
   to 0%.
6. **Freeze the golden-set snapshot now**, before any change alters the distribution.

**Exit:** `MAX_ATTEMPTS=3` deployed; `served_count` accurate; bank worker tied to measured
consumption; repair telemetry question answered with evidence; attempt-4 context verified clean;
golden set hashed and committed.

---

## 4. Phase 0 — Build the measurement loop ✅ **BUILT (scoring half)**

**Goal:** a repeatable offline eval that scores a generation config against human-labelled ground
truth, so every later change is measured rather than asserted.

> **Status.** The truth anchor, the scoreboard, the golden set and the judge calibration harness are
> **built, tested (75 tests) and committed** under `study-app/evals/`. See `evals/README.md`. What
> remains is the generate-N-and-score runner (`run.ts`) and a live calibration number, both of which
> need credentials this environment did not have. Detail inline below; §4.6 records what is NOT done.
>
> The motivating fact: **15 bin-fix proposals have already shipped to production and nobody can say
> whether any helped.** First-pass rate is 20.5% and human bin rate 33.7% after all fifteen. A loop
> that changes things without a scoreboard is not a self-improving loop, it is drift with paperwork.

### 4.1 The golden set

We already own a labelled dataset and barely use it: **309 `kept` + 157 `binned`**, the bins carrying
`reason_tags` and free-text notes.

Freeze `study-app/evals/golden/questions.jsonl`, content-hashed, stratified by paper × family ×
verdict:

| split | n | negatives | use |
|---|---|---|---|
| `calibration` | ~150 | ~50 | tune the judge rubric |
| `holdout` | ~150 | ~50 | measure the judge; never tuned on |
| `regression` | ~166 | ~57 | CI replay gate |
| `synthetic_floor` | 20 (new) | 20 | deliberately corrupted — a sanity floor |

**The `synthetic_floor` split is a council addition and is load-bearing.** Twenty questions
deliberately corrupted in ways that are objectively wrong regardless of reviewer taste: hallucinated
appellations, marks that don't sum to 25×wines, a red wine in Paper 1, a stem that contradicts its
own wine list. **A judge that misses these is unfit at any κ.** This gives us an objective floor that
does not depend on one reviewer's subjective judgement.

### 4.2 The judge — cross-family, by requirement

**The judge MUST be a different model family from the generator.** Council flagged the existing
`bin_reason_check` (Claude grading Claude, 0/69 overturned) as epistemically closed: correlated
biases mean a Claude judge will systematically ratify Claude's own stylistic tics and
hallucinations. Use **Gemini 3.1 Pro** (already wired via the council MCP) or a GPT model as the
primary judge; Claude may run as a *second* opinion, and disagreements between families are the most
informative rows in the whole eval — route them to the human.

Six dimensions, derived from the observed bin reasons: `exam_realism`, `wine_plausibility`,
`obscurity_calibration`, `stem_quality`, `factual_accuracy`, `answer_fidelity`, plus a `keep`/`bin`
verdict.

**Naming honesty (council):** with one labeller we cannot measure objective correctness, only
agreement with this reviewer. The headline metric is therefore named **`reviewer_alignment`**, not
"accuracy". `factual_accuracy` keeps its name only because the `synthetic_floor` split gives it an
objective anchor.

**Calibration procedure:**

1. Tune the rubric on `calibration` only.
2. Score `holdout`. Report **Cohen's κ with its 95% CI**, and **bin-recall with its 95% CI**.
3. **Gate on the lower CI bound, not the point estimate.** With ~50 negatives, an observed recall of
   0.80 has a 95% CI of roughly **[0.66, 0.90]** — the judge could be missing one bad question in
   three and we would not know. Requirement: **lower bound of bin-recall CI ≥ 0.70**, and **κ point
   estimate ≥ 0.6**.
4. **`synthetic_floor` recall must be 20/20.** No exceptions, no CI — these are objectively wrong.
5. If holdout κ falls >0.1 below calibration κ, declare overfit and revert the rubric.
6. Commit the run to `evals/reports/judge-calibration-{date}.json`.

**If the judge cannot clear these bars, it does not gate anything.** Phase 2.2's pre-bank gate does
not ship, Phase 3's CI falls back to deterministic metrics only, and that is recorded explicitly
rather than quietly relaxed. Given ~50 holdout negatives, **this is a realistic outcome and the plan
must survive it** — which is why every hard gate below is deterministic.

**Widening the label base** (the real fix for N=1, over time): every human review decision from here
on is appended to the label store, and the weekly job (§7.2) grows the set. Revisit split sizes at
n≥800.

### 4.3 The truth anchor — `evals/corpus-anchor.ts` ✅ **BUILT**

**The one component that cannot be gamed by a model.** A generate → judge → fix loop with an LLM at
both ends optimises toward the judge's taste; the corpus distribution does not move when models
drift. So it is the loop's primary gate, and the judge is advisory beneath it.

**162 real IMW questions**, 2011–2026, from `data/exams.json`. (CLAUDE.md's "112" refers to the
subset with decision matrices; the parsed corpus holds 162 and all are used.)

Features are extracted with the **same functions the app uses on generated questions** —
`deriveMarkFocus`, `deriveQuestionType`, `deriveQuestion` — never a parallel implementation. A
second parser would drift, and a fidelity score computed through two lenses measures the lenses.

Five axes, each scored by **total variation distance**: flight size · dominant mark category ·
question type · sub-parts per question · stem length. TVD is bounded, symmetric, needs no smoothing
(KL is infinite the moment a batch omits a category, which happens constantly at n=60), and reads
plainly — *0.12 means 12% of the questions are in the wrong bucket*.

**The noise floor is what makes it usable.** A TVD of 0.15 can be perfect: two samples from the same
distribution differ, and at n=60 they differ a lot. Each axis therefore carries a floor measured by
repeatedly drawing *real* samples of the batch's size and scoring them against the corpus.
`withinNoise` means statistically indistinguishable from a real sample. A fixed threshold would
just be measuring sample size.

Verified in both directions (`tests/evals-corpus-anchor.test.ts`): a genuine slice of the real
corpus must **not** trip drift (the false-positive guard — without it every scorecard is noise and
the loop chases phantoms), and an obviously wrong batch must.

### 4.3b The scoreboard — `evals/scorecard.ts` ✅ **BUILT**

Three rules, each enforced in code and pinned by tests:

1. **Nothing is a win inside the noise.** Comparisons run against the baseline's own run-to-run
   spread (≥3 runs, 2σ). A pipeline wandering 20→26→19% between *identical* runs has not improved
   when it lands on 26%. Below 3 baseline runs the verdict is `NO_BASELINE` and nothing may be
   called a win — this is the most common way an eval loop fools the person running it.
2. **Corpus fidelity outranks the judge.** Fidelity drift alone produces `REGRESS`; a metric flagged
   `advisory` never can.
3. **A regression names itself.** No aggregate score; every metric is diffed on its own row.

Other deterministic metrics it carries: first-pass validator rate, per-rule fire rate, cost per
accepted question, answer length band-hit rate, prompt tokens, cache-hit rate, novelty pressure.

### 4.4 The runner

`npm run eval -- --config <name> --n 60`:

1. Generate N against a named config (model, prompt version, MAX_ATTEMPTS, caching on/off)
2. Score with judge + deterministic metrics
3. Replay the frozen golden set through the judge — **judge-drift check**
4. Emit `evals/reports/{date}-{config}.json` + markdown scorecard
5. Diff against a named baseline, PASS/REGRESS per metric

**Determinism:** pin temperature, pin the wine-bank snapshot and avoid-list seed, record
`prompt_version`/`spec_version` in every report. Baseline is N≥3 runs with reported variance; **no
metric is called moved unless it clears 2σ.**

### 4.5b Statistical defects found by council review, and fixed

The first build of the harness was statistically wrong in four ways, each of which would have made
it **confidently misleading** rather than merely imprecise. All four are fixed and pinned by tests.

| # | Defect | Consequence | Fix |
|---|---|---|---|
| 1 | **Multiple comparisons ignored.** 5 axes × 3 papers = 15 drift tests, each cut at p95 | Family-wise false-drift rate **53.7%** — over half of healthy runs reported REGRESS. A gate that cries wolf that often gets re-run until green | Bonferroni: per-test quantile `1 − α/K`. Measured family-wise rate now <15% (`evals-metrics.test.ts`) |
| 2 | **"2σ" applied at n=3.** A z-threshold on a 3-run baseline | At df=2 the true 95% critical value is **4.303**, so "2σ" was really an ~82% test — rampant false IMPROVED and false REGRESS | Student's *t* **prediction** interval: `t(n−1)·√(1+1/n)`. `MIN_BASELINE_RUNS` raised 3 → 5 (at n=3 the threshold is ~4.97σ, so a 3-run baseline can barely fail anything) |
| 3 | **Zero-spread baseline → `Infinity` σ.** Deterministic metrics have sd=0 | 0.800 → 0.801 divided by zero and reported a confident **IMPROVED** for floating-point jitter | Every metric now declares `minRelevantDelta`; a change must clear **both** practical and statistical significance |
| 4 | **Noise floor built from a subsample of its own reference.** Drawing 60 from 162 and scoring against the same 162 | Sample and reference ~37% shared ⇒ correlated ⇒ TVD biased **low** ⇒ floor too tight ⇒ more false REGRESS, compounding #1 | Parametric bootstrap: resample i.i.d. from the corpus's categorical distribution. Trials raised 200 → 4,000 since the corrected quantile sits far out in the tail |

Two further fixes from the same review:

- **`markFocus` used argmax**, collapsing a 40/30/30 mark split and a 100/0/0 split to the same
  bucket — so a generator emitting only monolithic single-focus questions would have scored
  *perfect* fidelity. Now compares the batch's **average mark distribution** against the corpus's.
- **The judge could pass on recall alone** by binning aggressively. Added a `maxFalseBinRate` ceiling
  (25%): recall and precision are now bounded together, because an over-strict pre-bank gate starves
  the pool just as surely as a lax one floods it.

### 4.5c Known limitations — stated, not solved

1. **Shared feature extractors.** The anchor deliberately uses the app's own `deriveMarkFocus` /
   `deriveQuestionType` / `deriveQuestion`. If one of those has a bug, generated and real questions
   are parsed through the *same* broken lens and the fidelity score cannot see it. The alternative —
   a second parser — drifts, and then the score measures the lenses rather than the questions. This
   is a real trade-off with no free answer; the mitigation is that the parsers are separately tested
   and the anchor asserts >85% bucketing coverage on the real corpus.
2. **The synthetic floor is template-applied**, so a judge could in principle learn "flag stems that
   begin *all made from*" rather than reasoning about wine. It is a **floor**: passing proves minimal
   competence, not excellence. Generating corruptions with a different model would harden it.
3. **Self-preference bias is unmitigated** while the judge shares the generator's family. The golden
   set *is* generated questions with human labels, so calibration does test "can it judge Claude's
   output as the human would" — but a Claude judge may still systematically favour Claude's habits.
   Only a cross-family judge fixes this.
4. **Structural fidelity is not correctness.** A question can be perfectly corpus-shaped and
   factually wrong. The anchor cannot see that; Phase 5 (§8b) is what addresses it.

### 4.5d First live calibration — the judge failed its bars and found something worse ⚠️

Run 2026-08-07: **Gemini 3.1 Pro** (cross-family), calibration split, 60 real + 20 synthetic.

```
scored           72/80 (8 unparsed)
Cohen's κ        0.036          bar ≥ 0.60   ✗
bin-recall       70.6%  95% CI [46.9%, 86.7%] on 17 negatives
  lower bound    46.9%          bar ≥ 0.70   ✗
false-bin rate   21.1%          bar ≤ 25%    ✓
synthetic floor  17/17          bar perfect  ✓
VERDICT: NOT QUALIFIED — advisory only
```

**The judge is objectively competent and disagrees with the human anyway.** It caught every
deliberately-corrupted question (17/17) while binning only 21% of good questions on craft grounds —
so it is neither incompetent nor trigger-happy. The near-zero κ is not noise: **the judge and the
reviewer are measuring different things.**

**17 of ~55 human-kept questions (≈31%) were binned for a specific, checkable factual fault.**
Two were independently verified against tier-1 sources before writing this:

| Question | Generated | Verified reality |
|---|---|---|
| `gen_p1_F2_…770` | "Thierry Germain, **Saumur Blanc** Les Memoires, 2021 (13.5%)" | Les Mémoires is a **Saumur-Champigny RED**, 100% Cabernet Franc (Kermit Lynch, Radford Dale, JJ Buckley). **The wine does not exist as a white** — a real cuvée name welded to the wrong colour and appellation, in a white-only paper |
| `gen_p1_F1_…206` | "Felton Road Block 1 Riesling 2023 **(13.0%)**" | Block 1 is **8.5% ABV, 67 g/L RS** — the estate's sweet cuvée (wineanorak, with numbers) |

Others flagged but not yet adjudicated: Contino Blanco called Garnacha Blanca (it is Viura-dominant);
Bordeaux Supérieur Blanc used for a dry white (the appellation is moelleux); stainless-steel
fermentation attributed to Koehler-Ruprecht (a large-oak house).

**Every one of these passed all 22 validators AND was kept by the reviewer.**

**What this means, in order of importance:**

1. **§1.6b is now measured, not inferred.** Roughly a third of *kept* questions carry a disputed
   factual claim. Even if only half survive adjudication, that is a ~15% factual error rate in
   material candidates are studying. **Phase 5 is no longer the last phase — on this evidence it is
   the most important one in the document.**
2. **The 33.7% human bin rate UNDERSTATES the defect rate.** A reviewer scanning dozens of questions
   cannot check every ABV, appellation and cépage. The human labels are a strong reference for exam
   *craft* and a weak one for *fact*.
3. **κ against human labels is the wrong qualification bar for `factual_accuracy`.** The obvious
   next move — tune the rubric until κ rises — would have meant **training the judge to stop
   noticing real errors**. That is the single most dangerous thing this project could do, and the
   loop the user proposed would have done it automatically and invisibly.
4. **Cross-family paid for itself on the first run.** A Claude judge scoring Claude's own output had
   already produced 0/69 overturned bins. An independent model found a systematic defect class in
   an afternoon.

**Harness change made in response.** `falseBinRate` now excludes *disputed* bins — human-kept
questions the judge binned while scoring `factual_accuracy ≤ 2`. Those are **claims to adjudicate,
not judge errors**: counting them as errors would disqualify a judge for out-performing its own
reference. They surface as their own `disputed` list for a human to rule on. Before this change the
same run reported a 75% "false-bin rate" and looked like a broken judge; it was a working one.

### 4.5e Holdout — the finding replicates on a second, independent judge

The `gemini-3.1-pro` daily quota (250 requests/model) was exhausted, so the holdout was scored by
**gemini-3.6-flash**: a *second* cross-family judge on a split never used for tuning.

| | calibration (3.1-pro) | **holdout (3.6-flash)** |
|---|---|---|
| scored | 72/80 (8 unparsed) | **171/171, zero unparsed** |
| Cohen's κ | 0.036 | **0.037** |
| bin-recall | 70.6% [46.9, 86.7] | 49.0% [35.9, 62.3] on 51 negatives |
| false-bin rate | 21.1% | 17.0% |
| **disputed (kept, binned on fact)** | ~31% | **28% (28 of 100)** |
| synthetic floor | 17/17 | **20/20** |

**Two different models, two different question sets, the same three conclusions:** perfect on the
objective floor, κ ≈ 0.04 against the reviewer, and a factual fault in **28–31% of kept questions**.
A single run could have been a quirk of one model's priors. Two cannot.

**Adjudication now 7 for 7** (§ `evals/adjudications/`), including two from the holdout that are
worse than anything in the calibration set:

- **`Jean-Louis Grippat, 2022`** — Grippat retired in 2001 and sold the entire domaine to Guigal
  (his own words; Wine Spectator; Wikipedia). The estate ceased to exist **21 years before the
  stated vintage**. Producer, appellation and vintage are each individually plausible, so no
  string-matching validator can catch it.
- **`Le Clos Jordanne` Riesling** — the producer makes *"wine from only these two grape varietals"*,
  Chardonnay and Pinot Noir, per their own site.

Confirmed defect classes: wrong colour/appellation for a real cuvée · impossible ABV · wrong
dominant variety · appellation rules violated · winemaking inverted · **producer defunct at the
stated vintage** · **variety the producer has never made**. All resolvable against a producer sheet
or knowledge base. None a matter of taste. **None caught by the 22 validators or the reviewer.**

**Parse loss: fixed.** The 8/80 failures were misdiagnosed as truncation; 42 of 44 across runs were
HTTP 429s. Retry-with-backoff honouring the API's `retryDelay`, plus `maxOutputTokens` 2048 → 8192
(Gemini 3.1 Pro reasons before answering and thinking shares that budget — the same failure class
as Opus in §1.4). Result: **171/171 scored, zero unparsed.**

**Operational constraint discovered:** free-tier Gemini caps **250 requests per model per day**. One
full split is ~171 items, so two runs of one model exhausts the day, and the error is a hard 429
("retry in 18h50m"), not a throttle. Budget the day, or spread across models via `--model` — but
note that changing model changes the judge.

### 4.6 What was built, and what was not

**Built, tested, committed** (`study-app/evals/`, 75 tests, tsc clean):

| component | file | notes |
|---|---|---|
| Truth anchor | `corpus-anchor.ts` | 162 real questions, 5 axes, sample-size-calibrated noise floors |
| Distribution math | `metrics.ts` | TVD, seeded bootstrap, Wilson CI, Cohen's κ — pure and deterministic |
| Scoreboard | `scorecard.ts` | 2σ discipline, advisory flags, markdown render + baseline diff |
| Golden set | `golden.ts` + `scripts/build-golden-set.mjs` | **486 items frozen**, hash `3be7665113dbfc58` |
| Judge + calibration | `judge.ts` + `scripts/calibrate-judge.mjs` | pluggable provider; bars enforced in code |

Golden set as actually built: `calibration` 151 (51 bin) · `holdout` 151 (51 bin) · `regression` 164
(55 bin) · `synthetic_floor` 20. **Holdout has 51 negatives** — above the 40 minimum, so the split
can in principle gate, but the CI is still wide and §4.2's lower-bound rule is doing real work.

**Not built, and why:**

1. **`run.ts`, the generate-N-and-score runner.** The scoring half is complete; the generation half
   should land *after* Phase 1's caching restructure, or the baseline has to be established twice.
2. **A live calibration number.** The harness runs end-to-end but needs `ANTHROPIC_API_KEY`, which
   this environment did not have. Until it runs, the judge is unqualified — which is exactly what
   the code already assumes.
3. **A cross-family judge.** `grep -rn "GEMINI\|OPENAI" src/` returns nothing: the app is
   Claude-only. Shipped as a pluggable `JudgeProvider` with Claude as a loudly-flagged default
   (`crossFamily: false`, warning banner on every scorecard). Adding a key flips the flag.

**Exit:** golden set frozen + hashed with 4 splits ✅; judge clears §4.2 bars on holdout *or* is
formally declared non-gating (**currently non-gating, by default** — pending a live run); baseline
scorecard at N≥3 with variance (pending `run.ts`); eval runs <$5 and <15 min.

---

## 5. Phase 1 — Cost + retry structure

Gated on **no judge-score regression** vs the Phase 0 baseline. A cost change that costs quality does
not ship.

### 5.1 Prompt caching

Restructure `buildQuestionGenerationPrompt` into four ordered segments:

| seg | content | cache |
|---|---|---|
| S1 universal static | `mockExamWriterAgent`, `sharedRules`, `wineCompositionAnalysis`, `examinerReportSynthesis`, `curveballAnalysis`, `sourcingGuide`, paper-agnostic rule blocks (lines 575–820) | `cache_control: ephemeral` |
| S2 per-paper static | `paperScope`, `markEmphasis`, `historicalQuestionExamples[pN]`, P3 style catalogue | `cache_control: ephemeral` |
| S3 per-question dynamic | flight size, P3 draw, exam mix, single-wine suppression, variety constraint | — |
| S4 volatile | avoid-list, latest question, novelty block, repair context | user message |

**Two breakpoints is correct, not wasteful.** One council pass claimed only the final static block
should carry `cache_control`; that is wrong for a nested-prefix layout. S1 is shared by all three
papers (one cache entry, ~35k tokens, hit by every call); S2 is three per-paper entries built *on
top of* S1. Anthropic supports up to 4 breakpoints and this is the canonical use of 2. Rejected.

Projected, volume held constant:

| | now | after | basis |
|---|---|---|---|
| Sonnet | $0.148/call | ~$0.054 | 35k cache-read + 7.4k fresh + 1,445 out |
| Opus | $1.122/call | ~$0.646 | 35k cache-read + 22k fresh + 3,507 out |
| question_generation 30d | $984 | ~$478 | |
| model_answer 30d | $311 | ~$155 | |

**~$660/month**, before the Phase −1 volume cut compounds it.

**Hardening (all council-sourced):**
- A test that **fails if any interpolation appears before the S1/S2 breakpoint** — this is the
  regression that would silently return us to 0% hit rate. Pattern: `vercel-crons.test.ts`.
- A **byte-stability test**: build the prefix twice in one process and assert identical bytes.
  `JSON.stringify` does not guarantee key order across object constructions; any serialised context
  in the prefix must go through a key-sorted serialiser.
- Assert `cache_read_tokens > 0` on ≥90% of calls in the weekly regression, not just at rollout.
- Verify the Anthropic SDK path is not subject to Next.js `fetch` caching (`cache: 'no-store'`), and
  that `BUDGET_MS` / Vercel function timeouts still hold with the restructured prompt.

### 5.2 Retry structure — rebuilt around the corrected finding

- `MAX_ATTEMPTS = 3` (already in Phase −1).
- **Do NOT expand repair until the RCT reads out.** Council's position, and it is right: at a 4.7%
  fire rate the observed repairs are a severely biased subsample. The most likely alternative
  explanation is that **the 4.7% were easy failures** (a mark that didn't sum, one wine out of scope)
  while the 95.3% blind re-rolls were structural failures that repair cannot fix. Forcing structural
  failures into a repair flow on the strength of this sample could *lower* the pass rate. The 3×
  figure is a hypothesis worth testing, not a finding worth shipping.
- **Never repair past attempt 3** — repair underperforms blind re-rolls from attempt 4 (0.4–0.6×).
  With `MAX_ATTEMPTS=3` this is automatic, but encode it explicitly so raising the cap later cannot
  silently reintroduce the harm.
- **Validate the repair-vs-re-roll decision with a real RCT, not more observational data.** Council
  was right that the observational comparison is confounded in both directions. At the moment of a
  validation failure, randomise: 50% repair, 50% blind re-roll with identical parameters. Log the
  arm. This is cheap (it rides on traffic we already generate) and it is the only design that
  settles the question. Run until ≥200 per arm.
- Test **repair-block-at-front** vs the current at-end placement: today the repair instruction sits
  at the tail of a ~40k-token user message. Dilution is a live hypothesis.
- **`marks` / `markMix` (~600 fires/mo): repair in code, with a hard safety condition.** Council
  correctly warned that silently rewriting mark values can desynchronise the rubric from stem prose
  ("*Provide 10 descriptors*" vs a mutated 12/13 split). Therefore: apply the deterministic fixer
  **only when the mark figures appear nowhere in the stem or sub-bullet prose** — detectable with the
  existing mark-notation parsers. When prose references marks, **reject and re-draw**. Add a test
  asserting the fixer refuses prose-coupled cases.

### 5.3 Opus parse failures

- **Cap reasoning effort; do not simply raise `max_tokens`.** Council's point — a bigger buffer gives
  reasoning more room to ramble before hitting the new ceiling — matches the codebase's own comment
  that `effort` is the control that actually moves generation behaviour. Lower `GENERATION_EFFORT`
  for Opus and re-measure; raise `max_tokens` only as a secondary safety margin.
- **Parse-failure circuit breaker:** rolling 50-call parse rate < 80% → route to Sonnet + admin
  flag. Turns a silent $245/mo leak into an alert.
- Diagnose the Sonnet 17% `model_error` rate; `model_error` and `parse_failure_sample` are already
  recorded — group and fix the top cause.

### 5.4 Model routing

Opus passes at 19.2% vs Sonnet 13.4%, at 7.6× the price. Let the harness decide on judge-score per
dollar across Sonnet-only, Opus-only, and Sonnet-draft → Opus-repair.

**Exit:** ≥90% cache hit; 30-day projected spend ≤$600; Opus parse-fail <5%; repair RCT running with
a logged arm; judge score within 2σ of baseline.

---

## 6. Phase 2 — Quality at source

Premise: a rule firing 455 times is a **prompt failure**, not a validator success.

### 6.1 Attack the top rules individually

Each gets a root-cause read of real violating drafts → targeted prompt fix → harness A/B.

| rule | fires | hypothesis |
|---|---|---|
| `novelty` (794) | Avoid-list is truncated prose. Test a structured "contrast axes already used in this family" list. Also inflated by over-generation — Phase −1 should reduce it on its own, so **re-measure after Phase −1 before spending effort here.** |
| `variety` (724) | The constraint sits at line 809, ~35k tokens deep, *after* the text it claims to override. Hoist into S3. |
| `paperScope` (455) | The P3 rule is long, hedged, and has previously been self-contradictory (the file's own comments record an instance where it demanded still-dry wines *and* called them automatic failure). Replace prose with a checklist plus one worked positive and one negative example. |
| `banker` (372) | Model doesn't know the banker list. Inject an explicit benchmark-appellation list per paper. |
| `marks`/`markMix` (603) | Arithmetic — code fixer with the prose-coupling guard (§5.2). |

**Prompt size: tracked, not gated.** Council was right that a hard size-neutrality rule invites
"prompt golf" — engineers deleting whitespace and clarity to pass CI — and that optimising prompt
size while yield sits at 20% is the wrong side of the equation. If 500 tokens of worked examples fix
`paperScope`, spend them. Total prompt tokens stay a first-class *reported* scorecard metric so
dilution remains visible, and cost is already gated directly by cost-per-accepted-question.

### 6.2a Serve reviewed questions first — **SHIPPED IN THIS BRANCH**

The highest-value fix in this entire document, and it needed no LLM, no calibration, and no model
call. Per §1.6c, 79% of served questions had never been reviewed, and recency ordering actively
preferred them.

Applied to all five serve paths:

| path | change |
|---|---|
| `db.ts` `getEligibleBankedQuestions` | `ORDER BY (q.review_status = 'kept') DESC, q.created_at DESC` |
| `db.ts` `getUnansweredQuestions` (×2) | reviewed-first ahead of `created_at ASC` |
| `db.ts` `getQuestionsByFilter` (×2) | reviewed-first ahead of `created_at DESC` |
| `stem-sniper/drill/produce.ts` | reviewed-first ahead of `random()` |
| `stem-sniper/next/route.ts` | **added the missing `review_state = 'kept'` gate** + reviewed-first |

**A preference, not a filter.** A hard filter would cut the servable pool from 550 to 309 and could
starve a candidate mid-session — a worse failure than one unvetted question. Unreviewed questions
remain reachable as fallback, behind every human-approved one.

`tests/serve-reviewed-first.test.ts` pins both invariants (reviewed-first must be the *first* ORDER
BY key, or recency dominates and the preference does nothing; and no serve path may read the bank
without a `review_state` gate). Verified by mutation: reverting any one ORDER BY fails the test.

Retiring the unreviewed fallback entirely becomes safe once the review backlog is cleared (§8) —
track it, but do not force it while the backlog stands at 225.

### 6.2b Close the validator↔human gap

33.7% human bin rate on validator-passing questions is the real quality number.

Use the calibrated judge as a **pre-bank gate**, quarantining what it would bin before the human sees
it — **only if** it cleared §4.2 (lower CI bound on bin-recall ≥ 0.70 *and* 20/20 on
`synthetic_floor`). Otherwise the judge only **orders the human's review queue** (highest-risk
first), which is valuable, carries no gating risk, and is the fallback if calibration fails.

With §6.2a shipped, this gate is now a second line of defence rather than the only one — which is
the right dependency structure, since §4.2 flags judge calibration as likely to fail at ~50 holdout
negatives.

Feed `too_obscure` (18) and `not_realistic` (7) — the top two bin reasons, both about *wine choice* —
into the wine-selection prompt as explicit negative exemplars.

### 6.3 The answer side

- Put the **explicit target word count for this specific question** in the prompt (it is deterministic
  from marks) plus a worked example at that length, rather than a general rule.
- Target `clean` ≥60% (from 21%), retiring most of the $87/mo correction pass.
- Add `answer_fidelity` to the judge — does the answer address every sub-part, in order, at the right
  mark weight. Nothing checks this today.

**Exit:** first-pass validator rate ≥40% (from 20.5%); `paperScope` + `variety` fires down ≥60%;
human bin rate ≤15% on a fresh 60-question sample; answer `clean` ≥60%.

---

## 7. Phase 3 — Close the loop

### 7.1 CI gate — deterministic hard gate, live eval advisory only

Council killed the v1 design, correctly. At a 20% base rate, N=20 gives ~1.8 expected-pass standard
deviation ≈ **9 percentage points**. A 5-point hard gate would fail neutral PRs a third of the time
and teach everyone to re-run until green. Detecting a true 5-point drop from 20% at 80% power needs
**N ≈ 1,000** — far beyond a PR budget.

So the gate is restructured:

**Hard gate 1 — deterministic replay, zero sampling noise, free.** On PRs touching
`src/lib/prompts/**`, `question-rules.mjs`, `question-engine.ts`, `question-validator.ts`:
- Replay the **entire frozen regression split** through the changed validators/prompt builder. No
  generation, no model calls, no RNG — same inputs, same outputs, every time.
- Hard-fail on: cache-breakpoint test, byte-stability test, marks-fixer prose guard.
- **Rule fire rates are a SNAPSHOT test, not a threshold.** Council caught a real trap here: a
  developer who *fixes* a validator bug (say the appellation check was missing half its cases) makes
  the fire rate jump 50% and would be punished for the fix. Instead, any fire-rate change halts the
  build until a developer **explicitly re-baselines the snapshot in the PR** — which is exactly the
  `validator-blast-radius-before-merge` memory: the blast radius must be seen and accepted, not
  silently allowed or blindly blocked.

**Hard gate 2 — schema smoke test (does call a model, ~$0.15).** The deterministic gate has a real
blind spot: it proves the prompt *built* correctly, not that a model can still *answer* it. A prompt
edit that confuses the model into malformed JSON or a changed output shape passes replay and breaks
production instantly. So: generate **3 questions live** and hard-fail on parse failure or base-schema
violation only. **Never gate this on quality** — at N=3 it says nothing about quality, and gating it
would reintroduce the statistical illiteracy this section exists to remove.

**Advisory — live eval, reported not gated.** A 20-question live run posts a scorecard diff as a PR
comment, explicitly labelled *directional, underpowered, N=20*. It never fails a build.

**Cost/accepted-question** is gated only on the weekly N=60 run, and only outside 2σ of the
trailing baseline.

### 7.2 Weekly regression

GitHub Actions `schedule:` (never a Vercel cron above daily — CLAUDE.md), Sunday:

1. Full eval N=60 — still underpowered for small effects; report **effect size with CI**, and only
   open an issue outside 2σ of the trailing 4-week baseline.
2. Judge-drift check against the frozen golden set.
3. Append the week's human review decisions to the label store (this is how N=1 → N=large over time).
4. Assert cache hit rate ≥90%.
5. Post scorecard to the admin UI.

### 7.3 Recalibration

Monthly, against newly-labelled questions. If κ drifts below 0.55, the judge's **gate authority is
automatically suspended** (deterministic-only fallback) and an issue opens. The judge must never
decay silently into a rubber stamp.

**Exit:** hard gate demonstrated to block a deliberately-regressive PR; two consecutive clean weekly
runs; recalibration live with automatic suspension.

---

## 8. Phase 4 — Right-size supply (⚠️ **RESCOPED IN v3**)

The v1/v2 version of this phase asked "why is nothing being served?" — a question built on the broken
`served_count`. The real answer is that questions *are* being served (126 distinct all-time, 68 in
the most recent week); the counter just didn't say so. Phase −1 fixes the counter and sets the
throttle. What remains here is narrower:

- **Re-audit eligibility against the corrected numbers.** The `question-pool-eligibility` memory
  records that the eligible pool is smaller than the banked count. With 685 banked and 126 ever
  attempted, quantify how much of that gap is eligibility filtering versus simply not having been
  reached yet at ~68/week.
- **Clear the 225-question review backlog**, with the judge ordering the queue by risk.
- **Re-read the throttle monthly.** Consumption went 12 → 68 distinct/week in a fortnight on a
  2-active-user base. A supply target tied to a rate that volatile needs regular re-reading, and the
  failure mode of under-supply (a candidate who can't get a fresh question) is worse than the failure
  mode of over-supply (wasted spend, already capped by Phases 1–2).

**Exit:** eligibility gap quantified and explained; review backlog <50; throttle on a monthly
re-read cadence with an under-supply alarm.

---

## 8b. Phase 5 — Fact verification ⚠️ **NOW THE TOP PRIORITY (v5)**

**This is the phase that actually makes questions and answers more often *right*.** Everything in
Phases 0–4 targets structure, cost, and gating. Per §1.6b, nothing in the system checks whether a
single claim is true, and 307 banked wines have no external grounding whatsoever.

> **Promoted from last to first on measured evidence (§4.5d).** The first cross-family judge run
> disputed a factual claim in **~31% of human-KEPT questions**, and the two claims verified against
> independent sources were both correct — including a wine that does not exist in the colour and
> appellation given, sitting in a white-only paper, past all 22 validators. Sequence this ahead of
> Phase 2's prompt work: raising the first-pass validator rate on questions that are factually wrong
> optimises the wrong thing.

Port the pattern the theory pipeline already proved.

### 8b.1 A claims registry for practical questions

Mirror `claims_to_verify` from `outputs/theory_answers/`. At generation, the model registers every
checkable assertion it makes, in structured form:

| claim type | example | checkable against |
|---|---|---|
| `wine_exists` | producer + cuvée + vintage is a real wine | `wine_bank` evidence, Tavily, retailer listings |
| `appellation_variety` | that appellation permits that variety | `kb_chunk`, appellation rules |
| `region_country` | that region is in that country | `appellation-resolver.ts` (already exists) |
| `production_method` | "aged sous voile", "whole-bunch" | `kb_chunk` |
| `abv_plausible` | stated ABV within the style's real range | deterministic range table |
| `vintage_exists` | that producer made that wine that year | Tavily / producer site |

**Registration alone is worth shipping even before verification runs**, exactly as it was for
theory: it converts an invisible fabrication risk into a visible checklist. The theory corpus has
1,300 registered claims and *none externally verified* — that is still far better than not knowing
what the claims are.

### 8b.2 Deterministic checks first (free, no LLM)

Several claim types need no model at all and should be validators, not verifications:
- `region_country` — `appellation-resolver.ts` already resolves this
- `abv_plausible` — a range table per style category
- `appellation_variety` — a permitted-varieties table for the ~200 appellations the corpus actually
  uses, seeded from `kb_chunk`

These become hard rules in `question-rules.mjs` and are caught at generation, not after.

### 8b.3 LLM/web verification for the rest

Reuse `.claude/agents/claim-verifier.md` — it already emits per-claim verdicts against tier-1 sources
and is explicitly built never to rubber-stamp (`UNVERIFIED` is a legitimate outcome). Run it over the
residual claim types, batched, on newly banked questions.

**Priority order, by measured exposure:** the 307 `llm_enrichment` wines first (zero grounding), then
`s1a_import`, then re-verify `tavily_research` on a sample to establish that tier's real error rate.

### 8b.4 What to do with a failed claim

- **Deterministic failure** (ABV out of range, variety not permitted) → reject at generation, re-draw.
- **Verified-false** on a banked question → quarantine via `invalid_reasons`, the existing mechanism.
- **`UNVERIFIED`** → **do not quarantine.** An unverifiable claim is not a false one, and treating it
  as such would gut the bank. Surface it in the review queue and let the reviewer decide.

### 8b.5 Scoping — the measurement has now partly happened

The v4 draft said "nobody has measured the factual error rate; start with 30 questions". §4.5d *is*
that measurement, arriving early and from an unexpected direction: **~31% of human-kept questions
carry a disputed factual claim**, with 2 of 2 spot-checks upheld against independent sources.

Remaining work to size the phase properly:

1. **Adjudicate the 17 disputed claims already surfaced.** A person rules on each. That turns "31%
   disputed" into an error rate with a numerator you trust. Half a day.
2. **Run the holdout split** for a second estimate on questions never used for tuning.
3. Build §8b.1–8b.4 against a known rate rather than a guess.

**Do not tune the judge to agree with the human on `factual_accuracy`.** §4.5d is the reason: the
disagreement *is* the finding. The right target for that dimension is external truth — which is
exactly what §8b.2's deterministic checks and §8b.3's `claim-verifier` supply.

**Exit:** the 17 disputed claims adjudicated and an error rate published; claims registry live at
generation; deterministic checks in `question-rules.mjs`; verification running on the 307 ungrounded
wines; `UNVERIFIED` routed to review rather than quarantine.

---

## 9. Sequencing, cost, risk

| Phase | Depends on | Effort | Spend impact |
|---|---|---|---|
| **6.2a Serve reviewed-first** | — | **done** | $0 — pure quality |
| −1 Stop bleeding | — | hours | **−$500/mo** (volume) |
| 0 Harness | −1 | 2–3 d | +$50 one-off, +$20/mo |
| 1 Cost + retry | 0 | 2–3 d | **−$400/mo** |
| 2 Quality (rest) | 0, 1 | 3–5 d | −$50/mo |
| 3 Loop | 0, 2 | 1–2 d | +$30/mo |
| 4 Right-size supply | 2 | 1–2 d | — (raises value, not cost) |
| 5 Fact verification | 0 (measurement) | **unscoped** | +$50–200/mo, TBD by error rate |

Net: **~$1,434/mo → ~$400/mo** for Phases −1 to 4, with quality measured rather than assumed.
Phase 5 adds cost back deliberately, in exchange for the only correctness guarantee in the system —
and its size is unknown until the 30-question error-rate measurement runs.

### Risks

| risk | mitigation |
|---|---|
| **Judge fails calibration (likely at ~50 holdout negatives)** | Every hard gate is deterministic. Judge gating is opt-in on clearing §4.2; fallback is queue-ordering only. Plan survives a non-gating judge. |
| Single labeller → "reviewer simulator" | Metric renamed `reviewer_alignment`; `synthetic_floor` gives an objective 20/20 floor; rubric anchored on the 112-question corpus and EK doc, not reviewer phrasing; label base grows weekly. |
| Judge shares the generator's biases | Judge is a different model family by requirement; cross-family disagreements escalate to the human. |
| Repair finding is a telemetry artifact | Phase −1 investigation resolves it before Phase 1 acts; the RCT settles it regardless of which. |
| Cache breakpoint silently regresses | Interpolation-position test + byte-stability test + weekly `cache_read_tokens` assertion. |
| Deterministic marks fixer corrupts semantics | Applies only when marks appear nowhere in prose; otherwise reject and re-draw; test asserts the refusal. |
| Underpowered eval read as a win | 2σ rule; N≥3 baselines with variance; live PR eval explicitly labelled directional. |
| Cutting attempts starves the bank | Phase −1 cuts demand first; banked-fallback path already exists; monitor bank depth. |
| Vercel deploy quota (100/day Hobby) | CI eval must not create deployments; `claude/*` already excluded. |

---

## 10. Council review record

Three adversarial passes (Gemini 3.1 Pro; Codex CLI and OpenAI API both unavailable — workspace out
of credits, so this is a **single-reviewer council**, which is itself a limitation worth naming).

**Accepted and incorporated:**

| # | Finding | Where |
|---|---|---|
| 1 | Throttle generation first — optimising a 2%-consumption pipeline is the wrong order | Phase −1 (§3) |
| 2 | Repair-vs-re-roll comparison is confounded | §1.3 — **re-analysed; conclusion reversed** |
| 3 | CI at N=20 with a 20% base rate is statistically indefensible (~9pp noise; true 5pt detection needs N≈1,000) | §7.1 rebuilt around deterministic replay |
| 4 | Judge must not be the same model family as the generator | §4.2 |
| 5 | ~50 holdout negatives → 80% recall has CI [0.66, 0.90] | §4.2 — gate on lower CI bound |
| 6 | Add deliberately-corrupted questions as an objective floor | §4.1 `synthetic_floor` |
| 7 | Deterministic mark rewriting can desync rubric from stem prose | §5.2 prose-coupling guard |
| 8 | Prompt-size hard gate invites "prompt golf" | §6.1 — tracked, not gated |
| 9 | Raising `max_tokens` gives reasoning more room to ramble; cap effort instead | §5.3 |
| 10 | Rename accuracy → `reviewer_alignment` with one labeller | §4.2 |
| 11 | `JSON.stringify` key order / Next.js fetch cache / Vercel timeouts can break caching | §5.1 hardening |
| 12 | Repair needs an RCT at the moment of failure, not more observational data | §5.2 |
| 13 | **Do not act on the 3× repair figure until the RCT reads out** — the 4.7% sample is likely biased toward *easy* failures | §5.2 |
| 14 | Deterministic CI replay is blind to prompt degradation — a prompt edit that confuses the model passes replay and breaks production | §7.1 hard gate 2 (schema smoke test) |
| 15 | A hard fire-rate threshold punishes validator *bug fixes* (fixing a check raises its fire rate) | §7.1 — snapshot test with explicit re-baselining |
| 16 | Verify attempt 4 drops the failure history — otherwise context poisoning explains the late collapse | §3 item 5 |

**Rejected, with reason:**

| Finding | Why rejected |
|---|---|
| "Only put `cache_control` on the final static block; two breakpoints burns cache slots" | Wrong for a nested-prefix layout. S1 (universal, ~35k) is shared by all three papers; S2 builds per-paper on top of it. Anthropic supports 4 breakpoints; this is the canonical use of 2. **Council retracted this on round 3** and confirmed the nested layout is correct. |
| "Stop generation entirely until serve rate >20%" | Directionally right, too absolute — and the premise was based on the broken `served_count` (§1.7). User-triggered generation, Live Tasting, and the banked-fallback path all need a working generator. Throttled to ~1.2× measured consumption instead. |

**Endorsed by council as sound:** the 4-segment cached prompt layout; routing away from Opus on
parse-failure; the deterministic-metric fallback when the judge drifts; the `synthetic_floor` split;
and throttling rather than stopping generation.

**Council's round-3 verdict:** *"sound enough to execute"*, with the single biggest remaining risk
being the deterministic CI gate's blindness to prompt degradation — now addressed by hard gate 2.

### Round 4 — review of the BUILT Phase 0 harness

Reviewed as code, not as a proposal. Six findings accepted and fixed (§4.5b), four limitations
accepted and documented rather than solved (§4.5c).

| # | Finding | Disposition |
|---|---|---|
| 17 | Multiple-comparisons fallacy: 15 tests at p95 ⇒ 53.7% family-wise false-drift | **Fixed** — Bonferroni; measured <15% |
| 18 | z-test logic invalid at n=3; t(2) critical value is 4.303, not 2 | **Fixed** — t prediction interval; min baseline 3→5 |
| 19 | Zero-spread ⇒ ∞σ ⇒ confident IMPROVED on jitter | **Fixed** — `minRelevantDelta` on every metric |
| 20 | Noise floor subsamples its own reference ⇒ biased low | **Fixed** — parametric bootstrap, 4,000 trials |
| 21 | `markFocus` argmax discards the mix | **Fixed** — weighted distribution comparison |
| 22 | Judge can pass on recall alone by over-binning | **Fixed** — `maxFalseBinRate` 25% ceiling |
| 23 | Shared feature extractors mask app parser bugs | **Documented** (§4.5c #1) — the alternative drifts |
| 24 | Synthetic corruptions are mechanically pattern-matchable | **Documented** (§4.5c #2) — it is a floor, not a ceiling |
| 25 | Design documents rather than prevents self-preference bias | **Documented** (§4.5c #3) — needs a provider key |
| 26 | Corpus anchor measures structure, not truth | **Accepted** — this is precisely why Phase 5 exists |

One council claim was **rejected**: that the golden set is built from *human-written* questions and
therefore only proves the judge can grade humans. It is built from 466 **generated** questions
carrying human keep/bin labels, so calibration does measure judging Claude's own output. The
adjacent point — that self-preference bias is still unmitigated — stands and is documented.

---

## 11. Open questions

1. ~~Is `empiricalKnowledgeDigest` in the generation prompt?~~ **Resolved:** no. Static payload ~35k.
2. **Is the 4.7% repair rate a logic bug or a telemetry bug?** Gates Phase 1's retry design. §1.3.
3. **Why does Opus send ~14k more input tokens than Sonnet on the same prompt builder?** Sonnet
   median 42,376 (min 39,497); Opus 57,335 (min 53,577) — systematic, and Opus only runs attempt 1,
   which carries *less* context. Worth ~$0.21/call.
4. What is the Sonnet 17% `model_error` rate (458/2,684)?
5. ~~How many of the 404 usable banked questions are actually servable today?~~ **Resolved in v3:**
   126 distinct questions have been attempted all-time (18% of bank), 68 in the most recent week.
   The bank is being consumed; `served_count` was lying. Phase 4 rescoped accordingly (§8).
6. **Does attempt 4 carry the prior failed drafts in context?** If so, context poisoning likely
   explains the collapse to 0% by attempt 8, and the fix is cheaper than anything else in Phase 1.
7. Can a second council reviewer be obtained? All hardening above rests on one reviewer (Gemini),
   with Codex and OpenAI unavailable. The judge-independence argument in §4.2 applies to plan review
   too.
8. ~~What is the actual factual error rate?~~ **Partly answered (§4.5d):** ~31% of human-KEPT
   questions carry a disputed factual claim; 2 of 2 spot-checks upheld. Phase 5 is promoted to top
   priority. Adjudicating the 17 disputed claims converts this into a trusted numerator.
9. **Should the unreviewed-fallback in §6.2a eventually become a hard filter?** Safe only once the
   review backlog (225) is cleared and generation is throttled to match consumption — otherwise it
   risks starving a candidate mid-session. Revisit after Phase 4.
