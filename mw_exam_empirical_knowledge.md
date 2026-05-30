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
- **2026-05-30 — Seed.** Created from `outputs/heuristics/*`, `outputs/master_trees/*`,
  `outputs/backtest_reports/*`, `study-app/src/lib/question-validator.ts`,
  `question_quality_remediation_plan.md`, and a full read of the feedback ledger (26 items:
  ~18 accepts, 2 partials, rest rejected). EK-0001 … EK-0072.

---

## §1 · Overall exam structure & creation

### EK-0001 · Three papers, twelve wines each, ~25 marks per wine
- **tier:** STRONG SIGNAL · **status:** live
- **evidence:** CLAUDE.md; `outputs/heuristics/examiner_patterns.md` §2.5; ledger: attempt #96 (accept)
- **claim:** The practical is three blind-tasting papers. **P1 = white still**, **P2 = red still**,
  **P3 = mixed** (sparkling, fortified, sweet, rosé, oxidative, occasionally orange/unusual). Each
  paper presents **12 wines**. Mark allocation is **exactly 25 marks per wine, universally** — a
  2-wine question = 50, 3-wine = 75, 4-wine = 100, etc. (corpus: zero exceptions across 2014–2025).

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
  Mark allocation trend: ID **46%→39%** (2022→2023), Quality **22%→37%**. Model ID at ~35–45% of a
  question's marks; quality/maturity/winemaking/commercial collectively 55–65%.

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
- **evidence:** ledger: attempt #96 (accept); see EK-0001
- **claim:** Generation must allocate exactly 25 marks per wine. A 2-wine/70-mark question (35/wine)
  is invalid and would never occur on the real exam.

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

---

## §6 · Question-generation learnings from feedback (the living ledger)

This section is the audit trail of every resolved feedback item and what it taught us. New rows are
appended by the incremental sync when feedback resolves. Durable rules derived here are also written
into §2–§5 / §7 (cross-referenced by EK id). Maps to Neon `user_attempts` / `feedback_analyses`.

| attempt | analysis | paper/family | verdict | decided | what it taught | EK refs |
|---|---|---|---|---|---|---|
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

---

## §8 · Cross-reference index (authoritative artifacts)

This document is a synthesis layer. The deep artifacts it draws on (do not duplicate — cite/link):

- **Master decision trees (the candidate's exam strategy):** `outputs/master_trees/p1_whites_tree.md`,
  `p2_reds_tree.md`, `p3_special_tree.md` (Layer A stem routing → Layer B sensory; P3 adds Layer A.5
  visual triage), plus per-family packs `p{1,2,3}_family_tree_pack.md`.
- **Examiner heuristics:** `outputs/heuristics/examiner_patterns.md` (30 patterns),
  `examiner_report_synthesis.md` (7 Cardinal Rules), `question_taxonomy.md` (F1–F8),
  `curveball_analysis.md`, `quality_price_tier_analysis.md`, `question_wine_composition_analysis.md`,
  `family_matrix_templates.md`.
- **Per-question analysis:** `outputs/decision_matrices/` (112 stem-only) and
  `outputs/decision_matrices_v2/` (112 tree-aware). Training input — not study material.
- **Validation/accuracy:** `outputs/backtest_reports/loyo_postfix_audit.md` (post-fix LOYO: **72.8%
  top-1 variety, 89.2% top-3, 95.6% candidate-set**).
- **Answer-writing rules:** `docs/mw_write_pipeline_guidance.md`. **Methodology:** `docs/methodology.md`.
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

### EK-0070 · Mark distribution by family is assumed, not measured
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
</content>
