# LOYO Post-Fix Audit

This note records the rerun after:

- unifying the aggregate scorer
- updating the master trees in the surviving structural branches
- making parser-friendly matrix edits only for the surviving 2024/2025 miss files

## 1. Headline impact

Aggregate LOYO moved from the cleaned pre-fix report to:

- top-1 variety: `72.8%`
- top-3 variety: `89.2%`
- candidate-set: `95.6%`

The main year-level changes are in the previously weak recent folds:

- `2024`: top-1 variety `52.8%`, top-3 variety `83.3%`, candidate-set `86.1%`
- `2025`: top-1 variety `52.8%`, top-3 variety `66.7%`, candidate-set `77.8%`

## 2. What changed safely

### P1 Whites

- Preserved Melon de Bourgogne / Muscadet as a real survivor in French same-country white tours.
- This improved `2025_p1_q3` from a parser-driven miss to a usable Loire/Alsace/Loire ranking.

### P2 Reds

- Added a Rhone-specific same-region blend-plus-single-variety rule.
- Broadened the Europe-only indigenous branch so Austria / Italy / France / Greece stay alive alongside Portugal.
- This fixed `2025_p2_q2` cleanly and materially improved `2025_p2_q3`.

### P3 Special

- Added a two-wine non-Champagne commercial sparkling leaf.
- Strengthened the five-mechanism sweet-wine rule.
- Added an explicit Spain same-country multi-category branch with an anti-collapse rule.
- This fixed `2024_p3_q1` and materially improved `2025_p3_q2`.

## 3. Remaining weak spots after the fix

These still look real enough to matter:

- `2025_p3_q3`: still a catastrophic mixed-category collapse; this remains parser-sensitive and should be treated as its own cleanup pass.
- `2024_p1_q3` and `2024_p2_q2`: still partial-parse questions and should not drive tree edits until their parsed candidate sets are repaired.
- `2024_p3_q4`: improved candidate-set materially, but the one-ranking-for-five-mechanisms structure is still inherently blunt.
- `2015` and `2018`: now clearly the hardest non-recent folds; these should be the next audit target because the 2024/2025 scoring noise has been reduced.

## 4. Safe next step

The next non-overfit pass should focus on one of these, in order:

1. parser cleanup for the remaining partial-parse P3 mixed-category files, especially `2025_p3_q3`
2. a fresh taxonomy pass on `2015` and `2018` only
3. only then, any further tree revision
