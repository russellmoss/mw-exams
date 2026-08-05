# Frozen pre-exam forecasts

Each file here is a forecast **committed before the exam it predicts was sat**. That timing is
the whole value: once an exam is ingested, the corpus, the master trees and the predictor all
absorb it, and no measurement made afterwards can tell you whether the system actually
anticipated anything. These files are the only uncontaminated evidence.

**Never regenerate a file in this directory.** Re-running the predictor is fine — it writes to
`data/predicted_{year}_exam_profile.json`. The `PRE-EXAM-FROZEN` copies are evidence, not output.

## 2026 — scored, holdout spent

| | |
| --- | --- |
| Frozen | `predicted_2026_exam_profile.PRE-EXAM-FROZEN.json` (committed 2026-05-27, pre-exam) |
| Scored | `outputs/backtest_reports/2026_holdout.md` via `scripts/score_2026_holdout.py` |
| Result | archetype recall **6/8 (75%)**, country 61%, exact question count **1 of 3** |
| Findings | EK-0142 (holdout result), EK-0143 (the 12/12 count metric was a tautology; real rate 27%) |

The trees that produced this forecast are preserved at `outputs/master_trees/_frozen_pre2026/`.
Re-run the 2026 scoring against **those**, never the live trees — the live ones have seen 2026.

## 2027 — open, awaiting the exam

| | |
| --- | --- |
| Frozen | `predicted_2027_exam_profile.PRE-EXAM-FROZEN.json` |
| Frozen on | 2026-08-05 |
| Trained on | 2011–2026, all 120 decision matrices, corpus of 540 wines / 161 questions |
| Backtest state at freeze | `exam_predictor_backtest.PRE-2027.json` — 5 folds (2022–2026), structure mean-F1 0.521, country top-3 84.0%, variety top-3 60.0%, real question-count accuracy 27% |

### What it predicts

**3 questions per paper** — but note EK-0143: question count is the predictor's weakest output at
27%, so treat the count as near-noise and read the archetype mix instead.

- **Paper 1** — F1 same-variety-cross-origin, then F7 quality-calibration, then F2 same-origin-comparative.
  Chardonnay and Riesling lead every slot; France, Australia, USA, Italy.
- **Paper 2** — F2 same-origin-comparative, F7 quality-calibration, F2 same-region-internal-diversity.
  Bordeaux red family throughout; France, Italy, USA.
- **Paper 3** — F5 sparkling-method opener, F2 same-origin-comparative, F7 quality-calibration.
  France, Spain, Portugal; sparkling into fortified/sweet.

### How to score it when the 2027 papers appear

1. Ingest 2027 (append to `source/MW_Practical_Papers_Compilation.md`, re-run `scripts/parse_source.py`).
2. **Before** re-synthesizing anything, copy `scripts/score_2026_holdout.py` to a 2027 variant,
   point it at this frozen file, and write `outputs/backtest_reports/2027_holdout.md`.
3. Only then fold 2027 into the trees, and freeze the pre-2027 trees first — same order as 2026.

Scoring after re-synthesis destroys the measurement. That ordering is the entire discipline.
