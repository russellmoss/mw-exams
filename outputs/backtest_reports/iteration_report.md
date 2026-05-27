# Backtest Report — Iteration Backtest

**Iteration:** 2
**Mode:** iteration
**Questions scored:** 20

## Naive baseline comparison

Naive baseline (most common variety per paper): 20.8% top-1 variety hit
Tree top-1 variety hit: 52.7%
**Delta: +31.8pp** (target: +20pp)
Status: PASS

- P1 naive: always predict Sauvignon Blanc → 20.8%
- P2 naive: always predict Pinot Noir → 29.2%
- P3 naive: always predict Grenache → 12.5%

## Overall accuracy

| Metric | Actual | Aspirational Target |
|--------|--------|-------------------|
| top1_variety | 52.7% | naive + 20pp (40.8%) |
| top3_variety | 86.2% | 70.0% |
| top1_region_country | 35.9% | — |
| top1_region_subregion | 51.8% | — |
| top3_region | 73.2% | — |
| candidate_set | 100.0% | 85.0% |
| mrr_variety | 67.0% | — |
| mrr_region | 52.6% | — |

## By paper

| Paper | Top-1 variety | Top-3 variety | Top-1 region | Candidate-set | MRR variety | Qs |
|-------|--------------|--------------|--------------|---------------|-------------|-----|
| P1 | 33.3% | 86.1% | 37.5% | 100.0% | 55.1% | 6 |
| P2 | 54.2% | 83.3% | 46.4% | 100.0% | 66.7% | 6 |
| P3 | 66.0% | 88.3% | 26.9% | 100.0% | 76.2% | 8 |

## By year

| Year | Top-1 variety | Top-3 variety | Top-1 region | Qs |
|------|--------------|--------------|--------------|-----|
| 2023 | 45.8% | 84.2% | 37.5% | 10 |
| 2024 | 59.5% | 88.2% | 34.3% | 10 |

## Confusion matrix (variety families)

| Actual variety | Count | Top-1 hit rate | Most common misprediction |
|---------------|-------|---------------|--------------------------|
| Aglianico | 1 | 0.0% | Nebbiolo |
| Bourboulenc/Clairette/Grenache Blanc/Roussanne | 1 | 0.0% | Sauvignon Blanc/Semillon |
| Cabernet Franc/Merlot | 1 | 0.0% | Nebbiolo |
| Cabernet Sauvignon/Merlot | 1 | 0.0% | Syrah |
| Chardonnay | 6 | 50.0% | Chardonnay/Savagnin |
| Chardonnay/Pinot Noir | 2 | 50.0% | Cinsault/Grenache |
| Chardonnay/Savagnin | 1 | 100.0% | — |
| Chenin Blanc | 3 | 0.0% | Chardonnay |
| Cinsault/Grenache/Mourvèdre | 1 | 0.0% | Cinsault/Grenache |
| Corvina | 1 | 0.0% | Nebbiolo |
| Cremant | 1 | 0.0% | Macabeo/Parellada/Xarel-lo |
| Furmint | 2 | 100.0% | — |
| Gewurztraminer | 1 | 0.0% | Viognier |
| Grenache | 4 | 75.0% | Syrah |
| Gros Manseng/Petit Manseng | 1 | 0.0% | Sauvignon Blanc/Semillon |
| Macabeo/Parellada/Xarel-lo | 2 | 50.0% | Chardonnay/Pinot Noir |
| Malbec | 2 | 0.0% | Pinot Noir |
| Malvasia/Trebbiano | 1 | 0.0% | Riesling |
| Moschofilero | 1 | 0.0% | Viognier |
| Muscat | 2 | 0.0% | Riesling |
| Nebbiolo | 2 | 100.0% | — |
| Nerello Mascalese | 1 | 0.0% | Nebbiolo |
| Pinot Noir | 7 | 100.0% | — |
| Riesling | 4 | 25.0% | Chardonnay |
| Sangiovese | 1 | 0.0% | Nebbiolo |
| Sauvignon Blanc | 5 | 40.0% | Chardonnay |
| Sauvignon Blanc/Semillon | 4 | 100.0% | — |
| Semillon | 2 | 0.0% | Sauvignon Blanc |
| Syrah | 4 | 100.0% | — |
| Tempranillo | 2 | 0.0% | Syrah |
| Various | 2 | 0.0% | Riesling |
| Vidal | 1 | 0.0% | Riesling |
| Viognier | 2 | 50.0% | Riesling |

## Source URL warnings

The following wine_research files lack real source URLs (cannot be used for Layer B scoring):
- `2016_p1_w10.md`
- `2016_p1_w7.md`
- `2017_p2_w5.md`
- `2017_p3_w10.md`
- `2017_p3_w12.md`
- `2017_p3_w2.md`
- `2017_p3_w3.md`
- `2017_p3_w8.md`
- `2017_p3_w9.md`