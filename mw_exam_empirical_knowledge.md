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
  attempt #138 (accept); user domain expertise (MW candidate, 2026-05-30) for the pre-2013 boundary
- **claim:** The practical is three blind-tasting papers. **P1 = white still**, **P2 = red still**,
  **P3 = mixed** (sparkling, fortified, sweet, rosé, oxidative, occasionally orange/unusual). Each
  paper presents **12 wines**. Mark allocation is **exactly 25 marks per wine, universally** — a
  2-wine question = 50, 3-wine = 75, 4-wine = 100, etc. This exact-25 scheme is a hallmark of the
  **modern exam (~2013 onward)**: **zero exceptions across the verified 2014–2025 corpus**. Pre-2013
  papers did **not** use a uniform 25-marks-per-wine allocation — so treat exactly-25/wine as a truth
  of the *current* exam, not of all IMW history (cf. EK-0004, the exam evolves). It is now enforced as
  a hard validator rule (see EK-0041), because it is easy for a generator to get wrong.

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
  wines and the highest pass rate; P3 is the most stylistically diverse and the usual decider.

---

## §2 · Examiner mindset & grading philosophy

> Source: `outputs/heuristics/examiner_report_synthesis.md` (8 practical + 5 chief examiner reports,
> 2017–2025). "Taste like a detective; argue like a lawyer." (2019)

### EK-0006 · The exam is "a theory exam with a tasting"
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** examiner_report_synthesis §1 (2024 quote); §1 mark-allocation table
- **claim:** Identification is being de-emphasized in favour of analytical competencies.
  Mark allocation trend: ID **46%→39%** (2022→2023), Quality **22%→37%**. NB these are **paper-wide
  averages, not a per-question rule** — any single question allocates whatever it prints, and the
  spread is wide (e.g. 2023 P1 Q1: variety ID 20/100, winemaking 30, quality+ageing 50). Use the
  paper-wide ~35–45% ID figure only to *distribute* marks across a generated paper; grade and answer
  to the **printed per-question tariff**. See EK-0089.

### EK-0007 · Cardinal Rule 1 — Reasoning > Identification
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** examiner_report_synthesis §2.1 (every report 2017–2025)
- **claim:** Sound reasoning earns marks even when the conclusion is wrong. "Over half did not get a
  single origin exactly right, however many still managed 5–6/8 if their reasoning was sound" (2025).
  "A wrong answer yields more marks than an answer that is unfinished — so make a choice" (2021).

### EK-0008 · Cardinal Rule 2 — Quality must be contextualized
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** examiner_report_synthesis §2.2
- **claim:** "Good"/"very good" without context earns ~zero. Use official classification levels
  (Grand Cru Classé, Cru Bourgeois, DOCG, Prädikat, VORS), price points, and a quality ladder
  relative to origin/peers. Communicate "from an MW to an MW where on the quality scale this sits."

### EK-0009 · Cardinal Rule 3 — No shoehorning
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** examiner_report_synthesis §2.3
- **claim:** Do not decide identity first and bend tasting notes to fit. Read alcohol, acidity,
  tannin, RS accurately FIRST, then deduce. "A lot of shoehorning on paper two… led to the failure
  of many candidates" (2025).

### EK-0010 · Cardinal Rule 4 — Answer the question as asked
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** examiner_report_synthesis §2.4
- **claim:** Candidates routinely answer the question they prepared for, miss sub-parts
  ("opportunities AND challenges"), waste time on un-asked aspects, and confuse "compare and contrast"
  with "describe each separately." Flagged in every report.

### EK-0011 · Cardinal Rule 5 — Maturity has four required elements
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** examiner_report_synthesis §2.5 (2023 definition)
- **claim:** A maturity assessment must state (1) current age, (2) ready now or benefits from ageing,
  (3) how long it will improve, (4) how long it will hold before declining. Vague "matured for many
  years" earns minimal marks; specific timeframes expected.

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
- **evidence:** examiner_report_synthesis §3
- **claim:** Endorsed by name in every report since 2017: consider all glass evidence → list 2–3
  options → argue for/against each → narrow with reasoning → state the conclusion clearly (ideally up
  top). Reward enthusiasm/conviction; reward cross-referencing wines within a flight to unlock each
  other; reward honest engagement with unidentifiable wines.

### EK-0015 · "Howler" theory errors sink borderline papers
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** examiner_report_synthesis §4
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

### EK-0091 · Internal-consistency / cascade error (the most-penalized 2021–2025 failure mode)
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** grading_gap_analysis §2 P1 (2021, 2022)
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
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** grading_gap_analysis §4 (2018, 2021, 2024)
- **claim:** Pass is an **absolute 65%** per paper, not a curve; anchor verdicts to marks (F<50,
  BORDERLINE ~55–64, PASS ≥65; sub-45% does not recover). A pass needs mastery across **four
  dimensions** — structural reading, communication, theory accuracy, quality judgement (2024); a spike
  in one can't rescue a hole in another. **Howler override:** if the aggregate lands at BORDERLINE and a
  clear theory howler is present (EK-0015), resolve to FAIL and name it — examiners withhold the benefit
  of the doubt from a borderline candidate making obvious theory mistakes (2024).

### EK-0094 · Top-band differentiator — "under the skin of the wine"
- **tier:** PLAUSIBLE · **status:** live
- **evidence:** grading_gap_analysis §2 P3 (2022, 2025)
- **claim:** Reserve the highest marks for engaged, specific, second-order insight — e.g. reasoning that
  an exceptional producer exceeds a classification's minimum sugar requirement (2025) — i.e. getting
  "under the skin of the wine" (2022). Genuine enthusiasm conveyed in the writing is rewarded; flat,
  formulaic prose on a great wine is not. Use this to separate a *good* answer from an *outstanding* one.

---

## §4 · Wine selection & distribution by paper

### EK-0023 · Curveball distribution: 6.2% high / 17.9% medium / 75.9% low
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** `outputs/heuristics/curveball_analysis.md` (504 wines, 2011–2025)
- **claim:** Of all exam wines, **6.2% are high curveball, 17.9% medium, 75.9% low** (standard/expected).
  Four curveball types: Rare Variety (~35%), Rare Style (~30%), Unexpected Origin (~20%), Hidden
  Identity (~15%).

### EK-0024 · The "1 in 4" rule — one curveball, the rest anchors
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** `outputs/heuristics/curveball_analysis.md` (Examiner Deployment Patterns)
- **claim:** In a multi-wine question, typically **exactly one** wine is significantly harder; the
  rest are anchors. Ratios: 2-wine ≈ 1 curveball + 1 anchor (50%), 3-wine ~33%, 4-wine ~25% (modal
  format). Curveballs are **never random** — each serves a pedagogical purpose, and ID marks on it are
  downweighted in favour of style/winemaking/quality/commercial.

### EK-0025 · Curveballs concentrate in P3 and in the final question of P1/P2
- **tier:** STRONG SIGNAL · **status:** live
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
  reputation, not observable evidence).

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

### EK-0035 · P3 Q1 is usually sparkling; recent years specify "not Champagne"
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** `outputs/heuristics/examiner_patterns.md` §4.1; `outputs/backtest_reports/loyo_postfix_audit.md`
- **claim:** P3 opens with sparkling (or a category including sparkling) in 7/10 years; in the **last
  4 years (2021–2024) P3 Q1 was explicitly sparkling every time**, increasingly "not Champagne."
  Prepare Cava, Crémant, English sparkling, Franciacorta, California sparkling, Sekt, Prosecco Superiore.

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
- **evidence:** ledger: attempt #73 (accept) — flight-size distribution constraints
- **claim:** Generation was over-producing 4-wine flights. The real exam uses pairs and 3-wine flights
  frequently, occasionally a single wine, and sometimes a 4-wine flight presented as **two pairs**
  (often to compare quality and/or winemaking, e.g. 1er Cru Burgundy vs Bourgogne, or Vin Jaune vs
  Savagnin). Sample flight size from the historical distribution rather than defaulting to four.

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

---

## §10 · Validation, backtesting & known model limits

> How we proved the trees work, and where they still fail. Source: `outputs/backtest_reports/`.
> See §0.5 stage 7 for where this sits in the pipeline.

### EK-0082 · LOYO backtesting — method and result (pre-fix → post-fix)
- **tier:** PROCESS · **status:** live
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
- **tier:** PLAUSIBLE · **status:** live
- **evidence:** `outputs/backtest_reports/exam_predictor_backtest.md`; `data/predicted_2026_exam_profile.json`
- **claim:** Beyond per-wine ID, a sequence-aware 5-layer model predicts the **structure** of an
  upcoming paper (question count, family archetype per question, slot-level variety/country/style),
  backtested 2022–2025. It predicts the **exact question-count per paper correctly in every paper-year
  (12/12)**; top-3 hit rates: style 97.6%, question-role 92.9%, country 81.0%, variety 59.5%; structure
  mean-F1 0.499. **P2 structure is the hardest to predict.** It is explicitly *"a steering layer, not an
  oracle"* — useful for biasing mock-exam generation toward likely shapes, not for guaranteeing content.
</content>
