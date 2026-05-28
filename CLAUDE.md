# Master of Wine Practical Exam Study System

This project builds study materials for the Institute of Masters of Wine (IMW) practical (blind tasting) examination using ten years of past papers as the training corpus.

## The exam, in one minute

- The MW practical is three blind tasting papers. Each presents **12 wines** with structured questions worth marks.
- **Paper 1: white still wines.** Paper 2: red still wines. **Paper 3: a mix** — sparkling, fortified, sweet, rosé, oxidative, occasionally orange or unusual styles.
- Each candidate has **~12 minutes per wine** total, but with multiple sub-questions this often means **~8 minutes per written response**. Time pressure is brutal; answers must be precise and structured, not exhaustive.
- The IMW tests: variety identification, origin identification (as specific as possible — country → region → sub-region), winemaking inference from the glass, quality judgment in context of origin, maturity, commercial position. Some questions explicitly direct the candidate AWAY from origin and toward style/quality.
- Question stems carry massive information. "Wines 1–4 are from the same single grape variety" combined with the paper section (white/red/etc.) and supplementary clues (ageability mention, climate mention, blend vs single) drastically narrows what the wines could plausibly be.

## Conventions

- **Year**: integer, e.g. `2024`.
- **Paper**: `1`, `2`, or `3` (as integer in JSON, often written `p1` `p2` `p3` in filenames and IDs).
- **Question**: integer within a paper, e.g. `1`, `2`, `3`...
- **Wine slot**: 1–12 within a paper.
- **Wine ID format**: `YYYY_pN_wM`, e.g. `2024_p1_w3` is "Master of Wine Exam 2024, Paper 1, Wine 3".
- All textual content (wine names, question text) is treated as authoritative and never paraphrased when extracted from source.

## Data sources (read these, don't duplicate them)

- `source/MW_Practical_Papers_Compilation.md` — the human-readable annotated source. **Authoritative for question text and wine names.** Do not modify.
- `data/exams.json` — structured questions and wines per year/paper.
- `data/wines.json` — flat list of wine slots with `full_text`.
- `data/annotations.json` — examiner-intent notes per question. Some are filled (the user's expert reasoning); most are empty (targets for the annotation-proposer agent).
- `data/wine_research/` — one MD file per wine, populated by the wine-researcher subagent. Filename: `{wine_id}.md`.

## Outputs go in `outputs/`

- `outputs/decision_matrices/` — one MD per question: paper context → stem signals → plausible varieties/regions → ruling out → narrowed candidates.
- `outputs/mock_exams/` — full generated papers, dated.
- `outputs/mock_answers/` — 8-minute-constrained answers to historical questions.
- `outputs/proposed_annotations/` — drafts for empty annotations (user reviews then merges into source MD).
- `outputs/master_trees/` — **the core study artifacts**: three master decision trees (P1 whites, P2 reds, P3 special) that the candidate carries into the exam. These are authoritative for the candidate's exam strategy.
- `outputs/backtest_reports/` — accuracy reports from backtesting master trees against the 112 historical questions.
- `outputs/heuristics/` — examiner pattern analysis extracted from the 112-question corpus.
- `outputs/decision_matrices_v2/` — tree-aware decision matrices (Phase 5B re-analysis). These are what the candidate studies from.

## Decision trees are the core artifact

The master decision trees in `outputs/master_trees/` are the single most important output of this system. They target **variety + region accuracy** — correctly identifying the grape variety AND the country or major region (e.g. "Burgundy Chardonnay", "Barossa Shiraz"). This is the scoring rubric the trees are designed around.

**Producer, vintage, and vineyard identification are bonus, not the target.** A candidate who nails variety + region on every wine passes. A candidate who guesses the exact producer but misidentifies the variety fails. The trees encode this priority — they prune toward variety+region buckets, not specific wines.

Confidence is expressed using three tiers — **STRONG SIGNAL** (high confidence), **PLAUSIBLE** (worth considering), and **CURVEBALL** (low confidence, taste carefully) — not percentages. The 10-year corpus is too small for reliable probability distributions.

The candidate's exam strategy lives in `outputs/master_trees/` (the trees) and `outputs/decision_matrices_v2/` (the tree-applied matrices). `outputs/decision_matrices/` contains the raw stem-only analysis from Phase 5A and is preserved as the unbiased training input.

All other study artifacts (decision matrices, mock answers, mock exams) build on top of these trees. The question-analyst subagent applies the relevant master tree to each specific question; the backtest loop validates the trees against the full historical corpus.

## Working principles for every agent

1. **Cite sources.** When making a claim about a wine, region, or producer, cite (URL, doc, or "user annotation in {year} {paper} {question}"). When uncertain, write "Source needed" rather than guessing.
2. **8-minute discipline.** Mock answers must read like a real candidate's writing under time pressure: structured, decisive, with deliberate prioritization. Not exhaustive academic prose.
3. **Use Tavily MCP for web research.** Prefer specific high-quality sources: producer websites, wine-searcher, JancisRobinson, Vinous, Decanter, CellarTracker, regional wine board sites, importer tech sheets. Avoid forums and aggregators.
4. **Mimic the user's reasoning style.** The user's filled annotations (visible in `data/annotations.json` where `is_filled: true`) demonstrate how to narrow possibilities. Pattern-match on that style. Examples:
   - Lead with paper context (white/red/special) to set the universe.
   - Name the top global candidates first, then rule out by region-specific knowledge ("unlikely to be Italy because only N well-known whites" etc.).
   - Use specific producer/region examples to justify each candidate.
   - Acknowledge when the wine is likely a curveball.
5. **Never invent.** If a question has no annotation and no obvious answer, write "Reasoning unclear from question stem alone — likely a curveball wine. Possible candidates based on slot position: …" Do not fabricate confidence.
6. **Cross-reference duplicates.** Some wines (or near-duplicates from the same producer) appear in multiple years. The wine-researcher agent should detect and link these.

## Subagent files (in `.claude/agents/`)

- `wine-researcher.md` — pulls tasting notes, tech sheets, vintage character from the web
- `annotation-proposer.md` — drafts annotations for empty questions, mimicking the user's filled style
- `question-analyst.md` — produces decision matrices from question stems alone (Phase 5A: stem-only; Phase 5B: tree-aware)
- `tree-synthesizer.md` — synthesizes master decision trees from the 112 individual question matrices
- `taxonomy-tagger.md` — classifies each question using the canonical family/subcategory taxonomy
- `pattern-synthesizer.md` — extracts recurring logic within each paper x family bucket
- `matrix-writer.md` — writes study-ready before-tasting and in-taste matrices by paper x family
- `tree-backtester.md` — backtests master trees against historical questions and drives the refinement loop
- `heuristics-extractor.md` — extracts cross-corpus examiner patterns (stem phrasing, mark distribution, question structure trends)
- `taxonomy-auditor.md` — audits taxonomy tags, synthesis claims, and matrix usability
- `mock-answer-writer.md` — writes 8-minute answers to historical questions
- `mock-exam-writer.md` — generates new full exam papers in the IMW style

## Slash commands (in `.claude/commands/`)

- `/analyze-question YYYY pN qM` — generate or read a decision matrix
- `/research-wine YYYY pN wM` — research a specific wine
- `/propose-annotation YYYY pN qM` — draft an annotation
- `/answer-question YYYY pN qM` — produce an 8-minute mock answer
- `/generate-mock-exam pN` — produce a new mock paper for the given paper number
- `/study-batch` — run a randomized study session pulling questions from history

## Deploying the study app

The Vercel git integration does NOT auto-deploy. Deploy manually:

```bash
cd study-app && npx vercel --prod
```

Production URL: https://study-app-blond-nine.vercel.app

The Vercel project ID is `prj_1FOrN1z4uYqJZZoBx7JVmpaNVKQM`, org `team_UMX0qBzZ61GaCUri4A9hydvQ`. The deploy command needs a ~5 min timeout since the build takes ~45s.

To rebuild the study diagrams (after editing markdown in `outputs/study_diagrams/`):

```bash
python scripts/build_study_diagrams_site.py
```

This outputs to both `outputs/study_diagrams_site/` (standalone, light theme) and `study-app/public/diagrams/` (Vercel, dark theme).

## Token economy

The source MD is 2,500+ lines. Do NOT load it into context routinely. The structured JSON exists so agents can read targeted slices. When an agent needs a specific question's text, read it from `data/exams.json`. When an agent needs wine research, read the relevant file in `data/wine_research/`.

## Never modify (without explicit user consent)

- `source/MW_Practical_Papers_Compilation.md`
- `data/exams.json`, `data/wines.json` (parser outputs; regenerate by re-running `scripts/parse_source.py` instead)

## Modifiable

- `data/annotations.json` — the annotation-proposer fills this in, but only with `is_proposed: true` flag until the user accepts
- `data/wine_research/*.md` — wine-researcher writes here
- everything in `outputs/`
