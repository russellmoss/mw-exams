# Generation evals — the truth anchor and the scoreboard

This is Phase 0 of `docs/plans/2026-08-07-generation-quality-and-cost.md`: the thing a
generate → judge → bin → fix loop ratchets against.

Without it, "we made a foundational fix" is a story. Fifteen bin-fix proposals have already shipped
to production and **nobody can say whether any of them helped** — first-pass validator rate is
20.5% and the human bin rate 33.7% after all fifteen. That is the gap this closes.

## The one idea

A self-improving loop with an LLM generating and an LLM judging has **no external referent**. It
converges on what the judge likes, and the judge shares the generator's biases. So the loop needs
something outside itself to ratchet against:

```
        ┌─────────────────────────────────────────────┐
        │  TRUTH ANCHOR — 162 real IMW questions      │  cannot be gamed by a model
        │  data/exams.json, 2011–2026                 │  does not move when models drift
        └─────────────────────────────────────────────┘
                          ▲
                          │ corpus fidelity (TVD per axis, vs a noise floor)
                          │
   generate ──▶ validate ──▶ SCOREBOARD ──▶ verdict ──▶ foundational fix ──┐
        ▲                       ▲                                          │
        │                       │ judge (advisory)                         │
        └───────────────────────┴──────────────────────────────────────────┘
```

**Corpus fidelity is the gate. The judge is advisory until it proves otherwise.**

## Files

| file | what it is |
|---|---|
| `corpus-anchor.ts` | **The truth anchor.** Loads the 162 real questions, extracts features with the *same* functions the app uses on generated ones, scores fidelity per axis |
| `metrics.ts` | Distribution math — TVD, seeded bootstrap noise floors, Wilson intervals, Cohen's κ |
| `scorecard.ts` | **The scoreboard.** Renders a card and diffs it against a baseline with 2σ discipline |
| `golden.ts` | The 486-item human-labelled set: load, freeze, hash, health-check |
| `judge.ts` | Pluggable LLM judge + the calibration that decides whether it may gate |
| `golden/questions.jsonl` | Frozen artifact. 486 items, hash in `meta.json` |
| `reports/` | Emitted calibration runs and scorecards |

## Commands

Rebuild the golden set from the live bank (needs `DATABASE_URL`, read-only):

```bash
npm run eval:golden
```

Calibrate the judge and find out whether it is allowed to gate anything. Defaults to the
cross-family Gemini judge (needs `GEMINI_API_KEY`); `--provider anthropic` needs `ANTHROPIC_API_KEY`:

```bash
npm run eval:judge -- --provider gemini --split calibration --limit 60
```

Run the deterministic half — no API key, no database, no network:

```bash
npm run eval:anchor
```

## Corpus fidelity, and why there is a noise floor

Each axis projects a question onto a bucket, and we take the **total variation distance** between
the generated distribution and the real corpus. TVD is bounded [0,1], symmetric, needs no smoothing,
and reads plainly: *0.12 means 12% of the questions are in the wrong bucket.*

Axes today: flight size · dominant mark category · question type · sub-parts per question ·
stem length.

`markFocus` compares the **full mark mix**, not the winning category: a question splitting marks
40/30/30 is a different exam problem from one at 100/0/0, and argmax would call them identical — so
a generator emitting only monolithic single-focus questions would score perfect fidelity.

The trap is that **a TVD of 0.15 can be perfect.** Two samples from the *same* distribution differ,
and at n=60 they differ a lot. So every axis carries a noise floor. Two things about how it is built:

- **Parametric bootstrap, not subsampling.** Drawing 60 items out of the 162-question corpus and
  scoring them against that same corpus makes sample and reference ~37% shared, which correlates
  them and biases TVD *low* — a floor too tight, flagging healthy batches as drifted. Instead we
  resample i.i.d. from the corpus's estimated distribution.
- **Corrected for multiple comparisons.** 5 axes × 3 papers = 15 simultaneous tests. At an
  uncorrected p95 each, the family-wise false-drift rate is 1 − 0.95¹⁵ = **53.7%** — over half of
  clean runs would REGRESS, and people would learn to re-run until green. The cut is Bonferroni-
  corrected to `1 − α/K`, with 4,000 bootstrap trials because that quantile sits far out in the tail.

Verified in both directions in `tests/evals-corpus-anchor.test.ts` and `evals-metrics.test.ts`: a
genuine slice of the real corpus must **not** trip drift, an obviously wrong batch must, and the
measured family-wise false-alarm rate across 15 tests stays under 15%.

## The golden set

Built from 466 real human review decisions.

| split | n | negatives | use |
|---|---|---:|---|
| `calibration` | 151 | 51 | tune the judge rubric |
| `holdout` | 151 | 51 | **measure** the judge; never tuned on |
| `regression` | 164 | 55 | CI replay — deterministic, no model calls |
| `synthetic_floor` | 20 | 20 | deliberately corrupted; objectively wrong |

The **synthetic floor** is the load-bearing split. Every other label is one expert's judgement on a
subjective craft, so a judge that matches them perfectly has learned *that person*, not the exam.
Floor items are real kept questions with exactly one thing broken — marks that don't sum, a red wine
in Paper 1, a stem contradicting its own wine list, a hallucinated appellation, an impossible ABV.
Four of each. **A judge that misses those is unfit at any κ**, and that verdict needs no reviewer to
arbitrate it.

The set is frozen and content-hashed. Rebuilding after new reviews legitimately changes the hash —
which invalidates existing baselines, so `loadGolden` throws rather than letting an incomparable
comparison pass quietly.

## Whether the judge may gate

Three bars, all of which must clear:

| bar | why |
|---|---|
| Cohen's κ ≥ 0.6 | Raw accuracy is a lie at a 33% bin rate: a judge that keeps everything scores 67% |
| **Lower** bound of the 95% CI on bin-recall ≥ 0.70 | At 51 negatives, an observed 80% recall has a CI of roughly [66%, 90%]. Gating on the point estimate would qualify a judge that misses one bad question in three |
| False-bin rate ≤ 25% | Recall alone is gameable — bin everything and score 100%. An over-strict pre-bank gate starves the pool as surely as a lax one floods it, so precision is bounded too |
| Synthetic floor 20/20 | No CI, no tolerance. These are objectively wrong |

`assessCalibration` returns `qualified: false` with named failures otherwise, and the scorecard
prints the judge's numbers under a warning banner. **A non-qualified judge never contributes to a
verdict** — see the `advisory` flag in `scorecard.ts`.

### The cross-family judge, and what it found on its first run

`geminiJudge()` (`crossFamily: true`) is the one whose verdict can gate. `anthropicJudge()` remains
for development but sets `crossFamily: false` and prints a warning on every scorecard — Claude
grading Claude is a closed loop, and the existing `bin_reason_check` shows the pathology: 67 of 69
human bins "upheld", **0 overturned**. A 0% disagreement rate is not agreement.

**First live run (Gemini 3.1 Pro, calibration split, 2026-08-07): NOT QUALIFIED — and that is the
interesting part.** κ 0.036, bin-recall lower bound 0.469 — both bars missed. But the synthetic
floor came back **17/17** and the craft false-bin rate was 21%, so the judge is neither incompetent
nor trigger-happy. It disagrees with the reviewer because they are **measuring different things**:

**17 of ~55 human-KEPT questions (~31%) were binned for a specific factual fault.** Two verified
against independent sources:

- *"Thierry Germain, **Saumur Blanc** Les Memoires, 2021 (13.5%)"* — Les Mémoires is a
  **Saumur-Champigny RED**, 100% Cabernet Franc. The wine does not exist as a white, and it was
  sitting in a white-only paper.
- *"Felton Road Block 1 Riesling 2023 **(13.0%)**"* — Block 1 is **8.5% ABV, 67 g/L RS**.

Both passed all 22 validators **and** the human reviewer.

**This is why `falseBinRate` excludes `disputed`.** A bin that cites a factual fault is a claim to
adjudicate, not a judge error — counting it as an error would disqualify a judge for out-performing
its own reference. Before that fix the same run reported a 75% "false-bin rate" and looked broken.

**And it is why you must not tune the rubric until κ rises.** That would mean training the judge to
stop noticing real errors — the exact failure mode a self-improving loop would reach automatically
and invisibly. The human labels are a strong reference for exam *craft* and a weak one for *fact*.

## The scoreboard's three rules

1. **Nothing is a win inside the noise.** A change must clear *both* bars:
   - **Statistical** — a Student's *t* prediction interval, `t(n−1)·√(1+1/n)` baseline σ. Not "2σ":
     at a 3-run baseline the true 95% critical value is 4.303, so a flat 2σ test was really running
     at ~82% confidence. `MIN_BASELINE_RUNS` is **5**, because at n=3 the threshold is ~4.97σ and a
     baseline that can barely fail anything tells you nothing when it passes.
   - **Practical** — every metric declares `minRelevantDelta`. Deterministic metrics have zero
     baseline spread, so without this, 0.800 → 0.801 divides by zero, reads as ∞σ, and the
     scorecard confidently reports IMPROVED for floating-point jitter.
2. **Corpus fidelity outranks the judge.** Fidelity drift alone produces `REGRESS`; an advisory
   judge metric never can.
3. **A regression names itself.** No aggregate score — every metric is diffed on its own row.

## Known limitations — stated, not solved

1. **Shared feature extractors.** The anchor uses the app's own parsers by design. If one has a bug,
   generated and real questions go through the *same* broken lens and the score cannot see it. The
   alternative — a second parser — drifts, and then you are measuring the lenses. No free answer;
   mitigated by separate parser tests plus an >85% bucketing-coverage assertion on the real corpus.
2. **The synthetic floor is template-applied.** A judge could in principle learn "flag stems
   beginning *all made from*" rather than reasoning about wine. It is a **floor** — passing proves
   minimal competence, not excellence. Generating corruptions with a different model would harden it.
3. **Self-preference bias is unmitigated** while judge and generator share a family. The golden set
   *is* generated questions with human labels, so calibration does test "can it judge Claude's output
   as the human would" — but a Claude judge may still favour Claude's habits. Only a cross-family
   judge fixes this.
4. **Structural fidelity is not correctness.** A question can be perfectly corpus-shaped and
   factually wrong. Nothing here checks whether a claim is true — that is Phase 5 of the plan.

## What is not built yet

- **`run.ts`** — the generate-N-and-score runner. The scoring half is complete and tested; the
  generation half needs the Phase 1 caching work first, or the baseline gets re-established twice.
- **A live calibration number.** The harness runs; it needs `ANTHROPIC_API_KEY` in the environment.
  Until that runs, treat the judge as unqualified — which is what the code already does.
- **A cross-family judge.** Needs a provider key.
