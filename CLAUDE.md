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

## The definitive empirical guide — `mw_exam_empirical_knowledge.md`

`mw_exam_empirical_knowledge.md` (repo root) is the **canonical, evidence-cited summary of everything
we know to be true (or very directionally correct) about the MW exam** — how it is structured and
created, how examiners think and grade, what wines/qualities/styles appear by paper, the
question-generation rules, and a catalog of app bugs and their fixes. It is the definitive reference
for reasoning about the exam and for generating questions/answers.

- It is a **living document**: seeded from the agentic research in `outputs/` + the feedback ledger,
  and grown automatically whenever user feedback resolves (see `empirical_knowledge_doc_plan.md`).
- **Read the relevant section on demand — do NOT load the whole file routinely** (token economy, same
  rule as the source MD). It is organized into numbered sections (§1 structure, §2 examiner mindset,
  §3 grading, §4 wine/price/style distribution by paper, §5 question-generation rules, §6 feedback
  ledger, §7 app-bug catalog, §8 cross-refs, §9 open questions); jump to the section you need.
- Entries are cited (artifact path, corpus reference, backtest stat, or `user_attempts`/
  `feedback_analyses` ledger row) and tiered (STRONG SIGNAL / PLAUSIBLE / CURVEBALL / PROCESS).

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
- `/optimize-costs [30d|7d|24h] [apply]` — analyze `model_usage`/`tavily_usage` vs feedback+validity signals; recommend a per-task model mix, project savings, flag cost↔accuracy tradeoffs. Writes `outputs/cost_reports/{date}.md`. See `cost-tracking-system` memory.

## Deploying the study app

**Deploys are GIT AUTO-DEPLOY, single-path (changed 2026-05-30).** Vercel git auto-deploy is
**enabled** via `study-app/vercel.json` (`"git": {"deploymentEnabled": true}`). A push to `master`
that touches `study-app/` is built and deployed by Vercel automatically — for **both** human pushes
and the auto-feedback bot's merges. There is **one** deploy path (git); nothing runs an explicit
`vercel --prod` in CI anymore.

A versioned **`ignoreCommand`** in `study-app/vercel.json` decides what builds:

```jsonc
// study-app/vercel.json
"ignoreCommand": "if git log -1 --pretty=%s | grep -q '\\[skip ci\\]'; then exit 0; else git diff --quiet HEAD^ HEAD ./; fi"
```

- Commit message contains `[skip ci]` → **skip** (used by the empirical-knowledge sync commits).
- Otherwise build **only if** something under `study-app/` changed (`./` = the Vercel Root Directory,
  which is `study-app`). So root-only commits (docs, `data/`, `outputs/`) never trigger a build.

History (why it was the other way): the Vercel GitHub App once lost repo access, so we moved to an
explicit `vercel --prod` in `auto-feedback.yml`; when the App came back, pushes AND the explicit
deploy both fired → duplicate racing builds, so git auto-deploy was disabled. We've now consolidated
on the single git path (explicit deploy removed) — simpler, no duplicates. **This depends on the
Vercel↔GitHub integration staying connected.** If it ever disconnects (auto-deploys go silent), use
the manual fallback below and/or reconnect the integration in the Vercel dashboard.

```bash
git pull --rebase origin master   # ALWAYS pull first — the bot pushes to master; never force-push
git push origin master            # a study-app/ change here now auto-deploys via Vercel git
```

Repo layout note: the git repo is rooted at this MW_exam project (the repo root IS this folder — `study-app/`, `data/`, `source/`, `outputs/`, `.github/` are all at the root). The Vercel **Root Directory is `study-app`**; the `ignoreCommand` above is the (now versioned) Ignored Build Step. The working tree lives at `C:/Users/russe/Documents/MW_exam`; the parent `Documents` folder is no longer a git repo.

**Manual deploy (fallback if git auto-deploy is ever down).** Because the Vercel Root Directory is
`study-app`, run from the **repo root** (`MW_exam`), NOT from inside `study-app/` (that makes Vercel
look for `study-app/study-app` and fails). The repo root is linked to the project via `.vercel/`
(gitignored):

```bash
# from C:/Users/russe/Documents/MW_exam (repo root)
npx vercel --prod --yes
```

Production URL: https://study-app-blond-nine.vercel.app

The Vercel project ID is `prj_1FOrN1z4uYqJZZoBx7JVmpaNVKQM`, org `team_UMX0qBzZ61GaCUri4A9hydvQ`. A manual deploy command needs a ~5 min timeout since the build takes ~45s.

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
