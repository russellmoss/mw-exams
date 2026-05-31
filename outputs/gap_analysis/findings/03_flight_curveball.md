# Gap Analysis 03 — Flight Composition & Curveball Distribution

**Dimension:** What makes up a typical 2/3/4/5/6-wine flight, and how curveballs are distributed by
flight size, question position, and family — within a question and across a whole exam.

**Corpus:** `data/structured/corpus_wines.json` + `corpus_questions.json`, joined on `wine_ids`.
All tables below use **last-10 sat years** (`is_last10=true`; 2020 not held) unless noted:
112 questions / 360 wines. Curveball = `curveball_level` ∈ {low, medium, high}; "harder" =
medium+high. Note: the existing `curveball_analysis.md` and EK §4 quote **all-15-years** figures
(504 wines); several of its claims soften on the last-10 subset, flagged inline below.

---

## 1. What the real exam does — quantified

### 1.1 Curveball × Flight Size (wine-level, last-10)

| Flight size | nQ | nWines | low | med | high | **med+high %** | high % |
|---|---|---|---|---|---|---|---|
| 2 | 37 | 74 | 58 | 14 | 2 | **21.6%** | 2.7% |
| 3 | 30 | 90 | 66 | 16 | 8 | **26.7%** | 8.9% |
| 4 | 31 | 124 | 98 | 17 | 9 | **21.0%** | 7.3% |
| 5 | 7 | 35 | 25 | 5 | 5 | **28.6%** | 14.3% |
| 6 | 6 | 36 | 24 | 9 | 3 | **33.3%** | 8.3% |
| 1 | 1 | 1 | 1 | 0 | 0 | 0% | 0% |

**Finding:** Curveball *rate per wine* is roughly **flat at ~21–27%** across 2/3/4 — large flights do
**not** "stick to classics." If anything the per-wine harder-rate *rises* with flight size (5-wine
28.6%, 6-wine 33.3%), though 5/6-wine n is tiny (7 and 6 flights). So the intuition that 2-wine pairs
are easier is **not supported**: a 2-wine pair has the *lowest* high-curveball rate (2.7%) but a
comparable med+high rate (21.6%) to a 4-wine flight (21.0%).

### 1.2 Benchmark density × Flight Size (wine-level, last-10)

| Flight size | nWines | iconic | bench_classic | bench_regional | nonbench | **any-benchmark %** |
|---|---|---|---|---|---|---|
| 2 | 74 | 16 | 32 | 12 | 14 | **81.1%** |
| 3 | 90 | 21 | 35 | 12 | 22 | **75.6%** |
| 4 | 124 | 43 | 44 | 13 | 24 | **80.6%** |
| 5 | 35 | 16 | 9 | 1 | 9 | **74.3%** |
| 6 | 36 | 13 | 12 | 6 | 5 | **86.1%** |

**Finding:** Benchmark density is high and **stable (~75–86%) at every flight size**. Larger flights
are NOT banker-heavier as a *rate* — but in absolute count a 4-wine flight averages **~3.2 benchmark
wines** and only ~0.8 nonbenchmark, so the *anchor scaffold* is real. 4-wine flights are the most
icon-rich (43 iconic across 31 flights ≈ 1.4 iconic/flight).

### 1.3 Curveball × Position within paper (wine-level, last-10)

By absolute question number:

| Q# | nWines | med+high % | high % |
|---|---|---|---|
| q1 | 106 | 19.8% | 3.8% |
| q2 | 100 | **32.0%** | **14.0%** |
| q3 | 96 | 24.0% | 5.2% |
| q4 | 41 | 19.5% | 9.8% |
| q5 | 15 | 13.3% | 0% |

By relative position (first / middle / last question of each paper):

| Position | nWines | med+high % | high % |
|---|---|---|---|
| first | 106 | 19.8% | 3.8% |
| middle | 152 | 25.7% | **11.2%** |
| last | 102 | 27.5% | 5.9% |

By position **× paper** (med+high% / high%):

| Paper | first | middle | last |
|---|---|---|---|
| P1 | 8.6% / 0% | 23.1% / **15.4%** | 9.1% / 6.1% |
| P2 | 8.6% / 2.9% | 6.0% / 4.0% | 14.3% / 2.9% |
| P3 | 41.7% / 8.3% | 48.0% / **14.0%** | **58.8%** / 8.8% |

**Finding (important — contradicts EK-0025/§4.8 narrative):** The "curveballs cluster in the *last*
question of P1/P2" claim is **only weakly true on the last-10 subset.** For **P1, the *middle*
questions carry by far the most high curveballs (15.4%)**, not the last (6.1%) — the last question's
med+high rate (9.1%) is barely above q1. For **P2**, the last question is the hardest of the three
but the effect is small (14.3% vs 8.6% first) and high-curveballs are flat. For **P3**, curveball
density rises monotonically toward the end (last 58.8% med+high), consistent with "middle/late = the
unusual oxidative/orange/rosé slot." **q2 is the single hardest position overall (14% high).**

### 1.4 Curveball × Paper (wine-level, last-10)

| Paper | nWines | med+high % | high % |
|---|---|---|---|
| P1 | 120 | 15.0% | 8.3% |
| P2 | 120 | 9.2% | 3.3% |
| P3 | 120 | **49.2%** | 10.8% |

**Finding:** **P3 ≫ P1 > P2** confirmed and strong. P3 is ~3× P1 and ~5× P2 on med+high rate. EK-0025's
per-paper *ordering* holds emphatically; the magnitudes are larger than the all-years high-only
averages (P3 1.1 / P1 0.8 / P2 0.4 per paper).

### 1.5 Curveball × Family (wine-level, last-10)

| Family (name) | nWines | med+high % | high % |
|---|---|---|---|
| F5 Method/Production Dominant | 36 | **61.1%** | **22.2%** |
| F6 Style Mechanism Comparative | 13 | 38.5% | 7.7% |
| F7 Hierarchy/Quality Calibration | 27 | 29.6% | 0% |
| F4 Mixed Identification Breadth | 123 | 23.6% | 8.9% |
| F2 Same-Origin Comparative | 68 | 23.5% | 5.9% |
| F3 Blend/Composition | 19 | 10.5% | 5.3% |
| F1 Same-Variety Comparative | 74 | **8.1%** | 2.7% |

**Finding:** **F5 (production-method) and F6 (style-mechanism) are the curveball hotspots** — F5 carries
61% harder wines (these are the P3 fortified/oxidative/sweet method comparisons). **F1 same-variety is
the safest (8.1%)**, confirming EK's "same-variety rarely host curveballs (variety is stated)." F4
grab-bag is mid-pack (23.6%) — breadth is a host but not the *densest* host; the production families
beat it. The EK framing "breadth/mixed most" is partly right (F4 is high-volume) but **misses that the
production/method families are denser per wine.**

### 1.6 The "1-in-4" rule — harder-wines per flight (last-10)

Count of medium+high ("harder") wines per multi-wine flight, by size:

| Size | flights | avg harder/flight | exactly-1 | zero | distribution |
|---|---|---|---|---|---|
| 2 | 37 | 0.43 | 22% | **68%** | 0:25, 1:8, 2:4 |
| 3 | 30 | 0.80 | **43%** | 40% | 0:12, 1:13, 2:4, 3:1 |
| 4 | 31 | 0.84 | 23% | **58%** | 0:18, 1:7, 2:2, 3:1, 4:3 |
| 5 | 7 | 1.43 | 43% | 29% | 0:2, 1:3, 2:1, 5:1 |
| 6 | 6 | 2.00 | 0% | 50% | 0:3, 3:1, 4:1, 5:1 |

Across all 111 multi-wine flights: **0 harder = 54%**, exactly 1 = 28%, 2 = 10%, 3+ = 9%.

**Finding (qualifies EK-0024):** The "exactly one curveball + rest anchors" rule is **the modal
*non-zero* case but NOT the majority case.** The plurality of flights (54%) contain **zero**
medium/high wines — they are all-banker flights. When a flight *does* have a curveball, "exactly 1" is
the most common count (28% of all flights; 61% of the curveball-bearing flights). The clean "1 in 4"
holds best for **3-wine flights (43% have exactly 1)**; 4-wine flights are bimodal (58% have zero,
but 3 of 31 have *all four* harder — the deliberate grab-bag). So "1 in N" is a **tendency, not a law**,
and "≥half of flights are all-anchors" is an equally important, under-documented fact.

### 1.7 Per-paper (12-wine) composition — across a full exam

| Paper | avg med | avg high | avg med+high per 12 wines | range |
|---|---|---|---|---|
| P1 | 0.8 | 1.0 | **1.8** | 1–4 |
| P2 | 0.7 | 0.4 | **1.1** | 0–4 |
| P3 | 4.6 | 1.3 | **5.9** | 1–10 |

**Finding — the right whole-exam curveball budget:**
- A full **P1 paper** ≈ **2 harder wines / 12** (~1 genuinely high). A **P2 paper** ≈ **1 harder / 12**.
  A **P3 paper** ≈ **6 harder / 12** (half the flight is "unusual" — that is P3's identity).
- A realistic **36-wine mock suite** should therefore carry **~9 medium + high wines total** (~1.8 P1
  + ~1.1 P2 + ~5.9 P3), heavily weighted to P3, with **P2 the bankers' paper.**

### 1.8 Typical-flight portraits (last-10)

- **2-wine:** contrast pair, ~81% benchmark, usually **0 harder** (68%); when hard, it's a
  curveball+anchor pair (the Manzanilla + Jura sous-voile shape). Lowest high-curveball rate.
- **3-wine:** ~76% benchmark, the cleanest "**1 harder + 2 anchors**" shape (43% have exactly 1).
- **4-wine (the workhorse, F4-dominant):** ~3.2 benchmark + ~0.8 nonbench; **bimodal** — usually
  0 harder, occasionally a full grab-bag of 4 mid-tier identity wines.
- **5-wine (rare, F5/F1):** P3 method ladders; highest high-curveball rate (14%).
- **6-wine (rare, F4/F7):** breadth or hierarchy; either all-low (F4 breadth of classics) or
  medium-dense (F7 hierarchy / P3 — e.g. 2018 P3 Q1 had 5 medium of 6).

---

## 2. What our system enforces

Code read: `study-app/src/lib/question-engine.ts`, `question-rules.mjs`,
`prompts/question-generation-prompt.ts`.

**HARD-validated (regenerate on violation):**
- **Banker minimum** — `validateBankerMinimum()` (question-engine.ts L809-832): flights of 3+ wines
  must match `BENCHMARK_APPELLATIONS` regex ≥1×, else reject. This is the *only* difficulty-adjacent
  hard rule. **Matches the corpus** (75–86% benchmark density; all 3+ flights have ≥1).
- **Flight-size range** — `validateFlightSize()` (L903-924) + `FAMILY_FLIGHT_RANGES` (L893-901):
  per-family min/max, plus "P1 never 5-wine." Matches corpus ranges.
- The shared rule layer `question-rules.mjs` enforces country-diversity, same/distinct-variety,
  same-country, single-variety-blend, marks (25/wine), p3-oxidative-white. **No curveball rule exists
  in this file.**

**Distribution-steered (probabilistic, soft):**
- **Flight size** — `pickFlightSizeFromDistribution()` (prompt L16-90) rolls a target size from
  `TARGET_DISTRIBUTIONS` (L5-14) and *self-corrects* against the DB's current generated mix (picks the
  most under-represented size). Targets, e.g. F1 `{2:44,3:32,4:12,5:8,6:4}`, F4
  `{2:12,3:27,4:46,5:6,6:9}` — broadly aligned with the corpus family×size cross-tab.
- **P3 style category** — `pickP3StyleCategory()` (L102-173) rolls sparkling 31 / sweet 22 /
  still_dry 20 / fortified 18 / rose 6 / oxidative 2, self-correcting against the DB. Good coverage
  mechanism (indirectly drives P3 curveball density, since fortified/oxidative are curveball-dense).
- **Flight-size pick at serve time** — `pickFlightSizeAware()` (engine L231-245) down-weights 4-wine
  for F1/F2/F5/F7 to avoid over-serving the modal size.

**Prompt-only guidance (NOT validated, NOT tracked):**
- **Curveball ratio / "1 in 4"** — the entire `curveball_analysis.md` (incl. the "1 in 4" rule, mark
  redistribution, "never random," curveball+anchor pairing) is injected as the `## CURVEBALL ANALYSIS`
  block (prompt L265-266) and the banker section's GOOD/BAD examples (L341-345) name target counts
  ("2 bankers, 1 curveball"). **All of this is model-facing prose — nothing parses the generated
  flight to count harder wines or verify a 1-in-N ratio.**
- **Position-aware placement** — there is **no** representation of question position. Each question is
  generated in isolation; the engine has no notion of "this is the last question of the paper" or
  "this is the curveball slot." The "curveball in the final P1/P2 question / middle of P3" pattern
  (examiner_patterns §4.8) is documented but **un-modeled** — partly because the live tool generates
  **single questions, not whole papers**, so position has no anchor.

**EK references:** EK-0023 (curveball dist 6.2/17.9/75.9 — all-years), EK-0024 ("1 in 4"), EK-0025
(P3>P1>P2; final-question P1/P2, middle P3), EK-0029 (4-wine needs a banker — *implemented*),
EK-0030 (F4 mid-tier cap — *implemented as prompt guidance, L347-355*).

---

## 3. Meaningful gaps (prioritized)

### HIGH — No curveball-count validator (the "1 in 4" / banker-vs-curveball balance is unenforced)
The system hard-checks that a flight has **≥1 banker** but never checks the **other end**: that it
isn't *all* bankers (54% all-anchor in the corpus is fine, but the model has no signal to ever produce
a deliberate curveball) **or** that a P3/F5 flight has *enough* difficulty. There is no post-generation
count of medium/high wines, no per-flight target, and no tracking of the served curveball mix vs the
corpus targets (§1.1, §1.6). Risk: generated flights drift toward "all recognizable benchmarks" (the
safe completion the LLM defaults to), under-training the candidate on exactly the discrimination the
exam rewards. This is the single highest-value gap because the curveball is *the* mechanism that
separates pass from fail (per the banker-section rationale, L341).

### HIGH — Per-paper / whole-suite curveball budget is not modeled
Because the live tool generates **isolated single questions**, there is no enforcement of the
**per-12-wine budget** (P1 ~1.8, P2 ~1.1, P3 ~5.9 harder wines — §1.7). The mock-exam generator
(`/generate-mock-exam`) assembles a full paper but — from the prompt path — relies on the same
single-question machinery + prose; nothing guarantees a generated P3 reaches its ~6/12 harder-wine
identity or that P2 stays the "bankers' paper." A study suite that gives every paper the same
difficulty misrepresents the real exam's P2-easy / P3-hard shape.

### MED — Position-aware curveball placement is absent (and the EK claim it would encode is itself shaky)
There is no "curveball slot" modeling. Two-part gap: (a) the engine can't place a curveball in the
P3-late / P2-last slot even if we wanted it to; (b) more importantly, **the EK-0025/§4.8 claim that
P1/P2 curveballs cluster in the *last* question does not hold on the last-10 data** — P1's hardest
position is the *middle* (q2, 15.4% high; §1.3). So before building position logic we should **correct
the EK entry** to "P1 curveballs cluster mid-paper (q2); P2 mildly back-loaded; P3 rises to the end."
Building the documented-but-wrong rule would actively mistrain.

### MED — Family-level curveball density not differentiated
The system treats curveball guidance uniformly, but the corpus shows **F5 (61%) / F6 (38%) are 5–7×
denser than F1 (8%)** (§1.5). F1 same-variety flights should be near-curveball-free; F5/F6 P3 method
flights should be curveball-rich. The prompt's banker rule and F4 cap exist, but there's no F1
"keep-it-clean" or F5 "expect a hard wine" steer tied to family.

### LOW — `curveball_analysis.md` & EK quote all-15-year figures; last-10 differs materially
The injected analysis (50% for 2-wine, etc.) is computed on 504 wines incl. pre-2014 papers with
different structure. Last-10 2-wine harder-rate is 21.6%, not 50%. The model is being fed slightly
stale ratios. Low severity (directionally fine) but worth a refresh footnote.

---

## 4. Recommendations

1. **[question-gen] Add a curveball-count validator (soft, tracked).** After generation, classify each
   wine's difficulty (reuse the difficulty signal already in `stem-scoring.ts` `Tier`, or a light
   benchmark/curveball heuristic) and check the harder-wine count against a per-(family,size) band
   derived from §1.6 (e.g. F1≤1, F4 0–4, F5 expect ≥1 in 3+). Don't hard-reject on the low side
   (all-anchor is legitimate, 54%) but **reject all-banker flights for F5/F6/P3** and **reject >2
   harder wines in F1**. Log the served harder-count so we can compare the live mix to the corpus.

2. **[whole-test] Enforce a per-paper curveball budget in `/generate-mock-exam`.** Target ~2 harder/12
   for P1, ~1 for P2, ~6 for P3 (§1.7). After assembling the 12 wines, count and regenerate the
   offending question(s) if the paper is too flat (esp. P3) or too spiky (P2). This is the
   highest-fidelity fix because it operates where position/budget actually exist.

3. **[question-gen] Differentiate curveball guidance by family** in the prompt: explicit "F1
   same-variety: all wines should be confidently identifiable benchmarks of the stated variety — no
   curveballs" and "F5/F6 (P3 method/style): expect ≥1 genuinely hard wine; the difficulty is the
   point" — backed by the §1.5 rates.

4. **[answer-gen / grading] Tag the curveball wine and redistribute emphasis.** EK-0024's "ID marks
   downweighted on the curveball, style/method/quality upweighted" is sound and corpus-backed
   (Furmint/Aszú example). The model-answer generator should explicitly flag *which* wine is the
   curveball and lean its earned-marks narrative toward the discussion sub-questions for that wine; the
   grader should reward describe-what-you-taste over a failed name on the tagged curveball.

5. **[doc fix — feeds mw_exam_guide.md] Correct EK-0025 and refresh EK-0023/0024 to last-10.** State:
   curveball *rate* is flat ~21–27% across 2/3/4-wine; **P1's hardest slot is q2 (mid-paper), not the
   last**; 54% of flights are all-anchor (the "1 in 4" is the modal *non-zero* shape, not a majority);
   per-paper budget P1≈1.8 / P2≈1.1 / P3≈5.9 harder per 12. These belong in `exam_gap_analysis.md`
   and the guide's flight-composition section.
