# Question & Answer Generation: Quality + Cost Remediation

**Date:** 2026-08-07
**Status:** v3 — hardened after three adversarial council passes (Gemini 3.1 Pro)
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
Phase  3  Close the loop             ── CI + weekly regression
Phase  4  Fix consumption            ── make the bank worth generating into
```

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

## 4. Phase 0 — Build the measurement loop

**Goal:** a repeatable offline eval that scores a generation config against human-labelled ground
truth, so every later change is measured rather than asserted.

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

### 4.3 Deterministic metrics — no LLM, free, no sampling noise

These need no calibration and carry no judge risk. **They are the hard gates.**

- First-pass validator rate; per-rule fire rate
- Cost per accepted question (from `model_usage`)
- Answer length band-hit rate
- **Corpus-fidelity distances** vs the 112 real historical questions: flight-size distribution,
  mark-type mix, country/region diversity, old/new-world balance, stem length — reported per-axis so
  a regression names its axis
- Prompt token count; cache-hit rate
- Novelty pressure (mean attempts-to-novel; bank-vs-served ratio)

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

**Exit:** golden set frozen + hashed with 4 splits; judge clears §4.2 bars on holdout *or* is
formally declared non-gating; baseline scorecard at N≥3 with variance; eval runs <$5 and <15 min.

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

### 6.2 Close the validator↔human gap

33.7% human bin rate on validator-passing questions is the real quality number.

Use the calibrated judge as a **pre-bank gate**, quarantining what it would bin before the human sees
it — **only if** it cleared §4.2 (lower CI bound on bin-recall ≥ 0.70 *and* 20/20 on
`synthetic_floor`). Otherwise the judge only **orders the human's review queue** (highest-risk
first), which is valuable, carries no gating risk, and is the fallback if calibration fails.

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

## 9. Sequencing, cost, risk

| Phase | Depends on | Effort | Spend impact |
|---|---|---|---|
| −1 Stop bleeding | — | hours | **−$500/mo** (volume) |
| 0 Harness | −1 | 2–3 d | +$50 one-off, +$20/mo |
| 1 Cost + retry | 0 | 2–3 d | **−$400/mo** |
| 2 Quality | 0, 1 | 3–5 d | −$50/mo |
| 3 Loop | 0, 2 | 1–2 d | +$30/mo |
| 4 Consumption | 2 | 1–2 d | — (raises value, not cost) |

Net: **~$1,434/mo → ~$400/mo**, with quality measured rather than assumed.

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
