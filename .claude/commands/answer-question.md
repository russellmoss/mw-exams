---
description: Generate an 8-minute mock answer to an MW exam question.
argument-hint: <year> <p1|p2|p3> <q1|q2|...>
---

Arguments: $ARGUMENTS

1. Parse year, paper, question.
2. Verify wine-research briefs exist for the wines in this question. If missing, prompt the user whether to research them first.
3. Invoke the `mock-answer-writer` subagent.
4. Report the path of the generated answer and the word count.
