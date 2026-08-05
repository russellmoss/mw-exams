# 2026 Holdout — scoring the pre-exam forecast against the real papers

**This is the only true out-of-sample test the system has.** The forecast scored
here (`data/frozen_predictions/predicted_2026_exam_profile.PRE-EXAM-FROZEN.json`)
was committed 2026-05-27, before the exam. Nothing in it saw a 2026 paper.

## Headline

| Metric | Result |
| --- | --- |
| Question archetypes correctly anticipated | **6 of 8** (75% recall) |
| Archetype precision | 60% (10 predicted) |
| Papers with exact question count | 1 of 3 |
| Grape varieties present that were forecast | 28% |
| Countries present that were forecast | 61% |

### Against the 2022-2025 in-sample baseline

| Metric | 2022-25 backtest | 2026 holdout |
| --- | --- | --- |
| Structure (F1 proxy / recall) | 50% | 75% |
| Variety | 60% | 28% |
| Country | 81% | 61% |

The baseline rows are question-level top-3 hit rates on years the model was
tuned against; the holdout column is paper-level recall on a year it had never
seen. They are indicative of the same thing but are not computed identically —
do not read small gaps as signal.

## Paper 1 (whites)

Predicted 4 questions, actual 3 — MISS. Archetype recall 100%, precision 75%.

**Anticipated:** `p1:F1:same_variety_cross_origin`, `p1:F6:maturity_axis`, `p1:F7:quality_calibration`

**Missed:** _none_

**Predicted but absent:** `p1:F2:same_origin_comparative`

**Varieties** — hit: chardonnay, riesling · missed: assyrtiko, bourboulenc, clairette, vermentino

**Countries** — hit: Australia, France, Italy, USA · missed: Austria, Greece, New Zealand

| Q | Archetype | Flight | Varieties | Countries |
| --- | --- | --- | --- | --- |
| 1 | `p1:F1:same_variety_cross_origin` | 6 | chardonnay | Australia, France, Italy, New Zealand, USA |
| 2 | `p1:F6:maturity_axis` | 3 | riesling | Australia, Austria, France |
| 3 | `p1:F7:quality_calibration` | 3 | assyrtiko, bourboulenc, clairette, vermentino | France, Greece, Italy |

## Paper 2 (reds)

Predicted 3 questions, actual 3 — match. Archetype recall 67%, precision 67%.

**Anticipated:** `p2:F2:same_origin_comparative`, `p2:F7:quality_calibration`

**Missed:** `p2:F2:same_region_internal_diversity`

**Predicted but absent:** `p2:F1:same_variety_cross_origin`

**Varieties** — hit: cabernet franc, syrah, tempranillo · missed: cabernet sauvignon, chardonnay, corvina, corvinone, gamay, garnacha, merlot, sangiovese, savagnin

**Countries** — hit: France, Italy, USA · missed: Australia, Spain

| Q | Archetype | Flight | Varieties | Countries |
| --- | --- | --- | --- | --- |
| 1 | `p2:F2:same_origin_comparative` | 3 | cabernet franc, chardonnay, gamay, savagnin | France |
| 2 | `p2:F7:quality_calibration` | 3 | cabernet sauvignon, corvina, corvinone, syrah | Australia, Italy, USA |
| 3 | `p2:F2:same_region_internal_diversity` | 6 | cabernet sauvignon, garnacha, merlot, sangiovese, tempranillo | France, Italy, Spain |

## Paper 3 (special)

Predicted 3 questions, actual 2 — MISS. Archetype recall 50%, precision 33%.

**Anticipated:** `p3:F5:sparkling_method`

**Missed:** `p3:F2:same_region_internal_diversity`

**Predicted but absent:** `p3:F2:same_origin_comparative`, `p3:F7:quality_calibration`

**Varieties** — hit: chardonnay, riesling, sauvignon blanc · missed: chenin blanc, lambrusco, macabeo, pinot noir, semillon, touriga franca, touriga nacional, xarel-lo

**Countries** — hit: France, Italy, Portugal, Spain · missed: England, Germany

| Q | Archetype | Flight | Varieties | Countries |
| --- | --- | --- | --- | --- |
| 1 | `p3:F5:sparkling_method` | 4 | chardonnay, chenin blanc, lambrusco, macabeo, xarel-lo | England, France, Italy, Spain |
| 2 | `p3:F2:same_region_internal_diversity` | 8 | chardonnay, pinot noir, riesling, sauvignon blanc, semillon, touriga franca, touriga nacional | France, Germany, Portugal |

## Caveats

- **Variety recall is pessimistic by construction and is the weakest number here.**
  The denominator counts every variety in the paper including individual blend
  components (corvinone, touriga franca, macabeo), while the forecast only ever
  offered three guesses per slot. It was never going to name a Valpolicella
  component grape. Read the archetype and country rows as the real signal.
- Actual varieties/countries are derived from wine names by the canonical
  `run_loyo` extractors, not from `data/wine_research/` (the 2026 wines have no
  research files yet). Three 2026 wines resolve to an unknown variety and are
  therefore absent from the variety row.
- Label recall is pooled per paper, not per question — see the module docstring.
- Structure scoring is unaffected by both caveats: it derives from question text only.
