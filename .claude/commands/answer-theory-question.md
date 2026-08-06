---
description: Write a rubric-anchored model answer to an MW theory question.
argument-hint: <year> <p1-p5> [q1-q6]
---

Arguments: $ARGUMENTS

1. Resolve the id(s) to `th_{year}_p{paper}_q{question}`. With no question number, do the whole paper.
2. Check a rubric exists in `data/theory/theory_rubrics.json`. Rubrics exist only for
   2016–2019 and 2021–2025; 2015 and 2026 have no examiners' report, so there is nothing
   to anchor an answer to. Say so and stop rather than writing an unanchored answer.
3. Dispatch `theory-answer-writer` subagents, one batch per paper, in parallel.
   Remind each of the word band: 700–1,000 for papers 1–4, **1,050–1,450 for paper 5**
   (which gets 90 minutes per question, not 60).
4. Run `python scripts/build_theory_answers.py` — the coverage gate. Every core
   requirement of the rubric must have a `covers_core` entry, and the word count must sit
   in the paper's time-derived band.
5. Run `python tests/test_theory_answers.py`.
6. Report the answers written and, importantly, the `claims_to_verify` totals — those are
   the factual assertions a human still needs to check before the answer is studied.
