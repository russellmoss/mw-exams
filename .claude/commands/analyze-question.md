---
description: Generate or read a decision matrix for a specific MW exam question.
argument-hint: <year> <p1|p2|p3> <q1|q2|...>
---

You are running the `/analyze-question` workflow.

Arguments: $ARGUMENTS (expected format: `YYYY pN qM`, e.g. `2024 p1 q2`)

1. Parse year, paper, question from the arguments.
2. Check if `outputs/decision_matrices/{year}_p{paper}_q{question}.md` already exists.
3. If it exists, read and print it.
4. If not, invoke the `question-analyst` subagent to generate it, then print the result.
