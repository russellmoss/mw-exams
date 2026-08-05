# 2026 Tree Holdout — the frozen pre-2026 trees vs the real papers

**The clean per-wine variety measurement.** Predictions came from tree-backtester agents
reading only `outputs/master_trees/_frozen_pre2026/`, which never saw 2026, and barred from
the 2026 wine lists. Scoring reuses `run_loyo.score_question` verbatim, so these numbers sit
on the same scale as the 10-fold LOYO report.

Scored **36 wines** across **8 questions**.

## Headline

| Metric | 2015-2025 LOYO (post-fix) | 2026 holdout | Delta |
| --- | --- | --- | --- |
| Top-1 variety | 72.8% | **36.1%** | -0.4pp |
| **Top-3 variety** | 89.2% | **63.9%** | -0.3pp |
| Candidate-set hit | 95.6% | **88.9%** | -0.1pp |
| Top-1 country | — | 30.6% | — |
| Top-3 country | — | 77.8% | — |

## Per question

| Question | Wines | Top-1 var | Top-3 var | Cand-set | Top-1 country |
| --- | --- | --- | --- | --- | --- |
| `2026_p1_q1` | 6 | 100% | 100% | 100% | 33% |
| `2026_p1_q2` | 3 | 0% | 100% | 100% | 33% |
| `2026_p1_q3` | 3 | 33% | 67% | 100% | 33% |
| `2026_p2_q1` | 3 | 0% | 0% | 33% | 0% |
| `2026_p2_q2` | 3 | 33% | 67% | 67% | 0% |
| `2026_p2_q3` | 6 | 33% | 67% | 100% | 33% |
| `2026_p3_q1` | 4 | 25% | 50% | 75% | 25% |
| `2026_p3_q2` | 8 | 25% | 50% | 100% | 50% |

## What each question actually held

**`2026_p1_q1`** — predicted ranking: Chardonnay, Riesling, Sauvignon Blanc, Chenin Blanc, Semillon, Pinot Gris

| Slot | Actual variety | Country |
| --- | --- | --- |
| 1 | Chardonnay | France |
| 2 | Chardonnay | New Zealand |
| 3 | Chardonnay | Australia |
| 4 | Chardonnay | Italy |
| 5 | Chardonnay | France |
| 6 | Chardonnay | USA |

**`2026_p1_q2`** — predicted ranking: Chardonnay, Riesling, Sauvignon Blanc, Chenin Blanc, Semillon, Pinot Gris

| Slot | Actual variety | Country |
| --- | --- | --- |
| 7 | Riesling | Austria |
| 8 | Riesling | France |
| 9 | Riesling | Australia |

**`2026_p1_q3`** — predicted ranking: Vermentino, Assyrtiko, Grenache Blanc/Rhone-style blend, Grillo/Catarratto (Sicily), Viognier, Marsanne/Roussanne

| Slot | Actual variety | Country |
| --- | --- | --- |
| 10 | Vermentino | Italy |
| 11 | Assyrtiko | Greece |
| 12 | Clairette/Bourboulenc | France |

**`2026_p2_q1`** — predicted ranking: Sangiovese, Nebbiolo, Aglianico, Nerello Mascalese, Pinot Noir, Syrah/Shiraz

| Slot | Actual variety | Country |
| --- | --- | --- |
| 1 | Cabernet Franc | France |
| 2 | Gamay | France |
| 3 | Trousseau | France |

**`2026_p2_q2`** — predicted ranking: Cabernet Sauvignon/Merlot, Syrah/Shiraz, Pinot Noir, Tempranillo, Sangiovese, Cabernet Franc

| Slot | Actual variety | Country |
| --- | --- | --- |
| 4 | Corvina/Corvinone | Italy |
| 5 | Shiraz | Australia |
| 6 | Cabernet Sauvignon | USA |

**`2026_p2_q3`** — predicted ranking: Cabernet Sauvignon/Merlot, Sangiovese, Nebbiolo, Tempranillo/Garnacha, Pinot Noir, Syrah

| Slot | Actual variety | Country |
| --- | --- | --- |
| 7 | Tempranillo/Garnacha | Spain |
| 8 | Tempranillo/Garnacha | Spain |
| 9 | Sangiovese | Italy |
| 10 | Sangiovese | Italy |
| 11 | Cabernet Sauvignon/Merlot | France |
| 12 | Cabernet Sauvignon/Merlot | France |

**`2026_p3_q1`** — predicted ranking: Chardonnay, Pinot Noir, Xarel-lo/Macabeo/Parellada, Pinot Meunier, Chenin Blanc, Pinot Blanc/Auxerrois

| Slot | Actual variety | Country |
| --- | --- | --- |
| 1 | Lambrusco | Italy |
| 2 | Xarel-lo/Macabeo | Spain |
| 3 | Chenin Blanc | France |
| 4 | Chardonnay | England |

**`2026_p3_q2`** — predicted ranking: Chardonnay/Pinot Noir, Palomino, Touriga Nacional/Touriga Franca, Sercial/Verdelho/Bual/Malmsey, Sémillon/Sauvignon Blanc, Furmint

| Slot | Actual variety | Country |
| --- | --- | --- |
| 5 | Chardonnay | France |
| 6 | Chardonnay/Pinot Noir | France |
| 7 | Touriga Nacional/Touriga Franca | Portugal |
| 8 | Touriga Nacional/Touriga Franca | Portugal |
| 9 | Semillon/Sauvignon Blanc | France |
| 10 | Semillon/Sauvignon Blanc | France |
| 11 | Riesling | Germany |
| 12 | Riesling | Germany |

## Most common mispredictions

- Riesling -> Chardonnay (3)
- Grenache/Tempranillo -> Cabernet Sauvignon/Merlot (2)
- Sangiovese -> Cabernet Sauvignon/Merlot (2)
- Touriga Franca/Touriga Nacional -> Chardonnay/Pinot Noir (2)
- Sauvignon Blanc/Semillon -> Chardonnay/Pinot Noir (2)
- Riesling -> Chardonnay/Pinot Noir (2)
- Assyrtiko -> Vermentino (1)
- Bourboulenc/Clairette -> Vermentino (1)
- Cabernet Franc -> Sangiovese (1)
- Gamay -> Sangiovese (1)

## How to read this

- This measures the **trees** (which variety is each wine), not the exam-structure
  predictor. For that, see `outputs/backtest_reports/2026_holdout.md`.
- The baseline column is the post-fix LOYO figure, which was itself measured after tree
  edits made in response to the 2024/2025 misses — so it is optimistic. This 2026 column
  had no such opportunity, which is the entire point of the comparison.
- Per EK-0083 the trees score 0% top-1 on multi-grape labels, so blend-heavy flights will
  drag top-1 while candidate-set holds up. Read the two together.
