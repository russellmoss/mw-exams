# Master of Wine Practical Exam Study System

This project builds study materials for the Institute of Masters of Wine (IMW) practical (blind tasting) examination using ten years of past papers as the training corpus.

## Design system

`DESIGN.md` (repo root) is the source of truth for all visual and UI decisions in `study-app/` — the
"Cellar" system (warm-stone dark + amber accent, border-defined flat cards, Geist for UI/body/data,
Fraunces display serif for titles/headings, three-state PASS/BORDERLINE/FAIL verdict colors). **Read
`DESIGN.md` before making any visual or UI change**, and don't deviate from its colors, fonts, spacing,
or aesthetic without explicit user approval. When reviewing UI code, flag anything that contradicts it.

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

## The theory exam (separate corpus — don't mix it with the practical)

The MW Stage 2 exam has a **theory** half as well as the practical: **five papers** of essay
questions — 1 viticulture, 2 vinification & pre-bottling, 3 handling of wine, 4 the business of
wine, 5 contemporary issues. It lives in its own corpus and must never be folded into practical
statistics:

- **"Paper" means a subject domain, not a wine colour.** Practical Paper 1 = whites; theory
  Paper 1 = viticulture. They are unrelated axes.
- **No wines, and no published per-question marks.** The practical publishes "(3 x 10 marks)";
  the theory publishes only an answer-count rubric per paper ("Three questions to be answered, one
  from Section A and two from Section B"). **Never synthesise theory marks.**
- IDs are prefixed `th_` (e.g. `th_2024_p1_q3`) so they can't join against practical or S1A rows.

Files:

- `source/MW_Theory_Papers_Compilation.md` — authoritative question text, **2015–2026** (the
  five-paper era; no 2020 exam — COVID). 297 questions, a uniform 6/6/4/6/5 per year.
- `scripts/parse_theory_source.py` → `data/theory/theory_{exams,questions,annotations}.json`
- `tests/test_theory_corpus.py` — structural gate; also fails if practical-style marks or wine
  references leak into theory text.
- `scripts/fetch_imw_pdfs.py` — re-downloads the raw IMW PDFs into `source/imw_pdfs/` (gitignored;
  copyrighted). Encodes the hotlink workaround: the PDFs 403 without a browser User-Agent **and**
  `Referer: https://www.mastersofwine.org/mw-exam`.
- `outputs/theory_corpus/inventory.md` — what exists per year, including which examiner reports are
  public (2010–2014, 2016, 2018) versus student-area only (2017, 2019, 2021–2025), and which are
  image scans.

The **2000–2014 four-paper era** is downloaded but not compiled; it needs its own era grammar, and
the parser hard-fails on any year outside 2015–2026 to prevent silent mixing.

**Examiner reports are the rubric source for theory.** The IMW publishes no model answers, but the
reports give per-question commentary on what strong and weak candidates did — that is what theory
grading anchors to, rather than to similarity against a generated model answer. A theory question
admits many valid answers with different examples and different positions; anchoring on a model
answer would penalise a good essay for choosing Rías Baixas where ours chose Marlborough.

### The rubric extractor (three stages, only the middle one is an LLM)

```
scripts/segment_examiner_reports.py  →  data/theory/report_segments.json   deterministic
.claude/agents/rubric-extractor.md   →  data/theory/_rubrics_work/*.json   LLM, per batch
scripts/build_theory_rubrics.py      →  data/theory/theory_rubrics.json    deterministic
```

Run it with `/extract-rubrics <year> [paper]`. Schema: `outputs/theory_corpus/RUBRIC_SCHEMA.md`.
Test: `tests/test_theory_rubrics.py`.

Three things to know before touching it:

- **The quote gate is the load-bearing constraint.** Every extracted requirement must carry a
  verbatim quote from the report, re-verified at merge time against the segment it claims to come
  from. A fabricated requirement would silently fail candidates for omitting something the examiners
  never asked for, so a missing quote is a hard build failure. **Never hand-edit
  `theory_rubrics.json` to make the build pass** — re-extract the offending rubric instead.
- **Segmentation anchors on question TEXT, not on headings.** Each paper's section is written by a
  different Panel Chair and the formats differ ("Question 1:", bare "1.", no marker at all) —
  sometimes within one report. Since the corpus already holds authoritative question text, the
  segmenter fuzzy-matches it into the report, with a question-number fallback for chairs who
  abbreviate the restatement.
- **Evidence has three tiers**, all legitimate backing: the question's own commentary, its paper
  Chair's General Comments (`paper_preamble`), and the Theory Panel Chair's cross-paper report
  (`theory_chair_report`). Prefer question-specific evidence where they overlap.

**Coverage today: 243 of 297 questions (82%)** — 2016–2019 and 2021–2025, with 845 core
requirements and 2,407 verified quotes. Reports come from two stores, both wired into
`REPORT_SOURCES` in the segmenter: `source/imw_pdfs/` (public IMW site, gitignored) and
`docs/examiners reports/` (student-area reports, committed).

**Two years are covered by transcription, not publisher text.** The IMW published the 2021 and
2022 theory reports as image-only PDFs (75 and 48 extractable characters). They were transcribed
from 170-DPI page renders into `data/theory/ocr/{year}_theory_report.txt`, which the segmenter
prefers over the PDF. Every segment and rubric carries `text_source` — `pdf_text_layer` or
`transcribed_render` — because the quote gate can only prove a quote matches the *transcription*,
not that the transcription matches the printed report. Treat transcribed rubrics as marginally
weaker evidence, and re-check any quote shown to a candidate as an examiner's exact words.

Remaining gap: **2015 and 2026** have no examiners' report in either store (~54 questions).

### Model answers — `outputs/theory_answers/`

One rubric-anchored model answer per rubric-backed question (**243**), written by
`.claude/agents/theory-answer-writer.md` and gated by `scripts/build_theory_answers.py`
(test: `tests/test_theory_answers.py`). Run with `/answer-theory-question <year> <pN>`.
Spec: `outputs/theory_corpus/ANSWER_SPEC.md`.

- **Time budget is authoritative, from the IMW Student Guide.** Papers 1, 2 and 4 are three
  hours for three answers; paper 3 is two hours for two; **paper 5 is three hours for only
  two**, so it alone gets 90 minutes per question. Word bands follow: 700–1,000 for papers
  1–4, 1,050–1,450 for paper 5. An answer outside its band fails the build — a model answer
  nobody could write in the time teaches a habit that fails in the exam.
- **The coverage gate** is this pipeline's equivalent of the rubric extractor's quote gate:
  every `core` requirement in the rubric must have a `covers_core` frontmatter entry quoting
  it and naming where the answer discharges it. An answer cannot silently drop a requirement.
- **`claims_to_verify` is mandatory.** Every specific figure, date, statistic or
  named-producer assertion is registered in frontmatter. The gate cannot check that wine
  facts are true, so this converts an invisible fabrication risk into a review checklist.
  **1,300 claims are registered across the corpus and none has been externally verified** —
  treat them as candidate-grade recollection, not as sourced fact. Thirteen answers make no
  checkable claim at all, which is often the better-judged answer.

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
**enabled** via `study-app/vercel.json` (`"git": {"deploymentEnabled": {"claude/*": false}}` —
unlisted branches default to enabled, so master deploys; **`claude/*` worktree branches create NO
deployment at all**, preview or otherwise. That exclusion exists because on 2026-08-06 bot-branch
preview deploys exhausted the Hobby plan's 100-deployments/day quota and production deploys of
merged fixes were rate-limited for hours — see `.github/workflows/manual-deploy.yml` for the
break-glass path. To preview a claude branch, rename it or merge to master). A push to `master`
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

**The Vercel account is on the Hobby plan, which caps `crons` in `study-app/vercel.json` at 2 jobs,
each firing at most once per day.** A sub-daily schedule (anything with `*`, `,`, `-` or `/` in the
minute or hour field) makes Vercel reject the deployment *at creation time* with
`cron_jobs_limits_reached` — so there is no failed build to look at, nothing appears in the
deployments list, and **git auto-deploy silently stops for every subsequent commit**. That is what
took production down for four hours on 2026-08-03 (`0 * * * *` on `/api/cron/bank-worker`).
`study-app/tests/vercel-crons.test.ts` now fails the build gate on any such schedule. **Never raise a
Vercel cron above daily.** Anything that needs to run more often belongs in a GitHub Actions
`schedule:` workflow that curls the route — `.github/workflows/bank-worker-hourly.yml` is the
pattern to copy (hourly `/api/cron/bank-worker`, with the daily Vercel cron kept as a backstop
because GitHub schedules are best-effort).

**Only PRODUCTION deploys migrate the database.** Preview deployments share the production
`DATABASE_URL` (there is no preview branch DB) and `prebuild` runs `scripts/migrate.mjs` — so every
preview build of every unmerged branch was applying its schema to production. Three migrations
reached prod that way (`018_generation_telemetry`, `019_generation_attempt_timeouts`,
`026_bank_batch_family`); they are ledger rows in `schema_migrations` with no file on master, which
is why a production build reports fewer applied migrations than the table has rows. All three were
additive, but a branch carrying a `DROP COLUMN` or a backfill would have mutated production from an
experiment nobody merged. `shouldRunMigrations()` now gates on `VERCEL_ENV`: production migrates,
previews skip loudly, off-Vercel runs (`npm run migrate`, local builds) still migrate because a
human is driving. A preview needing a new column will fail against the production schema — that is
the correct outcome. If previews are ever given their own database, set
`MIGRATE_ALLOW_NON_PRODUCTION=1` so they resume migrating it.

**Cron routes authenticate on `CRON_SECRET`** (`/api/cron/*` and `/api/admin/bank/resume`): they
compare `Authorization: Bearer $CRON_SECRET` and otherwise fall back to an admin session. It must be
set with the **same value** in the Vercel project env (Production) *and* in the repo's Actions
secrets. If Vercel has none, `isCron` is false for every caller and the routes 401 the GitHub
workflow, Vercel Cron, and the bank worker's own self-resume hop alike — all silently, since a cron
401 surfaces nowhere in the app.

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
- `source/MW_Theory_Papers_Compilation.md`
- `data/exams.json`, `data/wines.json` (parser outputs; regenerate by re-running `scripts/parse_source.py` instead)
- `data/theory/*.json` (parser outputs; regenerate by re-running `scripts/parse_theory_source.py` instead)

## Modifiable

- `data/annotations.json` — the annotation-proposer fills this in, but only with `is_proposed: true` flag until the user accepts
- `data/wine_research/*.md` — wine-researcher writes here
- everything in `outputs/`
