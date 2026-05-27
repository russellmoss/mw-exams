# Country Concentration Reference — Historical MW Practical Exam Corpus

Derived from 42 papers across 14 exam years (2011-2025). Use this as the empirical basis for country-distribution guardrails when generating mock exams.

## Max wines from any single country, per paper-year

| Max Count | Occurrences | % of Papers | Notes |
|-----------|-------------|-------------|-------|
| 2 | 5 | 11.9% | Very diverse papers |
| 3 | 9 | 21.4% | |
| 4 | 11 | 26.2% | Most common |
| 5 | 9 | 21.4% | |
| 6 | 3 | 7.1% | |
| 7 | 1 | 2.4% | 2024 P3 (France) |
| 8 | 3 | 7.1% | 2015 P1, 2017 P1, 2018 P3 (all France) |
| 9 | 1 | 2.4% | 2012 P1 (France) — all-time max |

## By paper type

| Paper | Avg countries | Max single-country ever | Typical max range |
|-------|--------------|------------------------|-------------------|
| P1 (whites) | 5.6 | 9 (France, 2012) | 3-6 |
| P2 (reds) | 6.8 | 6 (France 2016/2021/2025) | 2-5 |
| P3 (special) | 6.2 | 8 (France, 2018) | 3-5 |

## The 8+ club (all France, all with multi-region justification)

| Year | Paper | France count | Regions used |
|------|-------|-------------|--------------|
| 2012 | P1 | 9/12 | Loire (4), Burgundy (3), Alsace (1), Rhône (1) |
| 2015 | P1 | 8/12 | Burgundy, Loire, Alsace, Languedoc, Rhône |
| 2017 | P1 | 8/12 | Burgundy, Loire, Alsace, Bordeaux |
| 2018 | P3 | 8/12 | Champagne, Rhône, Alsace, Jura, Bordeaux |

## Guardrails for mock generation

- Default cap: **max 6** from any country per paper (covers 90% of historical papers)
- P2 hard ceiling: **6** (never exceeded historically)
- P1/P3 hard ceiling: **8** (only with multi-region pedagogical justification)
- Target: **5-7 distinct countries** per paper
