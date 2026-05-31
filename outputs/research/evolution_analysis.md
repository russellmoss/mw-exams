# MW Practical Exam — Evolution Analysis (2011–2025)

**Mandate:** identify how the IMW practical exam has *changed* across three eras, and audit
`mw_exam_empirical_knowledge.md` (EK) for entries that underweight recent trends, overweight older
data, or are simply wrong. Per the brief, a finding that **disproves** a current EK entry is treated
as more valuable than one that confirms it.

**Primary source:** `data/exams.json` — verbatim question text (with inline mark tariffs) and wine
lists for all 14 sat years. This is read directly, not via the pre-existing `outputs/heuristics/*`
synthesis, precisely so the synthesis can be challenged rather than echoed.

**Eras (as specified):**
- **Era 1 — 2011–2014** (4 sittings)
- **Era 2 — 2015–2019** (5 sittings)
- **Era 3 — 2021–2025** (5 sittings; 2020 cancelled)

---

## 0 · Data-quality caveats (read first — they bound every claim below)

1. **2011 Paper 3 has no question text** (`"questions": []` in `exams.json`; wines only). So Era 1
   question-style / mark-allocation analysis rests on **11 papers, not 12**. Any "Era 1 P3" statement
   is inferred from wines + the 2012–2014 P3 pattern, and flagged as such.
2. **The EK's quantitative backbone excludes Era 1.** EK-0096…EK-0102 (curveball position, post-2014
   mark redistribution, OW:NW band, age/price signatures, single-country ceiling) are all computed on
   the **"last-10" 2015–2025 structured corpus**. They are, by construction, blind to 2011–2014 — so
   they *cannot* describe the evolution this report is about. EK-0023 (curveball) and EK-0027 (price)
   do use the wider 2011–2025 504-wine set; the rest do not. This is itself an audit finding (§Audit).
3. **Mark tariffs were summed manually**, not by script. The per-wine multiplier is implicit in
   "For each wine:" scoping and the 2012–2014 papers use an escaped `(N\)` notation that defeats naive
   parsing; arithmetic is shown inline where it matters.

---

## 1 · Era-by-era analysis (8 dimensions × 3 eras)

### 1.1 Question styles

| | Era 1 (2011–14) | Era 2 (2015–19) | Era 3 (2021–25) |
|---|---|---|---|
| **Dominant framings** | "same region, diff varieties"; "same variety, diff countries"; "mixed bag, 6 wines, diff country+variety" (2011 P1 Q3); pair-based "compare & contrast quality and style, with reference to winemaking" (2013 P1 — **all five** questions) | "same single grape variety" flights; "classic Western European origins" (2018 P2 Q1); "Europe but not France/Italy/Spain" (2012 already, again 2019 P2 Q3); first abstractions: "**sense of place**" (2017 P1 Q4), single-wine "consider … of unknown origin" (2017 P3 Q2 Amber) | fewer/larger flights; producer **verticals** (2021 P2 Q1 three Ducru vintages; 2022 P1 Q1 same producer); blend-**purpose** logic (2022 P2 Q1 "purpose of blending … reasons for not blending"); abstract essays (2025 P1 Q4 "human inputs vs natural factors") |
| **Compare & contrast** | **Heavy** (2013 is a pair-and-C&C year) | Moderate | **Heavy again** (2021–25, most papers). C&C is *cyclical*, not new. |
| **Questions/paper** | avg **3.7** (2011 P1=3/P2=5; 2013 P1=5) | avg **3.9**, **peak 2016–17** (2017 P3 = **6** questions, the corpus max) | avg **3.5**, settled at 3–4 |

**Read:** the arc is fragmentation → peak fragmentation (2016–17) → consolidation into fewer, larger,
more analytical questions (2021–25). Era 3's signature device is the **conceptual/abstract stem**
(sense-of-place → human-vs-nature → "wine globally") layered onto larger flights.

### 1.2 Mark allocation

- **25 marks/wine is universal across the *entire* corpus, 2011 included** — not a "modern" boundary.
  Manual sums: 2011 P1 Q1 = 15 + (3×15) + (3×5) = **75 = 25×3**; 2011 P2 Q2 = 20 + (2×5) + (2×10) =
  **50 = 25×2**; 2012 P1 Q1 = (4×10)+(4×6)+(4×3)+(4×6) = **100 = 25×4**; 2012 P2 Q1 = (6×12)+(6×8)+(6×5)
  = **150 = 25×6**; 2013 P1 Q1 = (2×15)+20 = **50**; 2014 P1 Q1 = 16+(4×5)+(4×8)+(4×8) = **100**.
  → **EK-0001's pre-2013 boundary is contradicted** (see Audit).
- **Internal redistribution is the real change.** ID's share of the per-question tariff compressed:
  - Era 1 examples: 2011 P2 Q1 = country 15 / variety 30 / quality 30 → **ID 60%**; 2012 P2 Q1 → ID
    ~48%.
  - Era 3 examples: 2023 P1 Q1 = variety 20 / winemaking 30 / quality+ageing 50 → **ID 20%**; 2024 P3
    Q1 and 2025 P3 Q3 ask **no identification at all** (0% ID). 2024 P2 Q3 / 2025 P1 Q4 → ID ~40% with
    the balance on climate/style/quality.
- **Vintage as a paid line item shrank.** Era 1–2 paid real marks for vintage ID: 2012 P1 Q3 "identify
  the vintage (15)", 2014 P2 Q2 "identify the vintage giving reasons (4×8 = 32)". Era 3 folds vintage
  into a softer "identify the vintage and suggest an ideal drinking window" (2024 P2 Q2) and rarely
  pays for it standalone.

### 1.3 Wine selection

- **Commercial/cheap wines are present in every era** — not a recent democratisation. Era 1 already
  used Wolf Blass Yellow Label (2011), Fetzer (2011), Barefoot Moscato + Jacob's Creek Sparkling Shiraz
  + Beringer White Zinfandel (2012), "Simply Garnacha … for Tesco" (2014). Era 3 continues with Yellow
  Tail (2023, 2024) and Mateus Rosé (2023). EK-0031 is correct and the behaviour is *constant*, not
  emergent.
- **Indigenous / "boundary" varieties** thread through all eras: Torrontés (2011), Assyrtiko (2013),
  Rkatsiteli/Georgia (2014), Blaufränkisch (2016, 2019), Zweigelt (2012, 2025), Xinomavro (2025),
  Touriga Nacional as a varietal (2025). Greece, Georgia, Hungary, Austria recur throughout.
- **Skin-contact/"orange" wine is an Era-1/Era-2 phenomenon, not an Era-3 one.** Pheasant's Tears
  Rkatsiteli (2014 P3), Cullen 'Amber' (2017 P3 Q2), Chinuri/Iago (2019 P1), Vecchio Samperi (2019 P1).
  **No clear skin-contact/qvevri wine appears 2021–2025** in the corpus. (Oxidative/flor styles — Jura,
  oxidative white Rioja, Sherry — *do* persist.) This is a caution against treating "orange wine" as a
  growing/future theme; the data says it *peaked* 2014–2019.
- **Producer verticals/horizontals grew** as a selection device: Roederer pair (2012), Lynch-Bages /
  Nenin across vintages (2014 P2 Q2), Dom Pérignon + Coutet + Taylor's pairs (2018 P3 Q1), Ducru
  three-vintage vertical (2021 P2 Q1), same-producer Meursault/Corton (2022 P1 Q1), Rieussec trio
  (2024 P3 Q3). Era 3 leans on "same producer, read the variable" more than Era 1 did.

### 1.4 Quality assessment

- Era 1: "comment on **the level of quality**" — often a standalone, lightly-contextualised line
  (2011 P1 Q3 "comment on the level of quality 6×10").
- Era 2: hardens into "quality **within the context of the region of origin**" as the default; "quality
  in an **international** context" appears early (2013 P2 Q2).
- Era 3: escalates to "quality within the context of **wine globally**" (2024 P2-style, 2025 P2 Q3) and
  "quality … with **specific reference to its classification**" (2025 P3 Q3). The reference frame moved
  **region → world**, and quality became explicitly **classification-anchored**.

### 1.5 Commercial assessment

A clear three-step maturation:
- Era 1 — **"appeal"**: "to whom is this wine most likely to appeal, and why?" (2012 P3 Q2);
  "characteristics … to a potential customer" (2014 P1 Q3).
- Era 2 — **"selling"**: "key selling points" (2016 P2 Q2), "how would you sell this wine to a potential
  customer?" (2016 P2 Q5), "in which area of the trade would this wine be most successful?" (2017 P1
  Q3), "market positioning" (2017 P3 Q1 rosés).
- Era 3 — **"strategic positioning"**: "market position" (2021, recurring), "consumer appeal" (2021,
  2024), and the dual-pole "commercial **opportunities and challenges**" (2024 P3 Q1, 2024 P3 Q3).

Commercial also rose in **weight and frequency** (EK-0098): from a sometimes-absent line in Era 1 to a
near-ubiquitous, often multi-question feature in Era 3.

### 1.6 Identification demands

- **Net ID marks fell** (§1.2) **but ID precision rose where it is still asked.** 2022 P2 Q2/Q3 demand
  the **sub-region** ("same region but different sub-regions … identify the sub-region as closely as
  possible" — Chianti Classico vs Brunello; Hautes-Côtes-de-Beaune vs Clos Vougeot).
- **ID-suppression emerged and then hardened into ID-free questions:**
  - 2017 P3 Q2 — single Amber wine, "consider … of unknown origin" (no origin ID).
  - 2019 P1 Q3 — "**Do not spend time thinking about the wine's specific origin**" (explicit
    suppression).
  - 2024 P3 Q1 & 2025 P3 Q3 — **zero ID marks**: pure quality / winemaking / style / commercial.
  This arc is the single clearest structural evidence for EK-0006 ("a theory exam with a tasting").

### 1.7 Examiner language

- Era 1: concrete and procedural — "Identify … as closely as possible", "Discuss how the wine has been
  made", "Comment on the level of quality".
- Era 2: introduces **conceptual** language — "sense of place" (2017), "retain the wine's sense of
  place", "key winemaking techniques used **to arrive at this style**" (a 2016 refrain).
- Era 3: **abstract / discursive** — "the relative importance of **human inputs versus natural
  factors**" (2025 P1 Q4), "how **climate** and winemaking techniques have influenced the quality and
  style" (2024 P2, 2025 P2 — verbatim repeat), "in the context of **wine globally**" (2024, 2025),
  "opportunities **and** challenges" (2024). Stems read more like short-essay prompts.

### 1.8 Chief-examiner priorities (inferred from stems + EK §2/§3 report synthesis)

- Era 1: candidate must **identify and rank** — origin, variety, vintage, quality level.
- Era 2: candidate must **explain winemaking-to-style** and **sell** the wine; reasoning begins to
  outrank the bare call (EK-0007).
- Era 3: candidate must **reason about forces** (climate, human-vs-nature, global quality position) and
  **position commercially with nuance** (opportunities and challenges). The examiner increasingly wants
  a market-aware, climate-aware analyst, not a label-guesser.

---

## 2 · The determinations the brief asks for

**What disappeared / strongly diminished**
- **Vintage ID as a paid standalone task** (Era-1 15–32 mark lines → folded into "drinking window").
- **Skin-contact / qvevri "orange" wine** — present 2014–2019, **absent 2021–2025** in the corpus.
- **Highly fragmented papers** (the 2016–17 five-/six-question paper; 2017 P3's six questions is the
  high-water mark and was not repeated).
- The lightly-contextualised **"comment on the level of quality"** line (now always frame-anchored).

**What increased**
- **Commercial weighting and sophistication** (appeal → selling → opportunities-and-challenges).
- **Style as a separately-weighted dimension** and its bundling with commercial/winemaking.
- **Compare-and-contrast** marks (Era-1 2013 spike, then strong return 2021–25).
- **Producer verticals/horizontals** as a selection device.
- **ID *precision* where ID survives** (sub-region asks, 2022).

**What emerged (new framings, with first appearances)**
- **"Sense of place"** (2017 P1 Q4) — first conceptual abstraction.
- **Explicit ID-suppression** ("do not spend time on origin", 2019 P1 Q3) → **fully ID-free questions**
  (2024 P3 Q1, 2025 P3 Q3).
- **Blend-purpose reasoning** ("purpose of blending … reasons for not blending", 2022 P2 Q1).
- **Texture/acidity → quality component analysis** (2023 P1 Q2).
- **Climate named as an examinable driver** (2024 P2, 2025 P2 — same stem two years running).
- **"Quality in the context of wine globally"** (2024–2025).
- **"Commercial opportunities and challenges"** dual framing (2024).
- **"Human inputs versus natural factors"** essay framing (2025 P1 Q4).

**What became less important**
- Pinpoint **origin/variety identification** as the scoring centre of gravity.
- **Vintage** identification.
- Pure breadth "mixed bag" as a *share* of the paper (still present — 2025 P3 Q3 — but fewer, larger
  questions overall).

**What became more important**
- **Reasoning over conclusion** (EK-0007), now structurally enforced by ID-light/ID-free questions.
- **Commercial + style + maturity** (EK-0098's redistribution direction is corpus-supported).
- **Climate literacy** and **global quality calibration**.
- **Classification fluency** ("with specific reference to its classification", 2025).

**Themes that first appeared after 2020**
- Climate-as-driver stems (2024, 2025); human-vs-nature (2025); "wine globally" quality frame
  (2024–25); opportunities-and-challenges commercial (2024); classification-anchored quality (2025);
  blend-purpose logic (2022); textural-component-to-quality (2023). Producer verticals, while seen
  earlier, became a *routine* P1/P2 device post-2020.

**Themes clearly growing**
- Commercial-strategic framing; climate; global (vs regional) quality calibration; conceptual essay
  stems; ID-light flights; producer-vertical comparisons.

**Themes likely to dominate the next ~5 years** (directional — small-n; treat as hypotheses)
- **Climate change as a standing axis** ("how climate and winemaking … influenced quality and style"
  appeared in *both* 2024 and 2025 — the strongest forward signal in the corpus).
- **Global quality calibration** ("in the context of wine globally").
- **Commercial opportunities-and-challenges** as the default commercial verb.
- **Conceptual/abstract stems** (human-vs-nature, sense-of-place lineage) replacing rote ID.
- **Style convergence** reasoning (New/Old World boundaries blurring → the candidate must argue style,
  not geography).
- *Counter-signal to resist:* "orange/natural wine will surge." The corpus does **not** support it —
  skin-contact peaked 2014–2019. Oxidative/flor styles persist; skin-contact does not.

---

# Evolution Timeline

- **2011** — Classic ID-and-rank exam. Heavy ID share (~50–60% of tariff). Vintage paid. P3 question
  text not in corpus. 25/wine already in force.
- **2012** — 6-wine breadth flights ("Bordeaux varieties from 6 countries"). Commercial appears as
  "to whom would this appeal" (P3 Q2). Sweet/cheap wines freely used (Barefoot, Jacob's Creek).
- **2013** — Pair-and-**compare-and-contrast** year (P1 = five C&C pairs). "Quality in an international
  context" (P2). Icewine/Tokaji/Vin Santo sweet breadth (P3 Q3, "none fortified", RS+ABV stated).
- **2014** — First **skin-contact** wine (Rkatsiteli/Georgia). Vintage ID worth 32 marks (P2 Q2). Tesco
  own-label wine. Consolidation toward 3–4 questions.
- **2015–2016** — "Arrive at this style", "key selling points", "how would you sell this wine". Yeast-
  themed P3 (2015 Q1). Question counts swell.
- **2017** — **Peak fragmentation** (P3 = 6 questions). First conceptual abstraction (**"sense of
  place"**) and first **ID-free single wine** (Amber, "unknown origin"). Rosé flight as P3 Q1.
- **2018** — Producer pairs across vintages (Dom Pérignon, Coutet, Taylor's). "Classic Western European
  origins."
- **2019** — Explicit **ID-suppression** ("do not spend time on the wine's specific origin"). Georgian
  orange (Chinuri) + oxidative Sicilian (Vecchio Samperi) in **P1**. Moscato d'Asti (frizzante, sweet)
  in P1 (boundary-push).
- **2020** — Cancelled.
- **2021** — Producer **vertical** (Ducru ×3 vintages). "Market position", "ideal drinking window".
- **2022** — **Blend-purpose** reasoning (why/why-not blend). **Sub-region** ID demand. Sparkling-rosé
  P3 opener.
- **2023** — **Texture/acidity → quality** component analysis (P1 Q2). Yellow Tail + Mateus. Traditional-
  method-not-Champagne sparkling.
- **2024** — **Climate** named as a driver (P2 Q3). Commercial **"opportunities and challenges"** (P3).
  Fully **ID-free** sparkling question (P3 Q1). "Wine globally."
- **2025** — **Human-inputs-vs-natural-factors** essay (P1 Q4). Climate stem repeated (P2 Q1). Quality
  "in the context of wine globally" (P2 Q3) and "with specific reference to its classification" (P3 Q3,
  ID-free). **P3 Q1 was a Riesling variety flight, *not* sparkling** — breaking the 2021–24 sparkling-
  opener streak.

---

# Structural Changes

1. **Questions per paper:** fragmented (3.7) → peaked 2016–17 (3.9, with 2017 P3 = 6) → consolidated
   (3.5, all 3–4). Fewer, larger, more analytical flights. *(Confirms EK-0002; adds the precise peak.)*
2. **Mark architecture:** 25/wine is **invariant across all 14 years** (not a post-2013 innovation).
   What changed is the *internal* split, not the per-wine total.
3. **ID's tariff share fell** from ~50–60% (Era 1) to 20–40% (Era 3), with the **emergence of 0%-ID
   questions** (2024 P3 Q1, 2025 P3 Q3).
4. **Flight construction:** rise of producer verticals/horizontals and "same region, different
   sub-region" pairs; "mixed bag" survives but as fewer, larger flights.
5. **Sequencing priors are softer than the EK implies:** the P3 sparkling-opener streak (2021–24)
   **broke in 2025**; Moscato d'Asti landed in P1 (2019). Position rules are tendencies, not laws.

---

# Philosophical Changes

1. **From identification to interpretation.** The exam's centre of gravity moved from "what is it?" to
   "what forces shaped it, where does it sit globally, and how would you sell it?" The ID-suppression →
   ID-free arc (2017 → 2019 → 2024–25) is the structural proof. *(Strongly supports EK-0006/EK-0007.)*
2. **From region to world.** Quality calibration moved from "within the region of origin" to "in the
   context of wine globally" — the candidate must hold a single world quality scale.
3. **From appeal to strategy.** Commercial evolved from "who would like this" to "opportunities and
   challenges" — an MBA-style positioning task, weighted ~3× heavier than in Era 1 (EK-0098 direction
   confirmed).
4. **From geography to style.** As New/Old World styles converge (and climate shifts expression),
   stems increasingly ask the candidate to *argue style and its drivers* rather than pin a map point.
5. **The exam became reflexive/conceptual.** "Sense of place" (2017), "human inputs vs natural factors"
   (2025) ask the candidate to reason about winemaking philosophy itself — a register absent in Era 1.

---

# Assessment Changes

1. **Reasoning > conclusion is now structural, not just a grading note.** Era-3 ID-light/ID-free
   questions make it impossible to pass on label-recognition; this operationalises EK-0007/EK-0016.
2. **Quality must be classification- and globally-anchored** (2025 P3 Q3; "wine globally"). Extends
   EK-0008 — the *frame* widened from regional to global.
3. **Commercial is graded on strategic nuance** (opportunities *and* challenges, channel, market) —
   EK-0012, with the dual-pole verb now explicit.
4. **Climate reasoning is assessable** (cool-vs-warm expression, vintage conditions) — not yet captured
   as an EK grading expectation.
5. **Maturity and style each carry materially more marks than in Era 1** (EK-0098 direction holds in raw
   stems).

---

# Future Direction

**Most likely (corpus gives a repeated signal):**
- **Climate-as-driver stems become standing furniture.** The identical "how climate and winemaking
  techniques have influenced the quality and style" stem in **both 2024 and 2025** is the clearest
  forward indicator in 14 years of data.
- **Global quality calibration** ("in the context of wine globally") and **classification-anchored
  quality** persist and spread across papers.
- **Commercial "opportunities and challenges"** becomes the default commercial framing.
- **Conceptual/abstract essay stems** (human-vs-nature lineage) recur — expect ~one per year, usually
  P1 Q4 or a P3 anchor.
- **ID-light/ID-free flights** continue, especially in P3 and in final questions.

**Plausible:**
- More **producer verticals** (read the variable: vintage, site, élevage).
- **Style-convergence** framing (argue style across OW/NW rather than identify origin).
- Continued **sub-region precision** where ID is asked.

**Explicitly *not* well-supported (resist the temptation):**
- A surge in **orange/skin-contact** wine — it *receded* after 2019.
- Building **position-based logic** on the "P3 opens sparkling" or "curveball in the last question"
  priors — 2025 broke the former; the latter is already superseded (EK-0096).

---

# Audit of `mw_exam_empirical_knowledge.md`

Falsification-first. Each item: the entry, the corpus evidence against/around it, and the verdict.

### A. Entries that are WRONG or contradicted by the corpus

**EK-0001 — "Pre-2013 papers did NOT use a uniform 25-marks-per-wine allocation."**
- **Contradicted.** Manual mark sums for 2011, 2012, 2013, 2014 all equal exactly 25 × wine-count
  (2011 P1 Q1 = 75/3w; 2011 P2 Q2 = 50/2w; 2012 P1 Q1 = 100/4w; 2012 P2 Q1 = 150/6w; 2013 P1 Q1 = 50/2w;
  2014 P1 Q1 = 100/4w). The boundary is sourced to "user domain expertise," not the corpus, and the
  corpus (which starts at 2011) refutes it.
- **Verdict: REVISE.** Either the boundary refers to **pre-2011** papers outside the corpus (then say
  so and stop implying 2011–2012 differ), or drop the boundary. Restate 25/wine as **invariant across
  the entire available corpus, 2011–2025**. *(Note: this strengthens, not weakens, the 25/wine rule.)*

**EK-0035 — "in the last 4 years (2021–2024) P3 Q1 was explicitly sparkling every time."**
- **Stale / now false.** **2025 P3 Q1 is a Riesling variety flight** (Dr. Loosen Sekt + Framingham
  still + Dr. Loosen BA) — sparkling appears only as one of three wines; the question's organising
  logic is *variety*, not *sparkling*. The streak broke in the very next sitting after the entry's
  window.
- **Verdict: REVISE** — update through 2025; recast as "P3 *usually* opens sparkling (and increasingly
  'not Champagne'), but the opener is a tendency, not a lock (2025 opened on a same-variety Riesling
  flight)."

### B. Entries that underweight recent trends or miss the *evolution*

**EK-0078 — "Vintage explicitly asked in only ~4–5 questions in 10 years; do not over-weight vintage."**
- **Incomplete (era-blind).** True for 2015–2025, but vintage ID was a **materially larger, paid task in
  Era 1–2** (2012 P1 Q3 = 15 marks; 2014 P2 Q2 = 32 marks; 2015 P1 Q1, 2016 P2 Q3 also paid). Vintage is
  not statically rare — it **declined**. Framing it as a flat low-frequency fact hides a real trend.
- **Verdict: REVISE** to note the decline (Era 1–2 paid standalone vintage ID; Era 3 folds it into
  "drinking window").

**EK-0020 / EK-0049 — "Style is a *relatively new* addition driven by style convergence."**
- **Imprecise.** "Quality and style" language is present throughout Era 1 (2011 P2 Q5; 2013 P1 ×5). What
  is genuinely newer is style as a **separately-weighted, bundled-with-commercial** dimension and the
  ~doubling of its mark share (EK-0098). 
- **Verdict: minor REVISE** — "style language is long-standing; its *weight and bundling* grew."

**EK-0006 / EK-0007 / EK-0016 — the "theory exam with a tasting" / reasoning-over-ID thesis.**
- **Under-evidenced from structure.** These cite examiner *reports* but not the strongest structural
  proof in the data: the **ID-suppression → ID-free arc** (2017 P3 Q2 "unknown origin" → 2019 P1 Q3 "do
  not spend time on origin" → 2024 P3 Q1 / 2025 P3 Q3 with **zero ID marks**).
- **Verdict: STRENGTHEN** with this corpus arc (see proposed EK-0104).

### C. Entries that overweight older / synthesised data, or need a scope label

**EK-0096…EK-0102 (the quantitative backbone).**
- **Scope caveat missing in spirit.** All are "last-10" (2015–2025) and **exclude 2011–2014**. They are
  fine *as last-10 facts* but are routinely read as timeless. For any *evolution* reasoning they are
  blind to a third of the corpus. (EK-0023 curveball and EK-0027 price *do* use 2011–2025 — keep that
  distinction visible.)
- **Verdict: ADD A STANDING NOTE** (proposed EK-0107) that distribution entries are last-10 unless
  stated, and that Era-1 (2011–2014) is uncharacterised quantitatively.

**EK-0046 — "Paper 1 almost never contains sparkling … occasional off-dry wine in P1 is fine."**
- **Slightly soft on the boundary.** **2019 P1 slot 8 = Moscato d'Asti (5.5%, frizzante, sweet)** — a
  *lightly sparkling, sweet* wine in Paper 1. The "off-dry is fine" caveat doesn't quite cover a
  frizzante sweet wine. It's a deliberate boundary-push curveball.
- **Verdict: minor REVISE** — acknowledge Moscato d'Asti (2019 P1) as the attested P1 frizzante/sweet
  edge case.

### D. Entries the corpus CONFIRMS (kept for balance — these survive falsification)

- **EK-0002** (fewer/larger; 2016–17 had 5–6) — confirmed; add that 2017 P3 = 6 is the corpus max and
  Era-3 settled at ~3.5/paper.
- **EK-0034** (Chardonnay in P1 every year) — confirmed across **all 14 years** (not just 10). Riesling
  in P1 is **12/14** (missing 2012, 2017) — slightly *more* reliable than the stated "8/10."
- **EK-0031** (mid-tier/commercial producers are normal) — confirmed and shown to be **constant across
  all eras** (Wolf Blass 2011 … Yellow Tail 2024), not a recent change.
- **EK-0098** (post-2014 redistribution: ID down, commercial/style/maturity up) — *direction* strongly
  confirmed by raw stems; the ID-free questions are the extreme of the trend it describes.

---

# Proposed EK additions and revisions (draft — for user review)

> Drafted in EK entry format. New IDs continue from the existing max (EK-0103).

### Revision to EK-0001 (status: revise)
> **claim (amended):** The practical is three blind-tasting papers (P1 white still, P2 red still, P3
> mixed). Each paper presents 12 wines, and mark allocation is **exactly 25 marks per wine — invariant
> across the entire available corpus, 2011–2025** (verified by manual tariff summation: e.g. 2011 P1 Q1
> 75/3w, 2012 P2 Q1 150/6w, 2014 P1 Q1 100/4w). **Supersedes the earlier "pre-2013 differed" boundary**,
> which was sourced to domain expertise and is contradicted by the 2011–2014 structured data; if a
> non-25/wine regime existed it is **pre-2011** and outside the corpus. Still enforced as a hard rule
> (EK-0041).

### Revision to EK-0035 (status: revise)
> **claim (amended):** P3 *usually* opens with sparkling (or a category including it), increasingly
> specified "not Champagne" (2023, 2024). It is a **tendency, not a lock**: **2025 P3 Q1 opened on a
> same-variety Riesling flight** (Sekt + still + BA), breaking the 2021–24 sparkling-opener streak.
> Prepare Cava/Crémant/English/Franciacorta/Sekt/Prosecco, but do not build position logic on a
> guaranteed sparkling opener.

### Revision to EK-0078 (status: revise)
> **claim (amended):** Vintage ID is rarely the target on the **last-10** corpus (~4–5 questions), but
> this reflects a **decline, not a constant**: Era 1–2 paid real standalone marks for vintage (2012 P1
> Q3 = 15; 2014 P2 Q2 = 32; 2015 P1 Q1; 2016 P2 Q3). Era 3 folds vintage into "identify the vintage and
> suggest an ideal drinking window" (2024 P2 Q2). Treat vintage as a *diminished* axis, not a static one.

### Proposed EK-0104 · The ID-suppression → ID-free arc (structural proof of "theory exam with a tasting")
> - **tier:** STRONG SIGNAL · **status:** live
> - **evidence:** corpus — 2017 P3 Q2 (single Amber, "consider … of unknown origin"); 2019 P1 Q3 ("Do
>   not spend time thinking about the wine's specific origin"); 2024 P3 Q1 & 2025 P3 Q3 (0 ID marks)
> - **claim:** Identification's role has structurally contracted over time. The exam moved from
>   ID-bearing questions (Era 1, ID ~50–60% of tariff) through explicit **ID-suppression** (2017, 2019)
>   to **fully ID-free questions** (2024 P3 Q1, 2025 P3 Q3) that pay only for quality/winemaking/style/
>   commercial. This is the strongest structural evidence for EK-0006/EK-0007 and means a generator
>   should be willing to emit questions with **no variety/origin marks at all**, especially in P3 and in
>   final questions.

### Proposed EK-0105 · Climate is now an explicit, repeated examinable driver
> - **tier:** STRONG SIGNAL (repeated) · **status:** live
> - **evidence:** corpus — 2024 P2 Q3 and 2025 P2 Q1 both stem "how climate and winemaking techniques
>   have influenced the quality and style of the wine"
> - **claim:** Post-2023 the IMW explicitly names **climate** as a quality/style driver, and used the
>   *same* stem two years running (2024, 2025) — the strongest forward signal in the corpus. Generated
>   P1/P2 questions should include a climate-driver framing; model answers must reason cool-vs-warm
>   expression, vintage conditions, and (implicitly) climate change, not just winemaking.

### Proposed EK-0106 · Quality calibration widened region → world; commercial → "opportunities and challenges"
> - **tier:** STRONG SIGNAL · **status:** live · **extends EK-0008, EK-0012, EK-0098**
> - **evidence:** corpus — "quality … in the context of wine globally" (2024, 2025 P2 Q3); "with specific
>   reference to its classification" (2025 P3 Q3); "commercial opportunities and challenges" (2024 P3
>   Q1/Q3); commercial verbs evolving appeal (2012/2014) → selling (2016/2017) → opportunities-and-
>   challenges (2024)
> - **claim:** Two assessment frames widened in Era 3: (1) **quality** must be placed on a *global*
>   scale and **anchored to classification**, not just judged within the region; (2) **commercial** must
>   address both **opportunities and challenges** (dual-pole), with channel/market specificity. Graders
>   and generators should default to the global+classification quality frame and the dual-pole commercial
>   verb for 2021+-style questions.

### Proposed EK-0107 · Scope label: distribution entries are "last-10"; Era 1 (2011–2014) is quantitatively uncharacterised
> - **tier:** PROCESS · **status:** live
> - **evidence:** EK §0.5 (core analytical corpus = 2015–2025); EK-0096…EK-0102 all cite
>   `data/structured/corpus_*.json` (last-10)
> - **claim:** Every per-paper composition entry (curveball position/budget, OW:NW band, age/price
>   signature, single-country ceiling, mark redistribution baseline) is computed on **2015–2025 only**
>   and is **blind to 2011–2014**. EK-0023 (curveball) and EK-0027 (price) use the wider 2011–2025
>   504-wine set; the rest do not. Do not read last-10 distributions as timeless, and do not use them to
>   reason about exam *evolution* — Era 1 needs separate structured tagging before any 14-year trend
>   line is asserted. (Recommended follow-up: extend `data/structured/` to 2011–2014.)

### Proposed EK-0108 · "Orange"/skin-contact wine peaked 2014–2019 and is absent 2021–2025 (do not forecast a surge)
> - **tier:** PLAUSIBLE · **status:** live
> - **evidence:** corpus — Rkatsiteli (2014 P3), Cullen Amber (2017 P3 Q2), Chinuri/Iago (2019 P1),
>   Vecchio Samperi (2019 P1); **no skin-contact/qvevri wine 2021–2025**
> - **claim:** Skin-contact/qvevri "orange" wine is an Era-1/Era-2 device, not a growing one — it does
>   not appear in the 2021–2025 corpus. Oxidative/flor styles (Jura Savagnin, oxidative white Rioja,
>   Sherry) persist (cf. EK-0088), but skin-contact does not. When generating "boundary" P1/P3
>   curveballs, prefer the persistent oxidative/flor family over orange wine, and do **not** model orange
>   wine as a rising/future theme.

### Proposed minor revision to EK-0046
> Add: the attested P1 boundary-push includes a **frizzante, sweet** wine — Moscato d'Asti (2019 P1 slot
> 8, 5.5%) — not merely "occasional off-dry." P1 excludes *fully* sparkling and never two sparkling, but
> a lightly-frizzante sweet wine has appeared once.

---

## Appendix · Evidence index (corpus citations used above)

- **25/wine, all eras:** 2011 P1 Q1, 2011 P2 Q2, 2012 P1 Q1, 2012 P2 Q1, 2013 P1 Q1, 2014 P1 Q1.
- **ID share fell / ID-free:** 2011 P2 Q1 (~60%), 2012 P2 Q1 (~48%); 2023 P1 Q1 (20%); 2017 P3 Q2,
  2019 P1 Q3, 2024 P3 Q1, 2025 P3 Q3.
- **Vintage decline:** 2012 P1 Q3, 2014 P2 Q2, 2015 P1 Q1, 2016 P2 Q3 → 2024 P2 Q2.
- **Commercial maturation:** 2012 P3 Q2, 2014 P1 Q3 → 2016 P2 Q2/Q5, 2017 P1 Q3 / P3 Q1 → 2021 P1 Q4,
  2024 P3 Q1/Q3.
- **Climate stems:** 2024 P2 Q3, 2025 P2 Q1. **Human-vs-nature:** 2025 P1 Q4. **Wine globally:** 2025
  P2 Q3. **Sense of place:** 2017 P1 Q4. **Blend-purpose:** 2022 P2 Q1. **Sub-region:** 2022 P2 Q2/Q3.
  **Texture→quality:** 2023 P1 Q2.
- **Sparkling-opener break:** 2025 P3 Q1. **P1 frizzante/sweet:** 2019 P1 slot 8 (Moscato d'Asti).
- **Orange wine window:** 2014 P3 (Rkatsiteli), 2017 P3 Q2 (Amber), 2019 P1 (Chinuri, Vecchio Samperi);
  none 2021–2025.
- **Questions/paper:** Era 1 ≈ 3.7 (2011 P3 text missing), Era 2 ≈ 3.9 (2017 P3 = 6, max), Era 3 ≈ 3.5.

*Generated from a direct read of `data/exams.json` (all 14 years) and a full read of
`mw_exam_empirical_knowledge.md`. Mark tariffs summed manually. Era-1 P3 (2011) question text is absent
from the corpus and is flagged wherever it bears on a claim.*
