# Decision Tree Remaining Work

Last updated: 2026-05-26

## Purpose

This is the handoff doc for the remaining work on building usable decision trees for MW practical questions by paper and by question type, for both:

- pre-taste strategy
- in-glass / tasting strategy

Use this to resume work without reconstructing context.

## Current state

- Taxonomy layer is usable.
  - Canonical taxonomy: [question_taxonomy.md](C:/Users/russe/Documents/MW_exam/outputs/heuristics/question_taxonomy.md)
  - Tagged corpus index: [question_taxonomy_index.md](C:/Users/russe/Documents/MW_exam/outputs/heuristics/question_taxonomy_index.md)
- Master trees exist as broad paper-level trees.
  - [p1_whites_tree.md](C:/Users/russe/Documents/MW_exam/outputs/master_trees/p1_whites_tree.md)
  - [p2_reds_tree.md](C:/Users/russe/Documents/MW_exam/outputs/master_trees/p2_reds_tree.md)
  - [p3_special_tree.md](C:/Users/russe/Documents/MW_exam/outputs/master_trees/p3_special_tree.md)
- Family tree packs now exist as the family-level layer underneath the master trees.
  - [p1_family_tree_pack.md](C:/Users/russe/Documents/MW_exam/outputs/master_trees/p1_family_tree_pack.md)
  - [p2_family_tree_pack.md](C:/Users/russe/Documents/MW_exam/outputs/master_trees/p2_family_tree_pack.md)
  - [p3_family_tree_pack.md](C:/Users/russe/Documents/MW_exam/outputs/master_trees/p3_family_tree_pack.md)
- Per-family matrix templates exist.
  - [family_matrix_templates.md](C:/Users/russe/Documents/MW_exam/outputs/heuristics/family_matrix_templates.md)
- Decision matrices exist for all 112 questions.
- Parser is now clean: 112/112 full parse.
- LOYO scoring has been rerun after parser cleanup.

## What was just finished (2026-05-26)

Each paper now has a family-by-family tree system covering:

1. pre-taste triage
2. tasting-time branching
3. matrix-writing templates driven by the taxonomy family

The three new `*_family_tree_pack.md` files cover every active taxonomy family in their paper. Each family section uses a consistent structure:

- `Pre-taste objective`
- `Stem triggers`
- `Default candidate universe`
- `Default rule-outs`
- `Main traps`
- `Pre-taste decision branches`
- `Tasting branch order`
- `Branch-specific candidate narrowing`
- `When to stay broad vs commit`
- `Matrix-writing template guidance`

The `family_matrix_templates.md` file gives the per-family matrix skeletons that all 112 question matrices (and future Phase 5B re-analysis matrices) should adopt.

## What is still not finished

The remaining work is now smaller and concrete:

1. Re-map the 112 historical decision matrices to the family tree-pack logic and note where existing matrices diverge.
2. Rerun LOYO scoring after the family tree packs are operational (only after at least one full re-mapped batch of matrices is in place).
3. Targeted patches against weak LOYO folds — only where failures recur across at least two questions.
4. Optional: build a small `F8 P3 curveball appendix` if future corpus years accumulate more amber/orange/qvevri sets.

## The two-layer tree system (now built)

Each paper has both layers:

1. `Pre-taste tree`
   - decide what kind of question this is before tasting
   - identify the dominant constraint from the stem
   - produce the right candidate universe and the right traps

2. `Tasting tree`
   - once the wines are in the glass, decide how to branch
   - prioritize the features that matter for that family
   - rank candidate identities/origins/styles with less collapse

These live inside the new `*_family_tree_pack.md` files, one section per taxonomy family per paper.

## Target structure (now implemented)

For each paper, the tree pack has one section per taxonomy family actually used in that paper. Each family section contains:

- `Pre-taste objective`
- `Stem triggers`
- `Default candidate universe`
- `Default rule-outs`
- `Main traps`
- `Pre-taste decision branches`
- `Tasting branch order`
- `Branch-specific candidate narrowing`
- `When to stay broad vs commit`
- `Matrix-writing template guidance`

## Paper 1 — built status

All P1 family trees are built in [p1_family_tree_pack.md](C:/Users/russe/Documents/MW_exam/outputs/master_trees/p1_family_tree_pack.md):

- `F1` cross-country, same-country, same-region — built (pre-taste + tasting)
- `F2` same-country regional literacy — built
- `F3` Bordeaux Blanc / Rhône Blanc / Iberian / Loire blend tree — built
- `F4` anti-overlink breadth tree with final-question ambush template — built (priority item)
- `F5` human-vs-natural + style-commercial-method — built
- `F7` hierarchy / quality calibration — built

## Paper 2 — built status

All P2 family trees are built in [p2_family_tree_pack.md](C:/Users/russe/Documents/MW_exam/outputs/master_trees/p2_family_tree_pack.md):

- `F1` Pinot / Syrah / Cabernet / regional same-variety — built
- `F2` country / region / hierarchy splits — built
- `F3` Bordeaux + GSM + Iberian + Tuscan + Cape blend tree — built (priority item)
- `F4` anti-overlink for the 15-question bucket — built (priority item)
- `F7` classification / age ladders — built

## Paper 3 — built status

All P3 family trees are built in [p3_family_tree_pack.md](C:/Users/russe/Documents/MW_exam/outputs/master_trees/p3_family_tree_pack.md):

- `F1d` cross-style single-variety — built
- `F2a / F2b / F2d` same-origin / region / elevage — built
- `F4` mixed-category anti-overlink tasting tree — built (priority item)
- `F5a–F5f` sparkling / sweet / fortified / oxidative / hybrid method tree — built (highest-priority item)
- `F6` sweetness / alcohol / maturity axis tree — built
- `F7` classification / commercial-position tree (incl. 2025 P3 Q3 template) — built (priority item)

## Highest-priority items — status

| Priority | Item | Status |
| --- | --- | --- |
| 1 | P3 F5 pre-taste tree | Built |
| 2 | P3 F5 tasting tree | Built |
| 3 | P3 F4 mixed-category tasting tree | Built |
| 4 | P2 F3 blend tree | Built |
| 5 | P1 F4 anti-overlink breadth tree | Built |
| 6 | P3 F7 classification/commercial-position tree | Built |

## What to build next in the repo

Items 1–3 are now done. The remaining concrete deliverables:

1. ~~Create a new tree-pack doc per paper.~~ Done.
2. ~~Add one section per active family with pre-taste tree, tasting tree, common traps, matrix-writing notes.~~ Done.
3. ~~Build matrix templates by family.~~ Done — see [family_matrix_templates.md](C:/Users/russe/Documents/MW_exam/outputs/heuristics/family_matrix_templates.md).
4. **Next:** Re-map the 112 question matrices to the family tree-pack logic and note where existing matrices diverge. This should produce `outputs/decision_matrices_v2/` entries that adopt the per-family matrix templates and reference the relevant family tree-pack section.
5. Rerun LOYO only after structural tree changes (not after prose-only reorganizing). Suggested timing: after at least one full batch of re-mapped matrices is written.

## How to work on this without overfitting

- Change tree logic by repeated family pattern, not by one exam question.
- If a rule only fixes one question, it is probably too specific.
- Prefer broader branch-order improvements over adding more leaves.
- Use recent weak folds as test cases, but do not tune to them literally.
- Keep stem-driven pre-taste logic separate from in-glass logic.

## Suggested next session starting point

The tree-pack layer is done. The next session should focus on the per-question re-mapping:

1. Open [question_taxonomy_index.md](C:/Users/russe/Documents/MW_exam/outputs/heuristics/question_taxonomy_index.md) and pick a paper + family bucket (start with P3 F5 since the tree pack is most opinionated there).
2. For each question in that bucket, open the existing matrix in `outputs/decision_matrices/`.
3. Rewrite it into the matching per-family matrix template from [family_matrix_templates.md](C:/Users/russe/Documents/MW_exam/outputs/heuristics/family_matrix_templates.md), linking to the relevant section of the family tree pack.
4. Save the rewritten matrix into `outputs/decision_matrices_v2/`.
5. After at least one full bucket is re-mapped, rerun LOYO to check whether the family-aware tree pack actually moves accuracy.

## One-sentence summary

The `paper × family × pre-taste/tasting` system is now built; the remaining work is to re-map the 112 historical matrices into the family-aware templates and rerun LOYO on top of the new structure.
