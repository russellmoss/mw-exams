# Gap Analysis 04 — Mark Distribution Across Questions & Sub-Parts

**Dimension:** How examiners distribute POINTS across questions and sub-parts, and how this changed after ~2014.
**Source:** `data/structured/corpus_subquestions.json` (462 sub-questions), `corpus_questions.json`, `corpus_summary.json`.
**Method:** Era split pre-2014 / 2015–2019 / 2020–2025. Mark-share computed two ways: (a) **full-credit per `type_hit`** (each multi-label sub-q credits its full `marks_sum` to every type it touches — matches `id_share_by_year`, so columns can exceed 100%); (b) **split-evenly** (marks divided across a sub-q's hits — columns sum to ~100%). Both shown. 2020 not held; `is_last10` = 2015–2025.

---

## (1) What the real exam does — quantified + cited

### 1a. The 2014 standardization (verified + deepened)
`marks_ok = 100%` for 2014+; fails 2012–2013. The structured `total_marks` per paper confirms the regime change: 2011 = 600, **2012 = 300, 2013 = 396** (non-standard), then **2014–2025 = exactly 900** every year (`corpus_summary.json`). Standardized to **25 marks/wine × 12 wines = 300/paper... actually 900/paper** across the three papers, i.e. the per-paper denominator locked at 900 from 2014 onward. **Anything pre-2014 is a different marking universe and should not seed generation targets.**

### 1b. ERA × TYPE mark-share — full-credit-per-hit (reconciles with `id_share_by_year`)
Share of each era's total marks; columns exceed 100% because of multi-label sub-questions.

| TYPE | pre-2014 | 2015–2019 | 2020–2025 |
|---|---:|---:|---:|
| variety_id | 29.1% | 22.6% | 26.8% |
| origin_id | 45.1% | 42.6% | **39.3%** |
| vintage_id | 3.1% | 1.9% | 2.0% |
| quality | 32.7% | 33.8% | **36.3%** |
| maturity | 4.6% | 11.1% | **13.1%** |
| commercial | 5.7% | 11.6% | **17.9%** |
| winemaking | 18.3% | 23.5% | 20.6% |
| style | 10.1% | 14.6% | **20.1%** |
| sweetness_rs | 1.9% | 0.4% | 2.3% |
| structure | 2.8% | 0.4% | 2.6% |
| comparative | 10.7% | 3.0% | 9.5% |
| **ID composite** (variety∪origin∪vintage) | **59.7%** | **53.8%** | **46.2%** |

### 1c. ERA × TYPE mark-share — split-evenly (columns ≈ 100%, cleaner "where do marks go")

| TYPE | pre-2014 | 2015–2019 | 2020–2025 |
|---|---:|---:|---:|
| variety_id | 19.3% | 15.7% | 16.0% |
| origin_id | 32.3% | 30.2% | **26.0%** |
| vintage_id | 2.5% | 1.9% | 0.8% |
| quality | 17.3% | 15.6% | 15.3% |
| maturity | 2.0% | 5.8% | **6.6%** |
| commercial | 2.6% | 6.1% | **7.8%** |
| winemaking | 12.2% | 17.2% | 14.1% |
| style | 3.8% | 5.7% | **7.9%** |
| sweetness_rs | 0.8% | 0.4% | 1.2% |
| structure | 1.7% | 0.4% | 1.1% |
| comparative | 3.6% | 1.1% | 3.2% |

**The concrete shift (both methods agree):** ID (esp. origin) bleeds marks downward; **commercial roughly triples** (5.7→17.9% full-credit; 2.6→7.8% split); **style roughly doubles** (10.1→20.1%; 3.8→7.9%); **maturity ~triples** (4.6→13.1%; 2.0→6.6%). Quality is stable/slightly rising (~33–36%). The marks freed up by shrinking ID are absorbed by the **commercial + style + maturity** trio — the "is this wine any good, where does it sit in the market, and how is it ageing" cluster. Per-year `id_share` corroborates: 2025 ID = 39.7%, commercial = 17.8%, quality = 40.1%.

### 1d. Per-PAPER modern shape (2018–2025, full-credit per-hit, share of that paper's marks)
The papers differ materially — a single global target is wrong.

- **P1 (whites):** origin 38, quality 39, variety 30, winemaking 22, **maturity 20**, style 15, commercial 13, comparative 8. *(P1 leans maturity/ageing heavily and has the LOWEST commercial.)*
- **P2 (reds):** **origin 50**, quality 38, variety 29, **style 23**, winemaking 16, commercial 16, maturity 9, vintage 4, comparative 8. *(P2 is the most origin-driven and most style-driven; low maturity.)*
- **P3 (special):** quality 37, origin 36, **winemaking 27**, **commercial 21**, style 18, variety 19, maturity 8, sweetness_rs 5, structure 3. *(P3 has the HIGHEST commercial + winemaking, LOWEST variety; sweetness/structure only appear here.)*

### 1e. MARK-TARIFF SIZING by type (validation of the test's claims)
Using `marks_each` (per-wine tariff) and `marks_sum` (flight aggregate). Single-label tariffs:

| TYPE | per-wine `marks_each` observed | tariff signal |
|---|---|---|
| sweetness_rs | **{2, 3}** | numeric "state RS" only |
| structure | **{2, 3, 5}** | numeric "state" / small |
| commercial | {5,6,7,10}; aggregate min 5 max 30 | **always ≥5** (claim CONFIRMED — every commercial-hit sub-q ≥5) |
| maturity | {5,6,8,10} | ≥5 |
| quality | {6,7,8,10} | ≥5 |
| winemaking | {4…15}, median 7 | 5–15 |
| variety_id | {5…28}, median 10 | see difficulty signal below |
| origin_id | {5…28}, median 10 | 5–6 = de-emphasized geography; 10–15 = precise geography wanted |
| style | single-label 15; any-hit 5–30 | **~5 standalone**, larger when bundled |
| comparative | any-hit `marks_each` 10–36; `marks_sum` up to 60; `marks_pct_of_question` 28–60% | **20–36 aggregate, CONFIRMED** — the bulk of a question's marks |

- **CONFIRMED: 2–3 marks attach EXCLUSIVELY to numeric "state" answers.** Of 11 sub-questions with `marks_each ∈ {2,3}`, the type_hits are **6 sweetness_rs + 5 structure** — zero written types. RS/ABV/structure-state only.
- **CONFIRMED: commercial never < 5** (corpus min = 5).
- **CONFIRMED: variety-ID size = difficulty signal** (heuristics §2.1): **10–15 = mainstream single-variety** (2024 P2 Syrah 15, 2018 P1 Riesling 10), **16–25 = harder/diverse** (2025 P1 Chardonnay-from-4-origins 16, 2024 P2 Pinot-from-5-countries 25). Low per-wine (4–8) = independent ID of diverse wines.
- **CONFIRMED: compare/contrast 20–36** and holds the plurality of a question's marks (`marks_pct_of_question` reaches 57–60%).
- **"style ~5"** is right for the *standalone* tariff but style is now usually **bundled** ("style, quality and commercial — 15 marks"), so its full-credit share (20%) far exceeds its standalone tariff.

### 1f. STRUCTURE TREND (questions/paper, sub-q/question)
Per-year (P1,P2,P3) question counts and avg sub-q/question (`corpus_questions.json`):

- **Questions per paper has CONVERGED to 3–4.** 2016–2017 spiked (5–6/paper, 14 total) but **2018→2025 sits at 10–12 total questions** (≈3–4 per paper), settling on **10** in 2023/2024/2025.
- **Sub-questions per question is flat at ~3.0** (range 2.58–3.40; 2023–2025 = 3.1/3.0/2.9). No "fewer-but-larger questions" trend — the modern paper is **~3–4 questions/paper, ~3 sub-parts each, 25 marks/wine**. Stable.

### 1g. CANONICAL modern (2018–2025) target shape a generated paper should replicate
- **Hard skeleton:** 25 marks/wine; 3–4 questions/paper; ~3 sub-questions/question; written sub-qs ≥5 marks; 2–3 marks reserved for state-RS/ABV.
- **Type-mix (full-credit-per-hit share of paper marks), per paper:**
  - **P1:** origin ~38, quality ~39, variety ~30, winemaking ~22, maturity ~20, style ~15, commercial ~13.
  - **P2:** origin ~50, quality ~38, variety ~29, style ~23, winemaking/commercial ~16, maturity ~9.
  - **P3:** quality ~37, origin ~36, winemaking ~27, commercial ~21, style ~18, variety ~19, sweetness/structure present.
- **Cross-paper musts:** **commercial ≥1 sub-q every question-ish (≈17% of marks overall, never 0%); style on essentially every question (~20% of marks via bundling); ID composite capped ~46% (down from ~60%); a compare/contrast item carrying 20–36 marks where the flight invites it.**

---

## (2) What our system enforces

**`question-engine.ts → validateMarkAllocation` (and R6 in `question-rules.mjs`):**
- **Total = exactly 25 × wineCount** (HARD; EK-0001/EK-0041). `corpus_questions.json` `marks_ok` 100% for 2014+ → faithfully replicated.
- **Every written sub-q ≥ 5 marks; only `state RS/ABV` may be 2–4** (regex sniffs "state/indicate/estimate … residual sugar/alcohol"). Matches EK-0018 and the corpus (2–3 marks = sweetness_rs/structure only).
- R6 (`question-rules.mjs:140`) duplicates the 25/wine HARD check. **Neither validator inspects sub-question TYPE composition at all.**

**`prompts/question-generation-prompt.ts`:**
- "## 25 MARKS PER WINE (ABSOLUTE)" + "## MARK ALLOCATION RULES": min 5 marks/written sub-q; lists *typical ranges* — ID 8–15, winemaking 5–10, quality/maturity 5–10, commercial 5–10, style 5–10 (these ranges are broadly corpus-accurate as *per-wine tariffs*).
- "## STYLE SUB-QUESTIONS (MANDATORY)": at least one style sub-q unless purely ID; weight 2021–2025 heavily. **This is the only type-mix nudge that is enforced as "mandatory," and it's soft (prompt-only, not validated).**
- P3 has a quantified `P3_STYLE_DISTRIBUTION` *wine-style* balancer (DB-driven) — but that balances **wine categories**, not **sub-question mark types**.

**`prompts/marking-principles.ts`** (answer-gen/grading): Cardinal Rule 1 "grade to the printed allocation, sub-part by sub-part — never assume a fixed split"; Rule 8 mark-proportional depth (EK-0017); most ID marks live in the argument not the conclusion. **This is grading-side and correct** — it reads the allocation off the generated question; it does not shape it.

**EK §3:** EK-0017 (depth∝marks), EK-0018 (2-mark=numeric), EK-0019 (commercial ≥5), EK-0020 (style ubiquitous ~5), EK-0022 (compare/contrast 20–36). All five are encoded as *tariff floors/shapes* but **none as a paper-level mark-share target.**

---

## (3) Meaningful gaps — prioritized

### HIGH — No enforcement (or even a target) for the modern TYPE-MIX of marks
The system guarantees the **skeleton** (25/wine, ≥5 sub-qs, state-RS exception) but is **silent on how marks are distributed across types.** A generated P2 question could legally be 25 marks of pure variety+origin ID with zero commercial, zero maturity — passing every validator — yet that is a **pre-2014 shape**, not the 2018–2025 shape. The single biggest post-2014 change (commercial ~6%→18%, style ~10%→20%, maturity ~5%→13%, ID 60%→46%) is **not represented in generation as a quantitative target.** Only "include ≥1 style sub-q" is nudged, and only in the prompt. **This is the core gap.**

### HIGH — Commercial under-representation risk
Commercial is now ~17–21% of marks (highest in P3) and **mathematically present on most questions**, but the system has **no rule that commercial appears at a minimum frequency/share.** The prompt's "typical range 5–10" only fires *if the model chooses* to include commercial. EK-0019 only constrains its *size when present*, not its *presence*. Likely under-generated relative to 2018–2025.

### MED — No per-PAPER mark-share differentiation
P1/P2/P3 have distinctly different shapes (P1 maturity-heavy ~20% & low commercial; P2 origin-heavy ~50% & style-heavy ~23%; P3 commercial+winemaking-heavy ~21/27% with sweetness/structure). The generation prompt's "typical ranges" are **paper-agnostic**, so all three papers drift toward one generic mix.

### MED — ID share is not capped
ID composite fell from ~60% to ~46%. Nothing prevents generation from over-weighting ID (the easiest sub-q to write), re-creating the pre-2014 ID-dominant feel. No "ID ≤ ~46% of paper marks" guard.

### LOW — Compare/contrast tariff not size-checked
EK-0022 says C&C = 20–36 marks (plurality of the question). When a generated stem says "compare and contrast," nothing verifies that sub-q actually carries the heavy tariff vs. being a token 5-mark line. Low frequency, so LOW.

### LOW — `structure`/`sweetness_rs` are P3-only but not gated to P3
Corpus shows `structure`/`sweetness_rs` state-questions appear essentially only in P3. A 2-mark "state RS" on a P1 dry-white question would be corpus-anomalous but currently passes. Edge case.

---

## (4) Recommendations — concrete & tagged

1. **[question-gen][whole-test] Add a per-paper TYPE-MIX target table to the generation prompt** (and ideally to whole-test assembly): give the model the 2018–2025 full-credit shares from §1d as explicit targets ("On P2, ~50% of marks touch origin, ~38% quality, ~23% style, ~16% commercial; on P3 commercial ~21% & winemaking ~27%; on P1 maturity ~20% & commercial only ~13%"). This converts the biggest empirical shift into a generation instruction.

2. **[grading][question-gen] Add a soft validator `validateMarkTypeMix(question, paper)`** that tags each sub-q's type(s) (reuse the corpus type taxonomy / a lightweight classifier) and checks paper-level shares against §1d bands with tolerance (e.g. commercial 10–25%, ID-composite ≤55%, style present). Severity = "important/nice-to-have" (relax on retry ≥6), matching the existing relax loop — never HARD, since individual questions legitimately vary; enforce the shape at the **whole-paper** level where possible.

3. **[whole-test] Enforce commercial + style PRESENCE across a paper, not per question.** When assembling a full paper, require: ≥1 commercial sub-q and style on a majority of questions, and that commercial+style+maturity together claim a meaningful slice (~45–55% of non-ID marks in the modern era). This is the cleanest way to replicate the post-2014 redistribution without over-constraining single questions.

4. **[question-gen] Cap ID composite (~46–55% of paper marks)** as a soft guard so generation can't regress to the pre-2014 ID-dominant feel.

5. **[question-gen] Make the "typical per-wine tariff ranges" PAPER-AWARE** in the prompt (e.g. P1 maturity 8–25, P3 winemaking 8–15 + commercial 8–21), replacing the single generic list.

6. **[question-gen] When the stem says "compare and contrast," validate that sub-q carries ≥20 aggregate marks** (EK-0022); flag token 5-mark C&C parts.

7. **[grading] No change needed to marking-principles** — it already grades to the printed allocation (Rule 1/8). The fix belongs upstream in generation so the *printed allocation itself* matches the modern shape.

---
*Feeds `mw_exam_guide.md` + `exam_gap_analysis.md`. All figures computed from `data/structured/` corpus; tariff/difficulty claims cross-checked against `outputs/heuristics/examiner_patterns.md` §2.1–2.3 and EK §3 (EK-0017/0018/0019/0020/0022).*
