---
description: Pull a randomized study session - N questions across years with their decision matrices and model answers.
argument-hint: <count> [paper-filter] (e.g. "5" or "3 p2")
---

Arguments: $ARGUMENTS

1. Parse the count (default 5) and optional paper filter.
2. Randomly select that many questions from `data/exams.json`, applying the filter if given.
3. For each, present in this format:
   - Question text only (don't show wines yet)
   - Pause for the user to attempt mentally
   - Then show: decision matrix, actual wines, model answer
4. After the batch, ask if the user wants another.
