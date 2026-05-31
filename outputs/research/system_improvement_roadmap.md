# MW System Architecture Review — System Improvement Roadmap

> **Mandate.** Decide how the MW study system should change, given six adversarial research reads
> (`examiner_objectives.md`, `evolution_analysis.md`, `distinction_candidate_analysis.md`,
> `examiner_confidence_model.md`, `future_exam_prediction.md`) and the canonical
> `mw_exam_empirical_knowledge.md` (EK). Every recommendation is grounded in **what the code, prompts,
> and validators actually do today** (audited 2026-05-31), not in what they aspire to.
>
> **Adversarial stance honoured.** The highest-ROI items below are *corrections of things the system
> currently gets wrong* (a load-bearing grading constant is factually wrong; the fastest-rising exam
> objective is entirely absent from generation), not confirmations of what works. Disconfirmations are
> ranked first.
>
> **Author:** System Architecture Review Team pass, 2026-05-31.

---

## 0 · How the system works today (audited baseline)

The audit established the real current behaviour, which bounds every recommendation:

**Single source-of-truth files**
- **Grading rubric:** `study-app/src/lib/prompts/marking-principles.ts` (MARKING_PRINCIPLES) — injected into
  model-answer generation, answer evaluation, and feedback. This is *the* place grading doctrine lives.
- **Funnelling:** `study-app/src/lib/prompts/funnelling.ts` — argument-structure definition, injected
  everywhere ID reasoning is graded or generated.
- **Contradiction rules:** `study-app/src/lib/question-rules.mjs` (R1–R7) — shared by generation and
  validation; the only *hard* structural validator layer.
- **Generation content:** `study-app/src/lib/prompts/question-generation-prompt.ts` +
  `study-app/src/lib/question-engine.ts` (8-attempt retry/relax orchestrator).
- **EK:** `mw_exam_empirical_knowledge.md` (highest live entry **EK-0103**), grown by the resolved-feedback
  sync (`empirical_knowledge_doc_plan.md`).

**What is already well-built** (survives falsification — do not touch except via EK scope labels)
- 25-marks-per-wine invariant (hard rule R6); paper scope; variety/country consistency; banker minimum;
  P3 oxidative still-white sub-rule.
- Grading already encodes: theory-howler→borderline-FAIL override (with detect-only telemetry in
  `grading-telemetry.ts`), internal-consistency cascade zeroing, bidirectional quality calibration,
  cut-and-paste penalty, "answer the exact question / opportunities AND challenges both halves," four-part
  maturity, plausibility-gradient ID credit.
- Feedback analysis is durable, reconcilable, corpus-anchored, and already injects EK verbatim — so
  **correcting EK automatically improves feedback rulings.** This is leverage.

**The decisive structural fact for prioritisation:** because MARKING_PRINCIPLES and EK are *injected* into
multiple downstream generators, a one-file edit to either propagates to generation, grading, and feedback
at once. The highest-ROI changes are therefore edits to these two hubs.

---

## 1 · Evaluation by subsystem (the seven areas)

### 1.1 Question generation
- **Strength:** structural correctness is airtight (scope, marks, variety/country, banker).
- **Gap (critical):** the **integrated multi-factor synthesis** archetype (climate×winemaking×style;
  human-vs-nature; why-blend) — the *fastest-rising objective in the corpus* (Obj-9; H1; EK-FP-1) — is
  **absent**. Climate-as-driver framing (the strongest forward signal, verbatim repeated 2024+2025) is only
  a passing phrase in one sub-question template (L418).
- **Gap:** quality-frame parameter (region | classification | **global**) absent; ID-light/zero-ID emission
  absent; commercial dual-pole absent; sub-region precision absent; producer verticals absent.
- **Mis-modelled:** mark-type allocation is a **static cap** (~46–55% ID, L402–404), but the corpus shows it
  **rotates** ("you never know where the weighting will be," EK-FP-3). Static targeting trains candidates to
  a slope that doesn't exist.

### 1.2 Wine selection
- **Strength:** banker minimum, OW:NW bands, quality-tier caps, wine-bank enrichment all function.
- **Gap:** `wine-enrichment.ts` lists `orange` as a first-class style category and the P3 distribution can
  pick skin-contact as a theme — but the corpus shows skin-contact **peaked 2014–2019 and is absent
  2021–2025** (M2; proposed EK-0108). The system can teach a dead theme.
- **Gap:** no producer-vertical/horizontal selection device (M4); no preference signal toward the
  *persistent* indigenous-esoterica family (established Greek/Austrian/Hungarian/Portuguese) over orange.

### 1.3 Answer generation
- **Risk (existential to the product's validity):** the 2024 Chief named *"over-reliance on the study
  programme… eroding students' ability to think for themselves"* as the top-band killer, and cut-and-paste
  is explicitly penalised. `model-answer-prompt.ts` only *partially* guards freshness and **does not** script
  the distinction-grade move (**reconcile conflicting evidence**, the single most examiner-praised behaviour
  — the Tokaji-Szamorodni example). A study app that ships templated model answers trains the exact failure
  the examiners engineer against (distinction §5.4; H7).
- **Gap:** model answers don't mandate full-scale/within-classification/origin-blind/volunteer-tier quality,
  nor climate-driver causal chaining — even though MARKING_PRINCIPLES expects them at grade time.

### 1.4 Grading
- **WRONG (factual error in a load-bearing constant):** `marking-principles.ts` L15 states *"the pass mark
  is an ABSOLUTE 65% per paper."* The public IMW Student Guide and three reads establish it is **a 65%
  AVERAGE across the three papers + a per-paper floor (~50%)** — not 65% per paper (examiner_confidence_model
  §7 row 1; distinction §0; memory `ek-0093-pass-standard-correction`).
- **Gap (sharpest convergent correction in the whole corpus):** "reasoning > ID" is encoded
  *unconditionally*. The corpus says it is **conditional**: only *plausible, structure-grounded* reasoning
  rescues a wrong call; a wrong **structural** read is **fatal** while a wrong **origin** on a sound read is
  **survivable**; and **bankers get no latitude** while esoterica do (H4; EK-0108/0107 drafts; objectives A3).
  None of this asymmetry is in the grader.
- **Gap:** the distinction band (A 70+/B 65–69/C+ 60–64) and "distinction = consistency, not peak" are
  absent (though the latter is only partly expressible in a single-question app — see §3 caveat).

### 1.5 Feedback
- **Strength:** durable, reconcilable, corpus-authoritative ("if a real MW exam did it 2011–2025, allow it"),
  injects live EK. Architecturally sound.
- **Gap:** the prompt has no explicit guard that **mark allocation rotates** — an "unusual" mark split is a
  *real* exam behaviour and should not be grounds to reject a generated question (EK-FP-3).

### 1.6 Validation
- **Strength:** R1–R7 hard rules are correct and the 25/wine invariant is properly enforced (the era
  analysis *strengthened* this rule).
- **Gap:** validators are purely *structural*. There is no soft validator for the *modern question shape*
  (synthesis present? climate frame available? quality-frame tagged? ID-share within the rotating band?).
  This is acceptable as a deliberate scope line, but it means generation-quality drift is only caught by
  feedback, not pre-emptively.

### 1.7 Knowledge management
- **Blocking issue:** four research passes **independently drafted entries EK-0104…EK-0111 with colliding
  IDs and overlapping content** (future_exam_prediction explicitly flags this). Until reconciled into one
  consecutive block, no prompt can safely cite "EK-0104."
- **Gap:** EK-0096…0102 (composition stats) are read as timeless assessment objectives when they are
  *last-10 generation-tuning parameters blind to 2011–2014* (objectives C2; evolution EK-0107 draft). Several
  live entries are now wrong/overfit (EK-0005, EK-0006, EK-0008, EK-0035, EK-0078, EK-0093, EK-0023).

---

## 2 · Recommendations, tiered by ROI

ROI = (assessment-accuracy impact × confidence) ÷ implementation effort, with **correctness bugs weighted
above feature gaps**. Each recommendation lists: rationale · evidence · expected impact · effort · confidence
· and the affected **code / prompts / validators / EK**.

---

# Tier 1 (Highest ROI)

### T1-1 · Correct the pass-standard constant (65% AVERAGE + floor, with grade bands)
- **Change:** In `marking-principles.ts` replace *"ABSOLUTE 65% per paper"* with: pass = **65% average across
  the three papers + a per-paper minimum floor (~50%)**, criterion-referenced (not a curve); add the band
  structure **A ≥70 / B 65–69 / C+ 60–64 (borderline) / <C below**. Keep the per-question verdict thresholds
  but relabel them as a *single-question proxy for the band*, not "the pass mark per paper."
- **Rationale:** a load-bearing grading constant is factually wrong; it mislabels how the IMW actually passes
  candidates and frames every verdict shown to the user.
- **Evidence:** examiner_confidence_model §7 row 1 (public IMW Student Guide overrides corpus); distinction §0;
  memory `ek-0093-pass-standard-correction` (HIGH severity, pending merge).
- **Expected impact:** corrects user-facing framing across all grading + feedback (MARKING_PRINCIPLES is
  injected everywhere); unblocks the EK-0093 merge.
- **Effort:** **Trivial** (one prompt file + one EK entry).
- **Confidence:** **HIGH** (public, authoritative source).
- **Code:** none. **Prompts:** `marking-principles.ts` (and transitively `answer-evaluation-prompt.ts`,
  `model-answer-prompt.ts`, `feedback-analysis-prompt.ts` via injection). **Validators:** none.
  **EK:** correct **EK-0093** (supersede the "per paper" clause).
- **Caveat (honesty):** the app grades single questions, so the *average-across-papers* rule cannot be
  enforced in per-question scoring — this is a **framing/messaging** fix, not a scoring-logic change. Say so
  in the prompt so the grader stops asserting a false per-paper rule.

### T1-2 · Make "reasoning > ID" CONDITIONAL, and encode the structural/origin asymmetry + banker/esoteric latitude
- **Change:** In `marking-principles.ts` (and mirror the key clause in `funnelling.ts`):
  1. Reasoning rescues a wrong call **only when** (a) the conclusion is *plausible/adjacent* and (b) the
     **structural read is correct**.
  2. **Asymmetry:** a wrong **structural** read (alcohol/acidity/tannin/RS) cascades fatally; a wrong
     **origin** on a sound structural read is survivable — grade the two miss-types differently.
  3. **Latitude scales with wine difficulty:** **bankers / paramount classic regions get little-to-no
     latitude** (only-correct earns full ID marks); esoterica get generous reasoning credit.
- **Rationale:** the single sharpest convergent correction across all four reads; the current unconditional
  rule over-rewards well-written nonsense on bankers and under-penalises fatal structural misreads.
- **Evidence:** objectives A3 + Obj-1/Obj-12 (2025 Rhône flight; "had to be in Tuscany," 2022); distinction
  §5.2/§5.3; confidence model §5A (cascade); future H4; EK-0108/0107 drafts.
- **Expected impact:** materially more accurate grading on exactly the cases the exam is built to
  discriminate; better feedback (corpus-anchored).
- **Effort:** **Small** (prompt edits). To fully wire (h) the grader needs a *wine-difficulty signal* — the
  wine bank already carries `quality_tier` and the generator already tags a "banker," so pass a
  `wineDifficulty: banker | classic | esoteric` hint into the evaluation context (small plumbing).
- **Confidence:** **HIGH** (4-read convergence).
- **Code:** `study-app/src/app/api/evaluate-answer/` + `evaluate-reasoning/` (thread the difficulty hint);
  optionally `stem-scoring.ts` (scale partial credit by bucket difficulty — currently only a +2 curveball
  bonus on HIT). **Prompts:** `marking-principles.ts`, `funnelling.ts`, `answer-evaluation-prompt.ts`.
  **Validators:** none. **EK:** refines **EK-0007**, **EK-0086**, **EK-0090**; merge EK-0107/0108 drafts.

### T1-3 · Add the integrated multi-factor synthesis archetype to generation
- **Change:** Add a first-class question archetype in `question-generation-prompt.ts` (and the family taxonomy
  in `question-engine.ts`): *"apportion this wine's character among climate, winemaking, and terroir"* /
  *"relative importance of human inputs vs natural factors"* / *"purpose of (or reasons against) blending."*
  Choose wine sets that form a deliberate **gradient** on the relevant axis (increasing human input,
  cool→warm). The wines are vehicles; the gradient is the point.
- **Rationale:** the **fastest-growing objective in the corpus** and the examiners' explicit anti-rote weapon;
  it is currently absent from generation, so the system cannot drill the competency most likely to decide
  2026–2030 papers.
- **Evidence:** objectives Obj-9 ("rising fast"); evolution Future-Direction; distinction §1.7 (gold-standard
  move); future H1/EK-FP-1 (all four reads converge); 2022 P2Q1, 2024 P2Q3c, 2025 P1Q4.
- **Expected impact:** **very high** — closes the biggest content gap; directly trains the rising discriminator.
- **Effort:** **Medium** (new archetype + family-taxonomy entry + a model-answer pattern that *integrates*
  factors causally rather than listing them).
- **Confidence:** **HIGH**.
- **Code:** `question-engine.ts` (family taxonomy / flight-construction). **Prompts:**
  `question-generation-prompt.ts`, `model-answer-prompt.ts` (causal-chaining pattern), `pre-glass-prompt.ts`
  (coach the synthesis scaffold). **Validators:** optional soft check "synthesis family answer integrates ≥2
  factors." **EK:** merge **EK-FP-1 / objectives-EK-0105** drafts; promote/specialise **EK-0004**.

### T1-4 · Make model answers reason freshly per glass + demonstrate the "reconcile conflicting evidence" move
- **Change:** In `model-answer-prompt.ts`: (1) hard instruction that every wine's answer is generated *from
  that wine's own structure* — never templated phrasing reused across the flight (it already differentiates
  but doesn't *forbid* templating); (2) where the evidence genuinely conflicts, demonstrate one **second-order
  reconciling inference** (the Tokaji "exceptional quality ⇒ producer exceeds the classification minimum"
  move).
- **Rationale:** this is a **correctness requirement, not a style preference** — the exam penalises
  cut-and-paste and the Chief flagged template-recall as the top-band killer; a study app shipping recited
  templates trains the named failure. The reconcile move is the clearest concrete picture of distinction
  reasoning in the corpus and is entirely absent.
- **Evidence:** distinction §1.7/§5.4 (EK-0108 draft "study-system caution," EK-0105 draft "reconcile");
  confidence model §2.10; future H7.
- **Expected impact:** **high** — protects the product's core validity and lifts every generated model answer
  toward the band the candidate must actually hit.
- **Effort:** **Small** (prompt edit; the grader already penalises cut-and-paste, so this aligns generation
  with grading).
- **Confidence:** **HIGH**.
- **Code:** none. **Prompts:** `model-answer-prompt.ts` (primary), `marking-principles.ts` (add "reward the
  reconcile move" to the top-band differentiator at L42–43). **Validators:** optional generation-side
  cut-and-paste detector. **EK:** merge **EK-0105 (reconcile)** + **EK-0108 (study-system caution)** drafts.

### T1-5 · Reconcile the colliding EK-0104…EK-0111 drafts + add scope labels to EK-0096…0102
- **Change:** Merge the four research passes' overlapping drafts into one consecutive, deduplicated block
  starting at EK-0104; flip superseded entries; and tag EK-0096…0102 as **"last-10 generation/composition
  parameters, blind to 2011–2014 — not assessment objectives."**
- **Rationale:** EK is *injected* into feedback and is the cited authority for every prompt change above —
  colliding IDs make those citations ambiguous, and mis-filed composition stats cause the app to teach
  frequencies as if they were competencies.
- **Evidence:** future_exam_prediction "Numbering caution"; objectives C2; evolution EK-0107 draft.
- **Expected impact:** **high (force-multiplier)** — unblocks T1-2/T1-3/T1-4 citations and improves every
  feedback ruling (corpus-anchored).
- **Effort:** **Medium** (careful EK editing; no code).
- **Confidence:** **HIGH** (the collision is documented).
- **Code:** none. **Prompts:** none directly. **Validators:** none. **EK:** the whole **EK-0104…EK-0111**
  range + scope notes on **EK-0096…0102**; uses the sync mechanism in `empirical_knowledge_doc_plan.md`.

### T1-6 · Add climate-as-driver framing to generation and model answers
- **Change:** Make "how climate (and winemaking) influenced quality and style" a recurring (not every-question)
  generation option for P1/P2 quality/style sub-questions; model answers must reason cool-vs-warm expression,
  vintage conditions, and **climate-change adaptation** (picking dates, alcohol/canopy/site management, variety
  choice) — not just cellar technique.
- **Rationale:** the **strongest forward signal in 14 years** — the only stem repeated verbatim two years
  running (2024 P2Q3, 2025 P2Q1).
- **Evidence:** evolution EK-0105 draft; future H2/M7/EK-FP-2.
- **Expected impact:** **high** — trains a near-certain recurring competency.
- **Effort:** **Small**.
- **Confidence:** **HIGH** (with a 3-absence falsification test already specified).
- **Code:** minor (`question-engine.ts` option weighting). **Prompts:** `question-generation-prompt.ts`,
  `model-answer-prompt.ts`. **Validators:** none. **EK:** merge **EK-FP-2 / EK-0105 (climate)** draft.

---

# Tier 2

### T2-1 · Quality-frame parameter: region | official classification | GLOBAL
- **Change:** Default quality sub-questions to a `frame` parameter; use the **global** frame for esoteric
  wines with no local peer set; require model answers to **volunteer the official tier** when one exists.
- **Rationale / evidence:** the quality frame widened region→world (2025 P2Q3b "wine globally," never asked
  before); objectives Obj-3 + A4; evolution §1.4; future H5.
- **Impact:** high; **Effort:** Small–Medium; **Confidence:** HIGH.
- **Code:** `question-engine.ts` (frame selection). **Prompts:** `question-generation-prompt.ts`,
  `model-answer-prompt.ts`, `marking-principles.ts` (grade against the *named* frame; note "good" alone earns
  *minimal*, not necessarily zero — corrects the current over-strict reading). **EK:** merge **EK-0106**;
  revise **EK-0008**.

### T2-2 · Treat mark allocation as a ROTATING distribution across a mock suite
- **Change:** Replace the static "~46–55% ID" cap with a *rotating* mark-type distribution sampled per
  question across a generated mock suite (ID ~39–46% as the largest single category, but quality / winemaking /
  commercial / style rotating). The flight-size rotation machinery already exists (`TARGET_DISTRIBUTIONS`,
  `pickFlightSizeFromDistribution`) — extend the same pattern to mark-type.
- **Rationale / evidence:** "you never know where the weighting will be" (2023 chair); objectives §2; future
  EK-FP-3. Static targeting trains a slope that doesn't exist.
- **Impact:** medium–high (mock realism + trains to variance); **Effort:** Medium; **Confidence:** HIGH.
- **Code:** `question-engine.ts`, `question-generation-prompt.ts` (mark-mix sampler).
  **Validators:** soft check "ID share within rotating band." **EK:** merge **EK-FP-3**; reframe **EK-0006 /
  EK-0098** from "trend" to "stable de-emphasis + annual rotation"; drop false-precision decimals in **EK-0023 /
  EK-0098**.

### T2-3 · Emit ID-light and occasional zero-ID questions (P3 + final questions)
- **Change:** Allow the generator to produce questions paying **0 ID marks** (pure
  quality/winemaking/style/commercial), concentrated in P3 and final questions.
- **Rationale / evidence:** the ID-suppression→ID-free arc (2017→2019→2024 P3Q1 & 2025 P3Q3, both 0 ID);
  evolution EK-0104 draft; future M3.
- **Impact:** medium; **Effort:** Small (relax the implicit ID-floor); **Confidence:** MEDIUM (still rare —
  don't make it the norm).
- **Code:** `question-engine.ts` (mark-mix). **Prompts:** `question-generation-prompt.ts`.
  **Validators:** ensure the 0-ID case isn't rejected by a hidden ID-floor assumption. **EK:** merge the
  ID-free arc draft.

### T2-4 · Commercial: dual-pole "opportunities AND challenges" in generation + flag it as the LOWEST-weight pool
- **Change:** Bias commercial sub-questions to the dual-pole verb in generation (grading already requires both
  halves). Add to MARKING_PRINCIPLES / coaching that commercial is the **smallest mark pool (~9%)** — answer
  crisply, don't over-invest writing time.
- **Rationale / evidence:** objectives Obj-8 + EK-0111 draft (9% in 2022); evolution §1.5; future M1.
- **Impact:** medium; **Effort:** Small; **Confidence:** MEDIUM (9% is a single data point).
- **Code:** none. **Prompts:** `question-generation-prompt.ts`, `marking-principles.ts`,
  `pre-glass-prompt.ts`. **EK:** merge **EK-0111**.

### T2-5 · Wine selection: stop modelling orange/skin-contact as a theme; prefer persistent oxidative/flor + established esoterica
- **Change:** Demote `orange`/skin-contact from a routine P3 theme; prefer the persistent oxidative/flor family
  (Jura, oxidative white Rioja, Sherry) and *established* indigenous esoterica (Greek/Austrian/Hungarian/
  Portuguese with a real production base) when generating "boundary" curveballs.
- **Rationale / evidence:** skin-contact peaked 2014–2019 and is **absent 2021–2025**; evolution EK-0108 draft;
  future M2. The system currently lists `orange` as a first-class style and can pick it as a theme.
- **Impact:** medium (avoids teaching a dead theme); **Effort:** Small; **Confidence:** MEDIUM (counter-signal).
- **Code:** `wine-enrichment.ts` (style weighting), `question-engine.ts` / `question-generation-prompt.ts`
  (P3 style distribution). **EK:** merge **EK-0108**.

### T2-6 · Sub-region precision in generation + penalise one-fact / macro-region calls in grading
- **Change:** When ID is asked, generate stems that demand sub-region ("as closely as possible"); in grading,
  encode that a bare macro-region ("Northern Rhône," "just Mosel") on a single supporting fact draws few/zero
  marks even when not wrong, and require ≥2 independent evidence strands.
- **Rationale / evidence:** 2022 P2Q2/Q3 sub-region demand; "too many just stated Mosel"; 2024 "Northern/
  Southern Rhône" alone → often zero; objectives EK-0109 draft; future M5. (Grading partly has this at L20.)
- **Impact:** medium; **Effort:** Small–Medium; **Confidence:** MEDIUM–HIGH.
- **Code:** none. **Prompts:** `question-generation-prompt.ts`, `marking-principles.ts`. **EK:** merge
  **EK-0109**; revise **EK-0035** (sub-region tendency) and the positional-prior softening.

### T2-7 · Model-answer quality discipline: full scale, within-classification, origin-blind, volunteer tier
- **Change:** Mandate in `model-answer-prompt.ts` that quality answers use the **full** scale decisively,
  discriminate *within* a classification, stay **origin-blind both ways** (no OW halo / NW penalty), and
  volunteer the official tier. (The grader expects this; generation should model it.)
- **Rationale / evidence:** distinction §4.2 (EK-0109 draft); 2018 Chambolle/Chilean-Cab under-rating; 2024
  full-scale; future H5.
- **Impact:** medium–high; **Effort:** Small; **Confidence:** HIGH.
- **Code:** none. **Prompts:** `model-answer-prompt.ts`. **EK:** merge the distinction **EK-0109** draft;
  extend **EK-0092**.

---

# Tier 3

### T3-1 · Producer verticals/horizontals as a selection device
- Same producer, change one variable (vintage/site/élevage). Suits the rising maturity + synthesis families.
- **Evidence:** evolution §1.3, M4. **Impact:** medium; **Effort:** Medium (needs vertical-aware wine
  selection in `wine-bank-lookup.ts` / `question-engine.ts`); **Confidence:** MEDIUM.
- **Code:** `question-engine.ts`, `wine-bank-lookup.ts`. **Prompts:** `question-generation-prompt.ts`.
  **EK:** new "producer-vertical device" entry.

### T3-2 · "Distinction = consistency, not peak" — encode where the architecture allows
- The full claim (no weak section across 12 wines × 3 days) **cannot** be graded in a single-question app;
  capture it as (a) a coaching note in `pre-glass-prompt.ts` / methodology, and (b) a *study-session-level*
  signal if the app ever aggregates a full mock. Add the A/B/C+ band labels to the verdict UI.
- **Evidence:** distinction §0/§3, future M6. **Impact:** medium (mostly framing); **Effort:** Small (note) /
  Large (session aggregation); **Confidence:** HIGH (claim) but LOW (per-question expressibility).
- **Code:** verdict UI + (optional) `study-session.ts`. **Prompts:** `pre-glass-prompt.ts`. **EK:** merge the
  distinction **EK-0104 (consistency)** draft, *with* the per-question-app caveat.

### T3-3 · Funnelling calibration nuance: commit when certain, funnel when uncertain
- Refine `funnelling.ts` so that *over-hedging a wine you genuinely recognise* is a (minor) fault, the mirror
  of shoehorning; reward correct mode-selection.
- **Evidence:** confidence model §2.2 / EK-NEW-B draft (Gayán/Skelton MW). **Impact:** low–medium; **Effort:**
  Small; **Confidence:** MEDIUM (PLAUSIBLE tier; coaching-sourced, not examiner-report).
- **Prompts:** `funnelling.ts`, `marking-principles.ts`. **EK:** merge **EK-NEW-B**.

### T3-4 · Feedback prompt: mark-rotation + global-frame awareness
- Add to `feedback-analysis-prompt.ts` that an "unusual" mark split or a "global quality" frame is *real* exam
  behaviour and is not grounds to reject a generated question.
- **Evidence:** EK-FP-3, H5. **Impact:** low–medium (prevents false rejects); **Effort:** Small;
  **Confidence:** MEDIUM. (Largely handled once EK is corrected, since EK is injected.)
- **Prompts:** `feedback-analysis-prompt.ts`. **EK:** rides T1-5 / T2-1 / T2-2.

### T3-5 · Era-1 (2011–2014) structured tagging
- Extend `data/structured/` to 2011–2014 so distribution entries stop being era-blind and 14-year trend claims
  become safe.
- **Evidence:** evolution §0, EK-0107 draft. **Impact:** medium (research integrity); **Effort:** **Large**
  (data work); **Confidence:** HIGH (the gap is real) but low urgency.
- **Code:** `scripts/build_structured_corpus.py`. **EK:** the scope-label entry (also in T1-5).

### T3-6 · Soften positional priors everywhere (sparkling opener, last-question curveball)
- Recast EK-0035 and any position logic as *tendencies, not laws* (2025 broke the sparkling opener).
- **Evidence:** evolution Audit; future L4. **Impact:** low–medium; **Effort:** Small (mostly EK + a check that
  generation doesn't hard-assume a sparkling P3 opener); **Confidence:** HIGH.
- **Code:** verify `question-engine.ts` P3 logic isn't hard-locked. **EK:** revise **EK-0035**, **EK-0025/0096**.

---

## 3 · Cross-cutting caveats (do not skip)

1. **Single-question architecture ceiling.** "65% average across papers" and "consistency across 3 days"
   are *exam-level* truths the app cannot grade per question. Implement them as **framing/coaching**, not as
   scoring logic, and label them as such in-prompt. (Affects T1-1, T3-2.)
2. **EK injection is the lever — and the risk.** Because MARKING_PRINCIPLES and EK propagate to multiple
   generators, a wrong edit propagates a wrong belief everywhere. Merge EK (T1-5) *before* shipping the
   prompt edits that cite it.
3. **Don't over-correct toward novelty.** ID remains ~40% and the single largest category; the corpus warns
   against under-investing in ID. Synthesis/climate additions are *additive*, not replacements.
4. **The product's own validity is at stake (T1-4).** The examiners are actively engineering against
   template study. Every generator must read as fresh reasoning, never recited scaffolding.

---

## 4 · Proposed update plan for `mw_exam_empirical_knowledge.md`

> Sequencing: **(1) reconcile the colliding EK-0104…EK-0111 block first** (T1-5), then merge the additions
> below into the renumbered space, then apply the revisions/scope-labels. Use the existing resolved-feedback
> sync workflow (`empirical_knowledge_doc_plan.md`); commit `[skip ci]`.

### 4.1 Strongly supported ADDITIONS (STRONG SIGNAL — merge as live)
- **Wine-is-a-vehicle; competency is the target — except the fused P3 production canon** (objectives EK-0104 /
  future EK-FP-4). The single most useful organizing meta-principle; absent from EK.
- **Integrated multi-factor synthesis is a distinct, rising objective; expect ~1/year** (objectives EK-0105 /
  future EK-FP-1). 4-read convergence.
- **Climate is a standing examinable driver** (evolution EK-0105 / future EK-FP-2). Only verbatim 2-year repeat
  in 14 years; carries a 3-absence falsification test.
- **"Reasoning > ID" is conditional on plausibility + a correct structural read; structural-miss fatal,
  origin-miss survivable** (objectives EK-0108). Qualifies EK-0007.
- **Latitude is wine-dependent — bankers get none, esoterica get credit** (distinction EK-0107). Refines
  EK-0090.
- **No consistently weakest paper; Paper 2 is the modern decider** (objectives EK-0107). Supersedes EK-0005's
  "usual decider" clause. Reconcile with the confidence model's "P3 is the *arithmetic* borderline-decider."
- **Mark allocation is a ROTATING distribution, not a trend** (future EK-FP-3). Methodological spine; reframes
  EK-0006/0098.
- **Distinction = consistency, not peak; the reconcile-conflicting-evidence move is the gold standard**
  (distinction EK-0104 + EK-0105). With the single-question-app caveat (§3).
- **Independent critical thinking > rote — the study-system design caution** (distinction EK-0108). Constrains
  every downstream generator.
- **EK-0093 pass-standard correction:** 65% **average** + per-paper floor, criterion-referenced (not 65%/paper).
  HIGH-severity factual fix (confidence model §7 row 1).
- **Quality is full-scale, within-classification, origin-blind, volunteer-the-tier** (distinction EK-0109).
  Extends EK-0008/0092.

### 4.2 Plausible ADDITIONS (PLAUSIBLE — merge with hedge)
- **Quality context can be GLOBAL, not just local/classification** (objectives EK-0106). New 2025 frame; one
  data point.
- **One-fact / vague-macro-region origin calls are actively penalised** (objectives EK-0109).
- **Vintage/maturity questions presume a classic, vintage-legible origin** (objectives EK-0110). Stem-inference
  rule.
- **Commercial is the lowest-weighted competency (~9%) — budget time accordingly** (objectives EK-0111). Single
  data point.
- **Calibration: funnel when uncertain, commit when certain** (confidence EK-NEW-B). Coaching-sourced.
- **Communication is the transmission channel for competence (legibility = real-exam-only)** (confidence
  EK-NEW-C).
- **Orange/skin-contact peaked 2014–2019, absent 2021–2025 — do not forecast a surge** (evolution EK-0108).
- **Vintage ID *declined* (era-blind correction)** — revise EK-0078; it is not a static low-frequency fact.
- **Standing provenance note:** examiner reports are member-gated; public IMW docs override corpus paraphrases
  on hard facts (confidence EK-NEW-D).

### 4.3 REVISIONS / scope-labels to existing live entries
- **EK-0001** — 25/wine is **invariant 2011–2025** (drop the contradicted "pre-2013 differed" boundary; the
  correction *strengthens* the rule).
- **EK-0005** — keep "most stylistically diverse"; drop "usual decider / consistently weakest."
- **EK-0006 / EK-0098** — reframe from monotonic "trend" to "stable de-emphasis + unpredictable annual
  rotation"; strip false-precision decimals.
- **EK-0008** — context can be regional / classification / **global**; price is corroboration only; "good"
  alone earns *minimal*, not necessarily zero.
- **EK-0023** — keep direction; drop the 3-sig-fig decimals; flag curveball-labelling as subjective.
- **EK-0035** — sparkling opener is a *tendency, not a lock* (2025 broke it); update through 2025.
- **EK-0078** — vintage *declined*, not statically rare.
- **EK-0093** — see §4.1 (the pass-standard correction).
- **EK-0096…0102** — tag as **"last-10 generation/composition parameters, blind to 2011–2014 — not assessment
  objectives."**

### 4.4 OPEN QUESTIONS (route to EK §9 — research before treating as fact)
- **Era-1 (2011–2014) quantitative characterisation** — needs structured tagging before any 14-year trend line
  (T3-5). Until then, do not assert pre-2015 distributions.
- **The "single howler tips borderline → FAIL" hard rule** — corpus-supported but publicly unverified; keep as
  a strong *tendency*, not an iron law (confidence §4).
- **"Most-penalised failure mode" ranking** — soften EK-0091's superlative (misread is the upstream trigger of
  the cascade).
- **Low/no-alcohol, sustainability/packaging, vessel/closure reasoning** — industry-plausible but corpus-absent
  (future L1–L3 / EK-FP-5 watch-list). Monitor; do not generate around yet.
- **Climate-adaptation as its own stem** (vs climate-as-driver) — logically implied (future M7) but not yet
  directly attested.

---

*Synthesised 2026-05-31 from the six research reads + a direct audit of `study-app/src/lib/` generation,
grading, feedback, and validation code (current behaviour as of this date). No code, prompts, validators, or
the EK doc were modified; all recommendations are proposals for user review. Effort/confidence are the
review team's estimates; the EK draft-ID collision (T1-5) must be resolved before the prompt edits that cite
those entries are shipped.*
