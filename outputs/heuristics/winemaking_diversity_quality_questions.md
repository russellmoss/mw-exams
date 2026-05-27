# Winemaking Diversity in Quality-Led Questions

This analysis asks whether historical MW practical questions that combine quality assessment with winemaking/method discussion usually select wines with meaningfully different winemaking signatures.

A question is included when its stem contains quality language and winemaking/method/production/oak/maturation language. Diversity is inferred from source-backed `data/wine_research` metadata and technical-note keywords: style category, oak signature, residual sugar, barrel/stainless, malo, lees, skin contact, botrytis, traditional method, oxidative handling, fortification, and related cues.

## Headline

- Historical quality + winemaking/method questions analysed: `91`
- High diversity: `75` (82%)
- Moderate diversity: `2` (2%)
- Paired or limited diversity: `6` (7%)
- Homogeneous winemaking signatures: `8` (9%)

So yes: historically, these questions usually create some winemaking diversity. Fully homogeneous production signatures are the minority, and when they appear they are normally not asking winemaking to carry the quality ranking by itself.

## Relevant Subsets

- Same-variety questions: `20` questions; high/moderate/paired diversity = `90%`; homogeneous = `10%`
- Same-variety plus same-country/same-region questions: `6` questions; high/moderate/paired diversity = `83%`; homogeneous = `17%`
- Explicit compare/rank questions: `18` questions; high/moderate/paired diversity = `94%`; homogeneous = `6%`

## By Flight Size

- `1` wines: `1` questions; homogeneous=1
- `2` wines: `33` questions; high_diversity=28, paired_or_limited_diversity=3, homogeneous=2
- `3` wines: `23` questions; high_diversity=20, homogeneous=3
- `4` wines: `24` questions; high_diversity=20, paired_or_limited_diversity=3, homogeneous=1
- `5` wines: `5` questions; high_diversity=4, moderate_diversity=1
- `6` wines: `5` questions; high_diversity=3, moderate_diversity=1, homogeneous=1

## By Paper

- Paper 1: `30` questions; high_diversity=25, paired_or_limited_diversity=4, homogeneous=1
- Paper 2: `23` questions; high_diversity=17, moderate_diversity=1, paired_or_limited_diversity=1, homogeneous=4
- Paper 3: `38` questions; high_diversity=33, moderate_diversity=1, paired_or_limited_diversity=1, homogeneous=3

## Mock v6 Paper 1 Question 2

- Stem: same variety, same country, quality ranking.
- Stem mentions winemaking/method: `False`
- Flight size: `3`
- Diversity category: `homogeneous`
- Unique winemaking signatures: `1`
- Style count: `1`; oak count: `1`; RS count: `1`

Diagnosis: the Loire Sauvignon Blanc set has homogeneous production logic: cool fermentation, no malo, no overt new oak, mostly stainless/neutral vessel handling. This is acceptable only if the stem makes origin/site/producer hierarchy the quality axis. It is weak if the stem asks winemaking to justify the ranking.

The current repaired stem uses origin, site expression, producer reputation and regional hierarchy, which matches the actual contrast. If winemaking is named in a future version, the flight should include at least one visible production lever: barrel/large-oak vs stainless, lees ageing difference, malo/no malo, skin contact, oxidative/reductive handling, sweetness/arrested fermentation, or bottle age/maturation regime.

## Comparable Historical Questions

- `2013_p1_q4` (2 wines, `high_diversity`, same_variety, same_country, compare_contrast): sig=2, style=1, oak=2, rs=1
- `2016_p1_q2` (2 wines, `high_diversity`, same_variety, same_country, oak_maturation_explicit): sig=2, style=1, oak=2, rs=1
- `2016_p2_q1` (2 wines, `high_diversity`, same_variety, same_region, compare_contrast): sig=2, style=1, oak=2, rs=1
- `2018_p2_q3` (2 wines, `high_diversity`, same_variety, same_region): sig=2, style=1, oak=2, rs=1
- `2021_p1_q3` (2 wines, `paired_or_limited_diversity`, same_variety, same_region, same_producer, compare_contrast): sig=2, style=1, oak=1, rs=1
- `2011_p2_q2` (2 wines, `homogeneous`, same_variety, same_region, method_explicit): sig=1, style=1, oak=1, rs=1

## Exam Writer Optimization

- If the stem says quality with reference to winemaking, do not choose three or four wines whose production answer is essentially identical.
- For a three-wine quality-ranking flight, require at least two distinct winemaking signatures; for a four-wine flight, require at least three unless the stem explicitly says classification, terroir, or same producer is the point.
- If the desired lesson is appellation hierarchy with similar production, phrase the stem as quality with reference to origin/classification, not winemaking.
- If keeping Loire Sauvignon Blanc, improve P1 Q2 by changing one slot to a visibly different production style: e.g. top Pouilly-Fumé/Sancerre with barrel or extended lees, a simpler stainless satellite appellation, and a premium single-site cuvée with neutral oak/foudre texture. Otherwise remove `winemaking` from the ranking justification.
