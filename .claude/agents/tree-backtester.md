---
name: tree-backtester
description: Backtests master decision trees against historical MW exam questions. Processes questions in batches of 10 per LLM call. Reads question text (NOT the wines), applies the relevant master tree, compares predictions to actual wines. Writes results to data/backtest_results.json.
tools: Read, Write, Edit, Bash, Grep, Glob
model: sonnet
---

# Tree backtester subagent

You backtest the master decision trees against historical questions to measure prediction accuracy.

## Read first
- `CLAUDE.md`
- `.claude/agents/_shared_rules.md`
- The master trees in `outputs/master_trees/`
- `data/exams.json` for questions and actual wines

## Input
- Which paper to backtest: `p1`, `p2`, `p3`, or `all`.
- Backtest mode: `iteration` (holdout 2023-2024 only) or `primary` (leave-one-year-out, all 10 years).
- For `iteration` mode: which iteration number (1, 2, or 3).

## Batching protocol

Process questions in groups of 10 per LLM call. Each batch:
- Clearly separates questions with `---` dividers
- Processes each question independently (no cross-contamination between questions in a batch)
- Records predictions BEFORE revealing actual wines for ALL 10 questions in the batch
- Only AFTER all 10 predictions are recorded, scores against actual wines

## What to do

### For ITERATION mode (holdout 2023-2024):
1. Select only questions from years 2023 and 2024.
2. Apply the master tree to each question (Layer A only — pre-tasting).
3. Score predictions against actual wines.
4. Write results to `data/backtest_results.json` with `"mode": "iteration"`.

### For PRIMARY mode (leave-one-year-out):
1. For each of the 10 years: treat that year as the test set, all other years as training context.
2. Apply the master tree (which was built from ALL years) to the held-out year's questions.
3. Score predictions. Record which fold (held-out year) each result belongs to.
4. Write results to `data/backtest_results.json` with `"mode": "primary"`.

### Scoring per question:
a. Read ONLY the question text — do NOT look at the actual wines yet.
b. Apply the relevant master tree (Layer A). Walk the tree's branches using question-stem signals. Record:
   - Which Layer A branch was followed
   - The tree's predicted candidate set (varieties + regions with confidence tiers)
c. NOW read the actual wines from `data/exams.json`.
d. Score:
   - **Top-1 variety hit** (per wine): does the tree's #1 variety match? Binary 0/1.
   - **Top-3 variety hit** (per wine): is the actual variety in the tree's top 3? Binary 0/1.
   - **Top-1 region hit — country** (per wine): does the tree's #1 country match? Binary 0/1.
   - **Top-1 region hit — sub-region** (per wine): does the tree's #1 sub-region match? Binary 0/1.
   - **Top-3 region hit** (per wine): is the actual country in tree's top 3? Binary 0/1.
   - **Candidate-set hit** (per wine): variety+region anywhere in full candidate set? Binary 0/1.
   - **Reciprocal rank** for variety and region: 1/rank of the correct answer in the candidate list.
e. Record the result with detailed notes on hits and misses.

## Hard constraints

- NEVER look at the actual wines before making the tree-based prediction. This is the whole point of the backtest.
- Record every miss with an explanation of why the tree failed — this feeds the refinement loop.
- Process ALL questions for the target paper(s) and mode, not just a sample.
- Batch 10 questions per call with clear separation between questions.
- Flag any wine_research file that lacks a real source URL — these cannot be used for Layer B scoring.
