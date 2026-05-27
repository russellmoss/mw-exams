# Quality Price Tier Analysis

This report treats MSRP/retail price as a rough quality proxy for historical MW practical wines. It uses explicit price cues in research notes where available, then falls back to classification and commercial-tier cues.

Price bands are intentionally coarse because historical retail prices vary by market and vintage:

- `value`: <=15
- `mainstream`: 16-30
- `premium`: 31-60
- `super_premium`: 61-120
- `luxury`: 120+

## Corpus Distribution

- Wines analysed: `504`
- Questions analysed: `153`
- Unmapped wine groups: `1`
- Quality-led questions: `134`
- Ranking-led questions: `0`

### All wines by price band

- `premium`: `236`
- `value`: `122`
- `super_premium`: `85`
- `luxury`: `36`
- `mainstream`: `25`

### Price-band source

- `classification_inferred`: `280`
- `commercial_cue`: `119`
- `commercial_tier_inferred`: `51`
- `explicit_price`: `36`
- `fallback`: `18`

### By paper

- Paper 1: value=46, mainstream=9, premium=82, super_premium=25, luxury=6
- Paper 2: value=52, mainstream=6, premium=61, super_premium=43, luxury=6
- Paper 3: value=24, mainstream=10, premium=93, super_premium=17, luxury=24

## Quality Question Patterns

- Quality questions with three or more price bands: `23` / `134`
- Quality questions that are compressed but all high-priced: `60` / `134`
- Quality questions where at least half the wines are super-premium/luxury: `35` / `134`

High-signal historical design usually does one of two things:

- Builds a clear ladder from value/mainstream to premium/fine wine when the candidate must rank quality.
- Keeps all wines high quality only when the question is about internal hierarchy/classification, and then gives a clear legal or producer ladder.

## Mock v6 Paper 2 Question 2 Check

- Price-band mix: premium=1, super_premium=1, luxury=2
- High-price share: `100%`
- Super-premium/luxury share: `75%`
- Band spread: `3`

Interpretation: this is a valid F7/Bordeaux classification ladder, but it is top-heavy. It tests fine distinctions between high-status classified Bordeaux more than broad quality discrimination. That is historically defensible only if the stem foregrounds classification or internal hierarchy.

Suggested refinement: either make the stem explicitly classification-led, or replace one of the two Second Growth / First Growth slots with a clearer lower rung such as generic Medoc/Haut-Medoc, second wine, or Cru Bourgeois. The cleaner ladder would be: value/mainstream Bordeaux -> Cru Bourgeois -> classed growth -> First Growth.

## Most Comparable Historical Questions

These are quality-led questions with broad price spread and clear exam-writer value for calibration:

- `2025_p2_q3` (commercial): value=1, premium=2, super_premium=1, luxury=1; high=80%; top=40%
- `2016_p3_q1` (commercial): premium=1, super_premium=1, luxury=3; high=100%; top=80%
- `2022_p3_q3` (commercial): premium=1, super_premium=1, luxury=1; high=100%; top=67%
- `2018_p1_q1`: premium=2, super_premium=1, luxury=1; high=100%; top=50%
- `2021_p1_q1`: value=1, premium=1, super_premium=2; high=75%; top=50%
- `2023_p2_q2` (commercial): value=2, super_premium=1, luxury=1; high=50%; top=50%
- `2024_p1_q1`: value=2, premium=1, super_premium=3; high=67%; top=50%
- `2021_p3_q2`: premium=3, super_premium=1, luxury=1; high=100%; top=40%
- `2015_p2_q2`: value=1, premium=1, super_premium=1; high=67%; top=33%
- `2023_p3_q4`: value=1, premium=1, luxury=1; high=67%; top=33%
- `2024_p1_q2` (commercial): value=1, mainstream=1, super_premium=1; high=33%; top=33%
- `2014_p3_q2`: mainstream=1, premium=2, luxury=1; high=75%; top=25%
- `2017_p2_q1`: value=1, premium=2, luxury=1; high=75%; top=25%
- `2017_p2_q3` (commercial): value=2, premium=1, super_premium=1; high=50%; top=25%
- `2021_p2_q4` (commercial): value=2, premium=1, super_premium=1; high=50%; top=25%
- `2022_p2_q1`: value=2, premium=1, luxury=1; high=50%; top=25%
- `2025_p1_q2`: value=1, premium=2, super_premium=1; high=75%; top=25%
- `2011_p1_q3`: value=1, premium=4, super_premium=1; high=83%; top=17%
- `2015_p1_q3`: value=2, premium=3, super_premium=1; high=67%; top=17%
- `2018_p1_q2`: value=1, premium=4, luxury=1; high=83%; top=17%

## Exam Writer Rule

For future quality-type questions, target one of these structures:

- Broad discrimination: at least three price bands, ideally one value/mainstream, one premium, and one super-premium/luxury.
- Internal hierarchy: all premium-plus is acceptable, but the stem should name or imply classification, same producer, same appellation, or a legally meaningful quality ladder.
- Avoid four wines that are all high-priced but not clearly tiered; that creates a ranking question where the answer turns on reputation rather than observable quality evidence.
