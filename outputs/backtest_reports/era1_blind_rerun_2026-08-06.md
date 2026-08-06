# Era-1 blind backtest re-run — current trees vs the 2000–2010 papers (2026-08-06)

The held-out re-validation of the routing-sweep fix pass (see `routing_sweep_postfix_2026-08-06.md`).
The 2000–2010 corpus is the one body of material the fix pass never touched — the routing sweep and
every tree edit were derived from 2011–2026 only — so this measures whether the structural fixes
**generalize**, on the exact protocol of the original blind test.

## Protocol — identical to `era1_blind_backtest_2000_2010.md`

- Same blind inputs: `scripts/build_backtest_input.py` (stems + slot counts only, leak-checked).
- Same ground truth: the 396 resolved (variety, country, region) triples from the original run,
  reused verbatim (they were resolved without sight of any prediction).
- Same prediction discipline: six agents, each reading ONLY its paper's tree + family pack + the
  blind stems; no corpus files, no web; ranked lists capped at 8 varieties; unroutable stems
  declared explicitly.
- Same scorer: `scripts/score_backtest.py` (synonym-aware, deterministic).
- Scored output: `era1_blind_rerun_2026-08-06.json` (this folder).

The one uncontrolled difference from the January baseline is the predicting model/run — LLM
prediction passes carry run-to-run variance. The deltas below are large and single-direction
across every metric, which variance alone does not produce, but treat the exact figures as
approximate.

## Results — current (2026-08-06) trees vs the frozen-tree baseline

| Metric | Frozen trees (baseline) | Current trees | Δ |
|---|---|---|---|
| Stems with no matching branch | 32/111 (29%) | **6/111 (5%)** | −24pp |
| Variety top-1 | 30% | 33% | +3pp |
| Variety top-3 | 52% | **58%** | +6pp |
| Variety in-set | 69% | **80%** | +11pp |
| Country top-1 | 36% | 40% | +4pp |
| Country top-3 | 62% | **69%** | +7pp |
| Country in-set | 83% | **90%** | +7pp |
| Region in-set | 25% | 37% | +12pp |
| MRR variety / country | 0.43 / 0.52 | 0.48 / 0.57 | + |

Per paper (variety top-1/top-3/in-set): P1 46/69/84 (was 35/61/80), P2 34/63/88 (was 33/57/78),
P3 19/42/69 (was 20/39/51).

## Reading

- **The routing repair transfers.** Unroutable stems fell 29% → 5% on constructions the fixes were
  never derived from; the six that remain (vintage vertical, single-wine isolation, OW-vs-NW grid,
  three P3 mixed shapes) fall to Branch 0 by design rather than by force-fit.
- **The gains concentrate exactly where the mechanism predicts:** in-set and top-3 (wider, correctly
  routed candidate sets) more than top-1 (which needs the glass, not the stem). Top-1 remains ~1 in
  3 — the standing guidance is unchanged: use the tree to bound the universe, let the glass decide.
- **P3 is still the weakest paper** on old material (19% top-1), though its candidate-set coverage
  moved most (51 → 69). Old P3 constructions remain the system's frontier.
- The 2026-and-earlier "holdout" columns quoted in older reports can no longer be re-measured
  honestly — every year 2011–2026 is now training material. This corpus and the 2027 sit are the
  only honest tests remaining.
