# Gap Analysis 05 — Grading & Reasoning-Reward

**Dimension:** Do we truly understand HOW examiners grade and what they reward/penalize in REASONING
(deductive structure, funnelling, plausibility-gradient credit, howlers, cascade/internal-consistency
errors), and is all of it operationalized in BOTH the grader AND the model-answer generator?

**Verdict up front:** This is the strongest-covered dimension in the system, and the earlier audit was
right. The 291-principle mining pass (`grading_gap_analysis.md`) was almost fully *implemented* into
`MARKING_PRINCIPLES` + `FUNNELLING_PRINCIPLE`, both injected into the two graders, and canonized in
`mw_exam_empirical_knowledge.md` §2/§3 (EK-0006–0022, EK-0086–0094). The residual gaps are real but
narrow, and they cluster in **two places**: (1) the **model-answer generator** under-demonstrates a few
reasoning behaviors the grader penalizes (asymmetry), and (2) grading is **prose-only** with no
structured score, which makes the two hard "override" rules (howler→FAIL, cascade→zero) *advisory* to
the model rather than mechanically enforced.

---

## 1. What the real exam does — how grading + reasoning-reward works

Cited to the synthesis (`outputs/heuristics/examiner_report_synthesis.md`) and the 291-principle mining
(`outputs/heuristics/grading_gap_analysis.md`); years are the examiner reports those docs quote.

- **Reasoning > identification.** Every report 2017–2025. "More marks can be given when the conclusion
  is wrong, as we can then see and reward intelligent thinking" (2019); "5–6/8 if reasoning was sound"
  even with a wrong origin (2025). Most ID marks live in the **argument, not the conclusion** (2022).
- **Funnelling is the endorsed method** (named 2017): read hard structural evidence first → put 2–3
  plausible options on the table with for/against → commit to a broad anchor early → narrow → land a
  decisive call. Two anti-patterns lose marks: the **snap-call** (one wine, no alternatives) and
  **shoehorning** (decide identity first, bend the structure to fit — "led to the failure of many
  candidates", 2025).
- **Plausibility-gradient partial credit.** Wrong IDs are scored on a sliding scale, not binary:
  "USA → Australia still received some credit, however Italy … few marks" (2021).
- **Cascade / internal-consistency errors** (the most-penalized 2021–2025 failure mode). Candidates
  misID, then "put in figures of alcohol and sugar to match, rather than assess the evidence in the
  glass" (2022), or "wrote an answer for what they had guessed it was, rather than referring to the
  wine itself" (2021). Internal contradiction ("a VDN at 20%", "Champagne at 14%") is a logical
  impossibility → no conclusion mark.
- **Howlers sink borderline papers.** Production-method / appellation / legal-fact errors ("Tawny in a
  solera", "Amontillado at 14.5%", "Douro, Spain", "Meursault Grand Cru") destroy examiner confidence;
  at the pass boundary, moderation withholds the benefit of the doubt (2017, 2018, 2024, 2025).
- **Quality must be contextualized AND calibrated both ways.** Bare "good" earns ~0 (2021); name the
  official tier even if unasked (2025). Penalize **over-calling** (CdR called Châteauneuf, Ruby called
  Vintage Port — 2025) as well as under-calling from origin bias (2017); don't mistake **maturity for
  quality** (2019).
- **Maturity needs four concrete parts** (2023): current age, drink-now vs needs-age, how long it
  improves, how long it holds — with real timeframes, not "matured for many years."
- **Commercial needs channel + geography + price + competitive set** (2022–2025); steakhouse/food-pair
  boilerplate "rarely rewarded."
- **Answer every sub-part, and the EXACT question** — both halves of "opportunities AND challenges",
  true compare/contrast not separate notes, quality *in the context of origin*; restating the stem
  earns nothing (2023, 2024, 2025).
- **No cut-and-paste across wines** — identical wording / the same technique on every wine "creates
  considerable doubt in the mind of the reader" (2023, 2024).
- **Verdict mechanics:** absolute 65% pass, four-dimension mastery (structural reading, communication,
  theory accuracy, quality judgement — 2024), top-band reserved for "under the skin of the wine" (2022)
  engaged/second-order insight and genuine enthusiasm (2025).

---

## 2. What our system does — principle → prompt-constant map

Two shared constants carry the rubric, both injected into the two graders that score written answers:

- `study-app/src/lib/prompts/marking-principles.ts` → `MARKING_PRINCIPLES`
- `study-app/src/lib/prompts/funnelling.ts` → `FUNNELLING_PRINCIPLE`

Injection points (verified):
- **Per-answer grader** — `study-app/src/app/api/evaluate-answer/route.ts` → `buildAnswerEvaluationSystemPrompt`
  (`answer-evaluation-prompt.ts`) injects BOTH constants. Model: Sonnet (`answer_grading`).
- **Full-debrief grader** — `study-app/src/app/api/evaluate-full/route.ts` injects BOTH constants
  inline (lines 48/50) plus an explicit "In the Glass → assess funnelling" instruction. Model: Opus.
- **Model-answer generator** — `study-app/src/lib/prompts/model-answer-prompt.ts` injects
  `FUNNELLING_PRINCIPLE` *plus* the full 14k-char `examinerReportSynthesis` and the 19.7k-char
  `mockAnswerWriterAgent` from `public/data/pipeline-context.json`. It does **NOT** import
  `MARKING_PRINCIPLES` (it relies on the synthesis + agent text to carry the rubric).
- **Pre-glass reasoning grader** — `study-app/src/app/api/evaluate-reasoning/route.ts` →
  `pre-glass-prompt.ts`. Deliberately scoped to "open the plausible field, don't fixate"; does NOT
  inject `MARKING_PRINCIPLES` (correct — it's not scoring a finished answer).

**Principle → constant coverage (grader side, in `MARKING_PRINCIPLES`):**

| Examiner principle | Encoded? | Where |
|---|---|---|
| Reasoning > ID; argument > conclusion | Yes | Cardinal Rule 1 + calibration bullet 3 |
| Grade to PRINTED tariff, not fixed % | Yes | calibration bullets 1–2 (EK-0089) |
| Plausibility-gradient partial credit | Yes | calibration bullet 4 (EK-0090) |
| Specificity / funnel must land concrete | Yes | Cardinal Rule 2 + `FUNNELLING_PRINCIPLE` |
| Quality contextualized + over/under-call + maturity≠quality | Yes | Cardinal Rule 3 (EK-0092) |
| Winemaking tied to glass w/ parameters | Yes | Cardinal Rule 4 |
| Maturity 4-part + concrete timeframes | Yes | Cardinal Rule 5 (EK-0011) |
| Commercial: channel/geo/price/competitive set | Yes | Cardinal Rule 6 |
| Answer every sub-part / EXACT question | Yes | Cardinal Rule 7 |
| Depth scales to marks | Yes | Cardinal Rule 8 (EK-0017) |
| No cut-and-paste across wines | Yes | Cardinal Rule 9 |
| Internal-consistency + cascade error | Yes | Cardinal Rule 10 (EK-0091) |
| Howler → caps mark + tips BORDERLINE→FAIL | Yes | "Howlers and the borderline (HARD rule)" (EK-0093) |
| Professionalism / spelling / jargon | Yes | "Professionalism" block |
| Top-band "under the skin" / enthusiasm | Yes | "Top-band differentiator" (EK-0094) |
| Absolute 65% bands, 4-dimension mastery | Yes | calibration bullets 5–6 (EK-0093) |
| Faithful verdict, constructive voice | Yes | "Tone" block |

The grader side is **essentially complete** — all 17 themes from the 291-principle mining are present,
with verbatim examiner quotes and EK cross-refs. Every paste-ready snippet from `grading_gap_analysis.md`
§2 was implemented.

**Model-answer-generator side** (`mockAnswerWriterAgent` + `examinerReportSynthesis`) term scan:
funnelling ✓ (3 hits, with "never work backward from a known wine" — the cascade antidote), maturity
4-part ✓, official-tier/quality-context ✓, commercial channel+competitive-set ✓, cross-referencing
wines ✓, enthusiasm ✓. **Absent as explicit generation instructions:** anti-cut-and-paste
differentiation, quality over-calling avoidance, "under the skin" / second-order-insight target, and an
explicit internal-consistency demonstration. (The synthesis doc *mentions* cut-and-paste and howlers as
background, but the **agent's own instructions** don't direct the generator to demonstrate
differentiation or top-band insight.)

---

## 3. Meaningful gaps (prioritized; honest about what's well-covered)

### Well-covered — do NOT manufacture gaps here
Funnelling (both grade + generate), reasoning>ID, plausibility gradient, howler override,
cascade/internal-consistency, maturity-4-part, commercial, answer-the-exact-question, depth-to-tariff,
quality mis-calibration, absolute bands, four-dimension mastery. All present in `MARKING_PRINCIPLES`,
both graders, and §2/§3. This dimension is genuinely the system's strongest.

### HIGH — Grading is prose-only; the two HARD "override" rules are advisory, not enforced
Both graders stream **free text** (verdict + per-question marks as prose; `evaluate-answer/route.ts`,
`evaluate-full/route.ts`). There is no structured/JSON score schema. Consequence: the two rules the
rubric itself labels "HARD" — **howler tips BORDERLINE→FAIL** and **cascade/internal-contradiction →
zero conclusion mark** — depend entirely on the model choosing to apply them in prose. There is no
post-hoc check that, e.g., a script flagged with a named howler did not still emit "Result: BORDERLINE",
and no enforcement that a self-contradiction ("Champagne at 14%") actually zeroed the conclusion mark in
the printed sub-total. This is the single highest-value residual gap: the rules are written but not
*operationalized* as mechanics. [grading]

### MED — Model-answer generator omits anti-cut-and-paste & top-band-insight demonstration (grader↔generator asymmetry)
The grader penalizes cut-and-paste (Cardinal Rule 9) and reserves top marks for "under the skin"
insight (top-band differentiator), but the `mockAnswerWriterAgent` instructions do not direct the
generator to (a) make each wine's answer *visibly differentiated* in a flight, or (b) include a
second-order insight in the model answer. Effect: the canonical "model" answer a candidate studies may
not itself model the differentiation or the top-band move the grader rewards — a student matching the
model answer's altitude could still be marked down for sameness, or never see what an outstanding answer
looks like. [answer-gen]

### MED — Quality over-calling not surfaced to the generator
`MARKING_PRINCIPLES` penalizes over-calling (CdR→Châteauneuf, Ruby→Vintage Port). The generator agent
covers quality contextualization and official tiers but has no instruction to *calibrate down* / avoid
inflating a lesser wine. Low real-world risk (the generator knows the true wine), but worth a one-line
guard so model answers explicitly demonstrate calibrated-not-inflated quality language. [answer-gen]

### LOW — Pre-glass reasoning grader doesn't reward plausibility-gradient on the candidate field
`pre-glass-prompt.ts` correctly rewards "open the field, don't fixate," but doesn't grade the candidate's
*starting* field on a plausibility gradient (a sensible 2–3-option set vs an implausible scatter). Minor:
pre-glass is coaching, not scored marks, but a light "reward a plausible, tight candidate set; gently
flag an implausible or scattershot one" would align it with EK-0090. [grading]

### LOW — No explicit "internal consistency" demonstration in the model answer
The generator is told "never work backward from a known wine" (good cascade antidote) but isn't told to
*show* the structure→identity consistency check that the grader rewards. Nice-to-have so the model answer
visibly models self-consistent deduction. [answer-gen]

---

## 4. Recommendations (concrete, tagged)

1. **[grading] Add a structured score + override-enforcement pass (HIGH).** Have the graders emit a
   small JSON block (per-sub-part marks, verdict, `howlerPresent: bool`, `cascadeFlag: bool`) alongside
   the prose, then enforce in route code: if `howlerPresent && verdict === "BORDERLINE"` → coerce to
   FAIL and require the named howler; if `cascadeFlag` true for a sub-part, assert its conclusion mark
   is 0. This converts the two HARD rules from advisory prose to mechanics. Minimal change:
   `evaluate-answer/route.ts` + `evaluate-full/route.ts` parse a trailing fenced JSON and post-validate.

2. **[answer-gen] Add three lines to `mockAnswerWriterAgent`** (in `pipeline-context.json`, and its
   source agent `.claude/agents/mock-answer-writer.md`): (a) "In a multi-wine flight, make each wine's
   answer visibly differentiated — never reuse the same technique/phrasing across wines (examiners
   penalize cut-and-paste)"; (b) "Include at least one second-order/'under the skin' insight on the
   strongest wine"; (c) "Calibrate quality both ways — do not inflate a lesser wine to a prestige tier."

3. **[answer-gen] Consider importing `MARKING_PRINCIPLES` into `model-answer-prompt.ts`** so the
   generator and grader share one source of truth instead of the generator relying on the (overlapping
   but not identical) synthesis + agent text. This closes the asymmetry at the root and prevents future
   drift when `MARKING_PRINCIPLES` is updated.

4. **[grading] One-line plausibility-gradient reward in `pre-glass-prompt.ts`** (LOW): reward a tight,
   plausible candidate set; gently flag a scattershot/implausible one.

5. **[answer-gen] Optional: have the model answer narrate its structure→identity consistency check**
   ("the 13% alcohol, high acidity and no RS rule out a botrytis wine, confirming the dry-style call"),
   modeling the internal-consistency behavior the grader rewards.

No **[question-gen]** or **[whole-test]** actions arise from this dimension — grading and reasoning-reward
are downstream of question generation; the relevant fixes are all in the graders and the answer
generator.

---

### Feeds
- `mw_exam_guide.md` (how grading works): §1 above is a clean, cited summary of the grading + reasoning-
  reward model.
- `exam_gap_analysis.md` (our gaps): the HIGH item (prose-only graders → unenforced HARD overrides) and
  the grader↔generator asymmetry (MED) are the two carry-forward findings.
