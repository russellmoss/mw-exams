# MW Exam Study System

A local Claude Code project that builds study materials for the Master of Wine practical (blind tasting) examination from ten years of past papers.

## What this builds

- **Decision matrices** — predict the wines in an exam question from its wording alone
- **Wine knowledge base** — tasting notes, tech sheets, and producer info for ~360 wines from past exams
- **Mock exams** — new practice papers in the IMW style, with model answers
- **Mock answers** — 8-minute model answers for all 112 historical questions
- **Annotation drafts** — proposed reasoning notes for unannotated past questions

## Layout

- `source/` — the annotated source MD (read-only, treat as authoritative)
- `data/` — structured JSON parsed from source + wine research files
- `outputs/` — generated study materials
- `scripts/` — Python utilities (parsers, validators)
- `tests/` — verification tests run between phases
- `.claude/agents/` — subagent definitions
- `outputs/heuristics/question_taxonomy.md` — canonical question-family taxonomy for the corpus
- `outputs/taxonomy_tags/` — per-question taxonomy assignments for downstream synthesis
- `outputs/question_type_matrices/` — study matrices organized by paper and question family
- `.claude/commands/` — slash commands

## Getting started

1. Confirm `.env` contains your Tavily API key
2. Confirm `source/MW_Practical_Papers_Compilation.md` exists
3. Run `python scripts/parse_source.py` (after Phase 1 builds it)
4. Then use slash commands like `/analyze-question 2024 p1 q2` (after Phase 9)

## Conventions

- Years are integers (`2025`), papers are `p1` `p2` `p3`, questions are `q1` `q2` etc.
- Wine slots within a paper are `w1` through `w12`.
- A full wine reference: `2024_p1_w3` = "2024 Paper 1 Wine 3" = the Corton-Charlemagne.
