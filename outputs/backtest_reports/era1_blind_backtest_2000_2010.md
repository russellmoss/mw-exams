# Blind out-of-sample backtest: the master trees vs the 2000–2010 papers

**What this is.** The first genuinely blind test of the master decision trees. Every previous
backtest scored the trees against the same 2011–2025 corpus they were synthesised from, so it
measured *fit*. The newly structured 2000–2010 corpus is material the trees have never seen, so
this measures *generalisation*.

**Scale.** 111 questions, 396 wines, all three trees.

## Protocol — why these numbers are trustworthy

The wines were withheld from the predicting agents, and ground truth was established independently:

1. `scripts/build_backtest_input.py` split the corpus into a **blind question file** (stems and wine
   slot counts only) and a separate answer key, with an automated leak check.
2. Six `tree-backtester` agents predicted from **the stem plus the relevant tree only**, instructed
   not to open any corpus file or search the web, and to flag stems the tree has no branch for.
   Each emitted ranked candidate lists (varieties, countries, regions) plus the branch it followed.
3. Four separate agents resolved each of the 396 wines to a canonical
   (variety, country, region) triple **without seeing any prediction** — so grading could not be
   bent toward the answers. 12 wines (3%) were flagged uncertain and are included as scored.
4. `scripts/score_backtest.py` matched the two deterministically, with a synonym map so
   Shiraz/Syrah, Pinot Grigio/Pinot Gris, Viura/Macabeo etc. score as equal.

Reproduce with:

```bash
python scripts/score_backtest.py --dir <backtest_dir> --out era1_backtest_scored.json
```

## Headline results

Per wine, top-1 / top-3 / anywhere-in-candidate-set:

| | variety | country | region |
|---|---|---|---|
| **All 2000–2010** | **30% / 52% / 69%** | **36% / 62% / 83%** | 25% in-set |
| Paper 1 whites | 35% / 61% / 80% | 40% / 59% / 82% | 24% |
| Paper 2 reds | 33% / 57% / 78% | 43% / 66% / 89% | 17% |
| Paper 3 special | 20% / 39% / 51% | 25% / 61% / 80% | 33% |

Mean reciprocal rank: 0.43 variety, 0.52 country.

**This is well below the in-sample figures.** The LOYO audit reports top-1 variety 72.8%, top-3
89.2%, candidate-set 95.6% (`loyo_postfix_audit.md`). Out-of-sample the same trees score 30% / 52%
/ 69%. Treat the gap as **indicative rather than exact** — the two runs use different scoring
harnesses, and this one caps each prediction at 5–8 ranked varieties, which makes "in-set"
deliberately harder than an unbounded candidate set. But the direction and rough size of the drop
are not in doubt, and they carry a clear lesson: **LOYO over-states how well the trees generalise,
because a tree synthesised from all years cannot be honestly held out from one of them.**

## The most useful finding: the confidence tiers are honest

The trees label each call STRONG SIGNAL / PLAUSIBLE / CURVEBALL. Out-of-sample, on material they
were never fitted to, those tiers rank correctly on **every one of the six metrics**:

| tier | wines | variety top-1 / top-3 / in-set | country top-1 / top-3 / in-set |
|---|---|---|---|
| STRONG SIGNAL | 216 | **38% / 65% / 82%** | **45% / 69% / 90%** |
| PLAUSIBLE | 106 | 21% / 45% / 61% | 26% / 54% / 75% |
| CURVEBALL | 74 | 16% / 26% / 43% | 24% / 53% / 76% |

A confidence label that survives a distribution shift this large is doing real work. This supports
the three-tier scheme over percentage confidences (CLAUDE.md) and means a candidate can trust the
tiers as *relative* guidance even where absolute hit rates are weak.

## Where the trees break: stem coverage

**32 of 111 questions (29%) hit no matching branch at all.** The predicting agents were asked to say
so explicitly, and the concentration is telling:

| paper | questions with no matching branch |
|---|---|
| Paper 1 whites | 15/40 (38%) |
| Paper 2 reds | 3/35 (9%) |
| Paper 3 special | 14/36 (39%) |

Coverage measurably drives accuracy:

| | wines | variety top-1 / top-3 / in-set |
|---|---|---|
| tree **had** a branch | 292 | 33% / 56% / 74% |
| **no matching branch** | 104 | 20% / 41% / 58% |

Constructions the trees have no leaf for, named by the agents:

- **Vintage verticals** — two vintages of the same wine compared (2004 P3 Q1 and Q2). Absent from
  Layer A entirely.
- **Price ranking** — "rank the wines by price, least expensive first" (2000 P1 Q2). A whole question
  type that no longer exists.
- **Old-World-vs-New-World paired grids** — a classic French wine paired with a New World wine of the
  same variety (2000 P2 Q1), and 2×2 variety/country grids.
- **Single-wine isolation** — "taking this wine (12) in isolation" (2007 P2 Q4).
- **Bare same-grape/multi-country P3 flights** with no style or family cue (2000 P3 Q2, 2002 P3 Q2).
- **Bordeaux varieties appearing in Paper 3** (2002 P3 Q1) — the tree notes the analogous
  Rhône-in-P3 curveball but has no leaf for this one.

Paper 2's 9% is the standout: red-wine stem grammar has been far more stable across 26 years than
white or special-paper grammar.

## How much of the gap is distribution shift, not tree weakness?

A large part, but not all of it. Three things are true at once:

1. **Era-1 question shapes are obsolete** (EK-0146): the 4-wine flight was the era's default, the
   8-wine flight existed, and commercial questions were nearly absent. The trees are fitted to modern
   stem grammar, so a 29% no-branch rate is partly the trees being *correctly* specialised.
2. **But coverage is not the whole story.** Even on questions where a branch *did* match, top-1
   variety was 33% against an in-sample 72.8%. The trees are weaker at genuinely novel material than
   the in-sample numbers suggest, irrespective of stem shape.
3. **The wine universe barely moved.** The origin mix is nearly identical across eras (~2/3 Old
   World, France ~1/3 — EK-0146), so this is not a case of the trees facing unfamiliar *wines*. It is
   the *stem-routing layer* that fails to transfer, not the wine knowledge underneath.

That third point is the sharpest diagnosis: **Layer A (stem routing) is the brittle part; the
underlying candidate knowledge holds up better** — country in-set stays at 83% overall and 90% on
STRONG SIGNAL calls even out-of-sample.

## What this does and does not mean for the candidate

- **It does not mean the trees are unfit for the 2027 exam.** They target modern stem grammar, which
  is what the candidate will actually sit. Era-1 shapes are extinct.
- **It does mean the published accuracy figures are optimistic** as a measure of what happens on a
  genuinely novel paper. The honest expectation for unseen material is materially below LOYO.
- **Trust the tiers, not the percentages.** STRONG SIGNAL calls were roughly twice as accurate as
  CURVEBALL calls out-of-sample, on every metric.
- **Paper 3 is the weakest tree** (variety top-1 20%, in-set 51%) and has the joint-worst stem
  coverage. That matches the examiner reports, where P3 is repeatedly where candidates come unstuck.

## Recommended follow-ups

1. **Add a fallback path to Layer A.** With 29% of historical stems unroutable, the trees should have
   an explicit "unrecognised construction" leaf that degrades to the paper-level prior rather than
   forcing a bad branch. This matters for the real exam too: EK-0004 says new question types appear
   regularly.
2. **Strengthen the P3 tree first** — worst accuracy and joint-worst coverage.
3. **Stop quoting LOYO as a generalisation figure.** Report it as in-sample fit and cite this test
   (or the 2026 holdout) for out-of-sample expectations.
4. **Do not fit the trees to Era-1 shapes.** The value of this corpus is as a *test set* and as
   evidence about invariants; training on extinct question types would make the trees worse at the
   exam the candidate will actually sit.

## Sources

- `data/backtest_era1_blind.json` — full per-wine scored results (this run)
- `data/past_exams_2000_2010.json` — the corpus under test
- `outputs/master_trees/{p1_whites,p2_reds,p3_special}_tree.md` — the trees as they stood
- `scripts/build_backtest_input.py`, `scripts/score_backtest.py` — harness
- In-sample comparison: `outputs/backtest_reports/loyo_postfix_audit.md`, `2026_holdout.md`
