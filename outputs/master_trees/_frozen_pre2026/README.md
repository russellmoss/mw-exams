# Frozen pre-2026 master trees

Snapshot of `outputs/master_trees/` as it stood **before** the 2026 exam was folded in
(taken 2026-08-05, immediately prior to the 120-matrix re-synthesis).

## Why this exists

These are the exact trees that were scored against the 2026 papers as a blind holdout.
`outputs/backtest_reports/2026_holdout.md` and EK-0142/EK-0143 are only reproducible
against *these* files. Once the live trees absorb 2026, that measurement can never be
re-run honestly — the trees will have seen the answers.

Keep this directory. If a future backtest needs a genuinely 2026-naive tree, use these.

## Provenance
- `p1_whites_tree.md`, `p2_reds_tree.md`, `p3_special_tree.md` — synthesized from the 112
  matrices of 2015-2025, then hand-refined by the LOYO post-fix pass (see EK-0082 for the
  five tree edits of record).
- `p3_special_tree.md` additionally carries the 2026-05-30 refactor that rerooted Layer B
  on visual appearance (commit e0175e0).
- `*_family_tree_pack.md` — the Phase 5B family packs built 2026-05-26.
