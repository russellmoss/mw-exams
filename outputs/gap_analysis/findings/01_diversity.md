# Gap Analysis 01 — Diversity (style / variety / region / vintage / OW–NW)

**Dimension:** diversity of wine STYLE, VARIETY, REGION, VINTAGE, and OLD-WORLD vs NEW-WORLD —
both WITHIN a single flight/question AND across a whole 12-wine paper.

**Data:** `data/structured/corpus_*.json`, last-10-sat-years filter (`is_last10=true`; 2020 not held).
360 wines, 112 questions, 30 year×paper sets. All numbers below are computed from the structured
corpus unless cited otherwise.

---

## 1. What the real exam does — quantified

### 1.1 VARIETY diversity

**Within a flight** — driven almost entirely by the stem family and flight size:

| Family | n | avg flight size | avg distinct varieties | % single-variety flights |
|---|---|---|---|---|
| F1 (same-variety / variety pair) | 25 | 3.0 | 1.32 | **72%** |
| F2 (same-country/region split) | 24 | 2.8 | 2.38 | 21% |
| F3 (blend pair) | 6 | 3.2 | 2.83 | 0% |
| F4 (mixed-ID breadth) | 33 | 3.7 | 3.42 | **3%** |
| F5 (Europe / method) | 12 | 3.0 | 3.00 | 8% |
| F6 (four countries / style) | 4 | 3.2 | 3.00 | 0% |
| F7 (same-region hierarchy) | 8 | 3.4 | 1.88 | 62% |

By flight size: size 2 → 1.54 distinct varieties (46% all-same); size 3 → 2.40 (23%);
size 4 → 3.13 (10%); size 6 → 4.83 (0%). **Variety diversity scales with flight size and is
family-determined** — F1/F7 are deliberately single-variety; F4/F5/F6 are deliberately maximally varied.

**Across a whole 12-wine paper:** P1 avg **8.6** distinct varieties (range 7–10); P2 **8.8** (7–10);
P3 **9.7** (7–11). A paper is never a one-variety tour — even P1/P2 span 7–10 distinct grapes.

### 1.2 REGION / COUNTRY spread

**Within a flight** (distinct countries):

| Flight size | n | avg distinct countries | % same-country | avg distinct regions |
|---|---|---|---|---|
| 2 | 37 | 1.41 | 59% | 1.51 |
| 3 | 30 | 2.00 | 37% | 2.60 |
| 4 | 31 | 2.74 | 23% | 3.55 |
| 5 | 7 | 4.00 | 0% | 4.71 |
| 6 | 6 | 3.67 | 0% | 5.00 |

By family: F2 is 96% same-country (by design — it splits ONE country into sub-regions); F7 75%
same-country; F4 only 3% same-country (avg 3.06 countries); F6 0% (avg 3.0); F1 32%.

**Across a whole 12-wine paper:** P1 spans **5.9** countries on average (range 4–10); P2 **6.7** (5–11);
P3 **6.2** (4–9). A typical paper is a 6-country world tour.

### 1.3 OLD-WORLD vs NEW-WORLD

**(a) Within a single flight** (111 multi-wine flights):
- **MIXED OW+NW: 47 (42%)** · pure Old-World: 51 (46%) · pure New-World: 13 (12%).
- By family: F1 64% mixed, F4 61%, F6 75%, F3 67%, F5 36%, **F2 0%, F7 0%** (same-country/same-region
  families are structurally single-world). By size: 19% (2) → 47% (3) → 55% (4) → 71% (5) → 67% (6).
- Takeaway: outside the same-origin families, **mixing OW and NW in one flight is the norm** (~60%+),
  and it scales hard with flight size. Pure-NW flights are rare (12%).

**(b) Across a whole paper** (per year×paper):
- **P1: avg 7.8 OW : 4.2 NW** (overall 65% OW); OW count range 4–11 across 10 papers.
- **P2: avg 7.6 OW : 4.4 NW** (63% OW); range 5–11.
- **P3: avg 9.8 OW : 2.2 NW** (82% OW); range 6–11.
- Corpus-wide last10: 252 OW / 108 NW = **70% OW** (`corpus_summary.world_dist_last10`).
- There is a clear, stable empirical **target band**: P1/P2 sit ~⅔ Old-World (≈8:4), P3 is much more
  Old-World-heavy (≈10:2) because its signature styles (Port, Sherry, Madeira, Sauternes, Tokaji,
  Champagne, Jura) are overwhelmingly European. No single paper is ever majority New-World.

### 1.4 VINTAGE / AGE

**Within a flight** (using `age_at_exam`; 100 of 111 multi-wine flights have ≥2 dated wines):
- **85% of dated flights mix ≥2 distinct ages**; only 15% are all-same-age.
- **20% of dated flights deliberately pair a young (≤3y) wine with an aged (≥8y) wine** (18% of all flights).
- Avg age spread within a dated flight = **4.4 years**; max spread 28y. Spread buckets: 0y →15 flights,
  1–3y →45, 4–7y →22, 8+y →18.
- So: deliberate young-vs-mature contrast is a real but *selective* device (~1 flight in 5), not a
  blanket rule; small age spread (≤3y) is the most common case.

**Across a paper** (age distribution per 12 wines):
- P1: 1% undated; avg age 3.4y (median 3); buckets young≤3 **89**, mid 4–7 **20**, aged 8+ **10**. P1 skews YOUNG.
- P2: 0% undated; avg 4.7y (median 4); young 50, mid **59**, aged 11. P2 is the most mid-aged.
- P3: **26% undated/NV** (31 of 120 — Champagne NV, Tawny, Sherry, Madeira); dated avg 6.2y (median 4),
  range 0–33; young 38, mid 29, aged **22**. P3 carries the OLDEST wines and all the NV styles.

**Vintage as a tested sub-question is rare:** only **7** `vintage_id` sub-questions in the last 10 years
(`corpus_summary`); EK-0078 states vintage is explicitly asked in only ~4–5 questions in 10 years.
The exam *builds* age contrast into flights far more than it *asks* for vintage directly — age/maturity
matters as a composition axis and a maturity-assessment input, not as a frequent ID target.

---

## 2. What our system enforces (code + EK)

**`study-app/src/lib/question-rules.mjs`** (`applyQuestionRules`, the single source of truth):
- **R1 country-diversity (hard):** "N different countries" ⇒ ≥N distinct keyed countries; bare
  "different countries" ⇒ one per wine. (Cited EK-0042, EK-0062.)
- **R2 same-variety / R3 distinct-variety (hard):** enforce the variety side of the stem.
- **R4 same-country (hard):** "same country" ⇒ exactly one country.
- R5 single-variety-blend (soft), R6 marks 25/wine (hard), R7 P3 oxidative-white scope (hard).

**`study-app/src/lib/question-engine.ts`:**
- `validateCountryDiversity` delegates to R1.
- `validateOriginDiversity` (F2 / "same origin" frame) enforces that same-origin flights have
  *distinct primary varieties* per wine — a WITHIN-flight variety-spread check.
- Plus `validateFlightSize` (per-family historical ranges) and `validateBankerMinimum`.

**What this covers well:** the variety axis (within-flight, both directions) and the country axis
(within-flight, both directions) are genuinely enforced and EK-cited. Flight size — which is the
single strongest *driver* of how much variety/country/OW-NW spread a flight should have — is also
range-checked per family. EK §4 (EK-0075/76/77/79/80/81) documents the empirical distributions well.

**What is searched-for and absent:** grep of `study-app/src/lib/` finds NO validator referencing
`old_world`/`new_world`, OW:NW ratio, vintage, or `age_at_exam` as a generation constraint. OW/NW
appears only as PROSE: a marking-principle calibration note ("do not assume old world wines will
always be the superior examples", `marking-principles.ts`) and the tasting-sanitizer banned-term list.
Vintage/age appears only in the tasting lexicon (MATURITY palette) and the maturity-answer rubric.
Neither `examiner_patterns.md` nor `historical_wine_classification.md` states an OW:NW-balance or
vintage-diversity rule. **There is no whole-paper (12-wine) composition validator of any kind** — every
check above operates on a single generated flight in isolation.

---

## 3. Meaningful gaps (prioritized)

### HIGH — No OLD-WORLD vs NEW-WORLD balance is tracked or enforced (within-flight OR whole-paper) `[question-gen][whole-test]`
The corpus shows two strong, stable patterns the system is blind to:
1. **Within-flight:** non-same-origin families mix OW+NW ~60%+ of the time (F4 61%, F1 64%, F6 75%),
   and mixing scales with flight size. A generator with no OW/NW awareness will drift toward
   single-world flights (the path of least resistance, since one region "feels" coherent), producing
   F4/F1 breadth flights that are less varied than every real example.
2. **Whole-paper:** there is a clear empirical target band — P1/P2 ≈ ⅔ OW (≈8:4), P3 ≈ 82% OW (≈10:2),
   and **no paper is ever majority New-World**. Nothing enforces or even measures this. A mock paper
   could come out 50/50 or NW-heavy and pass every current check.
This is the highest-value gap because OW/NW is a first-order axis examiners use to build contrast, it
is completely untracked, and it has a clean, quantified target.

### MED — No VINTAGE / AGE diversity is tracked (within-flight or whole-paper) `[question-gen][whole-test][answer-gen]`
85% of real dated flights mix ages; 20% deliberately pair young (≤3y) + aged (≥8y); papers have a
characteristic age signature (P1 young-skewed, P2 mid, P3 oldest + 26% NV). The system never reads
`age_at_exam`/`vintage` at generation. Lower than OW/NW because (a) vintage is rarely *asked* (7 subQs
/10yr) and (b) small age spreads dominate, so the miss is subtler — but a generated flight or paper
with no age contrast removes a real maturity-assessment cue and mis-trains the candidate.

### MED — No WHOLE-PAPER composition validator exists at all `[whole-test]`
Every diversity check is per-flight. There is no gate that, given a full 12-wine mock paper, verifies
it spans the empirical ranges: ~6 countries (P1 5.9 / P2 6.7 / P3 6.2), 7–10 varieties, the OW:NW band,
and the per-paper age signature. `/generate-mock-exam` can therefore emit a paper whose 12 wines are
individually valid but collectively too narrow (e.g. all-French P1, all-young P2).

### LOW — STYLE-category diversity on P3 is guided by prompt prose, not validated `[question-gen]`
P3 sweet flights empirically span ~3.3 sweetness mechanisms / ~3.6 varieties / ~3.7 countries
(EK-0080). The generation prompt *describes* mechanism diversity but no validator enforces a minimum
distinct-mechanism (or distinct style_category) count. Lower priority because EK-0039/0080 + R7 already
shape P3 reasonably and style is partly downstream of the OW/NW and variety fixes.

### Already covered (honest acknowledgement)
- **Within-flight COUNTRY diversity IS enforced** (R1/R4, EK-0042) — both "N different countries" and
  "same country" directions, with a detection-gap guard.
- **Within-flight VARIETY diversity IS enforced** (R2/R3 + `validateOriginDiversity`), including the
  blend-dominant-grape overlap case.
- **Flight size is range-checked per family** (`validateFlightSize`) — important because it governs how
  much spread a flight *should* have.

---

## 4. Recommendations (concrete, tagged)

1. **Add an OW/NW within-flight check** `[question-gen]`. Tag every wine `world` at generation (derive
   from detected country — the corpus has zero unknown-world wines). For non-same-origin families
   (exclude F2/F7), warn (soft) when a 3+ wine flight is single-world, since ~60% of real ones mix.
   Make it soft, not hard (pure-OW flights are still 46% legitimate), but surface it so the generator
   reaches for contrast.

2. **Add a whole-paper composition validator** `[whole-test]` run by `/generate-mock-exam` over all 12
   wines, checking against corpus bands:
   - distinct countries ≥ 4 (P1/P2 ≥5 ideally), distinct varieties ≥ 7;
   - **OW:NW within band** — P1/P2 target 7–8 OW (flag if <6 OW or NW-majority), P3 target ≥9 OW
     (flag NW > 3); never allow a majority-NW paper;
   - **age signature** — P1 mostly ≤7y with ≤a couple 8+; P3 allow 20–30% NV and the oldest wines.
   Emit a one-line composition report per generated paper so the user sees the spread.

3. **Track VINTAGE/AGE diversity** `[question-gen][whole-test]`. At flight level, optionally ensure
   F-appropriate flights aren't accidentally all-same-vintage; at paper level, check the per-paper age
   buckets above. Handle NV gracefully (P3 ~26% NV → vintage null is expected, not a defect).

4. **Feed OW/NW + age into answer/grading prose** `[answer-gen][grading]`. Model answers should
   explicitly exploit a flight's OW/NW split and young-vs-mature contrast as reasoning cues (they are
   how examiners build the flight); grading should reward a candidate who reads the contrast. This
   reinforces the existing "old world ≠ always superior" calibration note (`marking-principles.ts`).

5. **Document the targets in EK §4 + heuristics** `[whole-test]`. Add EK entries for the OW:NW per-paper
   band (P1/P2 ≈⅔ OW, P3 ≈82% OW, never NW-majority) and the per-paper age signature, citing this
   analysis — so downstream agents and the gap guide (`mw_exam_guide.md`) inherit the numbers.

---

### Feeds
- **`mw_exam_guide.md` (how the exam works):** §1.1–1.4 above are the diversity mechanics —
  family+flight-size drive within-flight spread; papers are ~6-country, 7–10-variety, ⅔-Old-World
  (P3 more), young-skewed (P1) → oldest+NV (P3) tours; age contrast is a deliberate ~20% device,
  vintage rarely asked.
- **`exam_gap_analysis.md` (our gaps):** §3 HIGH = no OW/NW tracking; MED = no vintage/age tracking +
  no whole-paper validator; LOW = P3 style-mechanism unvalidated. Country + variety within-flight are
  already covered.
