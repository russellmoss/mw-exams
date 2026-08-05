# Frozen-tree per-year series — and the correction it forces

Generated 2026-08-05 by `scripts/score_2026_tree_holdout.py`'s scorer applied to fresh
tree-backtester predictions in `data/loyo_frozen_predictions_{year}.json`. 112 questions /
360 wines for 2015-2025, plus the 8 questions / 36 wines of 2026.

## Why this run exists

The published per-year table and the 89.2% post-fix headline were produced by an older
prediction pass, while the 2026 holdout used fresh agents. They were never comparable. This
run re-derives every year with **one method**: fresh `tree-backtester` agents, reading only
`outputs/master_trees/_frozen_pre2026/`, given stems and barred from the wine lists.

## The headline: no penalty for a CONTEMPORARY unseen paper

Read this alongside `era1_blind_backtest_2000_2010.md`, which blind-tested the same frozen trees on
396 wines from 2000-2010 and got **52% top-3**. Both are honest. Putting all three on one scale:
2015-2025 (cited verbatim) **59.2%**, 2026 (unseen, contemporary) **63.9%**, 2000-2010 (unseen,
era-shifted) **52%**. The variable is **distribution shift, not novelty** — 29% of Era-1 stems hit no
branch at all, while 2026's modern stems route fine. See EK-0149.


| Metric | 2015-2025 (in-sample) | 2026 (unseen) | Delta |
| --- | --- | --- | --- |
| Top-1 variety | 35.0% | **36.1%** | +1.1pp |
| **Top-3 variety** | 59.2% | **63.9%** | +4.7pp |
| Candidate-set | 80.0% | **88.9%** | +8.9pp |
| Top-1 country | 40.0% | **30.6%** | -9.4pp |

**2026 scores at or above the in-sample average on three of four metrics.** Its top-3 sits
+0.72 sd from the in-sample mean (sd 6.6%) and would rank 3rd of 11 years.
Being genuinely unseen cost the trees nothing measurable.

## Per year

| Year | Wines | Top-1 var | Top-3 var | Cand-set | Top-1 country | Seen by tree? |
| --- | --- | --- | --- | --- | --- | --- |
| 2015 | 36 | 36.1% | 58.3% | 80.6% | 38.9% | cited verbatim |
| 2016 | 36 | 44.4% | 52.8% | 72.2% | 41.7% | cited verbatim |
| 2017 | 36 | 25.0% | 55.6% | 77.8% | 50.0% | cited verbatim |
| 2018 | 36 | 30.6% | 50.0% | 72.2% | 25.0% | cited verbatim |
| 2019 | 36 | 36.1% | 58.3% | 77.8% | 27.8% | cited verbatim |
| 2021 | 36 | 27.8% | 55.6% | 75.0% | 44.4% | cited verbatim |
| 2022 | 36 | 30.6% | 58.3% | 77.8% | 33.3% | cited verbatim |
| 2023 | 36 | 33.3% | 61.1% | 88.9% | 44.4% | cited verbatim |
| 2024 | 36 | 33.3% | 69.4% | 88.9% | 38.9% | cited verbatim |
| 2025 | 36 | 52.8% | 72.2% | 88.9% | 55.6% | cited verbatim |
| **2026** | 36 | **36.1%** | **63.9%** | **88.9%** | **30.6%** | **never seen** |

Every one of the 112 questions from 2015-2025 is **named verbatim inside the frozen trees**
(strings like `2016 P1 Q2` attached to the leaf that predicts them) — 112/112, versus 0/8 for
2026. Those years are recall, not prediction. That makes it all the more striking that recall
does not beat reasoning here.

## What this corrects

EK-0148 reported top-3 falling from 89.2% in-sample to 63.9% out-of-sample and called it a
25-point generalization penalty. **That comparison was invalid.** The 89.2% came from a
different prediction generation; fresh agents applying the *same frozen trees* to the *same
years* score **59.2%**. The gap was between measurement methods, not between in- and
out-of-sample. Corrected in EK-0149.

## Honest limitations

- **Attention confound.** The 2026 run used 3 agents for 8 questions (~2.7 each); this series
  used 10 agents for 112 (~11 each). More questions per agent may mean less care per question,
  which could flatter 2026. This is the main reason not to over-read the +4.7pp.
- **Method variance between agents.** Several restricted themselves to Layer A stem logic
  because the trees' Layer B sensory leaves cite the exact question under test; others used
  the full tree. Notably the strictest agent (2025, Layer A only) scored **highest** at 72.2%
  top-3 — so the leakage did not obviously help.
- **Not true cross-validation.** The trees are one artifact built from all 112 matrices;
  nothing retrains per fold. "LOYO" is a label, not a method, for 2015-2025.
- 2026 remains n=36 wines, one year.

## Tree coverage gaps the agents surfaced

Stem shapes with no clean route in the frozen trees: 2015 P3 Q2; 2017 P3 Q4, P3 Q5;
2018 P2 Q4, P3 Q1, P3 Q3; 2021 P1 Q4 (two same-country questions in one paper land on an
identical leaf), P2 Q3 (Americas-only pairing); 2023 P2 Q3, P3 Q2 (master tree and family
pack disagree on sub-branch). These are refinement targets for the live trees.

