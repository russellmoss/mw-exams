# Gap Analysis 02 — Price Diversity & Price-Point Ratio (within-question + whole-test)

**Dimension:** distinct price bands per question (flight) and the price-band MIX per paper / per whole test.
**Caveat up front:** `price_band` is a *coarse* 5-bucket quality proxy (value ≤$15, mainstream $16–30,
premium $31–60, super_premium $61–120, luxury $120+), and 51% of last-10 bands are
`classification_inferred` rather than `explicit_price` (only 36/504 corpus-wide are explicit). Treat the
numbers below as directional, not precise. Source bands:
`outputs/heuristics/quality_price_tier_analysis.md`; structured data:
`data/structured/corpus_wines.json` + `corpus_questions.json` (joined on `wine_ids → price_band`).

All figures are **last-10 sat years** (`is_last10=true`, 2020 not held): 360 wines, 112 questions, 30 papers.

---

## 1. What the real exam does — quantified + cited

### 1a. Within-question price spread (distinct bands per flight)

Distribution of distinct price bands per question (n=112):

| distinct bands | questions | share |
|---|---|---|
| 1 (homogeneous) | 35 | **31%** |
| 2 | 56 | 50% |
| 3 | 20 | 18% |
| 4 | 1 | 1% |

- **~1/3 of flights are price-homogeneous; only ~19% ladder across ≥3 bands.** The exam is NOT broadly
  laddered by default — most questions sit in a narrow 1–2-band window.
- **Spread scales cleanly with flight size** (mean distinct bands): 2-wine 1.51 · 3-wine 1.77 ·
  4-wine 2.16 · 5-wine 2.57 · 6-wine 2.67. Larger comparative flights deliberately recruit more tiers.
  - 4-wine flights: 5 homogeneous / 16 two-band / 10 three-band (mean 2.16).
- **By family** (mean distinct bands, n, #≥3):
  - **F4 (mixed breadth): 2.21, n=33, 11 with ≥3** — the broadest-laddering family.
  - F3: 2.00 (n=6). F1 (same variety): 1.80 (n=25). F5: 1.75. F6: 1.75. F2 (same country): 1.67. F7: 1.62.
  - Note: F4 ladders **widest on price even though the prompt explicitly caps F4 on quality-tier** — F4
    breadth comes from spanning value-to-premium regional wines, not from compression.

### 1b. Per-paper / per-test price-band MIX (the ratio target)

Last-10 wines by paper (counts → % → projected per 12-wine paper):

| band | P1 % (~/12) | P2 % (~/12) | P3 % (~/12) |
|---|---|---|---|
| value | 21.7% (2.6) | 16.7% (2.0) | 16.7% (2.0) |
| mainstream | 5.0% (0.6) | 1.7% (0.2) | 2.5% (0.3) |
| premium | 51.7% (6.2) | 44.2% (5.3) | 50.8% (6.1) |
| super_premium | 17.5% (2.1) | **33.3% (4.0)** | 12.5% (1.5) |
| luxury | 4.2% (0.5) | 4.2% (0.5) | **17.5% (2.1)** |
| **HIGH (sp+lux)** | **22%** | **38%** | **30%** |
| value+mainstream | 27% | 18% | 19% |

**The audit's qualitative claim is confirmed with numbers:**
- **P1 = value→premium tilted.** Highest value share (27% value+mainstream), lowest high-end (22%).
- **P2 = heaviest super-premium** (33%, ~4 of 12 wines) → highest HIGH share overall (38%); driven by
  classed-growth reds. Lowest value+mainstream alongside P3.
- **P3 = most luxury** (17.5%, ~2 of 12 — fortified/sweet icons), modest super-premium.

**Is the ratio STABLE per paper?** Reasonably so as a center, but with real year-to-year swing in the
HIGH (super_premium+luxury) share across the 10 papers:
- P1: mean 22%, range 0–42%
- P2: mean 38%, range 8–50%
- P3: mean 30%, range 17–42%

So a per-paper *target band* (with tolerance) is defensible; a hard single-point ratio is not.
Matches EK-0027 (the EK uses all-504 counts: P1 value 46/prem 82; P2 super_premium 43; P3 luxury 24 —
same shape as the last-10 percentages above).

### 1c. Quality questions — broad ladder vs internal hierarchy vs compressed-high (EK-0028)

Of 103 quality-ish last-10 questions (stem mentions quality/commercial, or family F7):

- **≥3 price bands (broad discrimination ladder): 21 (20%)**
- **Compressed all-premium-plus, <3 bands: 53 (51%)**
- **≥ half super-premium/luxury: 35 (34%)**

So the *majority* of quality questions are **compressed/high, not broadly laddered.** This is consistent
with EK-0028's "two valid modes" — but the corpus tilt is clearly toward **internal-hierarchy/compressed**
(51%) over **broad ≥3-band ladder** (20%). Examining family F7 (explicit hierarchy) confirms compression
is normal and legally scaffolded:
- 2015_p1_q1 (4 wines): luxury×3 + super_premium×1 — Burgundy multi-tier ladder, 2 bands.
- 2018_p3_q1 (6): luxury×4 + premium×2.
- 2021_p1_q3, 2021_p2_q1, 2022_p1_q1: **homogeneous (1 band)** — pure within-tier hierarchy.
- 2025_p3_q3 (6): value×3 + premium×2 + super_premium×1 — the one genuinely broad F7 ladder.

The key empirical rule (cross-ref `mock-exam-writer.md` lines 397–414): compression is fine ONLY when a
**legal classification scaffold** carries the hierarchy (14 of 18 historical quality ladders rest on
AOC/DOCG/Prädikat/1855 tiers); compressed-high WITHOUT a legal ladder = the failure mode EK-0028 warns
against.

### 1d. Price band vs curveball / benchmark role (EK-0026)

Price band by `curveball_level` (last-10 wines):

| curveball | n | value | premium | super_premium | luxury |
|---|---|---|---|---|---|
| low | 272 | 18% | 47% | 24% | 7% |
| medium | 61 | 16% | 56% | 10% | 15% |
| high | 27 | **26%** | **52%** | 15% | 7% |

**High curveballs cluster at value+premium (78%), almost never luxury (7%).** This confirms EK-0026 /
mock-exam-writer line 196 ("curveball tests breadth, not price discrimination; almost none luxury").
The curveball is a *cheap-to-mid obscure* wine, not an expensive trophy.

Price band by `benchmark_status` (the price↔role signal is strong):

| status | n | value | premium | super_premium | luxury |
|---|---|---|---|---|---|
| iconic_benchmark | 109 | 4% | 23% | **48%** | **25%** |
| benchmark_classic | 133 | 8% | **78%** | 8% | 2% |
| benchmark_regional | 44 | **48%** | 39% | 11% | — |
| nonbenchmark | 74 | **41%** | 41% | 11% | 3% |

So price band is essentially a **proxy for role**: iconic anchors are super_premium/luxury (73%);
classic bankers are premium (78%); regional bankers and curveballs are value/premium. A price-ratio
target is therefore *equivalent to* a role-mix target — the two should be designed together.

---

## 2. What our system has (cite code/EK)

### 2a. Single-question generator (in-app, deterministic) — NO price logic
- `study-app/src/lib/question-engine.ts`: the validation set run on every generated candidate is
  **paperScope, variety, marks, originDiversity, countryDiversity, banker, flightSize, novelty,
  generationConsistency** (see `validateBankedQuestion` and the main loop ~lines 399–444).
  **There is no price/tier/band check** — grep for `price|band|tier|luxury|super_premium` returns
  nothing relevant in the engine.
- `study-app/src/lib/question-rules.mjs`: the shared contradiction-rule layer (R1 country-diversity,
  R2 same-variety, R3 distinct-variety, R4 same-country, R5 single-variety-blend, R6 marks=25×wines,
  R7 P3 oxidative-white). **No price rule exists.** The normalized RuleWine shape
  (`{slot, varieties, region, country, is_blend, style}`) does **not even carry a price/tier field**,
  so price cannot currently be validated without extending the shape.
- `study-app/src/lib/prompts/question-generation-prompt.ts`: the ONLY price-adjacent guidance is the
  **qualitative F4 "QUALITY TIER CAP"** (lines 347–355: "avoid icon/prestige cuvées, use mid-tier
  regional-identity wines") and a one-line "use larger flights for hierarchy ladders" (line 243). No
  numeric price-band ratio, no per-question spread target, no whole-test ratio.

### 2b. Whole-test / mock-exam assembly — agent prose only, NOT enforced in code
- There is **no deterministic in-app whole-test assembler.** Mock-exam generation is agent-driven via
  `.claude/agents/mock-exam-writer.md` + the `/generate-mock-exam` command. The only in-app generator
  emits **single questions**.
- The mock-exam-writer agent DOES carry rich price guidance **as markdown prose** (so it is advisory to
  the LLM, never validated):
  - line 168–170: "Price tier balance within questions: no more than 2 wines from the same price tier
    in a 4+ wine flight (unless hierarchy); max price ratio in a sweet flight ~20:1."
  - line 172–173: absolute ceiling **$300–400/bottle** (IMW must buy ~25 bottles).
  - line 196 / 203: curveballs $10–60, "almost none luxury."
  - lines 397–414: quality-ladder rules (must rest on legal tiers; ≤ one wine per legal tier in a ladder).
- These never reach the deterministic path: the in-app engine doesn't implement them, and there is no
  audit/validator rule mirroring them in `question-rules.mjs` / `question-validator.ts`.

### 2c. Knowledge captures it, generation doesn't enforce it
- EK-0026 (curveball price), EK-0027 (per-paper band distribution), EK-0028 (quality-question modes)
  in `mw_exam_empirical_knowledge.md` §4 describe the targets accurately, and
  `outputs/heuristics/quality_price_tier_analysis.md` even states an explicit "Exam Writer Rule."
  **But no generation or validation code consumes any of it.** Price is documented, never enforced.

---

## 3. Meaningful gaps — prioritized

### HIGH — No within-question price-spread rule in the single-question generator/validator
The in-app generator (the path that actually serves users their drills/questions) has zero price logic.
It can legitimately emit a 4-wine "comment on quality" flight that is 4× super_premium (the EK-0028
failure mode: ranking turns on reputation, not observable evidence), or a "broad discrimination" quality
question that is price-homogeneous. The corpus shows real flights ladder by size and family
(4-wine mean 2.16 bands; F4 mean 2.21) — none of that is captured. This is the single highest-value gap
because it affects every generated question, not just full mock exams.
**[question-gen][whole-test]**

### MED — Quality-question mode (broad ladder vs legal-tier hierarchy) is unvalidated
EK-0028 is tagged STRONG SIGNAL and is the most actionable price rule, yet nothing enforces the binary:
a quality/commercial/F7 question must EITHER span ≥3 bands OR be compressed-high *with a legal-classification
scaffold in the stem/wines*. Corpus: 51% of quality questions are compressed-high; that's only valid with
a legal ladder, which is exactly the unchecked condition. **[question-gen][grading]**

### MED — Per-paper / whole-test price-ratio target exists only as agent prose
The per-paper band mix (P1 value-tilted, P2 super_premium-heavy 38% HIGH, P3 luxury-heavy) is stable
enough (with tolerance) to be a target, and the $300–400 ceiling + 20:1 sweet ratio are concrete — but
all of it lives in `mock-exam-writer.md` prose with no validator. A generated mock paper that is, say,
all-premium P2 (no super_premium anchors) or has a $600 wine would pass silently. **[whole-test]**

### LOW — Price↔role coupling not exploited; price_band field absent from the rule shape
Price band is ~equivalent to benchmark role (iconic=high, regional/nonbenchmark=value). The banker
validator already exists; a price-aware version could reuse benchmark_status. Minor: the RuleWine shape
lacks any price/tier field, so any price rule needs a small schema extension first. **[question-gen]**

### LOW — answer-gen / grading don't reference price calibration explicitly
`marking-principles.ts` correctly penalizes mis-calibration both ways (over/under-calling quality) and
asks for "a realistic price" in commercial answers, but there is no price-band scaffold tying the model
answer's quality verdict to the wine's actual tier. This is mostly adequate; flagged for completeness.
**[answer-gen][grading]**

---

## 4. Recommendations

### [question-gen] Proposed within-question price-diversity rule (add to `question-rules.mjs`)
First extend the normalized RuleWine shape with `price_band` (resolvable from the wine bank /
`commercial_tier`). Then add a SOFT rule (price is a coarse proxy — soft, not hard):

```
R8 price-spread (soft):
  let nbands = distinct price_bands in flight; allHigh = every band in {premium,super_premium,luxury}
  // mode A — quality/commercial/F7 stem:
  if isQualityStem(stem) or family == "F7":
     if nbands < 3 and not hasLegalLadderSignal(stem, wines):   // legal scaffold = AOC/DOCG/Cru/Pradikat/1855/Reserva tiers, or same producer/appellation
        flag soft "compressed quality flight with no legal-ladder scaffold (EK-0028)"
  // mode B — comparative breadth (F4) and 4+ flights:
  if flight_size >= 4 and nbands < 2:
     flag soft "4+ wine flight is price-homogeneous; corpus mean distinct bands at this size is ~2.2 (EK)"
  // tier-clustering cap (mirror mock-exam-writer line 169):
  if flight_size >= 4 and max wines in any single band > 2 and not hierarchyStem:
     flag soft "more than 2 wines share one price tier in a 4+ flight"
```
Calibrate thresholds to the measured family/flight-size means (4-wine ≈2.16, F4 ≈2.21). Keep SOFT so the
coarse proxy never hard-blocks a legitimate flight; surface in the audit + feedback path like other soft rules.

### [whole-test] Proposed per-test price-ratio target (for the mock-exam assembler / a new whole-test validator)
Per 12-wine paper, target the corpus center with a tolerance band (counts, ±1–2 wines):

| band | P1 target | P2 target | P3 target |
|---|---|---|---|
| value+mainstream | 3 (range 2–4) | 2 (1–3) | 2–3 (1–4) |
| premium | 6 (5–7) | 5 (4–6) | 6 (5–7) |
| super_premium | 2 (1–3) | **4 (3–5)** | 1–2 (1–3) |
| luxury | 0–1 | 0–1 | **2 (1–3)** |
| → HIGH (sp+lux) share | ~22% (≤ ~33%) | ~38% (30–50%) | ~30% (17–42%) |

Plus the two hard whole-test guards from agent prose, now enforced: **no wine > ~$300–400 equivalent**
(reject luxury wines flagged as icon/trophy beyond ceiling), and **sweet-flight intra-question price
ratio ≤ ~20:1**. Implement either by extending `mock-exam-writer.md` into a checklist the agent must
self-verify against these counts, OR (better) a small deterministic post-assembly validator that joins
the assembled 12 wines → price_band and asserts the per-paper band counts fall in the tolerance ranges.

### [grading][answer-gen] Tie quality verdict to actual band
When the model answer / grader knows the wine's `price_band`/`commercial_tier`, scaffold the expected
quality call to that tier (e.g. a value-band wine should not be model-answered as "outstanding/iconic"),
reinforcing `marking-principles.ts`'s existing both-ways mis-calibration penalty with a concrete anchor.
Low effort, complements the existing rule.

### Sequencing
1. (HIGH) add `price_band` to RuleWine + R8 soft within-question spread rule — single biggest coverage win.
2. (MED) EK-0028 quality-mode check (part of R8).
3. (MED) whole-test per-paper ratio validator + ceiling/sweet-ratio hard guards.
4. (LOW) grading/answer price anchor.
