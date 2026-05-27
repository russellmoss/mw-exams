---
description: Research a specific wine from the MW exam corpus.
argument-hint: <year> <p1|p2|p3> <w1|w2|...>
---

You are running the `/research-wine` workflow.

Arguments: $ARGUMENTS (expected format: `YYYY pN wM`)

1. Parse year, paper, slot.
2. Look up the wine in `data/wines.json` (the `id` field will be `{year}_p{paper}_w{slot}`).
3. If `data/wine_research/{wine_id}.md` exists, read and print a summary.
4. Otherwise invoke the `wine-researcher` subagent to research it, then summarize.
