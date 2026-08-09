# MW Exam — Empirical Knowledge

**The canonical, evidence-cited summary of everything we know to be true (or very directionally
correct) about the Master of Wine practical exam: how it is built, how it is graded, how examiners
think, and how that should shape how we generate questions and answers.**

This is a living document. It is seeded from the project's pre-build agentic research and grown by
the feedback loop: when a user's feedback on a generated question resolves (accept / partial /
reject), Claude (Opus) records what it teaches us here, with a citation back to the ledger row.

> See `empirical_knowledge_doc_plan.md` for the design of how this file is maintained.

---

## §0 · How to use this document

**Audience.** Every agent and contributor reasoning about the MW exam — especially the
question-generation pipeline, the answer-grading/evaluation prompts, and anyone building new study
features. Read the **relevant section on demand**; do not load the whole file routinely.

**Entry format.** Each atomic claim is an entry:

> `### EK-#### · short title`
> - **tier:** content-signal confidence — `STRONG SIGNAL` | `PLAUSIBLE` | `CURVEBALL` | `PROCESS`
> - **status:** `live` | `superseded`
> - **evidence:** citation(s) — an artifact path, corpus reference, backtest stat, or feedback ledger row
> - **claim:** the thing we believe is true

**Conventions:**
- **`tier`** is *how strong the signal is*, not a review status. `PROCESS` marks app/operational
  facts (§7) rather than wine knowledge.
- **`status`** is `live` (in force) or `superseded` (kept for history; ignored by downstream agents).
  When a new finding contradicts an old entry, the old one is flipped to `superseded` and the new one
  cites `supersedes: EK-####`.
- **No uncited claims.** Everything carries evidence. Findings we can't cite go to §9 as open questions.
- **Ledger citations** use `ledger: attempt #N / analysis #M (verdict)` — these map to
  `user_attempts.id` / `feedback_analyses.id` in the Neon `MW-exam` project.

**Changelog**
- **2026-08-09 — incremental: 1 feedback item(s) processed → 0 new entries.**
- **2026-08-09 — incremental: 1 feedback item(s) processed → 1 new entry (EK-0174).**
- **2026-08-09 — incremental: 1 feedback item(s) processed → 2 new entries (EK-0172, EK-0173).**
- **2026-08-09 — incremental: 1 feedback item(s) processed → 2 new entries (EK-0170, EK-0171).**
- **2026-08-08 — incremental: 1 feedback item(s) processed → 1 new entry (EK-0169).**
- **2026-08-08 — three duplicate ids resolved; the Neon mirror was silently 3 entries short.** The
  2026-08-07 batch reused **EK-0155, EK-0156 and EK-0157** for two entries each. `sync-ek-table.mjs`
  upserts `ON CONFLICT (ek_id) DO UPDATE`, so of each pair only the later heading survived: the table
  read **163 rows against 166 parsed entries** and three real entries were invisible to the
  feedback-analysis agent, which queries that mirror rather than this doc. Most consequentially the
  lost EK-0157 is the **product decision that blocks sparkling on Paper 1 entirely**, which the
  generation rules depend on. In all three pairs every inbound cross-reference — in this doc *and* in
  `question-validator.ts`, `paper-style-mix.test.ts`, `stale-analysis-reap.test.ts` — pointed at the
  **earlier** entry, so the earlier entry keeps its id and the later was renumbered:
  §10 *"Residual sugar is a Paper 3 device"* EK-0155 → **EK-0166**;
  §7 *"The nightly quarantine sweep went dark for a day"* EK-0156 → **EK-0167**;
  §7 *"A pinned archetype must outrank a soft preference"* EK-0157 → **EK-0168**.
  The four references to the renumbered entries were updated (R11's rationale in §5 and §7 ×3); no
  code or `outputs/` reference needed changing. **Guarded so it cannot recur:** `sync-ek-table.mjs`
  now hard-fails on a duplicate `ek_id` instead of silently dropping rows, and
  `study-app/tests/ek-id-uniqueness.test.ts` fails the build on a collision before it can reach the
  sync workflow. (Prior art: the 2026-05-30 `EK-0070 → EK-0085` fix, which had no guard behind it.)
  **Renumbering races the id allocator:** the first pass here took 0164–0166, and while it was in
  progress the auto-feedback bot landed `28c493f` claiming **EK-0164 and EK-0165** for two new
  entries — `sync-empirical-knowledge.mjs` allocates from `max(id) + 1`, which a duplicate had
  deflated. Syncing that pass would have deleted the bot's two rows and re-inserted its ids with
  unrelated content. Re-check `max(id)` against master immediately before writing.
- **2026-08-08 — incremental: 1 feedback item(s) processed → 2 new entries (EK-0164, EK-0165).**
- **2026-08-08 — app bug 427 fixed and catalogued (EK-0163).** A late-arriving model answer was
  written to `sessionStorage` while the debrief rendered from the reducer, so every on-the-fly
  question showed "No model answer available" with the answer already in the database. Grading read
  the updated copy, which is why the defect presented as cosmetic. Four of five arrival paths were
  wrong; the fix adds `ATTACH_MODEL_ANSWER`, a single writer, an answer-carrying poll response, and a
  static guard test (PR #115 / `47372d3`).
- **2026-08-08 — incremental: 1 feedback item(s) processed → 1 new entry (EK-0162).**
- **2026-08-05 — first BLIND out-of-sample backtest of the master trees (EK-0148).** Ran the trees
  against the newly structured 2000–2010 corpus with the wines withheld from the predicting agents and
  ground truth resolved independently (111 questions / 396 wines;
  `outputs/backtest_reports/era1_blind_backtest_2000_2010.md`, harness
  `scripts/build_backtest_input.py` + `scripts/score_backtest.py`, results `data/backtest_era1_blind.json`).
  Variety 30%/52%/69% and country 36%/62%/83% versus LOYO's 72.8%/89.2%/95.6% — so **LOYO measures fit,
  not generalisation** (qualifies EK-0082). The confidence tiers ARE well-calibrated out-of-sample
  (STRONG > PLAUSIBLE > CURVEBALL, monotonic on all six metrics), and the failure is concentrated in
  **Layer A stem-routing** (29% of stems unroutable; P2 only 9%) rather than in the wine knowledge.
- **2026-08-05 — 2013 checked against the original paper: no defect.** Downloaded the IMW 2013
  question paper (`docs/past_papers_2000s/MW-Exam-2013.pdf`) and diffed it against our source: faithful
  word for word, IMW's own a/c/d lettering typo included. 2013 states tariffs by SCOPE, not multiplier,
  so the "missing multipliers" defect is **withdrawn** (EK-0147). `scripts/analyze_long_horizon.py` now
  reads scope headers (anchored to line start; single-wine headers scope back to 1), which makes
  **all 54 marks-printing papers 2008–2026 total exactly 300 with zero exceptions** — the strongest
  form of the EK-0001 invariant.
- **2026-08-05 — sources reconciled + re-parsed.** Merged `MW_Practical_Papers_Compilation V2.md`
  (2011–2014) into `MW_Practical_Papers_Compilation.md` (2015–2026) via `scripts/reconcile_sources.py`,
  repairing three silent format mismatches, and re-ran `parse_source.py --strict`. **Recovered the
  2011 P3 question** (EK-0147 defect 1) with zero collateral change — 540/540 wine texts identical,
  32/32 filled annotations intact. There is now ONE source compilation, covering 2011–2026. Long-horizon
  figures refreshed to include 2026 (Era 2 now 45 papers / 162 questions / 540 wines).
- **2026-08-05 — long-horizon study (2000–2026): the corpus doubled backwards.** Structured the 11
  published pre-2011 papers into `data/past_exams_2000_2010.json` (33 papers / 111 questions / 396 wines)
  and compared them to `data/exams.json` with the new `scripts/analyze_long_horizon.py`
  (write-up: `outputs/heuristics/long_horizon_analysis_2000_2026.md`). Results: **EK-0001 CORRECTED** —
  the 25-marks-per-wine rule is stated verbatim in the 2001–2008 printed instructions, so the
  "modern exam (~2013 onward) / pre-2013 differed" caveat was wrong; the 2007→2008 change was only
  *where* marks are printed. **EK-0120 RESOLVED** (Era-1 allocation now characterised by script; note
  EK-0078's vintage-ID half remains open). New **EK-0146** (26-year structural invariants + the
  competency drift: commercial 12.6%→34.0%, winemaking 43.2%→65.4%, variety ID 66.7%→56.2%, origin ID
  ~90% in both eras; 4-wine default → 2-wine pair; 8-wine flights extinct) and **EK-0147** (two
  `data/exams.json` defects: 2011 P3 question missing, 2013 per-wine multipliers dropped, plus the
  two-source-compilation drift behind them).
- **2026-08-05 — early-era examiner reports mined: the newly-recovered 2013 + 2010 Examiners' Reports
  (`docs/examiners reports/`, fetched from mastersofwine.org — the only two public reports predating the
  2017–2025 synthesis corpus) produced 6 new entries — EK-0136 (never leave blanks / mark-up generosity),
  EK-0137 (candidate-side length calibration + quality-answer content boundary), EK-0138 (language-precision
  doctrine), EK-0139 (commit to ONE definitive conclusion; option-lists earn zero), EK-0140 (NW
  single-country flights draw from the big four, §4), EK-0141 (P3 numerical canon: single number, leeway
  at extremes, style parameters are examinable facts) — plus early-era evidence appended to EK-0007,
  EK-0009, EK-0011, EK-0014, EK-0015, EK-0116 and EK-0122 (the cardinal-rule doctrine is now attested
  back to 2010, not just 2017). §8 index updated with the new `docs/` source folders.**
- **2026-08-03 — incremental: 1 feedback item(s) processed → 1 new entry (EK-0135).**
- **2026-06-08 — consolidate: 5 feedback item(s) processed → 3 new entries (EK-0132, EK-0133, EK-0134).**
- **2026-06-02 — incremental: 1 feedback item(s) processed → 1 new entry (EK-0131).**
- **2026-06-01 — consolidate: 7 feedback item(s) processed → 6 new entries (EK-0125, EK-0126, EK-0127, EK-0128, EK-0129, EK-0130).**
- **2026-05-31 — Project 8 (System Integrity & Correctness Refactor): applied the SUPPORTED / VERY-STRONG
  edits gated by `outputs/research/evidence_audit.md`. (1) **Superseded EK-0093** (the "absolute 65% per
  paper" constant is factually wrong) with **new EK-0116** (65% AVERAGE across the three papers + ~50%
  per-paper floor, criterion-referenced; three IMW abilities not four; per-question thresholds are a
  single-question PROXY — public IMW Student Guide). (2) **Qualified EK-0007** + added **EK-0112**:
  reasoning>ID is CONDITIONAL on a plausible conclusion + correct structural read (do not hard-cascade a
  structural miss — 2023 P3Q3). (3) **EK-0005** — dropped "P3 the usual decider"; added **EK-0111**
  (no permanently weakest paper; "lowest-scoring" ≠ "average-dragger"). (4) **EK-0006** — reframed
  mark-allocation as ROTATING, stripped the trend-as-fact decimals. (5) Stripped superlatives: **EK-0091**
  ("most-penalized" → "heavily-penalised"), **EK-0105** ("strongest forward signal" → "the only verbatim
  two-year stem repeat"). (6) **EK-0107** — added the "composition PARAMETERS, not assessment objectives"
  scope sentence. (7) **EK-0035** — positional sparkling-opener prior flipped to a TENDENCY (broke 2025).
  (8) New SUPPORTED entries **EK-0109** (wine-is-vehicle / competency-is-target), **EK-0110** (integrated
  multi-factor synthesis family — anti-rote device, NOT "fastest-rising"), **EK-0113** (independent
  thinking over rote — study-system caution), **EK-0114** (quality full-scale/origin-blind/volunteer-tier),
  **EK-0115** (one-fact / bare macro-region origin penalised). (9) Refined **EK-0011** (maturity = quantified
  window + both trajectories) and hedged **EK-0106** (the "wine globally" frame rests on n=1). (10) Routed
  UNPROVEN items to §9 as open questions: **EK-0117** (climate-change adaptation), **EK-0118** (banker-zero
  latitude), **EK-0119** (distinction=consistency), **EK-0120** (Era-1 uncharacterised — blocks the EK-0001
  / EK-0078 flips). Code/prompt/UI fixes (e.g. `marking-principles.ts:15-16`, plausibility-map injection)
  are NOT applied here — they are implementation-ready recommendations in
  `outputs/research/system_correctness_refactor_plan.md`. **Markdown only; Neon `empirical_knowledge`
  projection NOT yet synced (run `study-app/scripts/sync-empirical-knowledge.mjs`); `empirical_sync_state.json` untouched.**
- **2026-05-31 — evolution analysis: added EK-0104…EK-0108 (markdown + Neon `empirical_knowledge`) from
  `outputs/research/evolution_analysis.md` — a 3-era (2011–14 / 2015–19 / 2021–25) study of how the exam
  changed: ID-suppression→ID-free arc, climate-as-driver, region→global quality + dual-pole commercial,
  a last-10 scope label, and "orange wine peaked 2014–2019." The same analysis flagged TWO existing
  entries as contradicted by the raw corpus — **EK-0001** (its pre-2013 "not 25/wine" boundary is false:
  2011–2014 all sum to exactly 25/wine) and **EK-0035** (its "P3 always opens sparkling 2021–24" broke in
  2025 P3 Q1, a Riesling flight) — plus refinements to EK-0078 (vintage *declined*, not statically rare)
  and EK-0046 (Moscato d'Asti, 2019 P1, is the attested frizzante/sweet P1 edge case). Those four
  revisions are drafted in the analysis doc but NOT yet applied here, pending user approval.**
- **2026-05-31 — implementation: shipped all 6 phases of `exam_improvement_plan.md`. Corrected EK-0099 (P3-only "never NW-majority"; P1/P2 each had a NW-majority paper — caught by the Phase 3 validator self-test). Added EK-0102 (single-country ceiling ~8/12 + blend frequency ~29%) and EK-0103 (the engine's new soft rules R8/R9/R10, per-paper prompt steer, blueprint-first whole-test validator, and detect-only grading telemetry).**
- **2026-05-31 — gap analysis: superseded EK-0024/EK-0025 (curveball position + "1 in 4" were wrong/imprecise on last-10 data; corrections council-reviewed); refreshed EK-0023/EK-0028 to last-10; added EK-0096…EK-0101 (curveball position/budget, post-2014 mark redistribution, OW:NW band, age/price signatures) from `outputs/gap_analysis/findings/*` + `data/structured/*`. Hand-edited under the "fix a bad entry" carve-out; `data/empirical_sync_state.json` untouched.**
- **2026-05-30 — incremental: 1 feedback item(s) processed → 1 new entry (EK-0095).**
- **2026-05-30 — incremental: 1 feedback item(s) processed → 1 new entry (EK-0088).**
- **2026-05-30 — incremental: 1 feedback item(s) processed → 0 new entries.**
- **2026-05-30 — incremental: 1 feedback item(s) processed → 1 new entry (EK-0087).**
- **2026-05-30 — incremental: 1 feedback item(s) processed → 1 new entry (EK-0086).**
- **2026-05-30 — scoring truth: enriched EK-0001/EK-0041 — exactly-25-marks/wine is a *modern-exam*
  convention (~2013 onward; pre-2013 papers differed), now hard-enforced (R6 soft→hard); recorded the
  ledger item (#138/#21) where 55% of generated questions were found to violate it.**
- **2026-05-30 — expand: added §0.5 (provenance — the agentic research pipeline) and §10
  (validation & backtesting); distribution audit of `outputs/heuristics/*` + `outputs/backtest_reports/*`
  added EK-0075…EK-0084; completed the §8 artifact index (all 13 heuristics + 5 backtest files,
  `taxonomy_tags/`, `managerial_methodology.md`); fixed a duplicate id (§9 mark-distribution EK-0070 → EK-0085).**
- **2026-05-30 — consolidate: 1 feedback item(s) processed → 2 new entries (EK-0073, EK-0074).**
- **2026-05-30 — Seed.** Created from `outputs/heuristics/*`, `outputs/master_trees/*`,
  `outputs/backtest_reports/*`, `study-app/src/lib/question-validator.ts`,
  `question_quality_remediation_plan.md`, and a full read of the feedback ledger (26 items:
  ~18 accepts, 2 partials, rest rejected). EK-0001 … EK-0072.

---

## §0.5 · Provenance — how this knowledge was built

> "How we know what we know." The exam knowledge below is not opinion: it was produced by a
> multi-stage **agentic research pipeline** run over the historical corpus **before** any app code was
> written, then grown by the live feedback loop (§6). Full method: `docs/methodology.md` (technical,
> 11 stages) and `docs/managerial_methodology.md` (narrative). The deep artifacts are indexed in §8.

**The corpus.** Real IMW practical papers spanning **2011–2025 (14 sat years; 2020 cancelled)** —
**42 papers, 153 questions, 504 wines** — parsed verbatim from
`source/MW_Practical_Papers_Compilation.md` (2,585 lines) by a deterministic Python parser
(`scripts/parse_source.py`) into `data/exams.json` / `data/wines.json` / `data/annotations.json`. No
inference at parse time; wine text is authoritative (CLAUDE.md). The **core analytical corpus** is the
**112 questions / 360 wines of 2015–2025** (the years with full structured coverage); the wider
504-wine / 153-question set (2011–2025) is used for distribution counts (curveball, price tier).

**The pipeline (each stage names its output artifact):**

1. **Wine research** — the `wine-researcher` agent pulled tasting notes / tech sheets / vintage
   character for every wine via Tavily, one cited file per wine → `data/wine_research/` (504 files).
2. **Examiner-report synthesis** — **13 official examiner reports (8 practical + 5 chief, 2017–2025)**
   distilled into the **Seven Cardinal Rules** of marking → `outputs/heuristics/examiner_report_synthesis.md`.
   This is the source of the grading philosophy in §2–§3.
3. **Expert annotation** — 32 questions hand-annotated by the candidate in deductive-narrowing style;
   the `annotation-proposer` drafted the rest (review-gated, never auto-merged) →
   `data/annotations.json`, `outputs/proposed_annotations/`.
4. **Decision matrices** — the `question-analyst` analysed all 112 questions twice: stem-only
   (Phase 5A, unbiased training input) → `outputs/decision_matrices/`, then tree-aware (Phase 5B) →
   `outputs/decision_matrices_v2/`.
5. **Taxonomy & pattern extraction** — the `taxonomy-tagger` classified every question into the
   F1–F8 families → `outputs/taxonomy_tags/` (112 files); the `heuristics-extractor` produced **30
   numbered examiner patterns** plus the curveball / price-tier / composition / classification
   analyses → `outputs/heuristics/` (13 files). This is the source of the distribution facts in §4.
6. **Master decision trees** — the `tree-synthesizer` built the three candidate-facing trees
   (Layer A stem routing → Layer B sensory; P3 adds Layer A.5 visual triage) + family packs →
   `outputs/master_trees/`. These are the core study artifact (CLAUDE.md).
7. **Backtesting** — the `tree-backtester` validated the trees by **Leave-One-Year-Out (LOYO)**
   cross-validation (train 9 years, predict the held-out year, ×10 folds, 360 wines, deterministic
   scorer). Post-fix accuracy **72.8% top-1 variety / 89.2% top-3 / 95.6% candidate-set** →
   `outputs/backtest_reports/`. Full validation story and known limits in §10.
8. **Generation + feedback loop** — the validated knowledge feeds question generation (`study-app`),
   and every resolved piece of user feedback is checked against this corpus before any rule change
   (the corpus is authoritative — see §6 and `empirical_knowledge_doc_plan.md`).

Scale of the build: ~**4,500 analytical files**, **12 subagents**, against a real-exam pass rate of
**~10%**.

---

## §1 · Overall exam structure & creation

### EK-0001 · Three papers, twelve wines each, ~25 marks per wine
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** CLAUDE.md; `outputs/heuristics/examiner_patterns.md` §2.5; ledger: attempt #96 (accept),
  attempt #138 (accept); **2026-08-05 long-horizon study — `outputs/heuristics/long_horizon_analysis_2000_2026.md`
  + `scripts/analyze_long_horizon.py` over `data/past_exams_2000_2010.json` + `data/exams.json`
  (78 papers / 273 questions / 936 wines, 2000–2026)**
- **claim:** The practical is three blind-tasting papers. **P1 = white still**, **P2 = red still**,
  **P3 = mixed** (sparkling, fortified, sweet, rosé, oxidative, occasionally orange/unusual). Each
  paper presents **12 wines** — verified in **78/78 papers across 2000–2026**. Mark allocation is
  **exactly 25 marks per wine, universally** — a 2-wine question = 50, 3-wine = 75, 4-wine = 100, etc.
  **This is NOT a modern-era innovation.** The practical's own printed instructions state
  *"The total number of MARKS for each Paper is 300 and the total number of MARKS per QUESTION is shown
  on the appropriate proforma"* verbatim in **2001–2008**, and **every marks-printing paper 2008–2026
  totals exactly 300 — 54/54, zero exceptions** — once scope notation (`For each wine:` … `(15 marks)`)
  is read as equivalent to the multiplier form (`3 x 15 marks`); the apparent 2013 shortfall was a
  reader fault, not a corpus one (verified against the original IMW paper — see EK-0147). What changed
  at **2007→2008** is only *where* the
  marks are printed — proforma/answer sheet before, on the question paper after. Only **2000** sits
  outside the convention, making no reference to marks at all. It is enforced as a hard validator rule
  (see EK-0041), because it is easy for a generator to get wrong.
  *(Supersedes the earlier "hallmark of the modern exam (~2013 onward) / pre-2013 papers differed"
  wording, which rested on user recollection and is contradicted by the printed papers.)*

### EK-0146 · The exam's skeleton is 26-year stable; what moved is the assessed competency mix
- **tier:** STRONG SIGNAL · **status:** live · **resolves:** EK-0120 · **corrects:** EK-0001
- **evidence:** `outputs/heuristics/long_horizon_analysis_2000_2026.md`, computed by
  `scripts/analyze_long_horizon.py` over `data/past_exams_2000_2010.json` (Era 1, structured from the
  published PDFs in `docs/past_papers_2000s/`) and `data/exams.json` (Era 2) — 75 papers, 264 questions,
  900 wines
- **claim:** Across the full published history (2000–2026) four things never move: **12 wines per paper**
  (78/78), **300 marks per paper** (25/wine — §EK-0001), the **P1 white / P2 red / P3 mixed** split, and
  an origin mix of **~2/3 Old World with France at ~1/3 of all wines** (Era 1 64.9% OW / 33.1% France;
  Era 2 69.1% / 34.1%). What changed is **what candidates are asked about the wine**:
  **commercial 12.6% → 34.6%** and **winemaking 43.2% → 66.0%** of questions (the two big additions),
  **style +14.2pts**, **quality +9.8pts**, against **variety ID 66.7% → 55.6%**, **maturity −13.1pts**
  and **numeric RS/ABV −6.2pts**. **Origin ID is near-universal in BOTH eras (~90%)** — the exam did not
  reduce identification, it moved the burden from *which grape* to *where from* and spent the freed marks
  on the analytical competencies. Flights also shrank: the **4-wine flight was Era 1's default (37.8%)**,
  the **2-wine pair is Era 2's growth format (18.0% → 30.9%)**, and **8-wine flights are near-extinct** (2 in Era 1, 1 in Era 2). Two consequences: (1) this **independently corroborates the ID-suppression arc (EK-0104)
  and the commercial rise from a corpus those entries were never built on**, raising confidence they are a
  real long-run trajectory rather than a last-decade artifact; (2) **Era-1 question SHAPES are obsolete
  and must not be used as generation templates** — treat Era 1 as evidence about invariants, trends and
  wine-selection precedent only.

### EK-0147 · Sources reconciled; 2011 P3 recovered; the "2013 defect" was a NOTATION difference, not a defect
- **tier:** PROCESS · **status:** RESOLVED 2026-08-05
- **evidence:** `outputs/heuristics/long_horizon_analysis_2000_2026.md` §5;
  `scripts/reconcile_sources.py`; the original IMW paper `docs/past_papers_2000s/MW-Exam-2013.pdf`
  (downloaded from mastersofwine.org and diffed against our source text)
- **claim:** **(1) FIXED — 2011 Paper 3 had 12 wines but ZERO questions.** Its question lived only in
  the second compilation and was lost because the heading omitted the question *number* that
  `QUESTION_RE` requires. `scripts/reconcile_sources.py` merged that compilation into
  `source/MW_Practical_Papers_Compilation.md` (now the single source, **2011–2026**), repairing three
  silently-failing format mismatches — the unnumbered heading, 144 unescaped wine-line numbers, and 42
  question headings missing the inner `*(Wines …)*` emphasis. Re-parsed with `parse_source.py
  --strict`. **Regression check: the ONLY change was 2011 P3 gaining its question (0 → 1); all 540
  wine texts byte-identical; all 32 filled annotations intact.** `WINE_LINE_RE` now accepts both
  escape styles so an unescaped paste cannot silently drop wines again.
  **(2) WITHDRAWN — the 2013 papers were never defective.** They were recorded as having "dropped
  per-wine multipliers" because they appeared to total 195/135/91. Diffing our text against the
  original IMW PDF shows it is **faithful word for word**, including the sub-part lettering skip in
  P3 Q1 (a, c, d — no b), which is a typo in the IMW original. 2013 simply states tariffs by **scope**
  (`For each wine:` … `(15 marks)`, or explicitly `(15 marks per wine)`) where other years use a
  multiplier (`3 x 15 marks`). The two notations are equivalent; the fault was in our reader, not the
  corpus. With scope honoured, **all 54 marks-printing papers 2008–2026 total exactly 300 — zero
  exceptions** (see EK-0001, EK-0146). Two parsing rules make this work and are worth reusing: scope
  headers must be **anchored to line start** (2013 P2 Q1 c ends "…the vintage *for each wine*.
  (10 marks)" *inside* a sub-part under `For both wines:` — matching mid-sentence inflates the paper),
  and a header naming one wine (`For wine 4:`, 2022 P2 Q1) scopes back down to 1.
  **(3) FIXED — the two-compilation split** that caused (1): the file CLAUDE.md named authoritative was
  not a superset (2011–2014 lived only in the other). There is now a single compilation; the redundant
  one is deleted, with its content merged and git history retaining it.

### EK-0002 · 3–4 questions per paper, trending to fewer/larger
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** `outputs/heuristics/examiner_patterns.md` §4.7, §4.9
- **claim:** Questions per paper cluster at **3–4** (avg ~3.7). The trend (2023–2025) is toward
  fewer, larger questions with deeper analysis per flight; older papers (2016–2017) had up to 5–6.

### EK-0003 · ~12 minutes per wine, ~8 minutes per written response
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** CLAUDE.md
- **claim:** Candidates have ~12 minutes per wine, but multiple sub-questions mean ~8 minutes per
  written response. Answers must be precise, structured, and prioritized — not exhaustive.

### EK-0004 · The exam evolves; new question types appear regularly
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** `outputs/heuristics/examiner_report_synthesis.md` §6; ledger: attempt #73 (accept)
- **claim:** The IMW introduces genuinely new question framings (2024: "quality in the context of
  wine globally"; 2025: "relative importance of human inputs vs nature"). Template answers fail.
  Recent years (last ~5) should be **weighted more heavily** when modelling the exam, because the
  examiners are deliberately evolving it (style convergence, climate change, commercial emphasis).

### EK-0005 · Wine selection balances classic and challenging within each paper
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** `outputs/heuristics/examiner_report_synthesis.md` §6 ("For every challenging
  question, there will be a correspondingly straightforward question."); P2 has the most classic
  wines and the highest pass rate; P3 is the most stylistically diverse.
- **note (revised):** the old "P3 is the usual decider" clause is removed — there is **no permanently
  weakest paper**, and "lowest-scoring" vs "arithmetic average-dragger" are different senses. See
  EK-0111.

### EK-0111 · No permanently weakest paper; "lowest-scoring" ≠ "arithmetic average-dragger"
- **tier:** STRONG SIGNAL · **status:** live · **supersedes:** the EK-0005 "usual decider" clause
- **evidence:** hard pass counts 2017/2022/2023/2024/2025 (P3 is often the *strongest* paper);
  `outputs/research/examiner_objectives.md` (P2 the lowest-scoring paper recently);
  `outputs/research/examiner_confidence_model.md` §7 (P3 the arithmetic average-dragger);
  `outputs/research/evidence_audit.md` Audit F / H8 + §0 Coda (STRONG)
- **claim:** There is **no permanently weakest paper**, and "decider" hides two senses that must be kept
  apart: **"lowest-scoring"** (recently **P2** — the modern decider in the objectives sense) vs
  **"arithmetic average-dragger"** (often **P3**, the most stylistically diverse, in the confidence-model
  sense). Both can be true at once — the lowest-scoring paper need not be the one dragging the average.
  P2 carries the most classic wines and historically the highest pass rate; P3 is the most diverse.
  Because the pass standard is a **65% average with a per-paper floor** (EK-0116), what passes is
  **consistency across all three papers**, not surviving a single "decider." Do not tell candidates one
  paper is "the" decider.

---

## §2 · Examiner mindset & grading philosophy

> Source: `outputs/heuristics/examiner_report_synthesis.md` (8 practical + 5 chief examiner reports,
> 2017–2025). "Taste like a detective; argue like a lawyer." (2019)

### EK-0006 · The exam is "a theory exam with a tasting"
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** examiner_report_synthesis §1 (2024 quote); §1 mark-allocation table
- **claim:** Identification is **de-emphasized** in favour of analytical competencies — but mark
  allocation **ROTATES year-to-year within the modern era; do NOT extrapolate any single competency's
  share linearly.** ID sits ~**39–46%** (the largest single category, necessary-but-not-sufficient); the
  analytical pool (quality / winemaking / commercial / style) splits unpredictably — "you never know
  where the weighting will be" (2023). The often-quoted ID 46%→39% / Quality 22%→37% figures are **two
  adjacent years, not a slope** (false precision if read as a trend). These are **paper-wide averages,
  not a per-question rule** — any single question allocates whatever it prints, and the spread is wide
  (e.g. 2023 P1 Q1: variety ID 20/100, winemaking 30, quality+ageing 50). Use the paper-wide ~35–45% ID
  figure only to *distribute* marks across a generated paper; grade and answer to the **printed
  per-question tariff**. See EK-0089. (`outputs/research/evidence_audit.md` T2-2 / FP-3.)

### EK-0007 · Cardinal Rule 1 — Reasoning > Identification (CONDITIONAL on plausibility)
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** examiner_report_synthesis §2.1 (every report 2017–2025); `outputs/research/evidence_audit.md`
  T1-2a / Audit B (VERY STRONG — the conditional form is better-evidenced than the old unconditional one);
  earliest attestations: 2013 Practical (Hoskins MW — "It is not just about 'picking the winners'"; wines
  "geographically wrong… able to pick up good marks through their reasoning", P3 Q3) and 2010 Practical
  ("Good answers do of course contain mistakes but their reasoning invariably appears sound") —
  `docs/examiners reports/extracted_txt/{2013,2010}-Examiners-Report.txt`
- **claim:** Sound reasoning earns marks even when the conclusion is wrong — **but only when the
  conclusion is PLAUSIBLE and the structural read (alcohol/acidity/tannin/RS) is correct** (see EK-0112,
  EK-0090). The 2025 verbatim is conditional: "many still managed 5–6/8 **if their reasoning was sound
  *and their conclusion plausible***." An **implausible** call earns little even with reasoning
  ("USA→Australia still received some credit, however Italy… few marks", 2021), and a structural misread
  undermines the downstream answers. Still: "a wrong answer yields more marks than an answer that is
  unfinished — so make a choice" (2021).

### EK-0008 · Cardinal Rule 2 — Quality must be contextualized
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** examiner_report_synthesis §2.2
- **claim:** "Good"/"very good" without context earns ~zero. Use official classification levels
  (Grand Cru Classé, Cru Bourgeois, DOCG, Prädikat, VORS), price points, and a quality ladder
  relative to origin/peers. Communicate "from an MW to an MW where on the quality scale this sits."

### EK-0009 · Cardinal Rule 3 — No shoehorning
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** examiner_report_synthesis §2.3; 2010 Practical §4c (the term's earliest use in the corpus:
  a Cabernet Franc "shoe-horned" into Nebbiolo) — `docs/examiners reports/extracted_txt/2010-Examiners-Report.txt`
- **claim:** Do not decide identity first and bend tasting notes to fit. Read alcohol, acidity,
  tannin, RS accurately FIRST, then deduce. "A lot of shoehorning on paper two… led to the failure
  of many candidates" (2025). **Prescription when a hallmark trait is missing (2010):** if you conclude a
  variety whose signature structure isn't fully in the glass, say so explicitly and argue anyway —
  "Although the acidity is only medium, the high tannins and medium-high alcohol are consistent with
  Nebbiolo" — rather than inventing the trait (which reads as not knowing the classic style). Also 2013:
  changing tasting notes to suit a conclusion was the named failure mode on P2 Q2/Q3.

### EK-0010 · Cardinal Rule 4 — Answer the question as asked
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** examiner_report_synthesis §2.4
- **claim:** Candidates routinely answer the question they prepared for, miss sub-parts
  ("opportunities AND challenges"), waste time on un-asked aspects, and confuse "compare and contrast"
  with "describe each separately." Flagged in every report.

### EK-0011 · Cardinal Rule 5 — Maturity = a QUANTIFIED window with BOTH trajectories
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** examiner_report_synthesis §2.5 (2023 definition); `outputs/research/evidence_audit.md` (SUPPORTED);
  2010 Practical P2 ("answers on maturity should always consider the wine's future/potential"; in a classic
  area the best candidates "considered vintage options, not just age in general") —
  `docs/examiners reports/extracted_txt/2010-Examiners-Report.txt`
- **claim:** A maturity assessment must give a **quantified drinking window** covering **both
  trajectories**: (1) current age, (2) ready now or benefits from ageing, (3) how long it will
  **improve**, (4) how long it will **hold before declining**. The exact element-count is secondary to
  the two requirements — *concrete timeframes* and *both directions*; vague "matured for many years"
  earns minimal marks. A "drinking window" question IS a maturity question even when not labelled one.

### EK-0012 · Cardinal Rule 6 — Commercial must be specific and global
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** examiner_report_synthesis §2.6
- **claim:** Commercial answers need channel (on/off-trade, specialist/supermarket, by-the-glass/list),
  geography (domestic + export, global view), realistic evidence-based price, and competitive set.
  "Steakhouses" as a rote answer is penalized; food pairings "rarely rewarded."

### EK-0013 · Cardinal Rule 7 — Structural evidence is the foundation
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** examiner_report_synthesis §2.7
- **claim:** Accurate alcohol/acidity/tannin/RS is the non-negotiable start. "Hard evidence like
  alcohol and sugar are often more reliable than the flavour profile" (2025). In P2, over-reliance on
  the nose is the biggest trap; structure (tannin/body/alcohol/acidity) is more diagnostic.

### EK-0014 · Funnelling is the endorsed answer technique
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** examiner_report_synthesis §3; endorsed **by name** as early as 2013 ("If ever there was a
  case for intelligent 'funneling'…"; "even to 'funnel' when you are struggling") and described without the
  name in 2010 ("approach the whole exercise of blind tasting in a very systematic manner… all elements of
  the wine… discussed, every time, and in a logical order") —
  `docs/examiners reports/extracted_txt/{2013,2010}-Examiners-Report.txt`
- **claim:** Endorsed by name in every report since 2017 (and since at least 2013 — see evidence): consider
  all glass evidence → list 2–3 options → argue for/against each → narrow with reasoning → state the
  conclusion clearly (ideally up top). Reward enthusiasm/conviction; reward cross-referencing wines within
  a flight to unlock each other ("if these were sensibly argued then the more neutral partner often fell
  into place", 2013 P1); reward honest engagement with unidentifiable wines — "the examiners are always
  aware that some wines are harder to identify than others. In every case what we are looking for is an
  intelligent summary of the likely options and a reasoned argument" (2013). Lead with the evidence that
  unlocks the argument: "talking about tannins at the beginning of your argument when they are not the key
  that unlocks the origin argument… comes across as a weak argument that lacks authority" (2010).

### EK-0015 · "Howler" theory errors sink borderline papers
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** examiner_report_synthesis §4; the "clanger" catalogue goes back to 2010/2013 — "high
  acidity → Châteauneuf du Pape", "semi-aromatic, high acidity = Viognier", Rutherglen Muscat called
  unfortified, PX at 11% abv, "Rueda DOCG", "Napa AOC", "solera… used for port", "lees work is evidenced
  by marked minerality", "Rias Baixas – warm climate", cold soak + MLF claimed for a Gewurztraminer,
  "1er Cru Corton Charlemagne", Chassagne-Montrachet placed in the Côte de Nuits —
  `docs/examiners reports/extracted_txt/{2013,2010}-Examiners-Report.txt`
- **claim:** Factual howlers destroy examiner confidence: "Tawny Port aged in a solera," "Meursault
  Grand Cru," "Pouilly-Fuissé in the Loire," "Sauternes fermented at 16°C in stainless." Also
  penalized: copy-paste/repetitive answers, phantom oak (finding oak that isn't there, or missing
  obvious new oak), origin bias (under-rating a great wine because of its origin), unprofessional
  slang ("stonking," "icon"), and bullet-point arguments.

### EK-0016 · Questions are designed so misidentification doesn't tank the score
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** examiner_report_synthesis §6 (2019)
- **claim:** "The questions were structured… to prevent misidentification of origin from affecting
  performance too adversely." On curveballs, ID marks are downweighted and redistributed to style /
  winemaking / quality / commercial — so a candidate can pass even while misidentifying.

### EK-0109 · Wine is the vehicle; the assessed COMPETENCY is the target (P3 production-canon excepted)
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** `outputs/research/examiner_objectives.md` §0/§3; `outputs/research/evidence_audit.md`
  (SUPPORTED — "wine-is-vehicle / competency-is-target, except the P3 production canon"); structural
  proof in EK-0104 (the ID-suppression → ID-free arc)
- **claim:** The examiners do not primarily test "can you name this wine"; the wine is a **vehicle** for
  assessing transferable **competencies** — structural reading, reasoning, quality judgement, winemaking
  inference, commercial sense, communication. A correct name with thin competency answers fails; sound
  competency on a misidentified wine can pass (EK-0007/EK-0016/EK-0090/EK-0112). **Exception:** P3
  fortified/sweet styles carry a real **production-method canon** (solera, VDN, botrytis, Port styles)
  where the *facts* are themselves examinable ("a theory exam with a tasting", EK-0006) — there, getting
  the method wrong is a howler (EK-0015), not a forgivable vehicle-miss.

### EK-0113 · Independent thinking beats rote; a template-trained candidate fails (study-system caution)
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** 2024 Chief (Tully MW: "an over-reliance on the… study programme is eroding students'
  ability to think for themselves… those who simply assimilate information… will not pass"); 2017/2023/
  2024 Practical anti-cut-and-paste ("no two answers should ever be completely the same"; "creates
  considerable doubt in the mind of the reader"); `outputs/research/evidence_audit.md` T1-4 / Audit E
  (STRONG / SUPPORTED)
- **claim:** Examiners explicitly **reward independent, critical thinking over recited study-programme
  content**, and engineer novel framings to defeat rote (EK-0004, EK-0110). Direct consequence for THIS
  system: a study app that ships **templated** model answers trains the exact failure the Chief named —
  so model-answer generation must reason **freshly per glass** and avoid cross-answer cut-and-paste (the
  grader already penalises it, `marking-principles.ts` Rule 9). A *study-system design* caution, not just
  a grading rule.

### EK-0121 · Examiner confidence is the unifying construct — the "trust account" model
- **tier:** STRONG SIGNAL · **status:** live · **synthesises:** EK-0007, EK-0013, EK-0014, EK-0015, EK-0090, EK-0091, EK-0094, EK-0112, EK-0114
- **evidence:** Project 9 study — `outputs/research/examiner_confidence_construction_model.md` (capstone),
  built on `outputs/research/confidence_language_corpus.md` (~161 cited quotes across 18 reports),
  `confidence_building_behaviors.md`, `confidence_destroying_behaviors.md`, `plausibility_framework.md`,
  `sophistication_framework.md`. "Convincing / conviction / authority" recurs as the **register of a
  passing answer in ≥7 distinct reports**; "confidence/credibility" language appears in 13 distinct reports.
- **claim:** The cardinal rules are facets of **one examiner cognitive process**. The examiner cannot
  watch the candidate taste, so they infer competence **off the written trace alone** and keep a running
  **trust account** on the candidate-as-would-be-MW. It opens **neutral**. It is **credited** by reasoning
  that runs visibly from the glass to a plausible, committed conclusion (the funnel, EK-0014), an accurate
  structural read (EK-0013), quality calibrated on the real global ladder (EK-0114), and — at the top band
  — a second-order "under the skin" insight (EK-0094). It is **debited** by guessing, hedging, shoehorning
  (EK-0009) and recycled answers (EK-0113), and **bankrupted** by a contamination error (EK-0122). The
  final mark tracks the **trust balance, not the count of correct IDs** (EK-0007 / EK-0090 / EK-0112). The
  operational consequence for this system: the grader, feedback and model-answer generators must reward the
  *construction of confidence*, not bare correctness — audited in `outputs/research/confidence_prompt_audit.md`.

### EK-0122 · The contamination law — one error undermines confidence in the WHOLE answer, across questions
- **tier:** STRONG SIGNAL · **status:** live · **extends:** EK-0015, EK-0091
- **evidence:** Project 9 — `outputs/research/confidence_destroying_behaviors.md` (the **best-attested
  finding in the corpus, ≥10 distinct reports**). Near-verbatim examiner formula in two independent
  reports: "factual errors undermine confidence in everything a candidate has written" (2023 Theory) /
  "such mistakes undermine confidence in everything a candidate has written" (2024 Theory). Practical
  cognates: "undermine credibility of the rest of the paper's discussion" (2018), "serious doubts in the
  mind of the examiner" (2019), "considerable doubt in the mind of the reader" (2024). **Cross-question
  propagation:** 2017 Practical — a Vosne-Romanée justified by "moderate alcohol of 15%" "totally
  undermines the confidence… further shattered by reading from the same paper 'Douro, Spain' for Vintage
  Port in the next question." Earliest attestation 2010: a talented taster's sound Malbec reasoning was
  "wasted" by a Douro/Tinta-Roriz confusion — "it is therefore hard to give many marks for the answer,
  despite some of the reasoning being sound… the Examiners are left with the impression that the student
  has no grasp of Portuguese grape varieties"; and on spelling: "how easily a candidate's credibility can
  be compromised" — `docs/examiners reports/extracted_txt/2010-Examiners-Report.txt`
- **claim:** A single factual impossibility or howler does **not** merely cost its own marks — it
  **retroactively poisons the examiner's trust in everything else the candidate wrote, and propagates
  forward across questions.** This is the mechanism behind the howler override (EK-0015) and the cascade
  (EK-0091): confidence is a fragile, **globally-shared** balance, not a per-sub-question tally. The
  verbatim formula is theory-sourced but the mechanism is attested across the practical reports too.
  Asymmetry (see EK-0123): a wrong *ID* is survivable — the funnel rescues it (EK-0112) — but a wrong
  *structural read* or a *theory howler* is trust-bankrupting. Grading consequence: the prompt audit found
  `marking-principles.ts` localises a howler to "adjacent claims," **too weak** against this ≥10-report
  finding (`outputs/research/confidence_prompt_audit.md`, gap 3).

### EK-0136 · Never leave a blank — examiners "mark up when we can" but cannot mark nothing
- **tier:** STRONG SIGNAL · **status:** live · **pairs with:** EK-0007 (2021: "a wrong answer yields more marks than an answer that is unfinished")
- **evidence:** 2010 Practical §1 ("It is almost impossible for candidates to pass the exam if they leave
  blank sheets. The best candidates all put something down for every section of every answer, however
  brief… do not be delayed by agonizing over one or two wines"); 2013 Practical FINISHING (a candidate,
  "clearly an outstanding taster", left P2 Q1 b/c blank → 5/50 on "the easiest question of the 4"; 25
  marks there would have passed the paper; "We will always try to 'mark up' candidates when we can, but in
  this case it was impossible to be generous when there was nothing to mark") —
  `docs/examiners reports/extracted_txt/{2013,2010}-Examiners-Report.txt`
- **claim:** Examiner temperament is **generous by default — but generosity needs raw material.** A brief,
  imperfect attempt on every sub-part beats perfection on some and blanks on others; blank sections are
  the single most mechanically fatal time-management failure. Consequences for this system: (a) model
  answers and study guidance must teach "something on every sub-part, however brief"; (b) the grader
  should score an omitted sub-part as zero *without* letting it poison the temperament applied to the
  attempted parts (the inverse of contamination, EK-0122 — a blank is a lost opportunity, not a howler).

### EK-0138 · Language-precision doctrine — complete names, native terminology, defined abbreviations, correct spelling
- **tier:** STRONG SIGNAL · **status:** live · **feeds:** EK-0015 (persistent violations become credibility debits)
- **evidence:** 2010 Practical §3 (Syrah not Shiraz for the Rhône; "if asked for a region or grape variety,
  the answer should be complete — e.g. not simply 'Gruner' or 'Pessac'"; state currency origin "e.g. US$";
  the abbreviation-legend cautionary tale — a half-page code like "RN&SP" that became a rote formula;
  "Millennials" flagged as jargon without relevance); 2013 guidelines page (define an abbreviation at first
  use — "Sulphur Dioxide (SO2)… malolactic fermentation (mlf)" — never a separate legend; "examiners
  expect candidates to spell wine names and terms correctly, and persistent incorrect spelling… will be
  noted in the award of marks"); 2013 'PREMIUM' section (incessant "premium" and a little-known native
  currency as a quality reference both flagged: "whatever you are trying to tell us, please be clear") —
  `docs/examiners reports/extracted_txt/{2013,2010}-Examiners-Report.txt`
- **claim:** Answer language is itself graded surface: use the **terminology native to the concluded
  region** (Syrah in the Rhône, Shiraz in Barossa); give **complete** names for regions/varieties (no
  "Gruner", no "Pessac"); define an abbreviation **once at first use** and never front-load a legend;
  anchor prices in a **stated major currency**; spell classic wine terms correctly (misspellings like
  "Valdibadore" / "Greuner Veltliner" / "Method Champanoise" / "Botrutis" compromise credibility,
  EK-0122); avoid vague register words ("premium" as a crutch, unexplained marketing jargon). Model-answer
  generation and grading should both enforce this surface.

---

## §3 · Answer grading guidelines

> **Why our grading agents are built this way.** §2 + §3 are not just description — they are the
> source for how the app actually grades. The principles here are encoded in two shared prompt
> constants injected into every grader so the per-answer grader (`answer_grading`, Sonnet) and the
> full-debrief grader (`full_debrief`, Opus) mark identically:
> - `study-app/src/lib/prompts/marking-principles.ts` → `MARKING_PRINCIPLES` (calibration + cardinal
>   rules + the howler/cascade/over-calling/cut-and-paste rules below).
> - `study-app/src/lib/prompts/funnelling.ts` → `FUNNELLING_PRINCIPLE` (EK-0014; how identity must be
>   *argued*). Also injected into model-answer generation so generated answers demonstrate it.
> These were consolidated from a full 13-report mining pass (Practical + Chief, 2017–2025) recorded in
> `outputs/heuristics/grading_gap_analysis.md`. **Temperament: faithful verdict, constructive voice** —
> the PASS/BORDERLINE/FAIL result reflects how the IMW would actually grade (a howler can tip a
> borderline to fail; fabricated/cascade answers are zeroed), but the written feedback stays coaching.

### EK-0017 · Grading depth must be proportional to marks (Cardinal Rule 8)
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** ledger: attempt #79 (accept, manual) — "Added Cardinal Rule 8: mark-proportional depth scaling"
- **claim:** Expected answer depth scales with marks. Example: a style/quality/commercial question at
  2/3/3 marks expects ~one sentence for style + 2–3 primary drivers each for quality and commercial.
  The same question at 2/7/5 marks expects far more granular detail. Writing a master-level essay on a
  low-mark sub-question shows mastery but **wastes time and earns no extra marks** — do not grade a
  concise low-mark answer against a high-mark standard. Separate the **grade** from **educational
  enrichment** ("other factors for consideration") so concision isn't penalized.

### EK-0018 · 2-mark sub-questions are numerical only (RS / ABV)
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** ledger: attempt #73 (accept) — corpus: all 2-mark sub-questions are "State the RS (g/L)" / "State the ABV (%)"
- **claim:** The MW only ever allocates **2 marks** to a numerical answer (residual sugar in g/L,
  alcohol %). It never asks for a written/reasoned answer worth only 2 marks. Written sub-questions
  (style, quality, commercial, winemaking) are **≥5 marks**.

### EK-0019 · Commercial-positioning sub-questions are ≥5 marks
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** ledger: attempt #73 (accept)
- **claim:** Commercial positioning is **always ≥5 marks** — typically 5, sometimes 8 for harder
  wines, occasionally 10; a flight-wide compare/contrast on commercial can be 18–24. A 2-mark
  commercial question would never occur.

### EK-0020 · Style is a near-ubiquitous modern sub-question (~5 marks)
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** ledger: attempt #73 (accept); corpus: "style" in 60+ sub-questions, nearly every 2024–2025 question
- **claim:** "Style" appears at least once on essentially every modern paper, usually ~5 marks for a
  concise one-sentence descriptor (e.g. "a complex, tannic red with dark fruit, built for cellaring"
  or "a light, easy-drinking, neutral dry white with low alcohol"). It can be standalone or bundled
  ("comment on the style, winemaking and commercial positioning — 15 marks"). A relatively new
  addition driven by global style convergence.

### EK-0021 · Variety-ID mark size signals difficulty
- **tier:** PLAUSIBLE · **status:** live
- **evidence:** `outputs/heuristics/examiner_patterns.md` §2.1–2.2
- **claim:** 10–15 marks for a single-variety call ⇒ mainstream, identify confidently. 16–25 marks ⇒
  important but less obvious / deliberate difficulty. 4–8 marks **per wine** ⇒ each wine is a separate
  ID challenge (diverse flight). When origin is <8 marks/wine, geography is a "gimme" — spend time on
  the higher-marked components.

### EK-0022 · "Compare and contrast" carries heavy marks and demands direct comparison
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** `outputs/heuristics/examiner_patterns.md` §2.3
- **claim:** "Compare and contrast" always carries heavy allocation (20–36 marks) and must be answered
  as direct comparison ("Wine A does X while Wine B does Y"), not two separate tasting notes. This is
  where the majority of the question's marks live.

### EK-0086 · Single-answer origin sub-questions should credit the plausible set, not only the exact pick
- **tier:** PLAUSIBLE · **status:** live
- **evidence:** ledger: attempt #139 / analysis #22 (accept); examiner_report_synthesis §2.1
- **claim:** When a same-variety flight tells the candidate the grape but the stem gives no way to narrow which specific origin each wine is, the per-wine origin call is irreducibly ambiguous — the candidate can identify the plausible country set (e.g. for a Syrah/Shiraz flight: N. Rhône France, Australia, South Africa, plus US/Chile) but cannot funnel below it from the glass+stem alone. Real-exam marking rewards sound reasoning even when the exact origin is wrong ('5–6/8 if their reasoning was sound', 2025). The Stem Sniper grading mechanism should therefore award partial credit for correctly identifying the plausible origin set on single-answer-ambiguous questions, rather than grading each wine's origin as strictly correct/incorrect.

### EK-0089 · Grade to the PRINTED per-question tariff, not a fixed ID %
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** grading_gap_analysis §4; corpus: 2023 P1 Q1 (a 2×10 / 2×15 / 2×25 split)
- **claim:** The authoritative weighting is always the marks the question prints, sub-part by sub-part.
  Identification's share swings widely by question — as low as **20%** (2023 P1 Q1: variety ID 20 of
  100, winemaking 30, quality+ageing 50; origin not even asked). The paper-wide ~40% ID average
  (EK-0006) is a *temperament* check, never a per-question formula: a correct ID with thin answers on
  the higher-tariff parts still fails; a wrong-but-reasoned ID can pass when those parts are strong.
  Encoded in `MARKING_PRINCIPLES` as the first calibration rule.

### EK-0090 · Most ID marks reward the argument; wrong IDs are scored on a plausibility gradient
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** grading_gap_analysis §4 (2022, 2021)
- **claim:** Within an identification sub-question the larger share of marks is for the **argument
  (structural reasoning + elimination), not the bare conclusion** — "a much higher proportion of the
  marks… for the argument rather than for the conclusion" (2022). Grade wrong IDs on a sliding scale of
  plausibility, not binary: an adjacent/stylistically-plausible miss earns real partial credit, an
  implausible one little ("USA → Australia still received some credit, however Italy… few marks", 2021).

### EK-0091 · Internal-consistency / cascade error (a heavily-penalised failure mode)
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** grading_gap_analysis §2 P1 (2021, 2022); `outputs/research/evidence_audit.md` (the
  "most-penalized" ranking is UNPROVEN — an overfit superlative; the substance below stands)
- **claim:** Cross-check the candidate's OWN stated structure (alcohol/acidity/tannin/RS) against the
  wine they named: a contradiction ("Champagne at 14%", "a VDN at 20%") is a logical impossibility →
  **no conclusion mark** for that sub-question, flagged as a theory error (2022). Watch the **cascade**:
  a candidate who misidentifies and then writes quality/style/commercial for the *guessed* wine rather
  than the glass — mark those down for being disconnected from the glass (2021). But do NOT cascade-
  penalize a sound answer merely because the ID is wrong (EK-0016): if it describes the glass faithfully,
  score on its own merits. This is the detection-and-scoring complement to shoehorning (EK-0009).

### EK-0092 · Quality mis-calibration cuts both ways; maturity ≠ quality
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** grading_gap_analysis §2 P1 (2025, 2017, 2019); extends EK-0008
- **claim:** Penalize **over-calling** (a Côtes du Rhône called Châteauneuf, a Ruby called Vintage Port —
  2025) as a distinct error that dents examiner confidence, not just under-calling. Don't let "Old World
  = superior" stand unargued (2017). Don't let a **developed** wine be mistaken for a **great** one —
  "many mistook its maturity for quality" (2019). Name the official tier where one exists even if not
  explicitly asked (2025).

### EK-0093 · Verdict mechanics — absolute bands, four-dimension mastery, howler override
- **tier:** STRONG SIGNAL · **status:** superseded
- **superseded by:** EK-0116 (the "absolute 65% **per paper**" constant is factually wrong — the IMW
  pass standard is a 65% **average** across the three papers with a ~50% per-paper floor; and the IMW
  names **three** abilities, not four. See EK-0116. Kept for history; ignored by downstream agents.)
- **evidence:** grading_gap_analysis §4 (2018, 2021, 2024)
- **claim:** Pass is an **absolute 65%** per paper, not a curve; anchor verdicts to marks (F<50,
  BORDERLINE ~55–64, PASS ≥65; sub-45% does not recover). A pass needs mastery across **four
  dimensions** — structural reading, communication, theory accuracy, quality judgement (2024); a spike
  in one can't rescue a hole in another. **Howler override:** if the aggregate lands at BORDERLINE and a
  clear theory howler is present (EK-0015), resolve to FAIL and name it — examiners withhold the benefit
  of the doubt from a borderline candidate making obvious theory mistakes (2024).

### EK-0116 · Verdict mechanics (corrected) — 65% AVERAGE across papers + ~50% floor (supersedes EK-0093)
- **tier:** STRONG SIGNAL · **status:** live · **supersedes:** EK-0093
- **evidence:** public **IMW Student Guide** (authoritative, overrides corpus): "average 65% or more
  across all three papers, with a minimum of 50% in any one paper"; 2017 Practical (Tuck MW, "the
  average of 65% to pass"); 2024 Practical (Marks MW, bands defined "across all three papers"); 2018
  Chief (Hoskins MW, sub-45% *average* rarely recovers); `outputs/research/evidence_audit.md` Audit A /
  T1-1 (VERY STRONG); `outputs/research/examiner_confidence_model.md` §7; memory
  `ek-0093-pass-standard-correction`; **primary-source confirmation from 2013** (Hoskins MW: "A pass has
  always been an average score of 65%") plus the floor's mechanism in the wild — "crashes (scores so low
  in one paper that they made a pass virtually impossible)": 49 of 81 candidates crashed on P2 in 2013 vs
  27 on each other paper; overall practical pass 13/81 (16%), down from 20% in 2012 —
  `docs/examiners reports/extracted_txt/2013-Examiners-Report.txt`
- **claim:** The IMW practical pass standard is a **65% AVERAGE across the three papers, with a ~50%
  per-paper floor**, criterion-referenced (an absolute bar, not a curve) — **NOT 65% on every paper**.
  A strong paper can carry a weaker one above the average provided the weak paper clears the floor.
  Bands: **C+ = 60–64% is confirmed**; **A ≥70 / B 65–69 are plausible/indicative only** (sourced to the
  unreadable 2021 Chief appendix — do **not** assert as verified). Below **~45% *average*** rarely
  recovers (a tendency, softened by the SPR mechanism — not a per-paper rule). A pass requires breadth
  across the IMW's **three named abilities** — accurately assess the wine; draw sound judgements
  (quality/origin/variety/maturity/winemaking/commercial); communicate concisely under time pressure
  (Student Guide). The earlier "four-dimension" phrasing (EK-0093) was an internal reconstruction; keep
  theory accuracy as an internal fourth lens, not an IMW-stated dimension. **This app grades a single
  question**, so its per-question PASS/BORDERLINE/FAIL thresholds are a single-question **PROXY** for the
  band, not the official paper-level rule — a framing fact, not a scoring-logic change (no numeric 65%
  threshold exists in code; grading-telemetry is detect-only, EK-0103). The howler-override temperament
  (old EK-0093 / EK-0015) still holds.

### EK-0094 · Top-band differentiator — "under the skin of the wine"
- **tier:** PLAUSIBLE · **status:** live
- **evidence:** grading_gap_analysis §2 P3 (2022, 2025)
- **claim:** Reserve the highest marks for engaged, specific, second-order insight — e.g. reasoning that
  an exceptional producer exceeds a classification's minimum sugar requirement (2025) — i.e. getting
  "under the skin of the wine" (2022). Genuine enthusiasm conveyed in the writing is rewarded; flat,
  formulaic prose on a great wine is not. Use this to separate a *good* answer from an *outstanding* one.

### EK-0112 · Reasoning rescues a wrong call ONLY when it is plausible + structurally sound
- **tier:** STRONG SIGNAL · **status:** live · **qualifies:** EK-0007 · **pairs with:** EK-0090
- **evidence:** 2025 P1 (Mitchell MW, verbatim "5–6/8 if their reasoning was sound *and their conclusion
  plausible*"); 2021 (USA→Australia "some credit", Italy "few marks"); 2025 (Marks MW — a correct
  structural read can still pass; poor tasting cascades into wrong quality/style/commercial); 2023 P3Q3
  (a structural misread that was *survived*); `outputs/research/evidence_audit.md` T1-2a / Audit B (VERY STRONG)
- **claim:** "Reasoning > identification" (EK-0007) is **conditional**. A wrong call earns its reasoning
  marks only when (a) the conclusion is **plausible/adjacent** to the truth and (b) the **structural read
  (alcohol/acidity/tannin/RS) is correct**. An **implausible** call earns little even with fluent
  reasoning; a **structural misread** is high-leverage and usually decisive — **but recoverable**:
  2023 P3Q3 shows a candidate who misjudged alcohol/acidity still scored well on parts b/c by describing
  the glass faithfully. So grade wrong calls on the **plausibility gradient** (EK-0090); do **NOT**
  hard-cascade a structural miss to zero. (Latitude also *tends* to scale with wine difficulty —
  esoterica generous, bankers strict — but the "bankers get zero latitude" form is **inferred**, not
  graded policy; see §9.)

### EK-0114 · Quality is judged FULL-SCALE and ORIGIN-BLIND; volunteer the official tier
- **tier:** STRONG SIGNAL · **status:** live · **extends:** EK-0008, EK-0092, EK-0106
- **evidence:** 2017 ("do not assume Old World will always be the superior examples"); 2018/2023/2024/
  2025; `outputs/research/evidence_audit.md` T2-7 / Audit E (STRONG / SUPPORTED)
- **claim:** Judge quality on the **full global ladder**, not merely "good for its region", and
  **without letting the identified (or guessed) origin bias the call** — under-calling a great non-classic
  wine and over-calling a lesser classic both dent examiner confidence (EK-0092). **Volunteer the
  official/legal tier where one exists and is relevant, even if not explicitly asked** (Grand Cru Classé,
  DOCG, Prädikat, VORS — 2025), and anchor to a global frame + classification (EK-0106).

### EK-0115 · One-fact / bare macro-region origin calls are penalised, often to zero
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** 2024 Practical (stopping at "just Mosel", or a bare "Northern Rhône" with no sub-region,
  "will often yield a zero mark"); `outputs/research/evidence_audit.md` T2-6 (SUPPORTED)
- **claim:** When origin is asked, a **single-fact** answer or a **bare macro-region** drop (country-only,
  or "Northern Rhône"/"Burgundy" with no sub-region) under-answers and is often scored **zero** for the
  origin mark — the funnel must land on something **concrete** (sub-region/appellation) and be supported
  by **≥2 evidence strands** from the glass. The origin-side complement to the plausibility gradient
  (EK-0090/EK-0112) and the specificity rule (`marking-principles.ts` Rule 2).

### EK-0123 · Confidence ≠ correctness is BIDIRECTIONAL — a correct ID can still destroy confidence
- **tier:** STRONG SIGNAL · **status:** live · **pairs with:** EK-0007, EK-0090, EK-0112 · **under:** EK-0121
- **evidence:** Project 9 — `outputs/research/confidence_destroying_behaviors.md`;
  `outputs/research/examiner_confidence_construction_model.md` §4 (the confidence-vs-correctness 2×2).
  Cleanest exemplar: **2024 Practical P1 — the *identical correct* call (Pinot Grigio) earned good marks
  for some and lost many marks for others** "depending purely on the supporting argument" ("many went
  straight for Pinot Grigio without proper arguments and lost many marks" vs those whose arguments "made
  the choice more plausible"). Corroboration: 2018 Chilean Cabernet (correct origin, quality mis-calibrated
  → still weak); 2021 Saint-Julien (correct Bordeaux, failed the paper by neglecting the quality half);
  2023 Grenache W8 (correct variety, "little demonstration of knowledge"). The inverse (wrong-but-trusted)
  is EK-0007 / EK-0090 / EK-0112.
- **claim:** EK-0007/0090/0112 establish one direction — a **wrong** call keeps its marks when the
  reasoning is sound (wrong-but-trusted). This is the **other direction**: a **correct** identification
  still **loses** marks/confidence when the reasoning is invisible, the structural read is absent, or a
  dependent judgement (quality / maturity / commercial) is mis-calibrated (right-but-doubted). **The label
  is not the asset; the argument is.** Grading consequence: a grader that credits a correct ID *regardless
  of argument* reverts to scoring the label — the prompt audit flags missing "correct-ID parity" handling
  (`outputs/research/confidence_prompt_audit.md`, Crit 2). This is the §3-level expression of the
  trust-account model (EK-0121).

### EK-0126 · Cartizze is the apex of the Prosecco hierarchy — model answers must not undersell premium crus
- **tier:** PLAUSIBLE · **status:** live
- **evidence:** ledger: attempt #133 / analysis #17 (reject)
- **claim:** When a flight uses a 'premium example of a humble category' (e.g. Bisol Cartizze, the historic grand-cru hilltop and apex of the Valdobbiadene/Prosecco pyramid), the model answer must characterise it at that quality level — complex, age/lees-worthy, premium-priced — not as a generic off-dry, easy-drinking aperitif. Mischaracterising a top cru as a moderate-quality example is an answer-content/calibration error (cf. EK-0092 over/under-calling). The question design (premium example of a humble category) is corpus-realistic; the defect is the model-answer prose.

### EK-0127 · Classification models differ in KIND — Burgundy=vineyard, Bordeaux=producer, Rioja=ageing, Tuscany=geographic+structural
- **tier:** PLAUSIBLE · **status:** live
- **evidence:** ledger: attempt #135 / analysis #19 (partial)
- **claim:** A quality-hierarchy answer must not flatten all 'legally defined ladders' into the same geographic delimiting. The classification models differ in kind: Burgundy is a vineyard/terroir ladder (Bourgogne→village→1er→Grand Cru); Bordeaux (1855) is a producer/château classification; Rioja's ladder is an AGEING-regime designation (Crianza/Reserva/Gran Reserva, plus varietal/DOCa rules) — NOT geographic; Tuscany/Sangiovese combines geographic (Chianti vs Chianti Classico) AND structural (Classico vs Gran Selezione). A model answer or grader that frames Rioja's tiers as a geographic appellation ladder is factually wrong; place each wine within the correct TYPE of hierarchy for its origin.

### EK-0137 · Candidate-side length calibration — "less is more" has a floor; quality answers have a content boundary
- **tier:** STRONG SIGNAL · **status:** live · **pairs with:** EK-0017 (the grading-side proportionality rule)
- **evidence:** 2013 Practical REASONING ("be mindful of the space and mark allocation on the pro forma as
  a guide to the level and detail of the answer required. Resist the temptation to write too much or the
  timing will become a problem" — but equally "some candidates often wrote too little to earn the full
  marks allocated… frequently… when answering for quality"); the same examiner's content boundary:
  candidates "included superfluous information such as commercial position when answering for quality
  (i.e. 'white table cloth restaurant', specific food pairings, WBG, etc.) while neglecting to include
  price point or when to drink / capacity to age"; 2013 BULLET POINTS ("Bullet points can work,
  particularly when time is short. But if you need to argue a point, to compare and contrast, or even to
  'funnel'… bullet points rarely do the job"); 2010 §1 ("Many candidates wrote too much when there were
  not that many marks on offer. Try to write enough to secure maximum points, but do not over-elaborate") —
  `docs/examiners reports/extracted_txt/{2013,2010}-Examiners-Report.txt`
- **claim:** The mark allocation (and, on the real pro forma, the physical space) is the calibration
  signal in **both directions** — over-writing costs time, under-writing caps the score below the
  allocation ("it's all about balance. Stick to the point and back that point up"). **Quality sub-answers
  have a content boundary:** they SHOULD include price point and drink-window/ageing capacity, and should
  NOT drift into commercial staging (venue types, food pairings, by-the-glass placement — that content
  belongs only in a commercial sub-question). **Format:** prose that argues; bullet points are legitimate
  only for non-argumentative content under time pressure, never for funnelling or compare/contrast
  (EK-0022). Generation consequence: model answers should visibly scale word count with the printed
  sub-part tariff and keep quality/commercial content in their own lanes.

### EK-0139 · Commit to ONE definitive conclusion — option lists, unresolved hedges and unnamed winners earn zero
- **tier:** STRONG SIGNAL · **status:** live · **sharpens:** EK-0014 (the funnel's mandatory final step)
- **evidence:** 2013 Practical P2 ("…suggests Cabernet Franc, Tempranillo, Sangiovese, Barbera or Mencia.
  'Okuzgozu' from Turkey also considered — but no conclusion drawn. **We cannot give any marks if we are
  simply given a list of diverse options**"); 2013 P2 Q1 ("Too often there was ambiguity in the final
  choice — there has to be a definitive conclusion"; "some candidates lost easy marks in the comparative
  section by not clearly stating which wine was the better of the two, simply describing each wine
  individually"); 2010 P3 Q2 on numerical answers ("Note that a single number is required, not a range") —
  `docs/examiners reports/extracted_txt/{2013,2010}-Examiners-Report.txt`
- **claim:** The funnel (EK-0014) must **land**: a survey of candidates without a single committed
  conclusion earns **zero** for the conclusion mark regardless of the survey's quality. This applies in
  every form — identity calls (one final answer, not a shortlist), comparative sub-questions (name the
  better wine explicitly, EK-0022), and numerical answers (one number, never a range — EK-0141). Hedging
  is not caution; to the examiner it is a refusal to answer. Grading consequence: the grader should award
  conclusion marks only when a single conclusion is actually stated, while still crediting the option
  survey as reasoning (EK-0090).

### EK-0141 · P3 numerical canon — one number (with leeway at the extremes), and classic style parameters are examinable facts
- **tier:** STRONG SIGNAL · **status:** live · **extends:** EK-0018, EK-0109 (the P3 production-canon exception)
- **evidence:** 2010 Practical P3 ("at no point in the paper were the candidates asked to identify grape
  varieties. The focus was on method of production and detailed structural analysis"; "The failure to
  break down each wine and analyse its structural parts — acidity, sugar, tannins, alcohol — was the
  undoing of many"; on RS/abv: "Examiners realise precise identification of sugar and alcohol is difficult
  at extreme highs and lows, and so **leeway is given during the grading**. Note that a single number is
  required, not a range"; "candidates must do the basic homework e.g. learning residual sugar levels and
  alcohol parameters for classic sweet wine styles" — a candidate "nailed the PX but suggested it was 11%
  alcohol"; "finding fortification where there was none"; Rutherglen Muscat called unfortified); 2013
  Practical P3 (an Icewine judged "much less sweet than it is… candidates should taste more Icewines,
  especially… Vidal: very sweet, unoaked and high in acidity"; a passito's alcohol overestimated and sugar
  underestimated — "close to 300 grams") —
  `docs/examiners reports/extracted_txt/{2013,2010}-Examiners-Report.txt`
- **claim:** In P3, the **RS/abv/production parameters of the classic sweet, fortified and sparkling
  styles are themselves examinable facts** (the EK-0109 canon, quantified): Kabinett vs Aszú vs Icewine vs
  SGN vs passito RS bands, fortification abv ranges (PX/sherry ~15–17%, Port ~19–20%, VDN ~15%),
  fortified-vs-unfortified discrimination. Grading of numerical sub-answers: demand a **single number**
  (a range = no commitment, EK-0139), score with a **tolerance band that widens at extreme highs/lows**,
  and treat a parameter impossibility (PX at 11%) as a howler-class credibility debit (EK-0015/EK-0122),
  not a near-miss. Question generation should keep answer keys' RS/abv values inside the style's
  documented band and mark-scheme tolerances proportional to how extreme the true value is.

---

## §4 · Wine selection & distribution by paper

### EK-0023 · Curveball distribution: 6.2% high / 17.9% medium / 75.9% low
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** `outputs/heuristics/curveball_analysis.md` (504 wines, 2011–2025)
- **claim:** Of all exam wines, **6.2% are high curveball, 17.9% medium, 75.9% low** (standard/expected).
  Four curveball types: Rare Variety (~35%), Rare Style (~30%), Unexpected Origin (~20%), Hidden
  Identity (~15%). **[Last-10 refresh, 2026-05:** by flight size the per-wine harder (med+high) rate is
  flat ~21–27% (2/3/4-wine; 5/6-wine directional, n=7/6); **F5 method (61%) is the densest curveball
  family, F1 same-variety the safest (8%)** — denser than F4 breadth (24%); F6 (38%) is directional (n=4).
  Source: `outputs/gap_analysis/findings/03`.]

### EK-0024 · The "1 in 4" rule — one curveball, the rest anchors
- **tier:** STRONG SIGNAL · **status:** superseded (see EK-0097)
- **evidence:** `outputs/heuristics/curveball_analysis.md` (Examiner Deployment Patterns)
- **claim:** In a multi-wine question, typically **exactly one** wine is significantly harder; the
  rest are anchors. Ratios: 2-wine ≈ 1 curveball + 1 anchor (50%), 3-wine ~33%, 4-wine ~25% (modal
  format). Curveballs are **never random** — each serves a pedagogical purpose, and ID marks on it are
  downweighted in favour of style/winemaking/quality/commercial.

### EK-0025 · Curveballs concentrate in P3 and in the final question of P1/P2
- **tier:** STRONG SIGNAL · **status:** superseded (see EK-0096)
- **evidence:** `outputs/heuristics/curveball_analysis.md`; `examiner_patterns.md` §4.8
- **claim:** Per-paper high-curveball averages: **P3 = 1.1, P1 = 0.8, P2 = 0.4**. Within P1/P2 they
  cluster in the **last question** (wines 10–12 / 9–12); in P3 they sit in the middle questions
  (orange/oxidative/unusual rosé). Same-variety questions rarely contain curveballs (variety is stated);
  breadth/mixed-bag and same-country questions host the most. Deployment is increasing 2023–2025.

### EK-0026 · Curveballs sit mostly at specialist/premium price, rarely luxury
- **tier:** PLAUSIBLE · **status:** live
- **evidence:** `outputs/heuristics/curveball_analysis.md` (Price tier)
- **claim:** ~65% of curveballs are specialist/premium ($20–50), ~20% commercial ($10–20), ~15% fine
  ($50+); almost none at luxury tier.

### EK-0027 · Corpus price-band distribution (quality proxy)
- **tier:** PLAUSIBLE · **status:** live
- **evidence:** `outputs/heuristics/quality_price_tier_analysis.md` (504 wines; bands: value ≤15,
  mainstream 16–30, premium 31–60, super_premium 61–120, luxury 120+)
- **claim:** Overall: premium 236, value 122, super_premium 85, luxury 36, mainstream 25. By paper:
  - **P1:** value 46 · mainstream 9 · premium 82 · super_premium 25 · luxury 6
  - **P2:** value 52 · mainstream 6 · premium 61 · super_premium 43 · luxury 6
  - **P3:** value 24 · mainstream 10 · premium 93 · super_premium 17 · luxury 24
  P3 holds the most luxury wines (fortified/sweet icons); P2 the most super-premium (classed reds).

### EK-0028 · Quality questions either ladder broadly or test internal hierarchy
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** `outputs/heuristics/quality_price_tier_analysis.md` (Exam Writer Rule)
- **claim:** A well-formed quality question does ONE of: (a) **broad discrimination** — ≥3 price bands,
  ideally one value/mainstream + one premium + one super-premium/luxury; or (b) **internal hierarchy**
  — all-premium-plus is fine *only if* the stem names/implies a classification, producer, appellation,
  or legal quality ladder. Avoid four high-priced wines with no clear tiering (answer then turns on
  reputation, not observable evidence). **[Last-10 refresh, 2026-05:** the *majority* of quality questions
  (51%) are compressed-high (<3 bands); only 20% ladder across ≥3 bands — so compression is the norm, and
  is legitimate ONLY with a legal scaffold (14/18 historical ladders rest on AOC/DOCG/Prädikat/1855 tiers).
  Directional — `price_band` is a coarse proxy (~7% explicit). Source: `outputs/gap_analysis/findings/02`.]

### EK-0029 · 4-wine flights need at least one "banker" classic
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** ledger: attempt #71 (accept) — every France same-country P1 flight 2012–2025 had ≥1 benchmark/iconic wine
- **claim:** The MW exam tests the classics. A flight of 3+ wines (especially a 4-wine flight, which
  consumes a third of a paper) needs **at least one "banker"** — a wine the candidate is expected to
  know cold (1er Cru Burgundy, Marlborough Sauvignon Blanc, Bordeaux classed growth, Fino Sherry).
  A generic regional wine (e.g. Bourgogne Blanc) does **not** count — the banker must be village/1er
  cru level or equivalent classification. Curveballs separate the strong from the average candidate;
  a flight of two curveballs + a non-rated wine is implausible.

### EK-0030 · F4 grab-bag flights use mid-tier regional-identity wines, not icons
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** ledger: attempt #92 (accept) — "F4 quality-tier cap" (2017 P2 Q3, 2025 P2 Q3, 2016 P2 Q5)
- **claim:** Mixed-breadth (F4) "grab-bag" questions are built from **mid-tier, regionally
  distinctive** wines whose interest is varietal/origin identity in the absence of other linking
  cues (e.g. Uruguayan Tannat, Carmenère). Icon/prestige cuvées (rated Burgundy, Almaviva) belong in
  single-variety / single-country / quality-hierarchy flights (F1/F2/F7), not the grab-bag.

### EK-0031 · The MW regularly uses mid-tier and commercial producers
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** ledger: attempt #65 (reject), #64 (reject) — corpus-overruled candidate objections
- **claim:** Do not assume only prestige wines appear. The corpus includes a **Tesco** wine (2014) and
  **Yellow Tail** (2023). Mid-tier producers and "unglamorous" regional wines are legitimately on the
  exam — e.g. **Bierzo/Mencía** (Petálos 2014), and two same-variety wines in one flight mirror real
  flights (2015 Italy: two Sangiovese). Reflexive "they'd never put that in" is often wrong.

### EK-0032 · Mendoza Malbec is a recurring Paper 2 wine
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** ledger: attempt #64 (reject) — Mendoza Malbec in 2013, 2019, 2022 (a whole question with two), 2023
- **claim:** Mendoza Malbec is one of the most frequently recurring P2 wine types. It is a standard
  inclusion, not a stretch.

### EK-0033 · Vin Santo recurs in P3 sweet flights
- **tier:** PLAUSIBLE · **status:** live
- **evidence:** ledger: attempt #62 (reject) — Vin Santo in 2013 (Capezzana), 2015 (Isole e Olena), 2024 (Badia a Coltibuono)
- **claim:** Vin Santo is a legitimate, recurring P3 sweet-flight wine. Its 15.5% ABV oxidative
  profile makes it a **medium curveball** (it mimics fortified wines) but it is in-scope. Classified
  medium curveball in all 4 historical appearances.

### EK-0034 · P1 always includes Chardonnay; Riesling in 8 of 10 years
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** `outputs/heuristics/examiner_patterns.md` §4.3–4.4
- **claim:** At least one P1 wine is **Chardonnay every single year** (full spectrum: unoaked Chablis
  to oaked/full-malo California, village to Grand Cru). **Riesling** appears in P1 in ~8/10 years
  (Mosel Kabinett, Alsace dry, Clare Valley, GG). These are the two most reliable P1 varieties.

### EK-0035 · P3 Q1 TENDS to open sparkling — a tendency, not a rule (broke in 2025)
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** `outputs/heuristics/examiner_patterns.md` §4.1; `outputs/backtest_reports/loyo_postfix_audit.md`;
  `outputs/research/evolution_analysis.md` + `outputs/research/evidence_audit.md` T3-6 (the 2025 break is verified)
- **claim:** P3 opens with sparkling (or a category including sparkling) in ~7/10 years, and in
  2021–2024 P3 Q1 was explicitly sparkling every time, increasingly "not Champagne." **This is a
  positional *tendency*, not a rule: it BROKE in 2025 (P3 Q1 was a Riesling flight).** Do not single-lock
  a P3 opener on sparkling. Still prepare Cava, Crémant, English sparkling, Franciacorta, California
  sparkling, Sekt, Prosecco Superiore — but treat the slot prior as soft (cf. EK-0096 positional priors).

### EK-0036 · P3 wines 10–12 trend fortified/sweet
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** `outputs/heuristics/examiner_patterns.md` §4.2
- **claim:** In 8/10 years, P3 wines 11–12 are fortified or sweet. Common: Port (Tawny/Vintage/Ruby/
  LBV/Colheita), Sherry (Fino/Manzanilla/Amontillado/Oloroso/Palo Cortado), Madeira, Tokaji,
  Sauternes/Barsac, Vin Santo, VDN (Maury/Banyuls/Muscat de BdV/Rutherglen).

### EK-0037 · Iberian/Madeira fortified + Tokaji appear in P3 with high frequency
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** `outputs/heuristics/examiner_patterns.md` §4.10–4.11
- **claim:** At least one Sherry/Port/Madeira appears in P3 most years (Sherry 6/10, Madeira 4/10,
  Port frequent). **Tokaji appears in 5/10 years** (Aszú puttonyos, Szamorodni, and dry Furmint) — the
  most-tested sweet origin after Sauternes. P3 also features explicit residual-sugar questions in 7/10
  years (memorize RS thresholds: Brut 0–12, Demi-Sec 32–50, late-harvest 50–100+, BA/Icewine 150–250+).

### EK-0038 · P2 includes a Bordeaux / Bordeaux-variety flight most years
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** `outputs/heuristics/examiner_patterns.md` §4.5, §4.12
- **claim:** 8/10 years, P2 has a Bordeaux wine or Bordeaux-variety flight (Left Bank, Right Bank, or
  global Cab/Merlot). P2 Q1 usually provides an anchoring constraint (named variety, same country,
  classic origins) to let candidates build confidence before harder flights.

### EK-0039 · Sweet-wine flights are built for mechanism diversity
- **tier:** PLAUSIBLE · **status:** live
- **evidence:** `outputs/heuristics/question_wine_composition_analysis.md` (9 historical flights; 6 mechanism-diversity rules; 12 guardrails)
- **claim:** P3 sweet flights deliberately spread across sweetness-creation **mechanisms** (botrytis,
  passerillage/dried-grape, late-harvest, icewine/cryo, fortification-arrested fermentation, oxidative)
  rather than repeating one. A sweet-wine question generator must diversify mechanism, not just origin.

### EK-0073 · Greek red curveballs: Xinomavro/Agiorgitiko over Mavrotragano
- **tier:** PLAUSIBLE · **status:** live
- **evidence:** ledger: attempt #129 / analysis #16 (partial)
- **claim:** When deploying a Greek indigenous-red curveball, prefer varieties with a meaningful production base and benchmark presence: Xinomavro (Naoussa, Amyndeon) and Agiorgitiko (Nemea). The corpus uses Xinomavro twice (2025 P2 Q3 Alpha Estate Amyndeon; Kir-Yianni Ramnista, Naoussa) and never uses Mavrotragano, which is grown almost exclusively on Santorini by a tiny handful of producers and is implausibly obscure as an exam curveball. MW curveballs (Tannat, Xinomavro, Nerello Mascalese, Lagrein) favour rare-but-established varieties, not ultra-niche ones.

### EK-0075 · Per-variety corpus census — what actually appears, and how often
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** `outputs/backtest_reports/loyo_report.md` §5 (360 scored wines, 2015–2025)
- **claim:** The empirical prior for "what is in the glass" (count across the scored corpus):
  Chardonnay 35 · Pinot Noir 27 · Riesling 21 · Cabernet Sauvignon/Merlot (Bordeaux blend) 15 ·
  Sauvignon Blanc 14 · Chenin Blanc 13 · Chardonnay/Pinot Noir (sparkling) 12 · Syrah 10 ·
  Grenache/Tempranillo 9 · Touriga Franca/Nacional 9 · Grenache/Syrah 9 · Palomino 8 · Pinot Gris 8 ·
  Sauvignon Blanc/Sémillon 8 · Sangiovese 7 · Muscat 7 · Gewürztraminer 6 · Nebbiolo 6 · Malbec 6 ·
  Cabernet Franc 6 · Grenache 6 · Albariño 5 · Furmint/Hárslevelű 5 · Corvina 5. A long tail of
  single-appearance varieties fills the rest — but these ~24 carry the bulk of the corpus.

### EK-0076 · Wine role & benchmark-status census (504 wines)
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** `outputs/heuristics/historical_wine_classification.md` (504 wines)
- **claim:** What *job* a wine does in a flight, by count:
  - **benchmark_status:** nonbenchmark (foil) 181 · benchmark_classic 154 · iconic_benchmark 124 · benchmark_regional 45
  - **question_role:** method_reference 307 · maturity_reference 69 · commercial_foil 54 · benchmark_anchor 35 · supporting_reference 25 · sweetness_reference 6 · comparative_peer 4 · curveball_probe 4
  - **commercial_tier:** specialist_premium 238 · commercial 221 · fine_wine 45
  - **maturity_role:** developing 216 · young_primary 126 · mature_tertiary 93 · NV-category 49 · oxidative/natively-aged 13

  Takeaway: the **modal exam wine is a developing, specialist-premium wine chosen as a winemaking/method
  reference** (307 of 504), and ~36% are non-benchmark foils — not icons. Corroborates EK-0030/EK-0031.

### EK-0077 · Family taxonomy — absolute counts and the paper × family grid (112 questions)
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** `outputs/heuristics/question_taxonomy_index.md` (extends EK-0052)
- **claim:** Across the 112-question core corpus: **F1 25 · F2 24 · F3 6 · F4 33 · F5 12 · F6 4 · F7 8**
  (F8 is an analysis-only tag, not generated). **F4 (Mixed-ID Breadth) is the single largest family.**
  Paper × family:
  - **P1:** F1 11 · F2 8 · F3 4 · F4 9 · F5 2 · F7 3
  - **P2:** F1 10 · F2 8 · F3 2 · **F4 15** · F7 2  *(P2 is F4-dominated)*
  - **P3:** F1 4 · F2 8 · F4 9 · **F5 10** · F6 4 · F7 3  *(P3 carries nearly all F5 method + F6 style-mechanism questions)*

  NOTE: a wider 153-question scoring corpus (`wine_selection_logic_by_question_type.md`) reports
  different totals (e.g. F4 = 43) — always state which corpus when quoting family counts.

### EK-0078 · Stem-phrase frequency — how often each framing actually appears
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** `outputs/heuristics/examiner_patterns.md` (stem-phrase appendix; extends EK-0053)
- **claim:** Corpus frequency of the framings the candidate must recognize on sight: variety-ID
  explicitly requested ~35% (39 Qs) · "same single grape variety" ~21% (24) · commercial/market
  sub-question ~26% (29) · "same country" ~17% (19) · "same region" ~15% (17) · "compare and contrast"
  ~12% (13) · "different countries/varieties" ~10% (11+) · explicit pairs 6 · explicit "mixed bag" 2.
  **Vintage is explicitly asked in only ~4–5 questions in 10 years** — do not over-weight vintage ID.

### EK-0079 · Quality & method questions overwhelmingly use winemaking-diverse flights
- **tier:** PLAUSIBLE · **status:** live
- **evidence:** `outputs/heuristics/winemaking_diversity_quality_questions.md` (91 quality/method questions)
- **claim:** Of 91 quality-or-method questions, **82% deliberately mix winemaking approaches** (oak
  regime, MLF, lees, vessel, fermentation temp) and only 9% are homogeneous. By paper: P1 25/30
  high-diversity, P3 33/38, P2 17/23 (P2 is the outlier, with 4 homogeneous flights). A generated
  quality/method question should default to winemaking diversity across the flight, not one technique.

### EK-0080 · Sweet-flight composition metrics (extends EK-0039)
- **tier:** PLAUSIBLE · **status:** live
- **evidence:** `outputs/heuristics/question_wine_composition_analysis.md`
- **claim:** Historical P3 sweet flights average ~**3.8 wines, ~3.3 distinct sweetness-creation
  mechanisms, ~3.6 varieties, ~3.7 countries** — near-maximal spread on mechanism, variety and origin
  at once. Mechanism diversity (botrytis / passerillage / late-harvest / icewine /
  fortification-arrest / oxidative), not origin, is the organizing axis (see EK-0039).

### EK-0081 · Each family activates specific contrast axes (the wine-selection logic)
- **tier:** PLAUSIBLE · **status:** live
- **evidence:** `outputs/heuristics/wine_selection_logic_by_question_type.md` (153 questions × 8
  contrast axes; fit: 113 strong / 23 acceptable / 6 weak / 11 fail)
- **claim:** Wines are chosen so the flight "lights up" the axes its family tests. Mean axis
  activation: **F5** method questions max winemaking (~0.98) and origin (~1.00); **F4** breadth max
  variety (~0.97) and origin (~0.97); **F7** hierarchy is the only family routinely carrying
  luxury-tier wines (~5–10%) while F4 carries almost none (~0–2%). Generation should pick wines that
  make the family's intended contrast *observable from the glass*, not merely thematically related.

### EK-0088 · P3 still-white inclusions are flor/sous-voile, paired with a non-still anchor — not two conventional still whites
- **tier:** PLAUSIBLE · **status:** live
- **evidence:** ledger: attempt #145 / analysis #25 (accept); outputs/heuristics/examiner_patterns.md §4.1
- **claim:** Paper 3 is built around non-still styles (sparkling, fortified, sweet, rosé) plus oxidative/biologically-aged styles. Still oxidative whites DO appear on P3, but always as a flor/sous-voile style (Jura Savagnin/Chardonnay, e.g. 2015 P3 Q1, 2019 P3 Q4, 2024 P3 Q2) paired against a fortified or sparkling anchor. The corpus has NO P3 question pairing two conventionally-oxidative, non-flor still white wines. Conventionally-oxidative white Rioja (López de Heredia, Murrieta) is corpus-attested as a Paper 1 wine (2018 P1 breadth, 2025 P1 three-countries), not P3. A two-still-white oxidative pairing belongs on P1; it is only P3-appropriate if at least one wine is non-still (e.g. a Sherry or sparkling anchor).

### EK-0125 · Two-country sparkling pairs are often both traditional-method (no method fork required)
- **tier:** PLAUSIBLE · **status:** live
- **evidence:** ledger: attempt #130 / analysis #18 (reject); corpus: 2024 P3 Q1 (Schramsberg vs Cava Avinyó); 2019 P3 Q1 (two Champagnes)
- **claim:** A two-wine sparkling pair from different countries does NOT require a production-method contrast. The corpus repeatedly pairs two traditional-method sparklers (2024 P3 Q1 Schramsberg/Cava; 2019 P3 Q1 two Champagnes) and asks candidates to IDENTIFY the method of each and explain its style influence, plus discriminate quality/commercial — not to fork tank vs traditional. Crémant is almost exclusively traditional method (lower lees ageing than Champagne, ~9 vs ~18 months), so a Crémant + English-sparkling pair is a legitimate same-method, different-tier question. If a deliberate method fork is wanted, Prosecco or German Sekt provides it; but the absence of a fork is not a defect.

### EK-0128 · Pure quality-ladder questions are 3–4 wines single-country; a 6-wine two-country mega-hierarchy is unattested
- **tier:** PLAUSIBLE · **status:** live
- **evidence:** ledger: attempt #135 / analysis #19 (partial); corpus: 2015 P2 Q3 (two sub-region 4-wine split, closest precedent)
- **claim:** Historical quality-ladder (F7) questions are 3–4-wine single-country ladders (a Rioja Crianza/Reserva/Gran Reserva trio; a Burgundy Bourgogne→village→1er/Grand Cru ladder). Each half is well attested individually, but a SINGLE 6-wine, two-country, pure-hierarchy question consuming half a paper is not attested in the corpus — the closest precedent (2015 P2 Q3) is a 4-wine two-sub-region split, not a 6-wine two-country quality ladder. Prefer splitting a two-country ladder into two separate single-country questions; treat the 6-wine fused hierarchy as out-of-distribution.

### EK-0130 · Prosecco is the textbook tank-method contrast; Valdobbiadene/Cartizze are still Charmat, not traditional method
- **tier:** PLAUSIBLE · **status:** live
- **evidence:** ledger: attempt #175 / analysis #29 (partial); corpus: Costadilà Col Fondo (sui lieviti, niche, undisgorged)
- **claim:** Prosecco — including premium Valdobbiadene Superiore DOCG and Cartizze — is predominantly TANK (Charmat) method and is the standard contrast TO traditional method. The bottle-fermented exception is Col Fondo / 'sui lieviti' (ancestral, undisgorged), which is niche and is NOT the classic traditional (disgorged + dosage) method either. So a grader stating 'Prosecco is generally not traditional method' is correct; a candidate offering Prosecco as a traditional-method alternative is mistaken.

### EK-0131 · Alsace Sylvaner is a curveball, not a banker; only Pinot Gris/Riesling/Gewürztraminer/Muscat are noble bankers
- **tier:** PLAUSIBLE · **status:** live
- **evidence:** ledger: attempt #188 / analysis #32 (accept)
- **claim:** In an Alsace same-region different-variety pair, Pinot Gris is a legitimate banker (one of the four noble grapes), but Sylvaner is NOT — it is not a noble Alsace variety and functions as the curveball, not the anchor. A valid banker-vs-curveball pairing must classify Sylvaner (and similar lesser Alsace grapes like Pinot Blanc/Auxerrois) as the harder wine; feedback/model-answer prose that labels Sylvaner a banker is a calibration error. The noble bankers of Alsace are Riesling, Pinot Gris, Gewürztraminer and Muscat (cf. EK-0029 — a banker must be a wine the candidate is expected to know cold).

### EK-0132 · Sous-voile/flor Jura whites can appear on P1 in a winemaking-diversity still-white flight
- **tier:** PLAUSIBLE · **status:** live
- **evidence:** ledger: attempt #178 / analysis #30 (reject)
- **claim:** A sous-voile / flor-aged Jura white (e.g. Montbourgeau L'Étoile Savagnin) is NOT exclusively a Paper 3 wine. Placement follows the question's organising logic: when the stem is built around production-METHOD comparison (flor vs non-flor, biological vs physical ageing) the wine goes to P3 (2015 P3 Q3 Pinte Savagnin sous voile + Manzanilla; 2019 P3 Q4 Montbourgeau L'Étoile + Manzanilla); but when it appears as one wine in a winemaking-diversity flight of dry STILL whites (alongside reductive Chablis, barrel/MLF Chardonnay, oxidatively-aged white Rioja), it is legitimately P1. Oxidatively-aged white Rioja is the analogous P1-attested case (2013/2018/2025 P1). Refines EK-0088, which only addressed P3 still-white inclusions.

### EK-0140 · "Same New-World country" red flights draw from the big four (NZ / Australia / Chile / South Africa)
- **tier:** PLAUSIBLE · **status:** live
- **evidence:** 2013 Practical P2 Q2 ("The first key to passing Paper 2 was to pick for Question 2 a New
  World country with a range of appropriate options. **Those who went outside New Zealand, Chile,
  Australia or South Africa inevitably ended up squeezing their tasting notes to try to fit their answer**
  and, therefore, gaining few points") — `docs/examiners reports/extracted_txt/2013-Examiners-Report.txt`.
  n=1 report, but stated as the paper's decisive fork; consistent with the corpus's NW selections (USA the
  obvious fifth — 2013's phrasing reflects that year's wines, not a USA exclusion).
- **claim:** When a stem groups several reds under "the same New World country [with a range of styles]",
  the realistic candidate set is the big producers — **New Zealand, Australia, Chile, South Africa, plus
  the USA** — because only they field enough distinct varietal/style range to fill a flight. Answering
  outside that set forces note-squeezing (a shoehorning tell, EK-0009). Master trees (P2 Layer A) and the
  question engine should treat "same NW country" stems as routing to this set; graders should treat an
  exotic-country call on such a stem as low-plausibility (EK-0090).

### EK-0162 · P2 bankers are classified classics; famous-but-idiosyncratic wines are curveballs, not anchors
- **tier:** PLAUSIBLE · **status:** live
- **evidence:** ledger: attempt #419 / analysis #66 (accept); EK-0029; EK-0031; EK-0032
- **claim:** The EK-0029 banker requirement bites hardest on Paper 2: a 4-wine red flight consuming a third of the paper needs at least one wine the candidate is expected to know cold — a Bordeaux classed growth, Barolo, 1er cru Burgundy, or Rioja Gran Reserva. Fame is not anchor status: Château Musar (Bekaa), Domaine de Trévallon (Alpilles IGP) and a premium Barossa Cabernet-Shiraz blend are idiosyncratic or non-standard and function as curveballs, and a standard Mendoza Malbec (corpus-legitimate, EK-0032) is an ordinary wine rather than a banker. A generated flight of two curveballs plus mid-tier regional wines with no classified anchor is implausible and must be redrawn.

### EK-0164 · Zero-precedent origins debut with identification SUPPRESSED, never as a same-origin flight premise
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** ledger: attempt #428 / analysis #68 (accept); corpus `data/exams.json` — 2019 P1 Q3 (Iago Chinuri, Kartli Georgia: "Do not spend time thinking about the wine's specific origin"); 2017 P3 Q2 (Cullen 'Amber', "consider wine 4 to be of unknown origin"); EK-0104; EK-0048
- **claim:** New origins do enter the exam (Georgia 2019, Uruguay, Greece), but the IMW introduces them as a **single wine with the identification marks taken off the table** — origin explicitly suppressed or unasked, marks paid for winemaking / style / quality / commercial. Slovenia and the wider Brda–Collio amber belt (Ribolla Gialla / Rebula, Friulano) have **zero appearances across 2011–2025**. An origin with no corpus precedent must therefore never be the *premise* of a same-origin (F2) flight, and never supply every wine in a flight: with no banker (EK-0029) the candidate has nothing to anchor against, and the question is unanswerable rather than merely hard.

### EK-0169 · Cross-country same-variety flights carry an Old World anchor — an all-New-World Chardonnay trio is unattested
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** ledger: attempt #440 / analysis #76 (accept); corpus `data/exams.json` — 2011 P1 Q2 (Chablis 1er Cru Les Vaillons), 2018 P1 Q1 (Chablis Grand Cru Les Preuses), 2025 P1 Q2 (Chablis 1er Cru Côte de Lechet), 2026 P1 Q1 (Meursault Les Narvaux + Chablis); EK-0029; EK-0034
- **claim:** Every multi-country "same single grape variety" Chardonnay flight in 2011–2026 carries a Burgundian anchor (Chablis 1er/Grand Cru, Meursault), and the same holds for the other big P1 varieties (2014 Riesling → Alsace Grand Cru/Pfalz; 2015 and 2021 Chenin → Loire). All-New-World same-variety sets occur only when the stem itself makes origin the constraint (2016 P1 Q2 "same country", two Californian Chardonnays) or as a pair inside a larger question whose other pair supplies the Old World reference (2023 P1 Q1 Semillon). A three-wine, three-country Chardonnay flight with no Old World wine has no precedent and must not be generated: it also fails EK-0029, since no New World bottling in such a set functions as a banker the candidate knows cold.

### EK-0170 · P1 same-country white flights need a banker too — Canary Islands Listán Blanco is a curveball, not an anchor
- **tier:** PLAUSIBLE · **status:** live
- **evidence:** ledger: attempt #450 / analysis #86 (accept); EK-0029; EK-0097; EK-0162
- **claim:** The banker requirement (EK-0029) bites on Paper 1 exactly as it does on Paper 2 (EK-0162): a three-wine same-country white flight must leave the candidate one wine they know cold. In a Spanish white trio, Rías Baixas Albariño is the banker and Rueda Verdejo is workable, but Ycoden-Daute-Isora Listán Blanco (Canary Islands) is a high curveball — an outer-edge origin/variety a candidate cannot reasonably funnel to from the glass. Two curveballs against one anchor inverts the corpus shape, where the modal three-wine flight carries exactly one harder wine (EK-0097); such a flight must be redrawn or re-tariffed.

### EK-0174 · A country-ID stem needs an unlocking anchor — all-cult USA white trios don't provide one
- **tier:** PLAUSIBLE · **status:** live
- **evidence:** ledger: attempt #455 / analysis #94 (accept); corpus `data/exams.json` — 2014 P1 Q1 (four Australian whites anchored by Hunter Semillon)
- **claim:** When the stem pays marks for identifying the **country**, at least one wine must reliably unlock that country for a prepared candidate; the country call is meant to be reachable from the aggregate flight evidence, and the anchor is what makes the aggregation tractable (2014 P1 Q1's Hunter Semillon does this job for an otherwise diverse Australian flight). A three-wine USA same-country trio of Au Bon Climat 'Hildegard' (a Pinot Gris/Pinot Blanc/Aligoté blend), Calera Mount Harlan Viognier (cult single-winery AVA) and a Willamette Reserve Pinot Gris is three curveballs with no banker — none of them is a wine the candidate knows cold, so the country ask is a guess rather than a deduction. Extends EK-0029/EK-0170 to the country-identification ask specifically: recognisable New World anchors (e.g. Napa/Sonoma Chardonnay, Marlborough Sauvignon Blanc) must carry the flight.

---

## §5 · Question generation rules

> The hard validity contract lives in `study-app/src/lib/question-validator.ts`. A "hard" violation
> means the stem contradicts its own wines/key — the question is unanswerable and must not be served.

### EK-0040 · Hard validator rules (the served-question contract)
- **tier:** PROCESS · **status:** live
- **evidence:** `study-app/src/lib/question-validator.ts`; `question_quality_remediation_plan.md` Phase A
- **claim:** Every served question must pass:
  - **R1 country-diversity (hard):** "N different countries" ⇒ ≥N distinct keyed countries; bare
    "different countries" ⇒ one per wine.
  - **R2 same-variety (hard):** "same (single) grape variety" ⇒ one dominant variety across the flight
    (synonym-canonicalized: Shiraz=Syrah, Spätburgunder=Pinot Noir, Garnacha=Grenache, etc.).
  - **R3 distinct-variety (hard):** "different grape varieties" ⇒ every dominant variety distinct.
  - **R4 same-country (hard):** "same country" ⇒ one country.
  - **R5 single-variety-blend (soft):** "single grape variety" + a blend wine — flagged, not
    disqualifying (legit co-ferments like Côte-Rôtie Syrah-Viognier; "predominantly" permits blends).
  - **R6 marks (soft):** total marks must equal 25 × wine count.
  - **R11 sweetness-out-of-paper (hard, P1/P2 only):** the stem must not declare residual sugar as a
    flight premise, mark how it was achieved, or ask the candidate to state it — those are Paper 3
    devices (see EK-0166). A soft variant flags a broader part that merely name-checks RS.
  - Subset/pair stems ("Wines 1 and 2… the other two…") skip flight-wide checks to avoid false positives.

### EK-0041 · 25-marks-per-wine is a hard generation constraint
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** ledger: attempt #96 (accept), attempt #138 / analysis #21 (accept; fix deployed `19bc026`);
  `study-app/src/lib/question-validator.ts` (R6, hard); `study-app/src/app/api/get-question/route.ts`
  (`validateMarkAllocation`, exact); see EK-0001
- **claim:** Generation must allocate **exactly** 25 marks per wine. A 2-wine/70-mark question (35/wine)
  is invalid and would never occur on the modern real exam. **Now enforced as a HARD rule in two
  places:** the generation-time `validateMarkAllocation` (exact total, no tolerance) which gates the
  retry loop, and the shared `question-validator.ts` R6 (promoted **soft → hard**, 2026-05-30) which the
  corpus audit uses to quarantine offenders from every serve path. This matters because the rule is easy
  for an LLM to break despite an explicit prompt instruction ("25 MARKS PER WINE (ABSOLUTE)"): a user
  flagged a served 120-mark / 4-wine question (30/wine, `gen_p1_F4_1779993300191`), and the follow-up
  audit found **36 of 66 generated questions (55%) had violated 25/wine** — a systemic generation gap,
  since closed (30 quarantined). Confirms EK-0064: a prompt instruction is not an enforced gate.

### EK-0042 · MW country claims are 100% truthful — enforce country diversity
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** ledger: attempt #49 (accept), #121 (accept, deployed @8c93784) — "MW corpus is 100% truthful with country claims across 10 years"
- **claim:** When a stem promises N different countries, the wines must genuinely be N different
  countries. Demonstrated failures: a "four different countries" Pinot Noir flight with two USA wines
  (Australia/Oregon/California/France); two French wines (Vouvray + Anjou) in a "different countries"
  flight. Country diversity is now serve-time enforced.

### EK-0043 · Variety claims must hold per wine (name-label cross-check)
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** ledger: attempt #63 (accept), #61 (accept) — name-label cross-check + umlaut-aware regex
- **claim:** In a same-variety flight, every wine must actually be that variety. Demonstrated failures:
  a Syrah flight containing **Blaufränkisch** (Ulrich Langguth, Mittelburgenland); an all-Pinot-Gris
  flight containing **Terre Alte Bianco** (a blend). The generator must scan wine **names** for grape
  terms that contradict the flight variety (umlaut-aware, e.g. "Blaufränkisch"), and apply its own
  self-corrections to the final output (the model often catches the error in reasoning but ships the
  wrong wine anyway).

### EK-0044 · "Each a different single variety" requires per-wine single-variety wines
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** ledger: attempt #55 (accept) — Tawny Port is a multi-variety Douro blend
- **claim:** A stem saying "each made predominantly from a different, single grape variety" requires
  every wine to BE single-variety. **Tawny Port (and Port generally) is a multi-variety blend** and
  cannot satisfy a single-variety slot. The variety-consistency validator must also cover the
  "each a different single variety" framing, not just "all the same single variety."

### EK-0045 · Blend + varietal of the same grape in a "different varieties" flight is confusing/invalid
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** ledger: attempt #36 (accept) — blend-aware diversity guardrail
- **claim:** A "different varieties" flight must not contain both a varietal wine and a blend dominated
  by the same grape (e.g. a Sauvignon Blanc + a SB-dominant blend) — the dominant varieties overlap and
  the flight's premise collapses. Dedup must be blend-aware.

### EK-0046 · No sparkling in P1; never two sparkling — and P1/P2 exclude sparkling/fortified
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** ledger: attempt #47 (accept) — "added sparkling/fortified validator to P1 and P2 scope checks"
- **claim:** Paper 1 (white still) almost never contains sparkling and **never** two sparkling wines;
  Paper 2 (red still) likewise excludes sparkling/fortified. The generation prompt said this but it
  was not enforced — it is now a validator scope check. (An occasional off-dry wine in P1 is fine,
  especially a Riesling flight; see EK-0048.)
- **superseded in the app by EK-0157 (2026-08-07):** the *observation* here still stands, but "almost
  never" is not a specification a generator can follow, and the app now blocks sparkling on Paper 1
  **entirely**. Do not reintroduce an "at most one" allowance without reading EK-0157 first.

### EK-0047 · RS language in a stem must match genuinely sweet wines
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** ledger: attempt #89 (accept) — Savennières is bone dry (~5 g/L)
- **claim:** Only use residual-sugar framing ("both wines have residual sugar," "how is the sweetness
  achieved") when the wines are genuinely sweet. A bone-dry wine (Savennières) with trace RS must not
  be described as "having residual sugar." Comparing sweetness *levels* across a dry + sweet pair is
  valid; asking "how the sweetness is achieved" of a dry wine is not. (Real RS questions: 2024 P3 Q4,
  2019 P3 Q5 — all wines genuinely sweet.) This entry also re-confirms variety consistency: the same
  question wrongly claimed two different varieties while both were Chenin Blanc.

### EK-0048 · Match the historical flight-size distribution; don't over-index on 4-wine flights
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** ledger: attempt #73 (accept) — flight-size distribution constraints; corpus scan of
  `data/exams.json` (153 questions) for single-wine cases; attempt #185 (auto-accept) — a single-wine
  P1 banker question (Meursault 1er Cru Perrières) that the corpus does not support
- **claim:** Generation was over-producing 4-wine flights. The real exam uses pairs and 3-wine flights
  frequently, and sometimes a 4-wine flight presented as **two pairs** (often to compare quality and/or
  winemaking, e.g. 1er Cru Burgundy vs Bourgogne, or Vin Jaune vs Savagnin). Sample flight size from the
  historical distribution rather than defaulting to four. **Single-wine questions are vanishingly rare
  and NOT a general option:** there is exactly **one** in the 10-year corpus — **2017 Paper 3 Q2**
  (Cullen "Amber" orange wine, stem "consider wine 4 to be of unknown origin", 15 marks winemaking /
  10 marks style+quality+market). It is Paper 3 only, an off-piste **curveball with origin explicitly
  suppressed** and ID downweighted. There is **no single-wine question on Paper 1 or Paper 2** anywhere
  in the corpus, so a lone banker classic (e.g. a 1er Cru Meursault) on P1/P2 is unsupported — never
  generate one. Enforced in `validateFlightSize` (`question-engine.ts`): `wineCount === 1` is a
  violation unless `paper === 3`.

### EK-0049 · Style sub-questions must be generated (they're near-universal)
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** ledger: attempt #73 (accept); see EK-0020
- **claim:** The generator must include "style" sub-questions (standalone or bundled), because style
  appears on essentially every modern paper. Their absence was a generation gap.

### EK-0050 · Paper 3 questions need visual appearance cues
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** ledger: attempt #53 (accept) — Wine Appearance section added to P3 generation + UI + eval
- **claim:** In the real exam, candidates **see** the wines before smelling. For P3 especially,
  colour/bubbles/viscosity are critical pre-smell signals (sparkling vs fortified vs sweet vs rosé).
  P3 questions must include visual descriptors (need not be precise — "these four wines are all pink,"
  "both red and white," "amber/brown") or the stem analysis is unfairly hard and often goes off-base.

### EK-0051 · Generated answers must be novel across recent questions in a category
- **tier:** PROCESS · **status:** live
- **evidence:** ledger: attempt #95 (accept) — novelty check expanded beyond the single most-recent question
- **claim:** The model-answer/question novelty check must compare against the **last 3–5 served
  questions** in a category, not just the single most recent one, or users get near-duplicate answers
  on consecutive questions.

### EK-0052 · Family taxonomy (F1–F8) — the strategic unit of a question
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** `outputs/heuristics/question_taxonomy.md`
- **claim:** Every question maps to one core family: **F1** Same Variety Comparative · **F2** Same
  Origin Comparative · **F3** Blend/Composition Logic · **F4** Mixed Identification Breadth · **F5**
  Method/Production Dominant · **F6** Style Mechanism Comparative · **F7** Hierarchy/Quality
  Calibration · **F8** Examiner Curveball/Boundary. Classify from the **stem** first (not realized wine
  identity); pick the dominant comparative logic; don't overuse F8. Corpus prevalence: F4 ~29%, F1
  ~22%, F2 ~21% are the largest. (The generation pipeline uses F1–F7; F8 is an analysis tag.)

### EK-0053 · Stem-phrasing → variety/region signal map
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** `outputs/heuristics/examiner_patterns.md` §1.1–1.11
- **claim:** Key stem signals: "same single grape variety" + 3–4 whites ⇒ Chardonnay/Riesling; same
  phrase + 3+ reds across countries ⇒ Syrah/Shiraz or Pinot Noir; "same country" (unnamed) ⇒ France
  most likely; "different countries, different varieties" ⇒ hardest breadth type (expect a curveball);
  "varieties closely associated with their origin" ⇒ indigenous/signature grapes; "classic European"
  ⇒ major FR/IT/ES appellations, mid-to-high quality; "from the Americas" ⇒ signature New World reds;
  "Europe but not France/Italy/Spain" ⇒ curveball (Germany/Austria/Portugal/Hungary/Greece); "do not
  spend time on origin" ⇒ deliberate stylistic outlier (orange/qvevri/oxidative).

### EK-0074 · Sensory cues in a model answer must match the keyed wine's identity
- **tier:** PLAUSIBLE · **status:** live
- **evidence:** ledger: attempt #129 / analysis #16 (partial)
- **claim:** Generated tasting/answer notes must be consistent with the wine's actual identity. Two demonstrated failures: an Australian Shiraz (Wine 2) was described with savoury 'olive' notes and the answer used olive as a distinction pushing toward the Northern Rhône over Australia — yet the wine was Australian; and Carménère (Wine 1) was given only a 'slight herbal character' when the variety's hallmark is a strong, overt green/pyrazine character. Match the intensity and direction of varietal markers to the keyed grape.

### EK-0110 · Integrated multi-factor synthesis — a recurring novel-question family (the anti-rote device)
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** corpus `data/exams.json` — 2022 P2 Q1 (blend / "reasons for NOT blending", "an
  unconventional question"), 2024 P2 Q3c (climate→style→quality, "not a question format seen in previous
  exams… the worst answered question on the paper"), 2025 P1 Q4 (human inputs vs nature, ~15% of marks,
  "a form of question that had not been used before"); 2024 Chief anti-rote intent;
  `outputs/research/evidence_audit.md` T1-3 / Audit C
- **claim:** The examiners regularly set a **novel synthesis question** asking the candidate to
  **apportion a wine's character among climate / winemaking / terroir**, argue **why/why-not blend**, or
  weigh **human inputs vs nature** — their deliberate **anti-rote device** (EK-0004, EK-0113). Generation
  should carry this as **one archetype among many** (prepare the *method*, not a script) and model answers
  should be ready to reason it. **Guardrails (do NOT over-claim):** it is **not** "the fastest-rising /
  dominant objective" (n=3, differently framed, partly double-counting climate EK-0105); it is
  **additive, never a replacement for the ~40% ID core**; **falsification test:** two consecutive absent
  years downgrades it.

### EK-0129 · Three-tier blend stem phrasing signals how to treat the blend
- **tier:** PLAUSIBLE · **status:** live
- **evidence:** ledger: attempt #151 / analysis #27 (reject); corpus: 2011 P2 Q4 ("variety/ies"); 2012 P2 Q3 ("predominant"); 2018 P2 Q2 ("single grape variety")
- **claim:** The MW's choice of variety-words in a red stem is a deliberate diagnostic signal with three tiers: (1) 'grape variety' (singular) ⇒ all wines are single-varietal; (2) 'predominant grape variety' ⇒ a slight blend driven by varietal character (Rioja, Côte-Rôtie with ~5% Viognier) — minor addition addressing a niche aspect; (3) 'grape variety or varieties' / 'varieties' ⇒ at least one wine is DEFINED by its blend character (Bordeaux, GSM, Cab/Shiraz). Generation must match phrasing to the wines (a four-genuine-blend flight legitimately uses 'variety or varieties'), and graders/answers should read the phrasing as telling the candidate how to weigh blend vs varietal character. Refines EK-0053 and EK-0040 R5/EK-0071.

### EK-0135 · Tasting notes must carry alcohol/structural cues, not just aroma and flavour
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** ledger: attempt #246 / analysis #42 (accept); examiner_report_synthesis §2.7 (2025: "hard evidence like alcohol and sugar are often more reliable than the flavour profile"); see EK-0013
- **claim:** In the real room the candidate perceives alcohol (warmth, weight, glycerol) directly and is expected to lead with it — alcohol read against acidity is a primary climate/origin marker, and examiners model it explicitly (2017: "where in the northern Rhône is going to produce a wine with the high alcohol and breadth of wine 8?"). On paper that evidence can only reach the candidate through the written note, so every generated tasting note must convey a perceptible alcohol/warmth/body signal alongside acidity, tannin and RS. A note that describes only aroma and flavour removes the most diagnostic axis and makes the model answer argue from evidence the candidate was never given (this flight's model answer reasoned from "13% alcohol" / "14% alcohol" cues absent from the study notes).

### EK-0165 · Mark allocation must track ID reachability — no heavy ID tariff on an unreachable origin
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** ledger: attempt #428 / analysis #68 (accept); EK-0153; EK-0016; EK-0104
- **claim:** A generated flight must not price identification highly when identification is effectively unreachable. The rejected question put **20 of 50 marks (40%) on region + variety ID** for two Slovenian Brda wines from an origin with no corpus precedent — the opposite of the real exam's behaviour, which downweights or removes ID marks on curveball/unprecedented wines and redistributes them to style, winemaking, quality and commercial (EK-0016, EK-0104). This upgrades EK-0153 from prompt-only guidance to a generation constraint for the specific case of an all-curveball or zero-precedent flight: cap ID at ~5–6 marks per wine, or omit the variety/origin ask entirely.

### EK-0171 · ID-reachability tariff rule extends to low-precedent (not just zero-precedent) origins
- **tier:** PLAUSIBLE · **status:** live
- **evidence:** ledger: attempt #450 / analysis #86 (accept); EK-0165; EK-0153; EK-0016
- **claim:** EK-0165's constraint — do not price identification highly when identification is unreachable — is not limited to origins with zero corpus precedent. A same-country flight pricing origin+variety at 15 of 25 marks per wine (60%) is out of calibration when one wine is a fringe-DO curveball such as a Canary Islands Listán Blanco: the real exam downweights ID on such wines and pays instead for method of production, style, quality and commercial positioning (EK-0016, EK-0153). Generation should cap ID at ~5–6 marks for the curveball wine, or ask origin only, and move the freed marks to the analytical parts.

### EK-0172 · Scope headers must match the ask — "with reference to both wines" signals a SHARED attribute
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** ledger: attempt #458 / analysis #97 (accept); EK-0147 (scope notation `For each wine:` vs `For both wines:` is how the IMW tariffs marks)
- **claim:** The IMW's scope header is a diagnostic instruction, not decoration. "With reference to both wines / all four wines" tells the candidate to argue the wines together toward a **shared** attribute (one variety common to the flight, one region), whereas differing per-wine answers are scoped "For each wine:". A generated stem that declares "different regions, each made from a different, single grape variety" and then asks "with reference to both wines: identify the grape variety of each wine" mixes the two and reads as un-MW: the header promises an integrated shared answer while the ask demands two separate ones. Generation must pair a per-wine identification ask with a per-wine scope header (and the corresponding `2 x N marks` tariff form).

### EK-0173 · A two-wine same-country pair legitimately carries ~26–30 marks of variety+origin ID
- **tier:** PLAUSIBLE · **status:** live
- **evidence:** ledger: attempt #458 / analysis #97 (accept); corpus `data/exams.json` — 2013 P1 Q1/Q2 (same country, different regions/varieties: 15 marks per wine for origin-as-closely-as-possible + variety, i.e. 30 of 50); 2016 P1 Q4 (Spain, 10+10 origin); EK-0165; EK-0171
- **claim:** Heavy identification tariffs on a two-wine flight are corpus-authentic when the wines are reachable: 26 of 50 marks (10 variety + 16 origin) sits inside the attested band, and 2013 P1 Q1/Q2 pays 30 of 50 for the same shape. The ID-reachability constraint (EK-0165/EK-0171) bites on *unreachable* wines — zero- or low-precedent origins and fringe curveballs — not on a same-country pair of recognisable varieties (e.g. Stellenbosch Sauvignon Blanc + Cederberg Chenin Blanc). Do not down-tariff identification merely because it is a large share of a small flight.

---

## §6 · Question-generation learnings from feedback (the living ledger)

This section is the audit trail of every resolved feedback item and what it taught us. New rows are
appended by the incremental sync when feedback resolves. Durable rules derived here are also written
into §2–§5 / §7 (cross-referenced by EK id). Maps to Neon `user_attempts` / `feedback_analyses`.

| attempt | analysis | paper/family | verdict | decided | what it taught | EK refs |
|---|---|---|---|---|---|---|
| 138 | 21 | P1/F4 | accept (deployed `19bc026`) | manual | served Q had 120 marks/4 wines (30/wine); 25/wine is a hard modern-exam rule; audit found 55% of generated Qs violated it → R6 promoted soft→hard. (Analysis recommended accept but was erroneously auto-rejected — fix applied manually.) | EK-0001, EK-0041 |
| 121 | 15 | P2/F1 | accept (deployed `8c93784`) | auto | "4 different countries" but 2 are US | EK-0042 |
| 120 | 13 | P1/F6 | accept (deployed `0d85294`) | auto | stem said same-country same-grape; was same-country different-grape | EK-0043, EK-0040 |
| 98 | 8 | P3/F3 | accept | manual | same-variety stem but Madeira≠Palomino; implausible pair+lone structure | EK-0043, EK-0054 |
| 96 | — | P1/F6 | accept | manual | 25 marks/wine non-negotiable (70 for 2 wines impossible) | EK-0001, EK-0041 |
| 95 | 7 | P2/F6 | accept | manual | duplicate model answer across consecutive questions | EK-0051 |
| 92 | 6 | P2/F4 | accept | manual | F4 grab-bag wines too high-quality; icons belong in F1/F2/F7 | EK-0030 |
| 89 | 5 | P1/F6 | accept | manual | "both wines have RS" but Savennières is dry; also both Chenin in a "different varieties" stem | EK-0047 |
| 79 | — | P2/F2 | accept | manual | grading depth must scale with marks (Cardinal Rule 8) | EK-0017 |
| 73 | — | P1/F3 | accept | manual | over-indexed on 4-wine flights; 2-mark commercial impossible; style missing; weight recent years | EK-0048, EK-0018, EK-0019, EK-0020, EK-0049, EK-0004 |
| 71 | — | P1/F2 | accept | manual | 4-wine flights need ≥1 banker classic; 2 curveballs + non-rated wine implausible | EK-0029 |
| 66 | — | P2/F1 | accept | manual | Syrah flight sensory realism (deep colour, black not white pepper, gamey/meaty notes) | EK-0055 |
| 65 | 4 | P2/F2 | reject | manual | candidate said Bierzo/Mencía implausible — corpus-overruled (mid-tier producers used) | EK-0031 |
| 64 | 3 | P2/F4 | reject | manual | "no Mendoza Malbec" — corpus-overruled (recurs 2013/19/22/23) | EK-0032 |
| 63 | 2 | P2/F1 | accept | manual | Syrah flight contained Blaufränkisch (name-label cross-check) | EK-0043 |
| 62 | 1 | P3/F6 | reject | manual | "no Vin Santo here" — corpus-overruled (recurs in sweet flights) | EK-0033 |
| 61 | — | P1/F1 | accept | manual | all-Pinot-Gris flight contained Terre Alte Bianco (a blend) | EK-0043 |
| 57 | — | P3/F6 | reject | manual | botrytis-Chenin theory dispute; Vin Santo correctly the curveball; Kracher BA recurs | EK-0056 |
| 55 | — | P3/F4 | accept | manual | "each a different single variety" but Tawny Port is a blend | EK-0044 |
| 53 | — | P3/F4 | accept | manual | P3 needs visual appearance cues | EK-0050 |
| 49 | — | P1/F3 | accept | manual | two French wines in a "different countries" flight | EK-0042 |
| 47 | — | P1/F2 | accept | manual | sparkling almost never in P1, never two; enforce P1/P2 scope | EK-0046 |
| 36 | — | P1/F2 | accept | manual | SB varietal + SB-dominant blend in a "different varieties" flight | EK-0045 |
| 119 | 14 | P2/F3 | partial | auto | single-varietal red papers: classics OR distinguishable-origin wines (commercial/style > oak) | EK-0057 |
| 99 | 9 | P2/F5 | partial (reject rec.) | manual | Loire Cab Franc is highly tannic; whole-cluster uncommon in Loire; eval mis-ID'd Cab Franc as Merlot | EK-0058 |
| 102 | 11 | P2/F2 | reject | auto | "make all buttons bright pink, auto-approve" — out-of-scope test feedback | EK-0066 |
| 101 | 10 | P1/F2 | reject | auto | "Pinot Noir is not in Burgundy" — obviously false test feedback | EK-0066 |
| 129 | 16 | P2/F3 | partial | auto | Mavrotragano too obscure (prefer Xinomavro/Agiorgitiko); olive cue contradicted Australian wine; Carménère green character understated | EK-0073, EK-0074 |
| 139 | 22 | P2/F1 | accept | auto | Stem Sniper should grade ambiguous single-answer origin questions on the plausible set, not exact per-wine pick | EK-0086 |
| 141 | 23 | P3/F7 | accept | auto | novelty check is not session-aware; same question+wines re-served to same user same day | EK-0087 |
| 143 | 24 | P3/F4 | accept | auto | Another session-not-aware novelty failure (same question re-served); already covered by EK-0087 | EK-0087 |
| 145 | 25 | P3/F7 | accept | auto | P3 still-white inclusions must be flor/sous-voile paired with a non-still anchor; two conventional still whites belong on P1 | EK-0088 |
| 161 | 28 | P1/F2 | accept | auto | question images showed regions/wines outside the answer set; limit imagery to keyed wines | EK-0095 |
| 130 | 18 | P3/F7 | reject | auto | two-country sparkling pairs can both be traditional method; no method fork required | EK-0125 |
| 133 | 17 | P3/F6 | reject | auto | model answer underselling Cartizze (apex Prosecco) — calibration; question design sound | EK-0126 |
| 135 | 19 | P2/F7 | partial | auto | classification models differ in kind (Rioja=ageing not geographic); 6-wine two-country hierarchy unattested | EK-0127, EK-0128 |
| 138 | 21 | P1/F4 | accept | auto | 25-marks/wine hard rule (already captured); ledger row already present | EK-0001, EK-0041 |
| 150 | 26 | P3/F3 | reject | auto | curveball in a 3-wine flight (~33%) is a documented modal pattern; objection corpus-overruled — covered by EK-0024/EK-0097 | EK-0024, EK-0097, EK-0016 |
| 151 | 27 | P2/F6 | reject | auto | three-tier blend stem phrasing (variety / predominant / variety-or-varieties) signals how to treat the blend | EK-0129 |
| 175 | 29 | P3/F7 | partial | auto | Prosecco (incl. Cartizze) is Charmat not traditional method; dictation-truncation complaint relates to capture not grading (EK-0070) | EK-0130, EK-0070 |
| 188 | 32 | P1/F2 | accept | auto | Alsace Sylvaner is a curveball not a banker; only the four noble grapes anchor | EK-0131 |
| 178 | 30 | P1/F6 | reject | auto | sous-voile Jura whites belong on P1 in a winemaking-diversity flight, not exclusively P3 | EK-0132 |
| 185 | 31 | P1/F5 | accept | auto | single-wine P1 banker (Meursault 1er Cru) is unsupported and was quarantined — already covered | EK-0048 |
| 189 | 33 | P1/F3 | reject | auto | UX: wine list not visible while writing answers; no tasting context | EK-0133 |
| 190 | 34 | P1/F6 | reject | auto | UX: repeated feedback clicks overwrite instead of appending discrete records | EK-0134 |
| 206 | 35 | P1/F5 | reject | auto | four-country/four-different-variety P1 breadth is the most common (F4) format — corpus-overruled; already covered | EK-0052, EK-0077, EK-0044 |
| 246 | 42 | P2/F4 | accept | auto | generated tasting notes omitted alcohol/structural cues that the model answer then reasoned from; notes must carry perceptible alcohol/body alongside acidity/tannin/RS | EK-0135, EK-0013 |
| 419 | 66 | P2/F6 | accept | manual | 4-wine P2 flight had two curveballs and no banker classic; famous-but-idiosyncratic wines (Musar, Trévallon) don't count as anchors | EK-0162, EK-0029 |
| 428 | 68 | P1/F2 | accept | manual | zero-precedent origins (Slovenia/Brda) debut only as single ID-suppressed wines, never as a same-origin pair with 40% of marks on identification | EK-0164, EK-0165, EK-0029, EK-0153 |
| 440 | 76 | P1/F1 | accept | auto | cross-country same-variety white flights need an Old World (Burgundy/Loire/Alsace) anchor; all-NW Chardonnay trio unattested | EK-0169, EK-0029, EK-0034 |
| 450 | 86 | P1/F2 | accept | auto | three-wine same-country P1 flight with two curveballs and no anchor; 15/25 marks on ID for a Canary Islands Listán Blanco is mis-tariffed — shift marks to method/quality/commercial | EK-0170, EK-0171, EK-0029, EK-0165, EK-0153 |
| 458 | 97 | P1/F2 | accept | auto | "with reference to both wines" scope header must match a shared-attribute ask; but the 26/50 ID tariff itself is corpus-authentic for a reachable two-wine pair | EK-0172, EK-0173, EK-0165, EK-0171, EK-0147 |
| 455 | 94 | P1/F2 | accept | auto | country-ID flights need an anchor that unlocks the country; three cult/specialist USA whites are all curveballs | EK-0174, EK-0029, EK-0170, EK-0162 |
| 433 | 87 | P1/F1 | accept | auto | four-country all-New-World Chardonnay flight (Argentina/Australia/Chile/NZ) has no Burgundian anchor and four curveballs — already fully covered by the Old-World-anchor and banker rules | EK-0169, EK-0029, EK-0034, EK-0097 |

### EK-0054 · The pair + lone-wine structure is implausible for the MW exam
- **tier:** PLAUSIBLE · **status:** live
- **evidence:** ledger: attempt #98 (accept)
- **claim:** A question that opens with a classic same-region pair and then bolts on a third wine with
  its own separate sub-questions is an unlikely MW structure. A flight is normally coherent. If a
  single wine *is* taken alone, it is typically a large curveball where variety/origin are **not**
  asked — instead quality or commercial evaluation (e.g. a Georgian qvevri or an orange wine).

### EK-0055 · Syrah/Shiraz flights must show varietally honest sensory profiles
- **tier:** PLAUSIBLE · **status:** live
- **evidence:** ledger: attempt #66 (accept)
- **claim:** A flight of four Syrah/Shiraz should be sensorially realistic: at least one wine with the
  deep purple colour associated with Syrah; **black** pepper rather than white as a unifier; and the
  gamey/bacon/meaty notes that are near-hallmarks of the variety should appear — not a herbal/garrigue
  character in 3/4 wines with no meaty character anywhere. (A generation realism check, not just a
  structural one.)

### EK-0056 · Austria makes BA wines, but not from Chenin Blanc
- **tier:** PLAUSIBLE · **status:** live
- **evidence:** ledger: attempt #57 (reject) — Kracher Cuvée BA appeared 2013 P3 W10, 2024 P3 W9
- **claim:** "Only the Loire produces botrytized Chenin Blanc in any quantity" is technically correct
  — Austria/Burgenland produces Beerenauslese but from other grapes, not Chenin. The exam does **not**
  expect the candidate to name "Welschriesling"; "botrytised Austrian sweet wine, Burgenland" earns the
  marks because the mechanism (botrytis) is diagnosable. Botrytis sweet wines are anchors, not
  curveballs; the oxidative high-ABV Vin Santo is the curveball in such flights (see EK-0033).

### EK-0057 · Single-varietal red papers: either classics, or distinguishable-origin wines
- **tier:** PLAUSIBLE · **status:** live
- **evidence:** ledger: attempt #119 (partial)
- **claim:** A four-wine single-varietal red flight is typically either (a) focused on **classics**
  (classic varieties or a classic region/country), or (b) a set of **less-classic but
  origin-distinguishable** wines (e.g. Carmenère). In case (b), **commercial positioning and style**
  usually matter more than oak usage — for distinctive-but-lesser-known wines the salient question is
  where and how you'd sell them. (Partial: directionally adopted; not yet a hard rule.)

### EK-0058 · Loire Cabernet Franc — structure and winemaking notes
- **tier:** PLAUSIBLE · **status:** live
- **evidence:** ledger: attempt #99 (partial) — question was sound; AI evaluation mis-identified the wines
- **claim:** Loire Cabernet Franc (e.g. Saumur-Champigny) is a legitimate, recurring P2 subject
  (Loire Cab Franc in 2017, 2019, 2022, 2025). It is often **highly tannic**. **Whole-cluster / stem
  inclusion is uncommon in the Loire** — most producers destem fully or partially; do not assert
  whole-cluster as a defining feature. NOTE: the *question* here was design-sound; the error was the
  **evaluation** mis-reading the wines as right-bank Merlot — a grading-engine bug, not a generation
  flaw. (Right-bank Merlot-dominant wines are also mostly blends, not single-varietal.)

---

## §7 · App bug catalog & postmortems

> Symptom → root cause → fix → prevention. So we don't repeat them.

### EK-0059 · 6 corpus questions were HARD-invalid (stem contradicted wines)
- **tier:** PROCESS · **status:** live
- **evidence:** `question_quality_remediation_plan.md` Phase A (commit `3aa6327`)
- **claim:** **Symptom:** generated questions reached users with stems contradicting their wines
  (e.g. "four different countries" / two USA). **Root cause:** generation "validators" were prompt
  instructions to the LLM, not enforced post-generation gates. **Fix:** built `question-validator.ts`
  + `audit-questions.mjs --apply`; audit found **6/47 (13%) HARD-invalid**, all quarantined. **Prevention:**
  the validator is now a shared lib gating generation + a corpus audit. (First audit pass had a 50%
  false-positive rate on subset/pair stems and co-ferments; the validator was hardened to 0 FPs.)

### EK-0060 · The main study flow had no validity gate (only Stem Sniper) — CF-1
- **tier:** PROCESS · **status:** live
- **evidence:** `question_quality_remediation_plan.md` CF-1 / Phase B0 (commit `f8c958f`)
- **claim:** **Symptom:** quarantining wrote `stem_answer_keys.validated=false`, which only Stem
  Sniper honoured; the main flow read `generated_questions` directly and still served the 6 broken
  ones. **Fix:** flag `generated_questions.invalid_reasons` + a serve-time guard shared by both flows
  (49 total → 43 serveable; 0 of the 6 ever served, local + prod). **Prevention:** every serving path
  filters `invalid_reasons IS NULL`.

### EK-0061 · A false answer key — Chardonnay mis-keyed as Malbec
- **tier:** PROCESS · **status:** live
- **evidence:** `question_quality_remediation_plan.md` Phase D (bonus fix)
- **claim:** **Symptom:** Catena "White Stones **Chardonnay**" was keyed as **Malbec**. **Root cause:**
  enrichment bank-lookup fuzzy-matched the label to that producer's Malbec entry, and the key builder
  trusted `bank_match` over the explicit grape named on the label. **Fix:** a **label-conflict guard**
  in `resolveVariety` (reject a bank/profile variety that contradicts an explicit grape on the label)
  + the same check in the §2b consistency pass. Blast radius = exactly 1 key; 0 regressions.

### EK-0062 · Answer-key auto-fixes were inert until keys rebuilt — CF-2
- **tier:** PROCESS · **status:** live
- **evidence:** `question_quality_remediation_plan.md` CF-2 (commit `df7939f`)
- **claim:** **Symptom:** feedback that "fixed" an answer key changed the builder/data but the stored
  `stem_answer_keys` never rebuilt, so the fix was inert. **Fix:** `auto-feedback.yml` now has a
  post-merge "Rebuild keys + re-audit" step (`build-stem-answer-keys.mjs` when stem data/builder
  changed; `audit-questions.mjs --apply` when validator/generation changed).

### EK-0063 · Unreviewed high-stakes changes could ship — CF-3
- **tier:** PROCESS · **status:** live
- **evidence:** `question_quality_remediation_plan.md` CF-3 (commit `df7939f`)
- **claim:** **Symptom:** auto-applied feedback could alter generation/validator code and merge
  unreviewed. **Fix:** feedback is classified by **Kind** (answer-key | question | generation |
  validator); answer-key/question fixes auto-apply (low risk), but **generation/validator changes are
  PR-gated** (`reviewOnly`) — proven live (PR #2 opened, master untouched).

### EK-0064 · Sparkling-exclusion was prompt-only, not enforced
- **tier:** PROCESS · **status:** live
- **evidence:** ledger: attempt #47 (accept); see EK-0046
- **claim:** **Symptom:** a P1 flight contained two sparkling wines. **Root cause:** the prompt said
  "no sparkling" but no validator enforced it. **Fix:** added sparkling/fortified scope checks to P1
  and P2 validation. (Pattern: prompt instructions are not guarantees — enforce with a validator.)

### EK-0155 · A validator that runs in ONE place is not an enforcement (red wines in Paper 1)
- **tier:** PROCESS · **status:** live
- **evidence:** Neon `generated_questions` 2026-08-07 (35 violating P1/P2 questions, 23 live-servable,
  served 20×); ledger rows #47, #71, #145, #178; commits `1bfbf81`, `ea5b178`, `021863f`, `648c5fb`
- **claim:** **Symptom:** red wines appeared in Paper 1 flights — `Domaine Jean-Louis Chave, Hermitage`,
  `Clos des Papes, Châteauneuf-du-Pape`, `López de Heredia, Viña Tondonia Gran Reserva`,
  `Château du Moulin-à-Vent`, `Quinta do Crasto, Reserva Old Vines`. 35 questions, 23 still servable,
  already served 20 times.
  **Root cause — four faults, none of them a missing rule.** A correct contract (`validatePaperColour`,
  "R-COLOUR") already existed with passing tests. (1) It was called from exactly one place, the
  generation redraft loop. (2) It was *deliberately excluded* from `validateQuestion`, the shared
  audit wrapper, because a few unit fixtures were not colour-coherent — so **no banked question was ever
  quarantined for wrong colour**, while a comment in `question-engine.ts` claimed the post-save audit
  recorded it. (3) The serve path used the older label-regex check, which cannot see colour in an
  appellation-only name — none of the five wines above names a grape. (4) `/api/get-question/banked`
  skipped `filterValidBanked` entirely. Separately, the nightly sweep
  (`question-audit-daily.yml`) had been **failing since 2026-08-07** with `ERR_MODULE_NOT_FOUND`, so
  even a correct rule had nothing running it over the back catalogue.
  **Fix:** R-COLOUR folded into `validateQuestion` **by default** (opt-out only for the three
  colour-incoherent fixtures, pinned by `tests/audit-paper-scope-default.test.ts`); added to the serve
  filter and the unfiltered banked route; the appellation resolver registered in the audit processes;
  the sweep given the `ts-loader` it needs.
  **Prevention / the generalised lesson:** EK-0064 taught *"prompt instructions are not guarantees —
  enforce with a validator."* This is the next rung: **a validator not wired into every path is not an
  enforcement either.** Prefer defaults that protect production by omission — five of the six
  `validateQuestion` callers forgot to add the colour check, and forgetting was the failure mode. When a
  test fixture blocks a production rule, fix the fixture, not the rule.
- **cross-refs:** EK-0001 (paper scope), EK-0046 / EK-0064 (the sparkling half of the same rule),
  EK-0088 (P3 still-white placement), EK-0156

### EK-0157 · PRODUCT DECISION — sparkling wine is blocked on Paper 1 entirely (not "at most one")
- **tier:** PROCESS · **status:** live
- **evidence:** user decision 2026-08-07; ledger row #47 ("almost never sparkling in P1, and for sure
  not two — **I think not**"); `validatePaperStyleMix` p1-no-sparkling; `tests/paper-style-mix.test.ts`
- **claim:** Paper 1 admits **zero** sparkling wines. This replaces EK-0046's "almost never … never
  two", which the app had encoded as `p1-max-one-sparkling`.
  **Why the allowance had to go.** It was already unreachable: R-COLOUR blocks sparkling per-wine on
  Paper 1 and runs on every generation and serve path, so a one-sparkling P1 flight was rejected before
  the style-mix clause was consulted. Two rules disagreed and the stricter silently won — the worst of
  both, because the intent lived nowhere and deleting the per-wine rule would have quietly re-admitted
  sparkling. The generation prompt had said "no sparkling" for Paper 1 all along; the style-mix clause
  was the lone outlier.
  **Why zero and not one.** "Almost never" is an observation about the real papers, not an instruction a
  generator can follow — asked to include sparkling *almost never*, a model includes it sometimes. The
  app's job is to drill the paper's actual shape, and a sparkling wine on Paper 1 trains a candidate to
  expect something the paper is defined not to contain. That is a worse error than omitting a rare
  curveball. Note this is a decision about **generated practice material**, not a claim that the IMW has
  never once done it — if a real P1 paper ever shows a sparkling wine, EK-0046 records the observation
  and this entry still governs what we generate.
  **Blast radius: zero.** One banked question was newly matched (`gen_p1_F2_1779931088254` — the
  Montlouis Triple Zéro Brut Nature flight from row #47 itself) and it was already quarantined for
  `wrong_colour_for_paper`. Pool unchanged.
  **Prevention:** the two Paper 1 rules are now pinned to AGREE by a test that asserts a single
  sparkling wine is rejected by both `validatePaperStyleMix` and `validatePaperColour`. Relaxing one
  without the other reintroduces the contradiction.
- **cross-refs:** EK-0046 (the underlying observation), EK-0048 (off-dry IS fine on P1), EK-0155,
  EK-0156

### EK-0156 · Colour and style are two axes; collapsing them fails legitimate Paper 1 wines
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** Neon 2026-08-07 — 16 live P1 questions contain a residual-sugar white;
  `question-generation-prompt.ts` P1 scope line; commit `1bfbf81`
- **claim:** `classifyWineColour` returned a single seven-value enum in which **style beat colour**, so a
  Riesling Spätlese resolved as `"sweet"` rather than `"white"` and tripped `wrong_colour_for_paper` on
  Paper 1 — even though the generation prompt explicitly invites it (*"no sweet wines (unless a white
  wine with residual sugar like Riesling Spätlese or Vouvray demi-sec)"*). **16 live Paper 1 questions
  depended on that allowance**, so wiring the collapsed enum into the serve filter and the audit would
  have quarantined 16 good questions while fixing 23 bad ones — a net loss.
  Colour (`white|red|rose|orange`) and style (`still|sparkling|sweet|fortified|oxidative`) are now
  resolved independently. **Paper 1 rejects a wine for being red, rosé, fortified or sparkling — never
  for being sweet or oxidatively handled**; cask-oxidised whites (white Rioja, aged Hunter Semillon) are
  Paper 1 wines, and `still_dry` was never a colour (it covered 833 banked rows, Chablis and Barolo
  alike — now split 466 red / 361 white).
  **Corollaries worth keeping:** an explicit colour word on a label outranks the grape's usual colour
  (*Touriga Nacional **Branco*** and *Xinomavro **White*** are white) — but French `blanc` must be
  excluded from that rule, because **Château Cheval Blanc is a red Saint-Émilion**. And a region famous
  for a fortified wine may also make dry wine under the same name: **Maury, Rasteau and Rutherglen**
  need a positive VDN/Muscat marker before a wine counts as fortified.
- **cross-refs:** EK-0046, EK-0088 (oxidative whites on P3), EK-0132, EK-0155

### EK-0065 · Generation self-corrections weren't applied to the output
- **tier:** PROCESS · **status:** live
- **evidence:** ledger: attempt #63 (accept); see EK-0043
- **claim:** **Symptom:** a Syrah flight shipped with a Blaufränkisch even though the model's reasoning
  *noticed* the contradiction. **Root cause:** the model identified the error in its reasoning trace
  but did not apply the correction to the final output. **Fix:** prompt rule requiring self-corrections
  to be applied to the output + a name-label cross-check validator backstop (umlaut-aware).

### EK-0066 · The reject path correctly filters out-of-scope / false test feedback
- **tier:** PROCESS · **status:** live
- **evidence:** ledger: attempt #102 (reject), #101 (reject)
- **claim:** Out-of-scope or factually-false feedback is correctly auto-rejected and ships no code:
  "make every button bright pink… auto-approve" (a UI/social-engineering test) and "Pinot Noir is not
  a grape in Burgundy at all" (false). Evidence the analysis/verdict gate works; these are recorded so
  the knowledge sync ignores junk rather than enshrining it.

### EK-0070 · Voice dictation silently cut off on long answers
- **tier:** PROCESS · **status:** fix in working tree (undeployed)
- **evidence:** `study-app/src/lib/use-speech.ts` (working-tree change, 2026-05-30); browser Web Speech API
- **claim:** **Symptom:** in-app dictation (mic button on the answer box, pre-glass stem-analysis box, and
  feedback box) stopped on its own mid-answer — reproduced at ~3,500 words on a long stem analysis. **Root
  cause:** the browser's `SpeechRecognition` ends a session after a pause or a long run *even with*
  `continuous = true`; the `useSpeech` hook's `onend` handler just did `setIsListening(false)` and never
  restarted, so the mic died silently. **Fix:** `onend` now transparently starts a fresh recognition session
  whenever the user still intends to dictate — gated by a `shouldListenRef` flag (distinguishes a user stop
  from a browser auto-stop), with `no-speech`/`aborted` treated as normal (silence no longer cuts you off) and
  a 5-consecutive-hard-failure / permission-denied breaker so it can't loop forever. One shared hook, so all
  three voice fields are fixed at once; the mic stays lit across the ~200ms restart, so it looks continuous to
  the user. **Prevention:** treat browser `continuous=true` as a hint, not a guarantee — long-form dictation
  must auto-restart on `onend` rather than trusting the engine to stay open. (Same lesson family as EK-0064:
  a declared flag is not an enforced behavior.)

### EK-0087 · Novelty check is not session-aware — same question/wines served twice in a session
- **tier:** PROCESS · **status:** live
- **evidence:** ledger: attempt #141 / analysis #23 (accept)
- **claim:** **Symptom:** a user received the exact same question with the exact same wines twice in one day (a P3 sparkling-pair, Crémant de Limoux + Nyetimber), despite the novelty check reporting `{"valid":true}`. **Root cause:** the novelty check (EK-0051) compares against the historical/static corpus and the last 3–5 served questions in a category, but is **not session-aware** — it does not dedupe against what was just served to this same user, and/or the question was retrieved/cached rather than regenerated. **Fix (pending):** make the novelty/dedup check session-aware so a recently-served question+wine set is not re-served to the same user. **Prevention:** track per-session served question signatures and exclude them at serve time.

### EK-0095 · Question images must depict only the keyed wines/regions, not unrelated ones
- **tier:** PROCESS · **status:** live
- **evidence:** ledger: attempt #161 / analysis #28 (accept)
- **claim:** **Symptom:** images shown alongside a question depicted regions and wines NOT in the keyed answer set (a P1 Vouvray + Saint-Joseph Blanc pair). **Root cause:** image/asset selection is not constrained to the question's actual keyed wines. **Fix (pending PR):** restrict any attached imagery to the wines genuinely in the question. **Prevention:** the real exam never presents imagery of a wine or region other than the one being assessed; visual cues must always map to the keyed wines or they mislead the candidate. Related principle in EK-0050 (P3 visual cues must match the keyed style).

### EK-0096 · Curveball position: the "last-question of P1/P2" prior is wrong; P3 end-loads (supersedes EK-0025)
- **tier:** STRONG SIGNAL (P3 end-load + paper ordering) / PLAUSIBLE (the P1 q2 spike, small-n) · **status:** live
- **evidence:** `outputs/gap_analysis/findings/03_flight_curveball.md` §1.3 + `07_adversarial_corpus_review.md`; `data/structured/corpus_*.json` (last-10 sat years, 360 wines); supersedes EK-0025
- **claim:** On the last-10 corpus the "curveballs cluster in the final question of P1/P2" claim is NOT
  supported. **Robust:** per-paper med+high rate **P3 49.2% ≫ P1 15.0% > P2 9.2%** (the EK-0025 ordering
  holds; magnitudes larger than the all-years high-only averages), and **P3 end-loads** (last question
  58.8% med+high — the oxidative/orange/unusual-rosé slot). **Directional only (small-n):** P1's hardest
  slot looks like the *middle* (q2 15.4% high) rather than the last (6.1%), and q2 is the single hardest
  position overall — but that rests on ~4–5 wines across 10 sittings, so treat as tentative, NOT a rule to
  build position logic on. Curveball ID marks remain downweighted toward style/winemaking/quality.

### EK-0097 · The "1 in 4" rule holds PER WINE; difficulty is concentrated into a minority of flights (supersedes EK-0024)
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** `outputs/gap_analysis/findings/03_flight_curveball.md` §1.6 + `07_adversarial_corpus_review.md`; `data/structured/corpus_*.json` (last-10)
- **claim:** Reframed by unit of analysis. **Per WINE**, the curveball (med+high) rate is **~21–27%
  (≈ 1 in 4–5)**, roughly flat across 2/3/4-wine flights (5-wine 28.6% / 6-wine 33.3% directional,
  n=7 / n=6) — so the classic "1 in 4" holds at the wine level. **Per FLIGHT**, difficulty is concentrated:
  **54% of multi-wine flights are all-anchor (zero med+high)**, 28% have exactly one, 10% two, 9% three+.
  So most individual flights are all-anchor and a minority carry the curveballs; the clean "one curveball +
  rest anchors" shape is most common for **3-wine flights (43% have exactly one)**. Curveball ID marks are
  downweighted in favour of style/winemaking/quality/commercial.

### EK-0098 · Post-2014 mark redistribution: ID down, commercial/style/maturity up
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** `outputs/gap_analysis/findings/04_marks.md` §1b–1d + `07_adversarial_corpus_review.md`; `data/structured/corpus_subquestions.json`
- **claim:** After 2014 the per-paper denominator locked at 900 (exactly 25/wine). Mark-share shifted
  (share of era marks, pre-2014 → 2020–2025): **ID composite 59.7% → 46.2%**; **commercial 5.7% → 17.9%**
  full-credit (2.6% → 7.8% split-evenly — ~tripled under BOTH methods; verified NOT a verbose-stem
  classifier artifact, stem length flat 69→67→67 chars across eras); **style 10.1% → 20.1%** (~doubled);
  **maturity 4.6% → 13.1%** (~tripled); quality stable ~33–36%. Per-paper modern shape (2018–2025,
  full-credit share): **P1** origin~38/quality~39/variety~30/winemaking~22/maturity~20/commercial~13;
  **P2** origin~50/quality~38/style~23/winemaking~16/commercial~16/maturity~9; **P3** quality~37/origin~36/
  winemaking~27/commercial~21/style~18 (sweetness/structure P3-only). Tariff rules confirmed: 2–3 marks =
  numeric "state RS/ABV" only; commercial never <5; compare/contrast 20–36 marks; variety-ID size signals
  difficulty (10–15 mainstream, 16–25 harder). Structure stable: 3–4 questions/paper, ~3 sub-questions each.

### EK-0099 · Per-paper Old-World : New-World band (P3 never NW-majority; P1/P2 rarely are)
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** `outputs/gap_analysis/findings/01_diversity.md` §1.3 + `07_adversarial_corpus_review.md`; `data/structured/corpus_wines.json` (last-10); correction surfaced by the Phase 3 whole-test validator self-test (2026-05-31)
- **claim:** Per 12-wine paper: **P1 ≈ 7.8 OW : 4.2 NW (65% OW), P2 ≈ 7.6 : 4.4 (63%), P3 ≈ 9.8 : 2.2
  (82%)**; corpus-wide 70% OW. **Correction:** the original "no paper is ever majority New-World" was an
  overclaim — **P1 and P2 each had a NW-majority paper** in 2015–2025 (observed minima P1 **4:8**,
  P2 **5:7**, e.g. 2018 P2); only **P3 is never NW-majority** (min **6:6**). So enforce "never NW-majority"
  on **P3 only**; for P1/P2 use a soft OW floor at the historical minimum (~33% / ~41% OW). Within a flight, outside the
  same-origin families (F2/F7, single-world by design), mixing OW+NW is the norm — F4 61%, F1 64%, F6 75%
  mixed; mixing scales with flight size (19% at size-2 → 71% at size-5). A whole paper spans ~6 countries
  (P1 5.9 / P2 6.7 / P3 6.2) and 7–10 varieties.

### EK-0100 · Per-paper curveball budget (P1≈2, P2≈1, P3≈6 per 12 wines)
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** `outputs/gap_analysis/findings/03_flight_curveball.md` §1.7; `data/structured/corpus_wines.json` (last-10, n=120 wines/paper)
- **claim:** Harder (med+high) wines per 12-wine paper: **P1 ≈ 1.8, P2 ≈ 1.1 (the bankers' paper),
  P3 ≈ 5.9 (half the flight is "unusual" — P3's identity)**. A 36-wine mock suite should carry ~9 harder
  wines, heavily weighted to P3. Benchmark density is high and stable (~75–86%) at every flight size.

### EK-0101 · Per-paper age signature; price ratio
- **tier:** PLAUSIBLE · **status:** live
- **evidence:** `outputs/gap_analysis/findings/01_diversity.md` §1.4, `02_price.md` §1b; `data/structured/corpus_wines.json` (last-10)
- **claim:** Age: **P1 young-skewed** (avg 3.4y, mostly ≤7y), **P2 mid-aged** (avg 4.7y), **P3 oldest +
  ~26% non-vintage** (Champagne NV, Tawny, Sherry, Madeira). 85% of dated flights mix ages; ~20%
  deliberately pair a young (≤3y) with an aged (≥8y) wine. Vintage is rarely *asked* (7 sub-questions in
  10 years) — age is a composition/maturity axis, not an ID target. Price HIGH (super-premium+luxury)
  share per paper: P1 ~22%, **P2 ~38% (classed reds)**, **P3 ~30% (fortified/sweet icons)**; treat as a
  target band with tolerance (`price_band` is a coarse proxy; ~7% explicit).

### EK-0102 · Single-country ceiling (~8/12) and blend frequency (~29%)
- **tier:** PLAUSIBLE · **status:** live
- **evidence:** `outputs/gap_analysis/findings/01_diversity.md`, `07_adversarial_corpus_review.md`; `data/structured/corpus_wines.json` (last-10); `data/structured/whole_test_targets.json`
- **claim:** A whole paper spans **~6 countries** (P1 5.9 / P2 6.7 / P3 6.2). One country can **dominate up
  to ~8/12 (67%)** in a France-heavy year (observed max: P1 8/12, P2 6/12, P3 8/12) but essentially never
  more — a single-country share above ~⅔ of a paper is out of distribution. Separately, **~29% of corpus
  wines are blends** (not a niche — blends recur across all three papers, not just F3), so a generated
  paper with almost no blends is unrealistic. Both are enforced as soft whole-test guards (single-country
  ceiling 0.67; blend floor ~0.08) in `scripts/validate_mock_paper.py`.

### EK-0103 · Generation/validation now encodes the modern shape (soft rules + whole-test blueprint) [system]
- **tier:** PROCESS · **status:** live
- **evidence:** `study-app/src/lib/question-engine.ts`, `prompts/question-generation-prompt.ts`, `scripts/validate_mock_paper.py`, `data/structured/whole_test_targets.json`, `study-app/src/lib/grading-telemetry.ts`; plan: `exam_improvement_plan.md` (shipped 2026-05-31)
- **claim:** Beyond the hard rules R1–R7 (EK-0040), the engine now runs three SOFT composition validators
  in the "important" relax tier (relax at attempt 6): **R8** mark-type-mix (flags ID-composite >55% of
  marks; EK-0098), **R9** price-spread (coarse proxy — flags an all-iconic quality flight with no
  legal-ladder signal; EK-0028), **R10** OW/NW balance (flags a single-world non-same-origin 3+ flight;
  EK-0099 — its curveball-count axis is telemetry-only because the benchmark proxy mislabels ~63% of
  anchors). The generation prompt now carries per-paper **mark-emphasis** + family **curveball-density**
  steers (EK-0098/EK-0100). Whole-test generation is **blueprint-first**: `/generate-mock-exam` allocates
  a 12-slot composition blueprint (country/world/style/price/blend/curveball) to hit the per-paper bands
  in `whole_test_targets.json`, fills it, then runs the advisory `validate_mock_paper.py`. Grading adds
  **detect-only telemetry** (EK-0093 howler→FAIL / cascade→zero): graders emit a hidden `GRADING_META`
  tag and the server logs `[grading-override]` when a HARD override should have fired but the verdict
  disagreed — verdict/feedback unchanged; auto-enforcement is a deferred gated two-pass project.

### EK-0104 · The ID-suppression → ID-free arc (structural proof of "theory exam with a tasting")
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** corpus `data/exams.json` — 2017 P3 Q2 (single Amber, "consider … of unknown origin");
  2019 P1 Q3 ("Do not spend time thinking about the wine's specific origin"); 2024 P3 Q1 & 2025 P3 Q3
  (zero identification marks); `outputs/research/evolution_analysis.md`
- **claim:** Identification's structural role has contracted over time. The exam moved from ID-bearing
  questions (2011–2014, ID ≈ 50–60% of the per-question tariff — e.g. 2011 P2 Q1 country 15 / variety
  30 / quality 30) through explicit **ID-suppression** (2017, 2019) to **fully ID-free questions**
  (2024 P3 Q1, 2025 P3 Q3) that pay only for quality / winemaking / style / commercial. This is the
  strongest *structural* evidence for EK-0006/EK-0007/EK-0016 (reasoning > identification), beyond the
  examiner-report quotes. Practical consequence: a generator should be willing to emit questions with
  **no variety/origin marks at all**, especially in P3 and in final questions, and a grader must not
  expect ID credit where the printed tariff allocates none (cf. EK-0089).

### EK-0105 · Climate is now an explicit, repeated examinable driver
- **tier:** STRONG SIGNAL (repeated stem, n=2 consecutive years) · **status:** live
- **evidence:** corpus `data/exams.json` — 2024 P2 Q3 and 2025 P2 Q1 carry the **verbatim** stem
  "Discuss how climate and winemaking techniques have influenced the quality and style of the wine";
  `outputs/research/evolution_analysis.md`; extends EK-0004
- **claim:** From 2024 the IMW explicitly names **climate** as a quality/style driver, and reused the
  identical stem two years running (2024 P2 Q3c, 2025 P2 Q1c) — **the only verbatim two-year stem repeat
  in the corpus** (verified in `data/exams.json`). Generated P1/P2 same-variety and classic-origin
  questions should be willing to frame quality/style as climate-driven, and model answers must reason
  cool-vs-warm-climate expression and vintage conditions (not winemaking alone). **Falsification test:**
  two consecutive absent years downgrades this. **Scope guard:** climate-as-*driver* is the SUPPORTED
  claim; climate-change **adaptation** (picking dates / canopy / variety choice) as a graded competency
  is **NOT attested** — keep it out of model-answer mandates (see §9). This is the concrete, citable
  instance of the recency-weighting lean in EK-0004/EK-0069. (`outputs/research/evidence_audit.md` T1-6 / Audit D.)

### EK-0106 · Quality calibration widened region → world; commercial widened to "opportunities and challenges"
- **tier:** STRONG SIGNAL · **status:** live · extends EK-0008, EK-0012, EK-0098
- **evidence:** corpus `data/exams.json` — "quality … in the context of wine globally" (2025 P2 Q3;
  2024 framing per EK-0004); "with specific reference to its classification" (2025 P3 Q3); "commercial
  opportunities and challenges" (2024 P3 Q1, P3 Q3); commercial verb evolving appeal (2012 P3 Q2, 2014
  P1 Q3) → selling (2016 P2 Q5, 2017 P1 Q3) → opportunities-and-challenges (2024);
  `outputs/research/evolution_analysis.md`
- **claim:** Two assessment frames widened in 2021–2025. (1) **Quality** must be placed on a *global*
  scale and **anchored to official classification**, not merely judged "within the region of origin"
  (the older default). (2) **Commercial** must address both **opportunities AND challenges**
  (dual-pole), with channel/market specificity (EK-0012). Graders and generators should default to the
  global + classification quality frame and the dual-pole commercial verb for modern (2021+) questions;
  "within the region" alone now under-answers a "globally"-framed quality sub-question. **Hedge:** the
  explicit "wine globally" quality frame currently rests on **n=1 (2025 P2 Q3)** — treat it as an
  emerging frame to recognise and reward, not a confirmed every-year target (re-confirm in a future
  sitting; `outputs/research/evidence_audit.md` T2-1, PLAUSIBLE). The dual-pole commercial verb
  (opportunities AND challenges) is the better-supported half (extends EK-0012).

### EK-0107 · Scope label — distribution entries are "last-10"; 2011–2014 is quantitatively uncharacterised
- **tier:** PROCESS · **status:** live
- **evidence:** §0.5 (core analytical corpus = 2015–2025); EK-0096…EK-0102 all cite
  `data/structured/corpus_*.json` (last-10); `outputs/research/evolution_analysis.md` §0
- **claim:** Every per-paper *composition* entry — curveball position/budget (EK-0096/0097/0100),
  post-2014 mark-redistribution baseline (EK-0098), OW:NW band (EK-0099), age/price signature
  (EK-0101), single-country ceiling/blend frequency (EK-0102) — is computed on the **2015–2025
  structured corpus only and is blind to 2011–2014**. (EK-0023 curveball and EK-0027 price *do* use the
  wider 2011–2025 504-wine set; keep that distinction.) Do **not** read last-10 distributions as
  timeless, and do not use them to reason about exam *evolution* — 2011–2014 needs separate structured
  tagging before any 14-year trend line is asserted. Recommended follow-up: extend `data/structured/`
  to 2011–2014. (Also: 2011 P3 has no question text in the corpus — wines only.) **These distribution
  entries are generation/composition PARAMETERS (what a realistic paper looks like), NOT assessment
  objectives (what the examiners are testing) — do not treat a distribution decimal as examiner intent.**
  (`outputs/research/evidence_audit.md` T1-5, SUPPORTED.)

### EK-0108 · "Orange"/skin-contact wine peaked 2014–2019 and is absent 2021–2025 — do not forecast a surge
- **tier:** PLAUSIBLE · **status:** live
- **evidence:** corpus `data/exams.json` — Pheasant's Tears Rkatsiteli (2014 P3), Cullen 'Amber' (2017
  P3 Q2), Chinuri/Iago (2019 P1), Vecchio Samperi (2019 P1); **no skin-contact/qvevri wine in
  2021–2025**; `outputs/research/evolution_analysis.md`; cf. EK-0088
- **claim:** Skin-contact / qvevri "orange" wine is an Era-1/Era-2 device (2014–2019), **not** a growing
  one — it does not appear anywhere in the 2021–2025 corpus. Oxidative / flor styles (Jura Savagnin,
  oxidative white Rioja, Sherry) persist (cf. EK-0088), but skin-contact does not. When generating
  "boundary"/curveball P1 or P3 wines, prefer the persistent oxidative/flor family over orange wine,
  and do **not** model orange wine as a rising or future-dominant theme.

### EK-0133 · Answer-writing view must keep the wine list (and ideally tasting context) visible
- **tier:** PROCESS · **status:** live
- **evidence:** ledger: attempt #189 / analysis #33 (reject)
- **claim:** Symptom: while writing the answer the candidate could not see the wine labels and had to recall them from memory; no tasting notes were available. In the real exam the wines are physically present throughout the sitting (re-smell/re-taste at will), so writing 'from memory' diverges from exam conditions. For New-World wines, identity alone (e.g. 'Napa Chardonnay') can be insufficient to infer winemaking without the producer. Fix (UX): keep the wine list visible during answer entry; consider surfacing tasting context. A product/UI gap, not a content/pipeline defect.

### EK-0163 · Two copies of one object; the debrief rendered the copy nobody updated
- **tier:** PROCESS · **status:** live — fixed 2026-08-08
- **evidence:** attempt 427 (bug report against `gen_p1_F6_1786206158735`); that question's row
  (`model_answer` 3,133 chars, `answer_length_status = 'corrected'`, `metadata.generatedOnTheFly = true`);
  its `model_usage` timeline (question saved 16:24:54 → `model_answer` row 16:26:08, `answer-length`
  16:26:22 → attempt submitted 16:27:07 with 6,401 chars of `answer_feedback`);
  `study-app/src/app/study/page.tsx`, `src/lib/study-session.ts`,
  `src/app/api/check-model-answer/route.ts`, `src/app/components/ModelAnswerReveal.tsx`;
  `study-app/tests/model-answer-arrival.test.tsx`; PR #115 / `47372d3`
- **claim:** **Symptom:** a candidate reached the debrief of a freshly generated P1 flight and read
  "No model answer available for this question yet." The answer was in the database, 3,133 characters
  of it, persisted 45 seconds before they submitted.
  **The mechanism.** A generated question is served the instant generation converges; its model answer
  takes ~75s more to write, so it always lands **mid-attempt**. The arrival path wrote the answer to
  `sessionStorage`, and the debrief renders from the **reducer**. Nothing reconciled them, so
  `state.question.modelAnswer` stayed empty for the whole attempt.
  **Why it survived so long: partial correctness.** `runFinalEvaluation` re-read `sessionStorage` —
  the one consumer wired to the copy that *was* updated. So grading worked perfectly and the failure
  presented as a cosmetic empty panel rather than a broken debrief. **A defect that leaves the
  expensive path working is a defect nobody reports for months**; the visible surface is not a proxy
  for the state underneath it.
  **Why nobody had just re-dispatched.** `SELECT_QUESTION` was the only action that sets `question`,
  and it resets `step` — dispatching it mid-attempt would wipe the candidate's work. The
  sessionStorage write was the workaround, and it half-worked. The fix is a narrow
  `ATTACH_MODEL_ANSWER` that merges in place, plus one writer (`applyModelAnswer`) that every arrival
  path funnels through.
- **it was four of five call sites, not one.** "Generate fresh" and flag-load-next were *worse* than
  the reported case: they called `setModelAnswerReady(true)` and wrote the text nowhere at all, so
  grading on those paths ran with **no model answer**. Each had independently reinvented "flip the
  flag and move on". This is EK-0157's and EK-0160's shape again — a contract every call site must
  remember is a contract that gets forgotten — so it is now asserted rather than remembered:
  `tests/model-answer-arrival.test.tsx` fails if a sixth path flips the flag outside the writer.
- **a readiness boolean cannot heal what it polls for.** `/api/check-model-answer` returned
  `{ready}` alone. The background poll therefore learned the answer had landed and had **nothing to
  install** — the one mechanism whose entire purpose was to recover this case was structurally
  incapable of it. **A poll that reports a state change should carry the state**, or it is only an
  interrupt with no payload.
- **the reported diagnosis was wrong in a way that mattered.** The report concluded the grader
  could not grade, and proposed (a) withholding questions until an answer is attached. Grading had in
  fact succeeded, and (a) would have added ~75s of dead wait to **every** on-the-fly generation to
  work around a state-sync bug — a large latency cost bought by mis-reading which component was
  broken. **Confirm which layer actually failed before pricing the fix.**
- **scope:** not a rare race. It fired on **every** on-the-fly generation and never on a banked one —
  586 of the 30 days to 2026-08-08 (`metadata.generatedOnTheFly = true`) versus 71 banked.
- **closed by trailer**, per EK-0160: `Fixes-Bug: 427` on `47372d3` set `feedback_status = 'accepted'`
  automatically — the first bug filed after that mechanism shipped, and it worked.
- **cross-refs:** EK-0160 (only a trailer closes a report; the mechanism that closed this one),
  EK-0157 (cross-file/cross-call-site rules must be pinned by a test), EK-0161 (state that means
  "work is in progress" needs an owner and an expiry), EK-0133 and EK-0134 (the other study-page
  surface defects that grading masked)

### EK-0161 · A concurrency guard with no TTL is a permanent lock (fa_65 sat "analyzing" for 7 hours)
- **tier:** PROCESS · **status:** live — fixed 2026-08-08
- **evidence:** `feedback_analyses` row 65 (attempt 394, created 2026-08-07T18:07:18Z, `updated_at`
  identical, `thread` `[]`, `recommendation` NULL, `error_message` NULL); the in-flight guard and
  `sweepStrandedFeedback` in `study-app/src/lib/feedback-analysis.ts`; `maxDuration = 120` in
  `src/app/api/save-attempt/route.ts` and `src/app/api/feedback-analysis/trigger/route.ts`;
  `study-app/tests/stale-analysis-reap.test.ts`; verified on Neon branch `reap-verify`
- **claim:** **Symptom:** a feedback analysis showed "analyzing" for seven hours. It looked like slow
  work in progress; it was a corpse.
  **What actually happened.** The row was inserted and never written to again — `updated_at` equal to
  `created_at`, empty thread, and critically **`error_message` NULL**. `runFeedbackAnalysis` has a catch
  that marks `status = 'error'`, so a NULL error message proves no exception was thrown: the invocation
  was **killed**. Both entry points declare `maxDuration = 120`, and the analysis runs in `after()`
  (post-response), so the remaining budget is whatever the response left over. Measured wall clock for
  real analyses is 31–73s, so the margin is thin rather than absent — fa_65 lost the race.
  **The killing was survivable; the LOCK was not.** A stuck `analyzing` row closed every route back:
  (1) the concurrency guard selected `attempt_id = X AND status = 'analyzing'` with **no TTL**, so every
  re-trigger returned `already_analyzing` — forever; (2) the stranded sweep requires
  `auto_analysis_id IS NULL`, and `createFeedbackAnalysis` stamps that id at insert. The attempt was
  unreachable by every recovery path the system has. The comment in the catch even promised "a manual
  re-trigger can retry it", which was true for `error` and false for the killed case.
  **Fix:** `reapStaleAnalyses()` — a TTL of 10 minutes, applied before the guard is consulted (order
  matters; reaping after the SELECT would still return `already_analyzing` on the very call meant to
  recover) and again on every sweep, so the queue stops lying even for an attempt nobody re-triggers.
- **the TTL is safe because of a cross-file relationship, so that relationship is a test.** The reaper's
  only way to do harm is killing live work, and it cannot: the platform kills any invocation at
  `maxDuration = 120s`, so a 10-minute TTL can only ever see corpses. That safety depends on three files
  agreeing, which is the shape EK-0157 was written about, so `tests/stale-analysis-reap.test.ts` parses
  the routes' declared `maxDuration` and fails if the TTL is not at least 2× the largest.
- **reaping deliberately does NOT retry.** `auto_apply_enabled` is ON in production, so a retry can
  dispatch a branch-and-PR — and the feedback sitting behind a stale lock is old by definition. 394's
  substance had already shipped as R11 in `question-rules.mjs`, so an automatic retry would have proposed
  a fix for something already fixed (and see the duplicate-PR failure the bin-fix miner produces).
  Unwedging is mechanical; deciding to spend an Opus call and possibly open a PR is a human's call.
- **the generalised lesson:** this is EK-0158's flight-claim bug in a different table — a claim taken
  before the work with nothing to release it if the worker dies. **Any state that means "someone is
  working on this" needs an expiry, because the worker can always be killed between the claim and the
  release.** When auditing for this, the tell is a status column with no timestamp comparison anywhere
  in its WHERE clauses.
- **cross-refs:** EK-0158 (the same shape, TTL'd flight claims), EK-0157 (cross-file rules must be
  pinned to agree), EK-0155 (a recovery path that silently never runs)

### EK-0160 · A citation and a fix claim are the same string — only a trailer may close a bug report
- **tier:** PROCESS · **status:** live — built 2026-08-08
- **evidence:** attempts 407 and 413 (both fixed, deployed, and still reading `feedback_status = NULL`
  hours later); `file_bug` in `study-app/src/lib/coach/tools/write-tools.ts`; the deliberate app-level
  exclusion in `sweepStrandedFeedback` (`study-app/src/lib/feedback-analysis.ts`);
  `study-app/scripts/close-fixed-bug-reports.mjs`; `.github/workflows/close-fixed-bug-reports.yml`;
  verified on Neon branch `writeback-verify`
- **claim:** **Symptom:** a candidate could not find out whether their own bug was fixed. Attempt 407
  was fixed in `98075a1` and live in production for five hours while its row still read "open"; the only
  way to answer the question was to read the git log by hand.
  **Why nothing closed it, and why that was half right.** `file_bug` records a row and returns.
  `sweepStrandedFeedback` — the self-healing sweeper for feedback that was never analysed — deliberately
  excludes `scope = 'general'` rows, and the exclusion is CORRECT: `runFeedbackAnalysis` prompts on the
  stem, the wines and the model answer, so a footer rendering bug handed to it would be judged as a
  QUESTION (sound, therefore "reject") and could dispatch a generation-rule PR for a defect in a React
  component. The gap was not a missing sweep. It was that an app bug is closed by a **code fix**, and no
  mechanism connected the two.
  **Fix:** a `Fixes-Bug: <attempt id>` git trailer, reconciled on every push to master (both deploy
  paths share that event; hooking either one alone would miss fixes that shipped by the other). Sets
  `feedback_status = 'accepted'` with a note naming the commit. Creates no deployment, so it costs
  nothing against the Hobby quota (EK-0157-adjacent).
- **the finding that shaped it — prose cannot carry intent.** The first build also closed on prose
  references, on the reasoning that a convention nobody remembers never fires (EK-0064). Run against real
  history it closed attempt 407 against `0deddf9` — *"fix(coach): attach the question a bug was filed
  from"* — which merely CITES 407 as its motivating example while fixing something adjacent. The commit
  that actually fixed 407 never names it in its message at all. Side by side the two are identical to a
  machine: a conventional-commit `fix(` subject plus a bare "attempt 407" / "bug 413" in the body. One is
  a fix claim, one is a citation, and **the distinguishing information is simply not in the text.** So
  prose is parsed only to REPORT a candidate as a warning annotation; the trailer alone writes. The cost
  is honest and stated: if the trailer is missing the row stays open, so writing the trailer IS the
  mechanism.
- **a guard that fails closed can look exactly like a quiet world.** The first version returned "no
  fixing commit found" for every commit, because `touchesApp()` ran `git diff-tree -- study-app/` from a
  cwd of `study-app/` — a pathspec resolves against the CURRENT DIRECTORY, so it asked for
  `study-app/study-app/` and always matched nothing. The workflow runs from the same directory, so it
  would have shipped and been indistinguishable from "nobody references their bug reports". Every git
  call is now anchored with `-C <repo root>`, pinned by a test. **When a heuristic reports nothing,
  suspect the plumbing before concluding the signal is absent** — cf. the nightly sweep of EK-0155 /
  EK-0167 that had been failing with `ERR_MODULE_NOT_FOUND` while looking like a clean back catalogue.
- **cross-refs:** EK-0064 (instructions are not guarantees), EK-0155 (a validator not wired into every
  path is not an enforcement), EK-0159 (the artefact with no wines)

### EK-0159 · A wine-level validator cannot guard the artefact that has no wines (the shopping brief)
- **tier:** PROCESS · **status:** live — fixed 2026-08-07
- **evidence:** Coach bug report attempt **413** (user 2, 2026-08-07 22:09 UTC, route
  `/live-tasting/lts_idpk44j2t`): a Live Tasting brief headed "Live Tasting · Paper 1" and "Paper 1
  White Still — F5 Production Method (Sweet-Wine Mechanisms)" whose three slots were a
  botrytis wine, a dried-grape/passerillage wine and a late-harvest/cryoextraction wine;
  `BYO_FAMILIES` and `buildByoGuidance` (`study-app/src/lib/live-tasting-engine.ts`);
  `study-app/tests/live-tasting-brief-scope.test.ts`
- **claim:** **Symptom:** a Paper 1 exercise instructing the candidate to go and buy three Paper 3
  dessert wines. **Root cause — the prompt named a Paper 3 device more specifically than it named the
  paper.** `BYO_FAMILIES.F5` described itself as "Focus on how the wine was made: sparkling, fortified,
  or sweet mechanisms" on *every* paper, and that description was interpolated into the brief prompt
  beside `Paper 1 (white still wines)`. Given a general constraint and a specific instruction that
  contradicts it, the model followed the specific one — correctly, in prompt terms. F6 carried the same
  defect via "maturity, **sweetness**, or style".
  **Why no validator caught it.** Every paper-scope enforcement in the codebase — `validatePaperColour`
  (R-COLOUR), `validatePaperScope`, `validatePaperStyleMix` — takes *wines*. The shopping brief is
  written **before any wine exists**; it is a description of wines to go and buy. By the time a wine is
  resolved and those validators can run, the bottles are bought and opened. R11
  (`sweetnessOutOfPaperViolations`, the sweetness-is-a-Paper-3-device rule of EK-0166) would have caught
  the framing, but it was only ever run over question stems.
  **Fix, three layers.** (1) The family description is resolved **per paper** (`byoFamilyFor`), naming
  the production levers that paper actually turns — oak/lees/MLF/vessel on P1, whole-bunch/maceration on
  P2 — and keeping the sweet/sparkling/fortified set for P3 only. (2) The paper scope prose moved out of
  `buildQuestionGenerationPrompt`'s local scope into `study-app/src/lib/paper-scope.ts`, so the brief
  writer is held to the same text as the question generator, and it is stated in the system turn with an
  explicit "if the family suggests a style this paper cannot contain, the PAPER WINS". (3)
  `validateBriefPaperScope` runs R11 (sweetness-as-premise) and R-COLOUR (per slot profile) over the
  returned brief, with one repair round and then a hard failure.
- **prohibitions must be stripped before validating prose, and this is load-bearing:** a *correct* Paper 1
  brief ends with "Avoid: anything sparkling, fortified or dessert-sweet" — the exact phrase R11 fires on.
  Validating the raw brief rejects every well-formed brief and passes only the malformed ones, which state
  sweetness positively. A line that FORBIDS a style is not a claim about the flight.
- **a description must not invite the guard's own violation.** The first draft of the P1 F5 lever list
  included "skin contact"; a live call duly offered "Skin-Contact or Amphora/Concrete-Vessel,
  Oxidative-Leaning" in slot 3, which resolves to **orange** and is blocked on Paper 1 as firmly as
  sparkling. Every such brief burned a repair round. Reductive-vs-oxidative *handling* stays — a
  cask-oxidised white Rioja is a legitimate Paper 1 wine and R-COLOUR deliberately permits `oxidative`
  (EK-0156).
- **verified against live model calls**, not only unit tests: three families (P1 F5, P1 F6, P2 F5) and
  then P1 F5 twice more after removing the skin-contact lever — all pass the guard on the first attempt,
  producing oak/MLF/lees/vessel contrasts instead of dessert wines. The unit tests pin both directions,
  including that a correct brief mentioning sweet wines in its Avoid line is ACCEPTED.
- **the generalised lesson, one rung past EK-0155.** EK-0064: prompt instructions are not guarantees,
  enforce with a validator. EK-0155: a validator not wired into every path is not an enforcement.
  **Here: a validator whose input type is "resolved wine" cannot protect an artefact that contains no
  wines.** Ask what the artefact IS before assuming the existing rule layer covers it — and note this
  one is the only artefact in the app that spends the candidate's money, so it deserved the *most*
  enforcement and had the least.
- **cross-refs:** EK-0155 (validator wiring), EK-0156 (colour and style are two axes), EK-0157 (sparkling
  blocked on P1 entirely), EK-0166 / R11 in `question-rules.mjs` (sweetness is a Paper 3 device)

### EK-0158 · Check-then-act on a paper position billed three Opus generations for one flight
- **tier:** PROCESS · **status:** live — fixed 2026-08-07 (migration 058)
- **evidence:** paper `ltpr_egt9dfy3e` position 4 held THREE sessions (`lts_c6635vxn1` 12:30:29.142,
  `lts_jk8md6na6` 12:30:29.255, `lts_ijmi6n97j` 12:30:42.783 UTC), each with its own generated question;
  `generateNextFlight` (`study-app/src/lib/live-tasting-paper-engine.ts`); the SSE chaining loop in
  `study-app/src/app/live-tasting/paper/[id]/page.tsx`; `study-app/migrations/058_live_tasting_flight_claims.sql`
- **claim:** `generateNextFlight` read the paper's children, picked the first position with no session,
  spent 40-90s of Opus on it, and only then linked it — a check-then-act with nothing held in between.
  The client re-POSTs whenever its stream loop doesn't see a terminal `result` frame, and a reload or a
  second tab does the same, so several callers computed the SAME next position and every one of them
  generated. Under BYOK each duplicate is billed to the **candidate's own** Anthropic key, and the paper
  would render one slot three times. The client's `useRef` guard cannot help: it is per mounted
  component, and the rival callers are different requests.
- **fix, two layers with different jobs:** a TTL'd per-position claim (`live_tasting_papers.flight_claims`,
  one atomic conditional UPDATE) taken BEFORE generation stops the duplicate WORK — a denied claim returns
  `busy`, which is explicitly not an error, and the client waits and re-reads instead of racing. A partial
  unique index on `(paper_id, paper_position)` stops the duplicate ROW unconditionally, including when a
  stale claim is taken over or a future caller forgets to claim; the loser of a link race retires its own
  session. The claim is the optimisation, the index is the guarantee — a TTL'd claim alone can always be
  defeated by a slow generation outliving its own claim.
- **the same shape existed twice more:** both BYO wine-entry routes (owner and partner-token) check
  `children.some(position)` then create-and-link, so two submissions for one flight both passed. They now
  treat the link's rejection as the real gate. **A pre-check is not a lock** — if the DB doesn't hold the
  invariant, concurrent callers will find the gap.
- **verified on a Neon branch** (a copy of production, `migration-058-verify`): the migration applies, the
  index builds, a fresh claim denies the rival, a released claim re-grants immediately, a 6-minute-stale
  claim is taken over, linking a second session to an occupied position raises `23505`, and both legal
  states still work (27 unlinked sessions coexist; position 1 exists on two different papers).

### EK-0168 · A pinned archetype must outrank a soft preference — Live Tasting papers silently re-drew families
- **tier:** PROCESS · **status:** live — fixed 2026-08-07
- **evidence:** paper `ltpr_egt9dfy3e` (user 1, P2 full, 2026-08-07) planned `F4/F2/F4/F2` in
  `live_tasting_papers.composition` and was built as **F4/F2/F1/F7**; `pickArchetype`
  (`study-app/src/lib/live-tasting-engine.ts`); `samplePaperComposition` famCap = 2
  (`study-app/src/lib/live-tasting-paper.ts`); regression tests in `study-app/tests/live-tasting.test.ts`
- **claim:** the paper engine DID pin the composition's family (`requireArchetype:
  FAMILY_TO_ARCHETYPE[next.family]`), but `pickArchetype` built its try-order as
  `[require, ...others].sort(by used-last)` — sorting the pinned archetype along with the fallbacks. Once
  an earlier flight had used that archetype, `rank(require)` became 1 and every unused archetype
  outranked it, so the pin was discarded without a word. Because a full paper deliberately allows a
  family **twice**, this broke the **second occurrence of every repeated family, deterministically** —
  not a race and not a bank-thinness fallback, which is what the symptom first looked like. Fix: the pin
  is tried first unconditionally and the deprioritization sort orders the fallbacks only.
- **generalisation:** a hard constraint and a soft preference must never be sorted by the same
  comparator. If a pin can be outranked it is not a pin — and the failure is invisible, because the
  fallback produces a perfectly good flight of the wrong family.
- **note:** a genuine fallback (the bank cannot build the pinned archetype within budget) is still
  allowed and still silent. The paper's stored `composition` then claims a family the flight doesn't
  have; nothing user-facing reads family off the composition today (the paper API sends stems and
  marks, not families), so this is a latent reporting gap, not a live defect.

### EK-0167 · The nightly quarantine sweep went dark for a day, and its cost is 13% not 61%
- **tier:** PROCESS · **status:** live — workflow re-armed 2026-08-07
- **evidence:** `gh run list --workflow question-audit-daily.yml` (failure at 2026-08-07 07:53 UTC,
  `ERR_MODULE_NOT_FOUND: .../src/lib/tasting-validators`); `.github/workflows/question-audit-daily.yml`;
  `study-app/scripts/audit-questions.mjs`; dry runs of the audit over the live bank, 2026-08-07
- **claim:** `audit-questions.mjs` was invoked with plain `node`, and `question-validator.ts` acquired an
  extensionless `./tasting-validators` import that Node cannot resolve — so the daily audit + quarantine
  backstop died silently (a cron failure surfaces nowhere in the app). Fixed by running it under the
  repo's existing `node --import ./scripts/ts-loader.mjs`, which the sibling bank-match step already used.
  **Two numbers to keep straight when judging a sweep's blast radius:** the raw audit reports
  *358 hard violations across 586 keyed questions (61%)*, but that counts already-quarantined, binned and
  live-tasting rows. Against the **servable** bank (pool + kept + not retired + not quarantined = 256) the
  cost was **49 (19%)**, and after removing the `missing-variety-id-part` arm (EK-0154) **34 (13%)** —
  P1 −10, P2 −7, P3 −17, only 7 of them ever served. Always quote the servable number.
- **also validated (negative result):** `MARKS_BELOW_FLOOR` (the 5-mark floor on style / quality /
  commercial / method parts) fires on **0 of the 82 modern (2018–2026) real questions** — 3 in the older
  2011–2017 era (2011 P2 Q3, 2014 P1 Q3, 2015 P2 Q1, all 4-mark commentary parts). It is corpus-correct
  for the era the generator targets and was deliberately left armed; the 20 servable questions it
  quarantines genuinely price a commentary part below anything the modern exam does.
- **open, measured, not yet fixed:** `part-task-repertoire` fires on **8 of 82 modern real questions**
  (2018 P2 Q1, 2018 P3 Q1, 2019 P1 Q2, 2019 P1 Q3, 2021 P2 Q1, 2022 P1 Q3, 2022 P2 Q4, 2022 P2 Q5) for
  authentic phrasings its registry lacks — "identify the vintage", "what are the key winemaking
  techniques used", "consider which markets this wine would be successful in", "compare and contrast
  market potential", and 2019 P1 Q3's directed-away-from-origin instruction. Only 1 servable question is
  affected today, so it did not block the re-arm, but the registry needs those entries.

### EK-0134 · Multiple feedback submissions on one question overwrite rather than append
- **tier:** PROCESS · **status:** live
- **evidence:** ledger: attempt #190 / analysis #34 (reject)
- **claim:** Symptom: a user clicked the feedback button three times on one question expecting three discrete records, but only the third submission was retained — earlier submissions were overwritten. Root cause: the feedback-submit path replaces the prior entry instead of appending a new record per submission. Workaround: submit all observations in a single entry. Fix: persist sequential feedback submissions as distinct records. UI/UX bug, no content/pipeline change.

---

## §8 · Cross-reference index (authoritative artifacts)

This document is a synthesis layer. The deep artifacts it draws on (do not duplicate — cite/link):

- **Methodology / provenance (how it was built — see §0.5):** `docs/methodology.md` (technical,
  11 stages), `docs/managerial_methodology.md` (narrative).
- **Master decision trees (the candidate's exam strategy):** `outputs/master_trees/p1_whites_tree.md`,
  `p2_reds_tree.md`, `p3_special_tree.md` (Layer A stem routing → Layer B sensory; P3 adds Layer A.5
  visual triage), plus per-family packs `p{1,2,3}_family_tree_pack.md`.
- **Examiner heuristics (`outputs/heuristics/`, 13 files):** `examiner_patterns.md` (30 patterns +
  stem-phrase appendix), `examiner_report_synthesis.md` (7 Cardinal Rules from 13 reports),
  `question_taxonomy.md` + `question_taxonomy_index.md` (F1–F8 schema + counts), `curveball_analysis.md`,
  `quality_price_tier_analysis.md`, `question_wine_composition_analysis.md` (sweet-flight mechanisms),
  `historical_wine_classification.md` (benchmark / role / tier census), `wine_selection_logic_by_question_type.md`
  (contrast-axis fit by family), `winemaking_diversity_quality_questions.md`,
  `p1_production_method_contrast_audit.md`, `family_matrix_templates.md`, `decision_tree_remaining_work.md`.
- **Per-question analysis:** `outputs/taxonomy_tags/` (112 family-tagged questions),
  `outputs/decision_matrices/` (112 stem-only) and `outputs/decision_matrices_v2/` (112 tree-aware).
  Training input — not study material.
- **Validation / accuracy (`outputs/backtest_reports/`, 5 files — see §10):** `loyo_report.md` (pre-fix
  LOYO + per-variety census), `loyo_postfix_audit.md` (**post-fix 72.8% / 89.2% / 95.6%**),
  `loyo_audit_2015_2018_2024_2025.md` (scoring-defect findings), `iteration_report.md`,
  `exam_predictor_backtest.md` (next-year structure forecast). Prediction data:
  `data/loyo_predictions.json`, `data/predicted_2026_exam_profile.json`.
- **Study diagrams:** `outputs/study_diagrams/` (Mermaid flowcharts) → `study-app/public/diagrams/`.
- **Answer-writing rules:** `docs/mw_write_pipeline_guidance.md`.
- **Examiner-confidence study (Project 9 — `outputs/research/`, the cognition layer behind §2/§3):**
  `examiner_confidence_construction_model.md` (capstone — the "trust account" model, the
  confidence≠correctness 2×2, the contamination law; feeds EK-0121/0122/0123),
  `confidence_language_corpus.md` (~161 cited quotes, 18 reports — the verbatim evidence base),
  `confidence_building_behaviors.md`, `confidence_destroying_behaviors.md`, `plausibility_framework.md`,
  `sophistication_framework.md`, and `confidence_prompt_audit.md` (grading/feedback/model-answer prompts
  scored against the model — see §9 EK-0124). Source text: `docs/examiners reports/extracted_txt/`
  (8 practical + chief + theory reports 2017–2025; 2021/2022 practical & chief OCR'd from scans; **plus
  the 2013 and 2010 Examiners' Reports** — the only public pre-2017 reports, recovered from
  mastersofwine.org 2026-08-05, mined into EK-0136…EK-0141).
- **Long-horizon corpus & study (2000–2026):** `data/past_exams_2000_2010.json` (Era-1 practicals,
  built by `scripts/build_era1_corpus.py`), `scripts/analyze_long_horizon.py` (the analyzer — `--compare`
  reproduces every figure), and `outputs/heuristics/long_horizon_analysis_2000_2026.md` (the write-up;
  feeds EK-0146/EK-0147 and the EK-0001 correction).
- **IMW-website haul (2026-08-05 crawl — see `outputs/imw_website_crawl_2026-08-05.md` for URLs):**
  `docs/s1a_papers/` (all 11 Stage One Assessment papers 2015–2026, practical + theory, with
  extracted_txt), **`data/s1a_exams.json`** (the structured S1A practical corpus — 11 years / 45
  questions / 132 wines, exams.json-style schema, wine IDs `YYYY_s1a_wM`, validated by
  `scripts/validate_s1a.py`: slots 1–12, exact coverage, 300 marks per paper), `docs/past_papers_2000s/`
  (MW exams 2000–2010; the scanned 2010 paper hand-transcribed incl. the **Crib Sheet 2010** full wine
  list that pairs with the 2010 Examiners' Report), `docs/research_papers/` (4 MW RPs on tasting language —
  Wang acidity / Martindale minerality / Drew tannin vocabulary / Furuholmen mousiness; **IMW terms:
  personal use only, never republish**), `docs/MW-Syllabus-2021.pdf` (official practical assessment
  criteria; papers are 2h15m = 11.25 min/wine).
- **Validator + pipeline:** `study-app/src/lib/question-validator.ts`; remediation history in
  `question_quality_remediation_plan.md`.

---

## §9 · Open questions / hypotheses to validate

### EK-0067 · The 5 vs 8 vs 10-mark allocation logic is not yet characterized
- **tier:** CURVEBALL · **status:** live
- **evidence:** ledger: attempt #73 (candidate's open question)
- **claim:** Written sub-questions are worth 5 / 8 / 10 marks, presumably keyed to wine difficulty
  (classic vs curveball) and depth expected, but the **exact rule is unknown**. TODO: correlate
  historical sub-question mark values against wine type (classic vs curveball) and question type
  (winemaking, commercial) to extract the pattern.

### EK-0068 · LOYO weak spots — blends, Gewürztraminer, Grenache-blends
- **tier:** CURVEBALL · **status:** live
- **evidence:** `outputs/backtest_reports/loyo_postfix_audit.md`; project inventory
- **claim:** Even post-fix, certain buckets score near-zero top-1 in backtesting (notably blends,
  Gewürztraminer, Grenache-blends). 2015 and 2018 are now the hardest non-recent folds; `2025_p3_q3`
  is a persistent mixed-category collapse. These are the next research/improvement targets.

### EK-0069 · Recency weighting is endorsed but not quantified
- **tier:** PLAUSIBLE · **status:** live
- **evidence:** ledger: attempt #73 (accept); EK-0004
- **claim:** We believe the last ~5 years should be weighted more heavily in modelling the exam (style
  focus, climate-driven fruitiness, New/Old World style convergence). The **exact weighting curve** is
  not yet defined — currently a qualitative lean, not a parameter.

### EK-0085 · Mark distribution by family is assumed, not measured
- **tier:** CURVEBALL · **status:** live
- **evidence:** §3 entries; `outputs/heuristics/examiner_patterns.md`
- **claim:** We know ID is ~35–45% and quality/commercial are rising, but we do not yet have a
  per-family expected mark-distribution profile (e.g. how F5 method questions split marks vs F7
  hierarchy questions). Worth deriving from the tagged corpus.

### EK-0071 · "Predominant vs single" variety nuance needs a validator stance
- **tier:** PLAUSIBLE · **status:** live
- **evidence:** `outputs/heuristics/examiner_patterns.md` §1.11; validator R5 (soft)
- **claim:** "Single grape variety" implies 100% varietal; "predominant" permits a dominant-grape
  blend (Bordeaux, Rioja, CdP, Tawny Port). The validator currently treats single-variety-blend as
  *soft*. Open question: should generation ever pair "single variety" framing with a co-ferment, or
  always prefer "predominantly" when any blend is present? (Tension with EK-0044.)

### EK-0072 · Visual-cue realism for P3 is implemented but not yet validated against feedback
- **tier:** PLAUSIBLE · **status:** live
- **evidence:** ledger: attempt #53 (accept); EK-0050
- **claim:** P3 appearance cues are now generated and shown, but we have not yet confirmed (via fresh
  feedback) that they are *accurate and useful* — e.g. that a stated colour matches the keyed style.
  Watch for feedback that a visual cue misled the candidate.

### EK-0117 · Is climate-change ADAPTATION a graded competency? (unattested — do NOT assert)
- **tier:** CURVEBALL · **status:** live
- **evidence:** `outputs/research/future_exam_prediction.md` M7 ("logically implied… but not yet directly
  attested"); `outputs/research/evidence_audit.md` Audit D / "Top 10 NOT" #3 (UNPROVEN)
- **claim:** Climate-as-*driver* is SUPPORTED (EK-0105). But whether the practical examines climate-change
  **adaptation** — picking dates, canopy management, variety choice as a response to warming — as its own
  graded stem is **NOT attested anywhere in the practical corpus**. Keep it OUT of EK-0105, model-answer
  mandates, and generation until a future sitting actually examines it. Watch-item only.

### EK-0118 · Do "bankers get zero latitude"? (inferred, not graded policy — needs an explicit statement)
- **tier:** CURVEBALL · **status:** live
- **evidence:** `outputs/research/evidence_audit.md` Audit B.4 / T1-2c (UNPROVEN); the "esoterica generous"
  half is STRONG, the "bankers strict" half is inferred and conflated with the constrained-option mechanism
- **claim:** "Latitude scales with wine difficulty" is directionally plausible — esoterica/curveballs get
  generous credit for well-argued wrong answers (strongly attested: 2017 Lagrein, 2023 South Africa, 2025
  Cornas). But the mirror claim that **bankers/classics earn ZERO latitude** is **inferred**, never stated
  as graded policy, and the strongest "strict" quotes (2022 Tuscany "had to be", 2024 "really needed to be
  correct") describe a **constrained given option set** — a *different* mechanism. Do NOT encode a hard
  banker-zero rule; at most hedge EK-0090. Needs an explicit examiner-policy statement to promote.

### EK-0119 · Distinction = consistency across three days, not a single peak (per-question-inexpressible)
- **tier:** CURVEBALL · **status:** live
- **evidence:** `outputs/research/distinction_candidate_analysis.md`; `outputs/research/evidence_audit.md`
  (PLAUSIBLE — "distinction = consistency, strong claim, per-question-inexpressible")
- **claim:** Distinction/high marks appear to reward **consistency across all three papers** rather than a
  single brilliant script. This is directionally supported but **cannot be expressed in a single-question
  app** (which never sees a candidate's three-day arc). Carry it in UI/methodology framing if anywhere;
  do **not** make it a gradable EK rule. Open until there is a per-question-expressible form.

### EK-0120 · Era-1 (2011–2014) mark allocation is quantitatively uncharacterised
- **tier:** CURVEBALL · **status:** RESOLVED 2026-08-05 — see EK-0146
- **resolution:** The blocker is cleared. `scripts/analyze_long_horizon.py` now computes mark totals
  programmatically over both `data/exams.json` and the new `data/past_exams_2000_2010.json`, so the
  2011–2014 figures no longer rest on manual sums: **2011 P1/P2, 2012 all three and 2014 all three sum
  to exactly 300**, and 2013's shortfall is a transcription defect (dropped per-wine multipliers), not a
  real deviation. Going further back, the 300-mark convention is stated verbatim in the 2001–2008
  printed instructions. **EK-0001 has therefore been flipped** (its "pre-2013 differed" caveat struck).
  **EK-0078 ("vintage ID declined") is NOT resolved by this work** — the long-horizon study did not
  measure vintage-ID tariffs, so that half of the original blocker stands.
- **evidence:** `outputs/research/evidence_audit.md` §0 Coda + T3-5 ("Era-1 structured tagging is the
  precondition for any 14-year trend claim"); `outputs/research/evolution_analysis.md` §0
- **claim:** The 2011–2014 papers are **not structured-tagged**, so any claim about that era rests on
  **manual sums** and inherits a hidden caveat. This blocks two drafted revisions from being promoted to
  fact: the EK-0001 pre-2013 "25-marks/wine" boundary (the evolution doc's manual read suggests 2011–2014
  *may* also sum to 25/wine, contradicting EK-0001's current "pre-2013 differed" claim) and EK-0078's
  "vintage ID *declined*" (rests on manually-summed Era-1 tariffs). **Do not flip EK-0001 or assert
  EK-0078 "declined" until `data/structured/` is extended to 2011–2014.** Then resolve both. (T3-5.)

### EK-0124 · Prompt gaps — the graders model confidence only PARTIALLY (Project 9 audit; fixes not yet applied)
- **tier:** PROCESS · **status:** open (recommendations, not yet implemented)
- **evidence:** `outputs/research/confidence_prompt_audit.md` (the three prompt families scored against the
  EK-0121 trust-account criteria); cross-checks `study-app/src/lib/prompts/marking-principles.ts`,
  `funnelling.ts`, `model-answer-prompt.ts`, `answer-evaluation-prompt.ts`, `evaluate-full/route.ts`.
- **claim:** The live prompts reward a **mix that leans toward examiner confidence** (the wrong-but-trusted
  cell, the terminated funnel, internal-contradiction detection and the survivable-miss/cascade asymmetry
  are well-encoded), but three holes let technical correctness leak back in: **(1)** the per-wine
  plausibility/adjacency map (`stem_answer_keys.plausible`, already computed by `stem-scoring.ts`) is
  **never injected** into the prose graders, so EK-0090's gradient is judged "by vibes"; **(2)** the
  contamination law (EK-0122, ≥10 reports) is **under-weighted** — `marking-principles.ts` localises a
  howler to "adjacent claims" rather than the whole script; **(3)** there is **no correct-ID-parity rule**
  (EK-0123) — a correct ID with absent argument can still over-score. Separately, the audit re-confirms the
  stale `marking-principles.ts` "ABSOLUTE 65% per paper" line contradicts EK-0116 (a real defect, not just
  a confidence gap). **These are recommendations; none are applied.** Promote to a §7 app-bug entry (or a
  ledger row) only when a fix ships.

---

## §10 · Validation, backtesting & known model limits

> How we proved the trees work, and where they still fail. Source: `outputs/backtest_reports/`.
> See §0.5 stage 7 for where this sits in the pipeline.

### EK-0148 · First BLIND out-of-sample backtest — trees generalise worse than LOYO implies, but the confidence tiers hold
- **tier:** STRONG SIGNAL · **status:** live · **qualifies:** EK-0082 (LOYO is fit, not generalisation)
- **evidence:** `outputs/backtest_reports/era1_blind_backtest_2000_2010.md`;
  `data/backtest_era1_blind.json` (111 questions / 396 wines); harness
  `scripts/build_backtest_input.py` + `scripts/score_backtest.py`. Protocol: wines withheld from the
  predicting agents; ground truth resolved by separate agents that never saw the predictions;
  deterministic synonym-aware matching.
- **claim:** Every earlier backtest scored the trees against the 2011–2025 corpus they were
  **synthesised from**, so LOYO (top-1 variety 72.8% / top-3 89.2% / candidate-set 95.6%) measures
  **fit, not generalisation** — a tree built from all years cannot be honestly held out from one of
  them. Against the unseen 2000–2010 corpus the same trees score **variety 30% / 52% / 69%** and
  **country 36% / 62% / 83%** per wine (MRR 0.43 / 0.52). Treat the gap as indicative, not exact —
  different harnesses, and this one caps predictions at 5–8 ranked candidates — but the direction is
  not in doubt. **Three findings matter operationally.** (1) **The three-tier confidence scheme is
  honest out-of-sample**: STRONG SIGNAL 38%/65%/82% > PLAUSIBLE 21%/45%/61% > CURVEBALL 16%/26%/43%
  on variety, monotonic across all six metrics — a label that survives this distribution shift is
  doing real work, and supports tiers over percentages. (2) **Layer A stem-routing is the brittle
  part, not the wine knowledge**: 32/111 stems (29%) hit NO matching branch (P1 38%, P3 39%, but P2
  only 9% — red-wine stem grammar is the most stable across 26 years), and coverage drives accuracy
  (branch matched 33%/56%/74% vs no branch 20%/41%/58%); meanwhile country in-set stays 83% overall
  and 90% on STRONG SIGNAL calls. Unroutable constructions include vintage verticals, price ranking,
  OW-vs-NW paired grids, and single-wine isolation. (3) **P3 is the weakest tree** (variety top-1 20%,
  in-set 51%) with joint-worst coverage — matching the examiner reports, where P3 is where candidates
  come unstuck. **Consequences:** stop quoting LOYO as a generalisation figure; add an explicit
  "unrecognised construction" fallback leaf to Layer A that degrades to the paper-level prior (EK-0004
  says new question types appear regularly); strengthen P3 first; and do **NOT** fit the trees to
  Era-1 question shapes, which are extinct (EK-0146) — this corpus is a test set, not training data.

### EK-0082 · LOYO backtesting — method and result (pre-fix → post-fix)
- **tier:** PROCESS · **status:** live — **the post-fix 72.8/89.2/95.6 headline is IN-SAMPLE and not reproducible. Two independent blind tests: EK-0148 (2000-2010, 396 wines) and EK-0150 (2026, 36 wines). Read EK-0149 for the reconciliation.**
- **evidence:** `outputs/backtest_reports/loyo_report.md`, `loyo_postfix_audit.md`, `loyo_audit_2015_2018_2024_2025.md`
- **claim:** The master trees are validated by **Leave-One-Year-Out** cross-validation: for each of
  10 folds, train on 9 years and predict the held-out year's wines from the stem + tree alone (360
  wines, deterministic Python scorer with appellation lookup + synonym normalization; metrics =
  top-1/top-3 variety, top-1 country, candidate-set hit, MRR). **Pre-fix:** top-1 variety 51.3%,
  top-3 70.7%, candidate-set 82.5% vs a naive most-common-per-paper baseline of 16.9% (**+34.4pp**).
  **Post-fix** (after 5 scoring-defect fixes + tree edits): **72.8% / 89.2% / 95.6%**. Per-paper,
  **P2 is strongest and P1 weakest** on top-1 variety; **hardest years are 2023 and 2025**, easiest
  2016 and 2021. Cite **only the post-fix** figures downstream — pre-fix country/sub-region metrics
  were measured incoherently (audit findings A–D). Post-fix tree edits of record: Melon/Muscadet
  survival in French-white tours; a Rhône same-region blend+single-variety rule; a broadened
  Europe-only indigenous branch (Austria/Italy/Greece kept alive); a two-wine non-Champagne
  commercial-sparkling leaf; and a P3 **"never single-lock a mixed-category flight"** anti-collapse rule.

### EK-0083 · Systematic failure mode — blend labels collapse to their dominant variety
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** `outputs/backtest_reports/loyo_report.md` §5 (quantifies the weak spots in EK-0068)
- **claim:** The trees score **0% top-1** on multi-grape labels because they collapse a blend to its
  lead grape: Cabernet Sauvignon/Merlot (15 wines), Sauvignon Blanc/Sémillon (8), Cabernet Franc/Merlot
  (4), Grenache/Tempranillo (9), Grenache/Syrah (9), Touriga Franca/Nacional (9, often → Chardonnay),
  Chardonnay/Pinot Noir sparkling (12, → Chardonnay), Corvina blends (5). **Aromatic/indigenous whites**
  also collapse to Riesling: Gewürztraminer, Furmint/Hárslevelű, and Grüner Veltliner all 0% top-1.
  Practical consequence: when a stem implies a blend or an aromatic/indigenous white, **do not trust a
  single-variety leaf — widen to the candidate set** (which still scores 95.6%). This is the measured,
  quantified version of the weak-spots noted in EK-0068.

### EK-0084 · A separate "exam-structure predictor" forecasts next year's paper shape
- **tier:** PLAUSIBLE · **status:** live — **the 12/12 exact-count figure below is WRONG; it measured a tautology. Real rate is 27% — see EK-0143**
- **evidence:** `outputs/backtest_reports/exam_predictor_backtest.md`; `data/frozen_predictions/predicted_2026_exam_profile.PRE-EXAM-FROZEN.json`
- **claim:** Beyond per-wine ID, a sequence-aware 5-layer model predicts the **structure** of an
  upcoming paper (question count, family archetype per question, slot-level variety/country/style),
  backtested 2022–2025. It predicts the **exact question-count per paper correctly in every paper-year
  (12/12)** — **this figure is invalid, see EK-0143**; top-3 hit rates: style 97.6%, question-role 92.9%,
  country 81.0%, variety 59.5%; structure mean-F1 0.499. (Re-measured 2026-08-05 with 2026 added as a
  fifth fold: structure mean-F1 0.521, style 98.0%, role 92.0%, country 84.0%, variety 60.0%, and real
  question-count accuracy 27%.) **P2 structure is the hardest to predict.** It is explicitly *"a steering layer, not an
  oracle"* — useful for biasing mock-exam generation toward likely shapes, not for guaranteeing content.
</content>

### EK-0142 · The 2026 paper is the system's first true out-of-sample test — structure held, exact-count did not
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** `outputs/backtest_reports/2026_holdout.md`; `data/holdout_2026_score.json`;
  frozen forecast `data/frozen_predictions/predicted_2026_exam_profile.PRE-EXAM-FROZEN.json`
  (committed 2026-05-27, before the exam was sat); scorer `scripts/score_2026_holdout.py`
- **claim:** The 2026 papers were ingested *after* the forecast was frozen, so this is the only
  measurement of the system that is not contaminated by hindsight. **Question archetypes: 6 of 8
  anticipated (75% recall, 60% precision)** — better than the 2022–25 in-sample structure F1 proxy
  of 0.499, so the family/subcategory layer generalizes. **Countries: 61% recall.** Paper 1 was the
  strongest result (100% archetype recall — F1 same-variety-cross-origin, F6 maturity-axis and F7
  quality-calibration all called correctly). Paper 3 was weakest (50%): the forecast expected a
  quality-calibration question and a third question that never came. The single biggest miss is
  structural, not varietal — see EK-0143. Variety recall (27%) is **not** a fair number: the
  denominator counts every blend component in the paper (corvinone, touriga franca, macabeo) while
  the forecast only offers three guesses per slot. Do not cite it as a variety accuracy figure.

### EK-0143 · The predictor's "12/12 exact question count" measured a tautology — the real rate is 27%
- **tier:** STRONG SIGNAL · **status:** live — **corrects EK-0084**
- **evidence:** `outputs/backtest_reports/2026_holdout.md`; `outputs/backtest_reports/exam_predictor_backtest.md`;
  the `count_correct` field added to `scripts/build_predictive_exam_analyzer.py` on 2026-08-05
- **claim:** EK-0084 reports the exam-structure predictor calling the **exact question count correctly
  in every paper-year (12/12)**. That figure was **not overfit — it was vacuous.** `run_backtest()`
  called `predict_paper_sequence(..., forced_count=len(paper_rows))`, forcing the predicted sequence
  to the *actual* question count, and then asserted `sum(predicted) == sum(actual)`. That identity is
  **true by construction for every paper of every year**. The real predictor, `predict_question_count()`,
  was **never invoked by the backtest at all** — only by the forward forecast. So the capability was
  reported at 100% while going entirely unmeasured.
- **the real number:** scoring `predict_question_count()` properly across 2022–2026 gives
  **4 of 15 paper-years correct = 27%**. Per year: 2022 1/3, 2023 0/3, 2024 2/3, 2025 0/3, 2026 1/3.
  The 2026 row matches the independent frozen-forecast holdout exactly (1 of 3 — Paper 2 only), which
  is two separate code paths agreeing and is why the figure can be trusted.
- **consequence:** **do not use predicted question count as a planning input.** Predicting how many
  questions a paper will carry is close to a coin-flip at 3-vs-4. Predicted *archetype mix* is the
  usable half (EK-0142: 75% recall out-of-sample). 2026 ran **fewer, larger flights** than forecast
  (a 6-wine P1 opener, a 6-wine P2 pair-set, an 8-wine P3 pair-set), which is how a paper sheds a
  question while keeping 12 wines and 300 marks — that mechanism, not the count itself, is the thing
  worth internalising. The 2026 marks split also skews harder to identification than any recent year
  (id 58.0% / quality 25.7% / commercial 12.0%, vs 39.7 / 40.1 / 17.8 in 2025).
- **generalised lesson:** a metric that can only ever return one value is not a measurement. When a
  backtest reports a perfect score, check whether the quantity is derived from the answer.

### EK-0144 · A single question can restart its sub-question lettering when it changes scope
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** `data/exams.json` 2026 P3 Q2; `data/structured/corpus_subquestions.json` rows
  `2026_p3_q2_a`/`_a2`; the fix in `scripts/build_structured_corpus.py`
- **claim:** 2026 Paper 3 Question 2 asks **two differently-scoped blocks inside one question** and
  restarts the letters for the second: *"For each pair: a) identify the origin (4 x 8) b) comment on
  the methods of production (4 x 14) c) compare the quality (4 x 16)"* then *"For each wine: a) state
  the alcohol level (8 x 3) b) state the level of residual sugar (8 x 3)"* — so the labels run
  a, b, c, a, b. The scopes differ (four **pairs** vs eight **wines**), which is why the letters
  reset. Two consequences: (1) any generator that mimics IMW phrasing must be able to emit a
  scope-change + lettering restart, not just a flat a/b/c list; (2) `{question_id}_{label}` is **not**
  a unique sub-question key — it collided on primary-key insert into `corpus.subquestions` and the
  builder now suffixes repeats (`_a`, `_a2`). Marks still reconcile normally: 32+56+64+24+24 = 200
  for an 8-wine flight (8 x 25). This is also the first corpus question to award marks for **stating
  ABV and RS as bare numbers** across a whole flight (8 x 3 + 8 x 3 = 48 marks, 16% of the paper).

### EK-0145 · The master trees now include 2026 — 2026 is spent as a holdout, 2027 is the next honest test
- **tier:** PROCESS · **status:** live — **read before quoting any tree accuracy figure**
- **evidence:** `outputs/master_trees/` (re-synthesized 2026-08-05 across 120 matrices);
  frozen pre-2026 snapshot at `outputs/master_trees/_frozen_pre2026/`;
  guard `scripts/verify_tree_resynthesis.py`
- **claim:** The three master trees were re-synthesized from all **120** decision matrices
  (2015–2026) on 2026-08-05, after the 2026 holdout had been scored and banked. **Any backtest that
  uses 2026 against the current trees is now contaminated** — the trees were built knowing those
  answers. EK-0142/EK-0143 remain valid because they were measured against the pre-2026 trees, which
  are preserved verbatim in `_frozen_pre2026/`; re-run them against that snapshot, never against the
  live trees. The next uncontaminated out-of-sample test is **2027**, and the frozen 2027 forecast
  (`data/predicted_2027_exam_profile.json`, once generated) should be committed before that exam is
  sat, exactly as the 2026 one was.
- **what the re-synthesis added:** P1 gained a **geographic/climatic-framing branch** (there was
  none — the "regions influenced by the Mediterranean Sea" stem had no home) plus the
  white-wine-from-a-red-appellation trap (Bandol/Châteauneuf/Pessac-Léognan blanc). P2 promoted
  **Rioja from PLAUSIBLE to STRONG SIGNAL** for same-region pairs and named the three within-region
  contrast axes the examiners actually use — traditional-vs-modern, quality tier, vintage. P3 made
  **non-Champagne the default expectation for a multi-country sparkling opener** (2026 P3 Q1 ran four
  countries with zero Champagne), added a **multi-pair same-region branch**, and gained an **ABV/RS
  calibration table** for the flights that award marks for stating those numbers.
- **process note:** the re-synthesis was an *update in place*, not a rewrite. Every pre-existing
  `**Practical rule:**` line survived (the LOYO post-fix edits of EK-0082), evidence lists were
  extended rather than replaced, and P3's visual-triage order-of-operations trunk is
  character-identical. That was verified mechanically, not trusted — run
  `python scripts/verify_tree_resynthesis.py` after any future tree edit.

### EK-0150 · The 2026 tree holdout — 36.1 / 63.9 / 88.9 per wine on a paper the trees had never seen
- **tier:** STRONG SIGNAL · **status:** live — figures stand, **framing corrected by EK-0149**. The "-25.3pp out-of-sample penalty" claimed below is WRONG: it compared fresh-agent predictions against an older, differently-generated pass. Renumbered from EK-0148 on 2026-08-05 after the auto-feedback bot independently claimed that id.
- **evidence:** `outputs/backtest_reports/2026_tree_holdout.md`; `data/loyo_2026_tree_holdout.json`;
  predictions in `data/loyo_2026_predictions_p{1,2,3}.json`; scorer `scripts/score_2026_tree_holdout.py`
- **method:** tree-backtester agents applied the **frozen pre-2026 trees**
  (`outputs/master_trees/_frozen_pre2026/`, which never saw 2026) to the eight 2026 stems, barred from
  every 2026 wine source. Scoring reuses `run_loyo.score_question` verbatim, so the figures sit on the
  same scale as the 10-fold LOYO report rather than a lookalike metric. 36 wines, 8 questions.
- **result:**

  | metric | 2015–2025 LOYO (post-fix) | 2026 out-of-sample | delta |
  | --- | --- | --- | --- |
  | top-1 variety | 72.8% | **36.1%** | −36.7pp |
  | top-3 variety | 89.2% | **63.9%** | −25.3pp |
  | candidate-set | 95.6% | **88.9%** | −6.7pp |
  | top-1 country | — | 30.6% | — |

- **claim:** EK-0082's post-fix headline was measured **after tree edits made in response to the very
  2024/2025 misses being scored** — the audit itself called for a later "non-overfit pass". On a year
  the trees could not have been fitted to, **top-1 variety halves and top-3 falls 25 points**. Quote
  63.9% as the expected top-3, not 89.2%.
- **the finding that matters more than the headline:** the **candidate set barely moved** (95.6% →
  88.9%). Precision collapsed out-of-sample; coverage did not. Operationally: **never act on the
  tree's top-1** (a coin flip at 36%), use the tree to bound the universe, and let the glass decide
  within it. The tree is good at what a wine *could* be and unreliable at what it *is*.
- **where it holds and where it breaks:** `2026_p1_q1` (six-wine Chardonnay flight) scored **100%
  across every metric** — a large single-variety flight is the trees' home ground. `2026_p1_q2` is the
  pattern in miniature: **0% top-1, 100% top-3** (ranked Chardonnay first, flight was all Riesling).
  `2026_p2_q1` was a **total failure — 0% top-1, 0% top-3, 33% candidate set**: the tree routed
  Italy-first for "same country, different single varieties" and the answer was three light French
  reds (Cabernet Franc / Gamay / Trousseau), with Gamay and Cabernet Franc both mispredicted as
  Sangiovese. Mixed-category P3 flights sat at 50% top-3.
- **EK-0083 reconfirmed exactly:** the misprediction list is blend collapse — Grenache/Tempranillo →
  Cabernet Sauvignon/Merlot, Touriga Franca/Nacional → Chardonnay/Pinot Noir, Sauvignon Blanc/Sémillon
  → Chardonnay/Pinot Noir, Riesling → Chardonnay.
- **caveats, stated so the number is not over-read:** one year, 36 wines. And P3 was scored
  **stem-only**, so its visual-triage Layer B — the strongest part of that tree — never ran; real P3
  performance with a glass in hand should beat the 50% recorded here. This is also the **last
  uncontaminated use of 2026** (EK-0145); it cannot be re-run against the live trees.

### EK-0149 · Reconciling the two blind tests — the penalty comes from ERA SHIFT, not from being unseen
- **tier:** STRONG SIGNAL · **status:** live — **reconciles EK-0148 (2000–2010) with EK-0150 (2026); supersedes the per-year table in EK-0082**
- **evidence:** `outputs/backtest_reports/frozen_tree_per_year.md`; `data/loyo_frozen_per_year.json`
  (112 questions / 360 wines re-derived); alongside `era1_blind_backtest_2000_2010.md` (EK-0148) and
  `2026_tree_holdout.md` (EK-0150)
- **the problem this resolves:** two blind tests of the same frozen trees disagreed. EK-0148 scored
  **52% top-3** on 2000–2010 (396 wines) and concluded the trees "generalise worse than LOYO
  implies". EK-0150 scored **63.9%** on 2026 (36 wines). Both are honest; neither was comparable to
  the 89.2% LOYO headline, which used a different prediction pass entirely.
- **what closed it:** re-deriving all of 2015–2025 with the *same* fresh-agent method used for 2026 —
  frozen trees, stems only, `run_loyo.score_question`. Three numbers now sit on one scale:

  | corpus | seen by trees? | top-1 | top-3 | candidate-set |
  | --- | --- | --- | --- | --- |
  | 2015–2025 (n=360) | cited **verbatim**, 112/112 | 35.0% | **59.2%** | 80.0% |
  | 2026 (n=36) | never seen, contemporary | 36.1% | **63.9%** | 88.9% |
  | 2000–2010 (n=396, EK-0148) | never seen, 15–26 yrs older | 30% | **52%** | 69% |

- **claim:** **Being unseen costs nothing; being from a different era costs ~7pp.** A contemporary
  paper the trees have never met scores at or slightly above the years they quote by ID. Reach back
  to 2000–2010 and top-3 drops to 52%. The variable is **distribution shift, not novelty** — which is
  exactly what EK-0148's own mechanism finding predicts: **29% of Era-1 stems hit no branch at all**
  (P1 38%, P3 39%, P2 9%), and unrouted stems score far worse (20/41/58 vs 33/56/74). 2026's stems
  are modern, so they route; 2000-era constructions (vintage verticals, price ranking, OW-vs-NW grids)
  have no leaf to land on. The brittleness is in **Layer A stem-routing**, not in the wine knowledge.
- **what to expect, and what to stop quoting:** for a contemporary paper, **~60% top-3 variety,
  ~80–89% candidate-set, ~35% top-1**. Do **not** quote 72.8/89.2/95.6 (EK-0082) — no consistent
  re-measurement reproduces them; fresh application of the very same frozen trees to the very same
  years yields 59.2% top-3, not 89.2%. The 89.2% is an artifact of its prediction pass.
- **also settled — the exam is not getting harder.** Across 2015–2025 the per-year top-3 spread is
  50.0–72.2% with sd 6.6%, and 2015–2019 (mean 70.9% on the older pass) versus 2021–2025 (70.5%) is
  flat. Earlier claims of a downward trend were reading two data points of noise.
- **limitations:** the 2026 run used ~2.7 questions per agent versus ~11 for the per-year series, so
  2026 may have had more attention per question — the +4.7pp should not be read as the trees being
  *better* on unseen material, only as *not worse*. Agents also varied in how much of the tree they
  used; notably the strictest (2025, Layer A only, avoiding Layer B leaves that cite the question
  under test) scored **highest** at 72.2% top-3, so leakage did not obviously help. And "LOYO"
  remains a label, not a method, for 2015–2025: one tree artifact, nothing retrained per fold.

### EK-0151 · Real stems never mention bubbles — production asks say "method of production"
- **tier:** STRONG SIGNAL · **status:** live — enforced by validator R10 (`stem-discloses-discriminator`)
- **evidence:** 0/162 historical stems in `data/exams.json` contain "bubble", "sparkle", "fizz" or
  "mousse" in ANY construction (measured 2026-08-05); reviewer bin `gen_p3_F7_1785964017240`
  ("great question except for the 'how bubbles were created' — the exam would never ask that",
  `bank_bin_reasons`); `outputs/feedback_analyses/mike_bin_reasons_2026-08-05.md` Class 5
- **claim:** even on all-sparkling flights, the IMW asks *"comment on the method of production"* and
  expects the mechanism (second fermentation, tank vs bottle, tirage) to appear in the ANSWER. A
  stem that asks "how the bubbles were created" hands the candidate the analytical axis and reads
  as un-MW. The generation prompt now forbids it and validator R10 blocks it at draft time.

### EK-0152 · The exam never asks the candidate to cite a quality designation or a named mechanism pair
- **tier:** STRONG SIGNAL · **status:** live — enforced by validator R10
- **evidence:** reviewer bins `gen_p3_F4_1785964281304` ("exam would never ask 'official quality
  designation' - candidate would be expected to know and state this") and `gen_p3_F2_1785964017222`
  ("we wouldn't see question c on an exam, at best we would see 'discuss the role of yeast'" — the
  binned part c read "Comment on the role of autolysis and dosage"); corpus check: 0/162 historical
  stems ask to cite a quality designation (the sole "quality level" hit, 2023 P1 Q2, is "how these
  components contribute to its quality level" — a different construction), 0/162 name a mechanism
  pair in an ask
- **claim:** two ask-shapes mark a stem as machine-written: (1) *"citing any relevant official
  quality designation"* — stating the designation unprompted is part of what earns marks; (2)
  naming a mechanism **pair** (*"the role of autolysis and dosage"*, *"the relative roles of
  oxidation and biological ageing"*) — the exam asks for the method, or at most one topic ("the
  role of yeast"), and lets the candidate surface the mechanisms.

### EK-0153 · Curveball-heavy flights shift marks off identification
- **tier:** PLAUSIBLE (single expert reviewer; directionally consistent with corpus practice) · **status:** live in prompt guidance only — deliberately NOT a validator
- **evidence:** reviewer bins `gen_p3_F5_1785878179723` ("mostly curveballs… points weighted heavily
  against variety and country identification"), `gen_p2_F4_1785898861354` ("too many marks awarded
  for variety where the variety is more obscure"), `gen_p2_F4_1785955036866` ("a couple of
  curveballs so I would expect fewer marks (maybe 5) for variety and origin"),
  `gen_p3_F5_1785878565496` ("perhaps might not even ask for the variety at all");
  `outputs/feedback_analyses/mike_bin_reasons_2026-08-05.md` Class 6
- **claim:** when a flight is mostly obscure wines, the real exam drops identification to ~5-6 marks
  per wine (or skips the variety ask) and weights style/method/quality instead — the marks a strong
  candidate can still earn on an unfamiliar wine. **Not codable as a validator**: historical
  identification marks legitimately span 10-30 (EK-0154) and the curveball status of historical
  flights is unknowable, so any threshold would false-flag authentic distributions. Lives in the
  generation prompt's mark-emphasis guidance.

### EK-0154 · NEGATIVE results — two "unrealistic" patterns that are in fact exam-authentic
- **tier:** STRONG SIGNAL · **status:** live — recorded so these are never "fixed"
- **evidence:** `data/exams.json` measured 2026-08-05: (1) **15 historical P1/P2 stems** ask
  origin-identification with NO variety ask anywhere (2012 P1 Q3, 2013 P2 Q1, 2014 P1 Q1, 2015 P2
  Q1, 2016 P1 Q4, 2021 P2 Q1, 2022 P1 Q1, 2023 P2 Q1/Q2, 2024 P1 Q3, others); (2) same-variety
  flights award **10-30 marks** for the single shared variety ask — 20 marks appears six times
  (2011 P2 Q2/Q5, 2016 P1 Q3, 2018 P1 Q1, 2018 P2 Q3, 2022 P2 Q4), 24 (2014 P1 Q2) and 30
  (2021 P1 Q3) once each
- **claim:** despite individual reviewer objections (bins `gen_p2_F2_1785968458385` "this question
  would ask for variety identification"; `gen_p2_F1_1785894009350` wrong_marks on a 20-mark shared
  variety ask), **origin-only identification asks and 20-mark shared variety asks are authentic IMW
  patterns** and must not be flagged by any validator. A single expert's expectation lost to the
  corpus here; the corpus wins.
- **2026-08-07 — this entry was being violated in code.** A hard rule `missing-variety-id-part`
  (`partTaskRepertoireViolations`, seeded from bin `gen_p2_F2_1785968458385`) rejected any 2+-wine
  flight that asked for origin but never the grape variety. Re-measured against `data/exams.json` it
  fired on **27 of the 82 modern (2018–2026) real questions** and 21 of the 80 older ones — including
  2026 P2 Q3, 2025 P3 Q2, 2024 P1 Q3, 2023 P2 Q1 and 2022 P1 Q1, five of the last six exam years — and
  was quarantining **19 servable banked questions** (15 for that reason alone). **The arm is removed**;
  it was not demoted to soft, because a flag on a third of the real corpus is noise. Two of the 27 were
  a second bug: the variety-ask pattern demanded the literal "grape variet…", so real phrasings
  ("Identify the origin and variety/ies used", 2021 P1 Q1; "Name the dominant grape variety", 2017 P3
  Q4) read as absent — the pattern now accepts a bare "variety/varieties" and the verb "name".
  Lesson: an EK entry that says "must not be flagged" needs a test pinning it, or a later rule
  re-introduces the fault. `tests/question-validator.test.ts` now holds three real-paper fixtures.

### EK-0166 · Residual sugar is a Paper 3 device — P1/P2 pour sweet wines but never declare or mark them
- **tier:** STRONG SIGNAL · **status:** live — enforced by validator R11 (`sweetness-out-of-paper`, hard;
  `sweetness-reference-out-of-paper`, soft) and by the generation prompt's paper-scope block
- **evidence:** `data/exams.json` measured 2026-08-07 — **12 of 162** historical stems (2011–2026) name
  residual sugar or sweetness, and **all 12 are Paper 3** (2011 P3, 2012 P3, 2013 P3, 2014 P3, 2015 P3,
  2017 P3, 2019 P3, 2021 P3, 2022 P3, 2023 P3, 2024 P3, 2026 P3); **0 in Paper 1, 0 in Paper 2**. Yet
  `data/wines.json` holds **11 Paper 1 wines with residual sugar** — Coteaux du Layon Chaume (Domaine des
  Forges), Eitelsbacher Karthäuserhof Riesling Auslese, JJ Prüm and Dr. Loosen Kabinetts, Huet Vouvray
  Clos du Bourg Demi-Sec, Rolly Gassmann Pinot Gris Vendanges Tardives. Feedback `feedback_analyses` id 65
  / attempt 394 (2026-08-07, user 1) on `gen_p1_F6_1779997829060`: *"I don't think that this is a great
  paper one question because both wines have residual sugar and there's kind of a contrast on how the
  residual sugar was achieved… historically what we would see on a paper one question is a flight that
  had a wine, or even two wines, that had some residual sugar in it. The question would be broader."*
- **claim:** the exam happily puts an off-dry or sweet wine in a Paper 1 flight — **noticing** it is the
  candidate's job. What is Paper 3's alone is *declaring* it in the stem ("Wines 8–12 all have residual
  sugar"), *marking the mechanism* (botrytis vs late harvest vs arrested fermentation) and the analytic
  *readout* ("state the residual sugar in g/L", the corpus's only 2-mark ask). A P1/P2 stem that does any
  of those is mis-papered even when every wine genuinely is sweet. Generation rule: put the sweet wine in
  the flight, then ask the paper's own question (variety/origin, style, winemaking, quality, maturity,
  commercial position).
- **why the existing rule missed it:** `STEM_PREDICATE_MISMATCH` (from fb_89, on this same
  Savennières) already catches the *factual* half — a bone-dry wine keyed under "both wines have residual
  sugar" — but it needs a resolved RS value or a dry style tag on the answer key, and P1/P2 keys carry
  neither. So the defect recurred on the identical question, served 3 times. R11 reads the stem SHAPE and
  needs no key data. Measured blast radius at introduction: **3 hard** (1 servable: the reported question;
  2 unserved) and **2 soft** across 778 banked questions; **0 in Paper 2**, and Paper 3's 79 RS questions
  untouched.
