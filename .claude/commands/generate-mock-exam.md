---
description: Generate a new full three-paper mock exam suite with one combined answer file.
argument-hint: [optional theme or constraint]
---

Arguments: $ARGUMENTS (optional theme or constraint)

You are orchestrating a three-stage pipeline. Execute these steps IN ORDER. Do not skip or combine stages.

## Stage 1 — Generate the exam paper

Spawn a single `mock-exam-writer` subagent (in foreground — you need the result before proceeding):

- Pass the theme/constraint from $ARGUMENTS if provided
- The agent determines the version number by scanning existing mocks, then writes:
  - Clean exam paper → `outputs/mock_exams/mock_full_{YYYY_MM_DD}_v{N}.md`
  - Design rationale → `outputs/mock_exams/mock_full_{YYYY_MM_DD}_v{N}_rationale.md`
- The agent STOPS after writing these two files — it does NOT write answers
- When it returns, confirm BOTH files exist and note the exact base name (e.g. `mock_full_2026_05_27_v9`) — you need it for Stage 2

## Stage 2 — Generate answers (three parallel agents)

Once Stage 1 is confirmed complete, spawn **exactly three `general-purpose` agents in parallel in the background** using the base name from Stage 1:

### Agent 1 — Paper 1 answers

```
You are writing model answers for Paper 1 of a mock MW practical exam.

Read these files first:
- `C:\Users\russe\Documents\MW_exam\CLAUDE.md`
- `C:\Users\russe\Documents\MW_exam\.claude\agents\_shared_rules.md`
- `C:\Users\russe\Documents\MW_exam\.claude\agents\mock-answer-writer.md` (for answer format and quality rules)
- `C:\Users\russe\Documents\MW_exam\.claude\agents\mock-exam-writer.md` (the "Answer generation — parallel pipeline" section for study diagram assist format)
- `C:\Users\russe\Documents\MW_exam\outputs\heuristics\examiner_report_synthesis.md`
- The exam file: `C:\Users\russe\Documents\MW_exam\outputs\mock_exams/{BASE_NAME}.md`
- `C:\Users\russe\Documents\MW_exam\outputs\master_trees\p1_whites_tree.md`
- `C:\Users\russe\Documents\MW_exam\outputs\study_diagrams\p1_whites.md`
- `C:\Users\russe\Documents\MW_exam\outputs\study_diagrams\variety_cards.md`

Extract ONLY the Paper 1 questions and wines from the exam file. For each question, write:
1. A model answer following mock-answer-writer rules (8-minute discipline, 250-420 words, MW-note style)
2. A `## Proposed annotation` section
3. A `## Reasoning trace` section
4. A `## Study diagram assist` section walking through the P1 whites decision tree step by step

For wine research: read any matching files in `C:\Users\russe\Documents\MW_exam\data\wine_research\`. For wines not in the research corpus, use web search (Tavily) to get tasting notes, tech sheets, and producer info before writing the answer.

Write the output to: `C:\Users\russe\Documents\MW_exam\outputs\mock_exams/{BASE_NAME}_answers_p1.md`

Start the file with:
# Mock Answers — Paper 1 (Whites)
```

### Agent 2 — Paper 2 answers

Same as Agent 1 but for Paper 2, reading:
- `p2_reds_tree.md` and `study_diagrams/p2_reds.md` instead of whites
- Writing to `{BASE_NAME}_answers_p2.md`

### Agent 3 — Paper 3 answers

Same as Agent 1 but for Paper 3, reading:
- `p3_special_tree.md` and `study_diagrams/p3_special.md` instead of whites
- Writing to `{BASE_NAME}_answers_p3.md`

**IMPORTANT**: Launch all three agents in a SINGLE message so they run concurrently. Use `run_in_background: true` for all three.

## Stage 3 — Combine answer files

After all three background agents complete, concatenate the per-paper answer files into one combined file:

1. Read `{BASE_NAME}_answers_p1.md`, `{BASE_NAME}_answers_p2.md`, `{BASE_NAME}_answers_p3.md`
2. Write a combined file to `outputs/mock_exams/{BASE_NAME}_answers.md` with this structure:

```markdown
---
mock_exam_id: {BASE_NAME}
papers: [1, 2, 3]
generated: {DATE}
---

# Mock Answers — Full Exam Suite

{Paper 1 answers content}

{Paper 2 answers content}

{Paper 3 answers content}
```

3. Report all file paths to the user:
   - Exam paper: `outputs/mock_exams/{BASE_NAME}.md`
   - Rationale: `outputs/mock_exams/{BASE_NAME}_rationale.md`
   - Combined answers: `outputs/mock_exams/{BASE_NAME}_answers.md`
   - Per-paper answers (kept for reference): `_answers_p1.md`, `_answers_p2.md`, `_answers_p3.md`

## File naming convention

- `mock_full_{YYYY_MM_DD}_v{N}.md` — clean exam paper (questions + wine lists only, candidate-facing)
- `mock_full_{YYYY_MM_DD}_v{N}_rationale.md` — design reasoning, sourcing logs, validity checks (internal)
- `mock_full_{YYYY_MM_DD}_v{N}_answers.md` — combined model answers with annotations, reasoning traces, study diagram assists
- `mock_full_{YYYY_MM_DD}_v{N}_answers_p{1,2,3}.md` — per-paper answer files (intermediate, kept for reference)

## Why this pipeline

A single agent producing exam + answers burns ~175k tokens over ~30 minutes and routinely hits context limits before finishing. Three parallel answer agents each use ~35-50k tokens in ~1-2 minutes. Wall-clock time drops from 30+ min to ~10 min and answer quality improves because each agent has full context for its paper.
