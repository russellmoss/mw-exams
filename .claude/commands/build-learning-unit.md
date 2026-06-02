---
description: Build one learning-unit chapter for the study app, end to end, via the reusable agent team (source-map → research fan-out → write → adversarial verify → visual-spec). Human-gated before publish.
argument-hint: <chapter-number | slug>  e.g. "1" or "grading"
---

You are running `/build-learning-unit` — the orchestrator for one chapter of *"The Practical: How the MW
Exam Is Actually Passed"*, rendered as an interactive learning unit in the study app.

Arguments: $ARGUMENTS (a chapter number or slug).

## The chapter → source map

Resolve the chapter, then assemble its `sourceFiles[]` from this map (read only what's listed — token economy):

| Ch | slug | anchor visual | Source files |
|----|------|---------------|--------------|
| 1 | grading | `GradeBands` | `outputs/research/pass_standard_impact_analysis.md`; `mw_exam_empirical_knowledge.md` §3 + EK-0093, EK-0116; `outputs/research/evidence_audit.md` (pass-standard rows) |
| 2 | trust-model | `TrustBalance` | `outputs/research/examiner_confidence_construction_model.md`, `examiner_confidence_model.md`, `confidence_building_behaviors.md`, `confidence_destroying_behaviors.md`, `confidence_language_corpus.md`; EK §2 + EK-0121–0124. **Also read the user's hand-written Chapter-2 draft as the voice oracle (ask the user for it if not in repo).** |
| 3 | identification-funnel | `Funnel` | `outputs/research/plausibility_framework.md`, `plausibility_grading_gap_analysis.md`; `outputs/master_trees/*`; `outputs/heuristics/examiner_patterns.md`; sample `outputs/decision_matrices_v2/*` |
| 4 | quality-ladder | `QualityLadder` | `outputs/heuristics/quality_price_tier_analysis.md`; EK §3 quality entries |
| 5 | winemaking | `ProcessChain` | `outputs/heuristics/winemaking_diversity_quality_questions.md`, `p1_production_method_contrast_audit.md` |
| 6 | maturity-commercial | `MaturityCurve` | `outputs/heuristics/examiner_patterns.md` (maturity/commercial); EK §3 |
| 7 | communication-technique | — | `outputs/research/examiner_objectives.md`; EK §3 (time/structure) |
| 8 | failure-taxonomy | `FailureCards` | `outputs/research/confidence_destroying_behaviors.md`; EK Howler/Shoehorn/Cascade entries |
| 9 | paper-3-canon | per-style | `outputs/master_trees/p3_special.md`; `outputs/study_diagrams/p3_special.md`; EK §4 P3 |
| 10 | distinction | — | `outputs/research/distinction_candidate_analysis.md`, `sophistication_framework.md` |
| 11 | preparation | — | `outputs/research/system_improvement_roadmap.md`; EK prep entries |
| 12 | evolution | — | `outputs/research/evolution_analysis.md`, `future_exam_prediction.md`, `anti_template_gap_analysis.md` |

If the requested chapter isn't in the map, ask the user for its source files before proceeding.

## Pipeline (drive the subagents in this order)

1. **Source-map** — invoke `learning-unit-sourcemap` with the chapter brief. Produces `_work/ch{NN}/claims.json`.
2. **Gate A (cheap, optional)** — skim `claims.json`. If it surfaces a `conflict`, resolve with the user
   before writing (this corpus has real contradictions; don't let the writer pick blindly).
3. **Research fan-out** — split `claims.json` claims into 3–5 slices; invoke `learning-unit-researcher` once
   per slice **in parallel** (multiple Agent calls in one message). Each writes `_work/ch{NN}/evidence_{slice}.json`.
4. **Write** — invoke `learning-unit-writer`. Produces `outputs/learning_units/ch{NN}_{slug}.json` (status:"draft").
5. **Adversarial verify** — invoke `learning-unit-verifier` (round 1). If `verdict != "clean"`, apply the
   `fix`/`cut` flags (re-invoke the writer with the flags, or edit directly for small fixes), then re-run the
   verifier. Loop until `clean` or two consecutive rounds with no new flags. **Never publish with an open
   howler or fabricated-example flag.**
6. **Visual-spec** — invoke `learning-unit-visual-spec` for the chapter's visual blocks. Produces
   `_work/ch{NN}/visual_specs.md` (the dev builds/reuses the React component from this).
7. **Gate B (human)** — present to the user: the chapter summary, the verifier's final report, and the visual
   specs. On approval, flip `status` to `"published"`. Only then does it show in `/learn`.

## Rules
- The agent team is **reusable** — do not re-author it per chapter; only the brief changes.
- Run researchers in parallel; everything else is sequential (each stage depends on the prior).
- Cite-or-cut is absolute: a factual block with no supporting citation does not ship.
- Keep `_work/` as the audit trail; commit the final `ch{NN}_{slug}.json` + `visual_specs.md`.
- After publish, if the chapter introduces a NEW visual component, ensure it's added to the Visual Registry
  in `SCHEMA.md` and built in the app before flipping to published.
