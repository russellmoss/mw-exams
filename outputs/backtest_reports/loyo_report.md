# LOYO Backtest Report — Light LOYO (Existing Trees)

**Folds:** 10 (one per year: 2015, 2016, 2017, 2018, 2019, 2021, 2022, 2023, 2024, 2025)
**Questions scored:** 112
**Wines scored:** 360
**Scorer:** Deterministic Python with appellation lookup + synonym normalization

## 1. Headline averages (across 10 folds)

| Metric | Mean | Std Dev | Target |
|--------|------|---------|--------|
| top1_variety | 51.3% | 9.3% | naive+20pp (36.9%) |
| top3_variety | 70.7% | 8.8% | 70.0% |
| top1_region_country | 22.1% | 9.4% | — |
| top1_region_subregion | 38.4% | 9.9% | — |
| top3_region | 46.2% | 12.3% | — |
| candidate_set | 82.5% | 7.1% | 85.0% |
| mrr_variety | 62.3% | 7.5% | — |
| mrr_region | 34.0% | 10.7% | — |

**Naive baseline:** 16.9% (predict most common variety per paper)
- P1 naive: always predict Chardonnay -> 21.7%
- P2 naive: always predict Pinot Noir -> 19.2%
- P3 naive: always predict Chardonnay/Pinot Noir -> 10.0%
**Naive baseline delta:** +34.4pp (PASS)

## 2. Year-by-year results

| Year | Qs | Top-1 var | Top-3 var | Top-1 region | Top-3 region | CS hit | MRR var | MRR reg |
|------|----|-----------|-----------|--------------|--------------| -------|---------|---------|
| 2015 | 10 | 47.5% | 59.2% | 30.0% | 57.5% | 87.5% | 56.7% | 43.5% |
| 2016 | 14 | 70.8% | 77.4% | 26.2% | 46.4% | 74.4% | 76.2% | 36.1% |
| 2017 | 14 | 46.4% | 73.8% | 32.1% | 60.7% | 83.9% | 58.7% | 46.3% |
| 2018 | 10 | 48.7% | 72.7% | 9.5% | 29.2% | 90.0% | 62.4% | 20.0% |
| 2019 | 11 | 53.8% | 71.2% | 14.4% | 43.2% | 84.8% | 64.4% | 27.3% |
| 2021 | 11 | 61.7% | 89.2% | 27.9% | 52.7% | 76.5% | 74.0% | 39.7% |
| 2022 | 12 | 55.1% | 64.0% | 31.5% | 52.9% | 84.4% | 62.6% | 42.1% |
| 2023 | 10 | 40.8% | 68.3% | 21.7% | 42.5% | 90.0% | 56.8% | 32.4% |
| 2024 | 10 | 46.2% | 59.8% | 22.7% | 54.0% | 68.3% | 53.3% | 39.0% |
| 2025 | 10 | 42.0% | 71.0% | 5.3% | 22.7% | 85.0% | 57.7% | 13.5% |

## 3. Per-paper breakdown (averaged across all folds)

| Paper | Top-1 var | Top-3 var | Top-1 region | CS hit | MRR var | Wines |
|-------|-----------|-----------|--------------|--------|---------|-------|
| P1 | 44.4% | 68.7% | 21.4% | 71.6% | 56.7% | 37 |
| P2 | 60.8% | 81.6% | 25.5% | 84.9% | 72.0% | 37 |
| P3 | 50.9% | 63.1% | 21.5% | 90.0% | 59.8% | 38 |

## 4. Hardest and easiest years

### Hardest
- **2023** (top-1 variety: 40.8%, 10 questions)
- **2025** (top-1 variety: 42.0%, 10 questions)

### Easiest
- **2021** (top-1 variety: 61.7%, 11 questions)
- **2016** (top-1 variety: 70.8%, 14 questions)

## 5. Confusion matrix (variety predictions)

Top 20 actual varieties by frequency, showing top-1 hit rate and most common misprediction:

| Actual variety | Count | Top-1 hit% | Most common misprediction | Mispredict count |
|---------------|-------|------------|---------------------------|-----------------|
| Chardonnay | 35 | 57.1% | Unknown | 6 |
| Pinot Noir | 27 | 66.7% | Unknown | 3 |
| Riesling | 21 | 66.7% | Chardonnay | 2 |
| Cabernet Sauvignon/Merlot | 15 | 0.0% | Cabernet Sauvignon | 7 |
| Sauvignon Blanc | 14 | 28.6% | Unknown | 4 |
| Chenin Blanc | 13 | 38.5% | Riesling | 3 |
| Chardonnay/Pinot Noir | 12 | 0.0% | Chardonnay | 9 |
| Syrah | 10 | 80.0% | Tempranillo | 1 |
| Grenache/Tempranillo | 9 | 0.0% | Grenache | 3 |
| Touriga Franca/Touriga Nacional | 9 | 0.0% | Chardonnay | 2 |
| Grenache/Syrah | 9 | 0.0% | Grenache | 4 |
| Palomino | 8 | 62.5% | Chardonnay | 1 |
| Pinot Gris | 8 | 50.0% | Savagnin | 1 |
| Sauvignon Blanc/Semillon | 8 | 0.0% | Sauvignon Blanc | 3 |
| Sangiovese | 7 | 71.4% | Nebbiolo | 2 |
| Muscat | 7 | 28.6% | Riesling | 3 |
| Gewurztraminer | 6 | 0.0% | Riesling | 2 |
| Nebbiolo | 6 | 50.0% | Sangiovese | 2 |
| Malbec | 6 | 50.0% | Pinot Noir | 3 |
| Cabernet Franc | 6 | 33.3% | Cabernet Sauvignon | 2 |
| Grenache | 6 | 33.3% | Cinsault | 1 |
| Albarino | 5 | 20.0% | Semillon | 1 |
| Furmint/Harslevelu | 5 | 0.0% | Riesling | 2 |
| Corvina/Corvinone | 5 | 0.0% | Corvina | 3 |
| Semillon | 4 | 50.0% | Unknown | 2 |
| Viognier | 4 | 25.0% | Semillon | 1 |
| Gamay | 4 | 50.0% | Tempranillo | 1 |
| Cabernet Franc/Merlot | 4 | 0.0% | Cabernet Sauvignon | 1 |
| Cinsault/Grenache | 4 | 0.0% | Grenache | 2 |
| Gruner Veltliner | 3 | 0.0% | Semillon | 2 |

## 6. Known weak spots

Varieties where the tree's top-1 hit rate is below 30% across the full corpus:

- **Cabernet Sauvignon/Merlot** (15 wines, 0.0% top-1 hit): most often predicted as Cabernet Sauvignon
- **Sauvignon Blanc** (14 wines, 28.6% top-1 hit): most often predicted as Unknown
- **Chardonnay/Pinot Noir** (12 wines, 0.0% top-1 hit): most often predicted as Chardonnay
- **Grenache/Tempranillo** (9 wines, 0.0% top-1 hit): most often predicted as Grenache
- **Touriga Franca/Touriga Nacional** (9 wines, 0.0% top-1 hit): most often predicted as Chardonnay
- **Grenache/Syrah** (9 wines, 0.0% top-1 hit): most often predicted as Grenache
- **Sauvignon Blanc/Semillon** (8 wines, 0.0% top-1 hit): most often predicted as Sauvignon Blanc
- **Muscat** (7 wines, 28.6% top-1 hit): most often predicted as Riesling
- **Gewurztraminer** (6 wines, 0.0% top-1 hit): most often predicted as Riesling
- **Albarino** (5 wines, 20.0% top-1 hit): most often predicted as Semillon
- **Furmint/Harslevelu** (5 wines, 0.0% top-1 hit): most often predicted as Riesling
- **Corvina/Corvinone** (5 wines, 0.0% top-1 hit): most often predicted as Corvina
- **Viognier** (4 wines, 25.0% top-1 hit): most often predicted as Semillon
- **Cabernet Franc/Merlot** (4 wines, 0.0% top-1 hit): most often predicted as Cabernet Sauvignon
- **Cinsault/Grenache** (4 wines, 0.0% top-1 hit): most often predicted as Grenache
- **Gruner Veltliner** (3 wines, 0.0% top-1 hit): most often predicted as Semillon
- **Malvasia/Trebbiano** (3 wines, 0.0% top-1 hit): most often predicted as Riesling
- **Grenache Noir** (3 wines, 0.0% top-1 hit): most often predicted as Palomino
- **Clairette/Grenache Blanc** (3 wines, 0.0% top-1 hit): most often predicted as Sauvignon Blanc
- **Macabeo/Xarel-lo** (3 wines, 0.0% top-1 hit): most often predicted as Xarel-lo

## 7. Note on partial parses

13 of 112 matrices scored with weaker region predictions due to non-standard section structure.

| Metric | Full-parse files (99) | Partial-parse files (13) | Impact |
|--------|----------------------|-------------------------|--------|
| top1_variety | 54.3% | 34.2% | -20.1pp |
| top3_variety | 73.6% | 51.8% | -21.8pp |
| top1_region_country | 22.3% | 26.2% | +3.8pp |
| top1_region_subregion | 36.6% | 57.8% | +21.2pp |
| top3_region | 44.9% | 61.9% | +17.0pp |
| candidate_set | 83.0% | 76.9% | -6.0pp |
| mrr_variety | 64.9% | 46.6% | -18.3pp |
| mrr_region | 33.3% | 44.5% | +11.1pp |

Partial-parse files:
- `2015_p3_q3`
- `2017_p3_q1`
- `2017_p3_q2`
- `2017_p3_q6`
- `2018_p3_q2`
- `2021_p2_q4`
- `2021_p3_q2`
- `2021_p3_q3`
- `2023_p3_q2`
- `2024_p1_q3`
- `2024_p2_q2`
- `2025_p1_q3`
- `2025_p3_q3`

## 8. Final recommendation

- Naive baseline delta: +34.4pp (PASS, threshold +20pp)
- Top-3 variety: 70.7% (PASS, threshold 70%)
- Candidate-set hit: 82.5% (BELOW TARGET, threshold 85%)
