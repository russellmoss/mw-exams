# System Correctness Refactor Plan — Project 8 (Agent 5 · Synthesis)

> **Mandate.** Single prioritized, implementation-ready refactor plan synthesizing the four Project-8
> auditor deliverables (EK integrity, pass-standard, anti-template, plausibility-grading), gated by the
> hostile `evidence_audit.md` bucket assignments (SUPPORTED / PLAUSIBLE / UNPROVEN). Correctness over
> novelty. No PLAUSIBLE/UNPROVEN finding is promoted to fact.
>
> **Author:** Synthesis Agent (Agent 5), 2026-05-31. **Proposal only — no code or EK doc modified.**

---

## 1 · Executive summary + the single sequencing constraint

Four hostile audits converge on a small, coherent set of correctness defects. The system's *grader logic* is
fine — there is **no numeric pass threshold in code** (`grading-telemetry.ts` is detect-only; verdicts are
LLM-prompt-driven). So nearly every fix is **framing/messaging in EK text + grader prompt prose**, plus one
**medium code fix** (inject the plausibility adjacency map the system already computes but never passes to the
prose grader). The defects are concentrated in three places: the live EK doc, `marking-principles.ts` L15-16,
and the two prose-grader routes + `model-answer-prompt.ts`.

**THE SINGLE HARD SEQUENCING CONSTRAINT (prerequisite for the whole plan):**

> **F-01 — the EK-0104…EK-0108 ID collision — must be resolved FIRST.** EK is injected live into the
> feedback-analysis agent *by `ek_id`* (`study-app/src/lib/db.ts:582-597`). The evolution-pass values for
> EK-0104…0108 are already committed live (0104=ID-suppression, 0105=climate, 0106=quality region→world,
> 0107=scope label, 0108=orange wine), while three other research passes drafted *different* content under
> the same IDs, and the roadmap/prediction docs already cite the WRONG live entries (e.g. "EK-0108" for
> reasoning-conditional, but live EK-0108 = orange wine). **No prompt or doc edit that cites any EK-0104+ ID
> may ship until the renumber lands.** evidence_audit rates this VERY STRONG / SUPPORTED / 98% conf.

Two exceptions that do NOT block on F-01 (low EK numbers, no collision): **EK-0093** (pass-standard) and
**EK-0007** (reasoning-conditional) can be edited independently — but the *new* conditional entry they point
to (EK-0113) lives in the F-01 block, so the cleanest path is still: do F-01, then everything else.

Net adversarial outcome (carried from evidence_audit): the low-risk **correctness** items rise to the top;
the attractive **superlatives and single-data-point figures** are stripped or routed to §9. ~40-50% of the
original roadmap's *claims* were weakened, while their underlying *features* mostly survived.

---

## 2 · Master priority table

Priority Score ≈ (Impact × Evidence × Confidence) ÷ Risk (evidence_audit discipline). Evidence: VERY STRONG 5
/ STRONG 4 / MODERATE 3 / WEAK 2. Risk: Low 1 / Med 2. Effort is noted separately (it does not divide score).

| ID | Finding | Domain | Surfaces | Evidence | Bucket | Effort | Correctness risk | Examiner-realism impact | Expected score impact | Tier |
|---|---|---|---|---|---|---|---|---|---|---|
| **F-01** | EK-0104+ collision renumber + scope sentence | EK integrity | 7,4,5,1,2,3 | VERY STRONG | SUPPORTED | MED | **Prerequisite** — stale citations inject wrong content | High (feedback agent pulls wrong entry by id) | Indirect (unblocks all) | **IMMEDIATE (1st)** |
| **PS-1/PS-3 (F-02)** | Pass standard: 65% avg+floor, supersede EK-0093 + `marking-principles.ts:15` | Pass-standard / EK | 5,7,8 | VERY STRONG | SUPPORTED | LOW | High (false constant in grader's read-FIRST block) | High (avg-with-floor vs per-paper) | Medium (verdict framing) | **IMMEDIATE** |
| **PS-2 (F-02)** | "FOUR dimensions" → IMW three abilities, keep min-not-mean (`:16`) | Pass-standard / EK | 5,7 | MODERATE→SUP (correction) | SUPPORTED | LOW | Medium (false framework count) | Medium | Low | **IMMEDIATE** |
| **PG-1** | Inject plausibility adjacency map into both prose graders | Plausibility | 5,6 | VERY STRONG | SUPPORTED | MED | High (gradient stated, unenforceable) | High (calibrated wrong-call credit) | High | **IMMEDIATE** |
| **PG-2** | Detect-only `plausibilityMismatch` telemetry | Plausibility | 5 | VERY STRONG | SUPPORTED | LOW | Medium (currently unmeasurable) | n/a (observability) | None direct (unlocks PG-3) | **IMMEDIATE** |
| **PG-5 / F-03** | EK-0007 + feedback prompts: reasoning>ID CONDITIONAL on plausibility | Plausibility / EK / Feedback | 5,4,7 | VERY STRONG | SUPPORTED | LOW | High (teaches "any reasoning rescues") | High | Medium | **IMMEDIATE** |
| **PG-4** | Feedback names plausible vs implausible miss | Plausibility / Feedback | 4,5 | VERY STRONG | SUPPORTED | LOW | Medium | High (teaching point) | Medium | **IMMEDIATE** |
| **AT-1** | Cross-answer anti-scaffold clause (`model-answer-prompt.ts`) | Anti-template | 3,5,6 | STRONG | SUPPORTED | LOW | Medium (ships rote templates) | High (trains named failure) | Medium | **IMMEDIATE** |
| **AT-2** | CONDITIONAL reconcile-conflict instruction (generation) | Anti-template | 3,5 | MODERATE | PLAUSIBLE | LOW | Low (top-band only) | Medium | Low-Med | **IMMEDIATE (hedged)** |
| **PG-3 (F-04 area)** | EK-0005 "usual decider" → two-level nuance (EK-0112) | EK integrity | 1,7,8 | STRONG | SUPPORTED | LOW | Medium (one-sided fact) | Medium | Low | **IMMEDIATE** |
| **F-05** | EK-0006 trend-as-fact → rotation, strip decimals | EK integrity | 1,5,7 | STRONG | SUPPORTED | LOW | Medium (false precision) | Medium | Low | **IMMEDIATE** |
| **F-06** | Drop superlatives: EK-0091, EK-0105, "fastest-rising" | EK integrity | 7,4,1 | WEAK (superlative) | UNPROVEN | LOW | Low (overclaim) | Low | Low | **IMMEDIATE (de-claim)** |
| **F-07** | EK-0107 append "params not objectives" sentence | EK integrity | 1,2,7 | STRONG | SUPPORTED | LOW | Low | Medium | Low | **IMMEDIATE** |
| **F-08** | EK-0078 vintage hedge + EK-0001/EK-0035 positional priors → tendencies | EK integrity | 1,2,7 | STRONG | SUPPORTED | LOW | Medium (EK-0035 broke 2025) | Medium | Low | **IMMEDIATE** |
| **PS-4** | `mw_exam_guide.md:233-234` stale echo align | Pass-standard | doc | VERY STRONG | SUPPORTED | LOW | Low (not injected) | Low | None | **WAIT (same pass)** |
| **AT-3** | Grader rule 9 names structural scaffold reuse | Anti-template | 5,6 | STRONG | SUPPORTED | LOW | Low | Medium | Low | **WAIT (after AT-1 + regen)** |
| **AT-5** | Mirror AT-1/AT-2 into offline `mock-answer-writer.md` | Anti-template | 3,7 | MODERATE | SUPPORTED | LOW | Low | Low | Low | **NEEDS-VALIDATION** |
| **PG-3-grader** | Soft difficulty hint in prose grader | Plausibility | 5 | WEAK | PLAUSIBLE | LOW | Low | Medium | Low | **WAIT (gate on PG-2)** |
| **PS-5** | Optional UI proxy clause `methodology/page.tsx:505` | Pass-standard / UI | 8 | WEAK | SUPPORTED | LOW | None | Low | None | **WAIT (optional)** |
| **F-09** | Global-quality entry (do NOT standalone; fold into EK-0106) | EK integrity | 7,3 | MODERATE | PLAUSIBLE | LOW | Low (dup risk) | Low | Low | **WAIT (fold, hedged)** |
| **PG-6 / cascade** | Structural-miss cascade-to-zero | Plausibility | 5 | MODERATE | PLAUSIBLE | — | — (2023 P3Q3 counterexample) | — | — | **DO NOT IMPLEMENT** |
| Banker-zero-latitude | Encode "bankers get no latitude" | Plausibility / EK | 5,7 | WEAK | UNPROVEN | — | — | — | — | **DO NOT IMPLEMENT (→ §9)** |
| Climate-adaptation | Climate-change adaptation as graded competency | EK / model-answer | 3,7 | WEAK | UNPROVEN | — | — | — | — | **DO NOT IMPLEMENT (→ §9)** |
| A≥70 / B 65-69 bands | Assert grade-band cut-points | Pass-standard | 5,7 | MODERATE | PLAUSIBLE | — | — | — | — | **WAIT — hedge, don't assert** |

---

## 3 · The IMMEDIATE batch — in apply order

> **STEP 0 (PREREQUISITE — must complete before any EK-0104+ citation ships): F-01 collision renumber.**
> EK-only + doc cross-ref. Paste the canonical de-duplicated EK-0109+ block after live EK-0108
> (`mw_exam_empirical_knowledge.md:1083`), keeping live EK-0104…0108 as-is. Per the EK integrity auditor's §9
> reconciliation, **drop standalone global-quality (the duplicate of EK-0106) and renumber down**, yielding:
> EK-0109 wine-is-vehicle; EK-0110 synthesis-family (hedged, no "fastest-rising"); EK-0111 two-level decider
> (supersedes EK-0005 "usual decider" clause); EK-0112 reasoning-conditional (qualifies EK-0007); EK-0113
> independent-thinking-over-rote; EK-0114 quality full-scale/origin-blind/volunteer-tier; EK-0115 one-fact
> origin penalised; EK-0116 maturity quantified + both trajectories; EK-0117 commercial dual-pole (9% hedged).
> Route distinction "consistency" and "bankers zero latitude" to §9. Update `system_improvement_roadmap.md` +
> `future_exam_prediction.md` stale cross-refs. *(See §6 EK manifest for the exact entries; the manifest uses
> the post-fold numbering. The single biggest correctness lever in the whole plan is doing this first.)*

Then, the code/prompt/UI batch (each safe, each SUPPORTED unless tagged):

1. **PS-1 / `study-app/src/lib/prompts/marking-principles.ts:15`** — replace the "ABSOLUTE 65% per paper"
   sentence. New text (preserves "anchor to marks, not a curve"; fixes the falsehood; names the proxy):
   > *"The IMW pass standard is criterion-referenced (an absolute bar, not a curve): a candidate must average
   > 65% or more across the three practical papers, with a ~50% minimum floor in any one paper (public IMW
   > Student Guide). It is NOT 65% on every paper — a strong paper can carry a weaker one above the average
   > provided the weak paper clears the floor. Because THIS TOOL grades a single question, treat the
   > per-question verdict as a PROXY for where this answer sits in the band, not a paper-level pass test:
   > FAIL < 50, BORDERLINE ≈ 55–64, PASS ≥ 65 (C+ 60–64 confirmed; A ≥70 / B 65–69 are reported/indicative).
   > A candidate whose answers persistently average well below ~45% would not, on aggregate, recover."*
   Hedge the A/B bands (PLAUSIBLE); fix recovery clause to "aggregate." Framing fix, **not** a scoring change.

2. **PS-2 / `marking-principles.ts:16`** — replace "FOUR dimensions":
   > *"A pass requires competence across the IMW's three assessed abilities — accurately reading/assessing the
   > wine, reaching a sound judgement/conclusion, and communicating it (IMW Student Guide). (Internally we also
   > track theory accuracy as a fourth lens.) This is a MINIMUM across faculties, not an average: a spike in
   > one cannot rescue a hole in another."*
   Keeps the load-bearing min-not-mean logic; removes the unsupported "FOUR."

3. **PG-1 / `evaluate-answer/route.ts` (L19, L33-48) + `evaluate-full/route.ts` (L19-27, L124-145)** — read the
   persisted `stem_answer_keys` row by `question_id` (`ground_truth`, `plausible`); for historical questions
   derive on the fly via `deriveStemKey` or skip gracefully. Inject a **"Plausibility reference (for grading
   wrong calls — NOT the answer to reveal)"** block into the grader USER message (ground truth + the listed
   plausible confusables). Add one rubric line after `marking-principles.ts:14`: *"When a Plausibility
   reference is provided, anchor wrong-call partial credit to it: a call matching a listed confusable earns
   meaningful partial credit; a call neither listed nor otherwise stylistically adjacent earns little. When no
   reference is provided, judge adjacency from style."* **Credit calibration only — no auto-zero; leave L33
   (2023 P3Q3 recoverability) intact.** Effort MEDIUM (the one non-trivial code change).

4. **PG-2 / `grading-telemetry.ts`** — extend `GradingMeta` (L25-30) with `wrongCallPlausible?: boolean|null`
   and `creditGiven?: "none"|"partial"|"full"`; extend `GRADING_META_INSTRUCTION` (L17-23) so the grader
   self-reports for the primary ID sub-question; `console.warn` in `recordGradingOverrideCheck` (L51-67) on
   over-credit (implausible+full) or under-credit (plausible+none). **Pure observability — never changes the
   verdict.** Ship alongside PG-1 so the gap becomes measurable from day one.

5. **PG-5 / EK-0007 + both feedback prompts** — EK-0007: append *"— conditional on the conclusion being
   PLAUSIBLE and the structural read correct (see EK-0112). Implausible calls and structural misreads do not
   earn the rescue."* (EK manifest item below; uses post-fold EK-0112.) Prompt: `marking-principles.ts`
   Cardinal Rule 1 (L19) already says "wrong-but-plausible," so **no prompt change there.**

6. **PG-4 / `answer-evaluation-prompt.ts` (~L52-54) + `evaluate-full` per-sub-question format (~L96-107)** —
   add: *"If the candidate's ID was wrong, state explicitly whether it was a plausible (adjacent) miss earning
   partial credit or an implausible one earning little, and name the nearer plausible call they should have
   funnelled to."*

7. **PG-4-UI / `methodology/page.tsx:148` + `:512`** — append the condition: *"…provided the wrong call is
   still plausible; an implausible call earns little even with reasoning (2021)."* (Stops the UI teaching the
   unconditional misconception the 2025 report corrects.)

8. **AT-1 / `model-answer-prompt.ts`** — in the user-message `### 1. Model Answer` block (after L96) add the
   **cross-answer anti-scaffold clause**: reason freshly per glass, vary the *shape* not just the content; do
   not run every wine through one fixed maturity formula ("[tier] → improve N → hold M") or an identical
   channel→geography→price commercial sentence; let different wines carry the fullest treatment of different
   dimensions and lead with different evidence types. Cite the doctrine in **prose** (2017 "no two answers
   should ever be completely the same"; 2024 "creates considerable doubt"), **not** an EK number.

9. **AT-2 / `model-answer-prompt.ts`** (after AT-1) — **CONDITIONAL** reconcile instruction: *"Where the glass
   evidence genuinely conflicts, demonstrate ONE second-order reconciling inference — only when a real tension
   exists; never manufacture one,"* with the 2025 Tokaji exemplar. The "never manufacture" guardrail is
   load-bearing (PLAUSIBLE-as-frequency → illustrative, not blanket).

10. **EK-only batch (apply with the F-01 paste, all SUPPORTED unless tagged):** EK-0005 strip "usual decider"
    → pointer to EK-0111 two-level nuance (F-04/PG-3); EK-0006 reframe to rotation + strip decimals (F-05);
    EK-0091 retitle drop "most-penalized" (F-06, de-claim); EK-0105 replace "strongest forward signal in the
    corpus" with "the only verbatim two-year stem repeat (2024 P2Q3c = 2025 P2Q1c)" (F-06, de-claim); EK-0107
    append "composition PARAMETERS, not assessment objectives" sentence (F-07); EK-0078 vintage hedge +
    EK-0001/EK-0035 positional priors flipped to tendencies (F-08).

---

## 4 · The WAIT batch — and why each waits

- **PS-4 — `mw_exam_guide.md:233-234` stale "65% per paper" echo.** Correct in the same pass, lower urgency:
  it is a reference doc, **not injected at runtime** (sync only ingests `mw_exam_empirical_knowledge.md`).
- **AT-3 — grader rule 9 names structural-scaffold reuse.** The grader is currently *correct and AHEAD of* the
  generator. Tightening it before AT-1 lands + artifacts regenerate would penalise the system's own model
  answers. Ship only after AT-1/AT-2 and a regeneration pass; keep it a "mark down," never a howler/zero-cap.
- **PG-3-grader — soft difficulty hint in the prose grader.** "Latitude scales with difficulty" is PLAUSIBLE
  (esoterica-generous strong; banker-strict inferred). Gate on **PG-2 telemetry** actually showing the grader
  under-credits hard wines. Soft hint only — no multiplier, no banker-zero rule, keep constrained-option (L20)
  separate.
- **PS-5 — optional UI proxy clause (`methodology/page.tsx:505`).** No correctness defect; cosmetic.
- **F-09 — global-quality concept.** Do NOT create a standalone STRONG entry duplicating EK-0106 (which already
  asserts the global frame). Fold the single-point (n=1, 2025) hedge into EK-0106 as one sentence; this is why
  the de-dup block drops the standalone entry and renumbers down. PLAUSIBLE.
- **A≥70 / B 65-69 grade-band cut-points.** Only C+ = 60-64 is publicly confirmed; A/B are sourced solely to
  the unreadable 2021 Chief appendix. **Hedge as "reported/indicative" now; do not assert as verified.**

---

## 5 · The NEEDS-VALIDATION batch — what evidence unlocks each

- **AT-5 — mirror AT-1/AT-2 into offline `.claude/agents/mock-answer-writer.md:234`.** Validation: confirm the
  offline mock-exam pipeline does not read the live `buildModelAnswerPrompt` clauses (it uses parallel agents
  via `pipeline-context.json`). If it diverges (it does), add the parallel clauses — otherwise the offline
  path keeps seeding scaffolded artifacts into `outputs/`. Low-risk once confirmed; sequence with AT-1/AT-2.
- **PG-3-grader (difficulty latitude)** — unlocked by PG-2 telemetry showing systematic under-crediting of
  CURVEBALL/esoteric wines. Until then it is an unmotivated change against PLAUSIBLE evidence.
- **Banker-zero-latitude** — needs an explicit IMW **graded-policy statement** (currently inference, conflated
  with the constrained-option mechanism). Route to §9; at most refine EK-0090 with a hedge. Do NOT encode.
- **Climate-change ADAPTATION as a graded competency** — unattested in the practical corpus (future M7
  self-flags "not yet directly attested"). Needs a future sitting that actually examines picking
  dates/canopy/variety choice. §9 watch-item; keep OUT of EK-0105 and model-answer mandates.
- **Commercial = ~9% lowest weight; quality-frame "global"** — single data points (2022, 2025). Re-confirm in
  a future sitting before treating as targets; keep illustrative/hedged.
- **A≥70 / B 65-69 cut-points; 50% vs 55% floor** — source from a readable public IMW document (the 2021 Chief
  appendix is image-based/unreadable). Adopt 50% with "~" until confirmed.
- **Any "14-year trend" claim** — inherits a hidden caveat until 2011-2014 is structured-tagged (EK-0107);
  decide whether EK entries should carry that caveat explicitly.
- **Whether scaffold-sameness should move the verdict band** (vs prose-only) — needs a calibration backtest
  against real examiner reports before promotion beyond "mark down."

---

## 6 · EK UPDATE MANIFEST

> **Apply ONLY after the F-01 paste establishes the post-fold numbering.** All entries below are gated
> SUPPORTED / VERY STRONG by `evidence_audit.md` and are eligible to apply now, EXCEPT the explicitly-hedged
> PLAUSIBLE items and the UNPROVEN items (which route to §9, do NOT assert). Post-fold numbering (the
> global-quality standalone is dropped per the EK auditor §9 reconciliation; EK-0112→0111 etc.):
> EK-0111 = two-level decider, EK-0112 = reasoning-conditional.

### SUPPORTED — eligible to apply now

**M1 — EK-0093 (REVISE → supersede; add new entry):** *VERY STRONG / SUPPORTED.*
- Current: "Pass is an **absolute 65%** per paper, not a curve … sub-45% does not recover. A pass needs mastery
  across **four dimensions** — structural reading, communication, theory accuracy, quality judgement (2024)…"
- Replacement: flip EK-0093 `status: live → superseded`; add a new entry (`supersedes: EK-0093`): *"Pass = 65%
  AVERAGE across the three practical papers with a ~50% per-paper floor, criterion-referenced (not a curve;
  public IMW Student Guide, which overrides corpus). C+ = 60–64% confirmed; A ≥70 / B 65–69 are plausible but
  sourced only to the unreadable 2021 appendix — do not assert as verified. Below ~45% AVERAGE rarely recovers
  (tendency, softened by SPR). A pass needs breadth across the IMW's three named abilities (read/assess the
  wine, reach a sound judgement, communicate it); the earlier 'four-dimension' phrasing was an internal
  reconstruction — keep theory accuracy as an internal fourth lens. Howler override remains as temperament
  (detect-only telemetry, EK-0103). The app grades single questions, so the per-question PASS/BORDERLINE/FAIL
  thresholds are a single-question PROXY for the band, not the official paper-level rule."*
- Citation: public IMW Student Guide; 2017 Practical (Tuck MW, "the average of 65%"); 2024 Practical (Marks MW,
  bands "across all three papers"); 2018 Chief (Hoskins MW, sub-45% average); evidence_audit Audit A / T1-1.

**M2 — EK-0007 (REVISE — append conditional):** *VERY STRONG / SUPPORTED.*
- Current claim: "Sound reasoning earns marks even when the conclusion is wrong…"
- Replacement: append *"— conditional on the conclusion being PLAUSIBLE and the structural read
  (alcohol/acidity/tannin/RS) correct (see EK-0112). Implausible conclusions and structural misreads do not
  earn the rescue."*
- Citation: 2025 P1 (Mitchell MW, verbatim "if their reasoning was sound AND their conclusion plausible");
  2021 (USA→Australia some credit, Italy few marks); evidence_audit T1-2a / Audit B.

**M3 — EK-0005 (REVISE — strip "usual decider"):** *STRONG / SUPPORTED.*
- Current: "…P3 is the most stylistically diverse and **the usual decider**."
- Replacement: "…P3 is the most stylistically diverse. (For the 'decider' question see EK-0111: there is no
  permanently weakest paper; 'lowest-scoring' — recently P2 — and 'arithmetic average-dragger' — often P3 —
  are different senses.)" Keep the classic/challenging-balance and P2-most-classic content.
- Citation: hard pass counts 2017/2022/2023/2024/2025 (P3 often strongest); examiner_objectives ("P2
  lowest-scoring recently"); examiner_confidence_model §7; evidence_audit Audit F/H8 + §0 Coda.

**M4 — EK-0006 (REVISE — rotation, strip decimals):** *STRONG / SUPPORTED.*
- Current claim: "…Mark allocation trend: ID **46%→39%** (2022→2023), Quality **22%→37%**…"
- Replacement: "Mark allocation ROTATES year-to-year within the modern era — do NOT extrapolate any single
  competency's share linearly. ID sits ~39–46% (the largest single category, necessary-but-not-sufficient);
  the analytical pool (quality/winemaking/commercial/style) splits unpredictably. The 46%→39% / 22%→37%
  figures are two adjacent years, not a slope. Grade/answer to the printed per-question tariff (EK-0089)."
  (distinction "ID weighting volatile ~40%" folds in here, no new ID.)
- Citation: 2023 verbatim "you never know where the weighting will be"; evidence_audit T2-2 / FP-3.

**M5 — EK-0107 (REVISE — append scope sentence):** *STRONG / SUPPORTED.*
- Current: states the last-10 / blind-to-2011-2014 scope; does not say these are composition parameters.
- Replacement: append *"These are generation/composition PARAMETERS (what a realistic paper looks like), NOT
  assessment objectives (what the examiners are testing); do not treat a distribution decimal as examiner
  intent."*
- Citation: evidence_audit T1-5 UNPROVEN flag on reading composition decimals as objectives.

**M6 — EK-0091 (RELABEL — drop superlative):** *evidence_audit UNPROVEN for the ranking; substance SUPPORTED.*
- Current title/claim: "the **most-penalized** 2021–2025 failure mode."
- Replacement: retitle "Internal-consistency / cascade error (**a heavily-penalised** failure mode)"; drop the
  "most-penalized" ranking from title and claim. Keep all cascade/internal-consistency substance.
- Citation: evidence_audit UNPROVEN bucket (overfit ranking; misread is the upstream trigger).

**M7 — EK-0105 (REVISE — replace superlative with precise true claim):** *climate-as-driver STRONG; superlative
WEAK.*
- Current claim: "…the **strongest forward signal in the corpus** for the next ~5 years."
- Replacement: "…**the only verbatim two-year stem repeat in the corpus** (2024 P2Q3c = 2025 P2Q1c, verified in
  `data/exams.json`), with a 3-absence falsification test." Keep the climate-as-driver substance and the
  model-answer cool-vs-warm reasoning axis. **Do NOT add climate-change adaptation** (UNPROVEN → §9).
- Citation: `data/exams.json` verbatim match; evidence_audit T1-6 / Audit D.

**M8 — EK-0078 (REVISE — vintage hedge):** *STRONG / SUPPORTED (the tendency); PLAUSIBLE underlying figure.*
- Current: frames vintage ID as "rarely asked."
- Replacement: add *"vintage ID has DECLINED over the corpus, not merely been statically rare; the Era-1
  baseline is manually summed and uncharacterised (EK-0107)."*
- Citation: evolution changelog; evidence_audit (vintage-declined PLAUSIBLE; Era-1 caveat).

**M9 — EK-0035 (FLIP — positional prior to tendency) + EK-0001:** *STRONG / SUPPORTED.*
- Current: EK-0035 "P3 always opens sparkling" (broke in 2025); EK-0001 pre-2013 boundary correction drafted.
- Replacement: flip EK-0035 "always opens sparkling" → "P3 TENDS to open with sparkling, but this positional
  prior is not a rule (broke 2025)"; apply the drafted EK-0001 pre-2013 "not 25/wine" boundary correction.
- Citation: 2025 sparkling-opener break verified; evidence_audit T3-6.

**M10 — NEW EK entries from the F-01 de-dup block (all SUPPORTED unless tagged):**
- **EK-0109** (NEW, STRONG SIGNAL) wine-is-vehicle / competency-is-target, P3 production-canon excepted
  (merge objectives-EK-0104). Cite: examiner_objectives §0/§3; 2025 P3 production-method canon.
- **EK-0111** (NEW, STRONG SIGNAL) two-level decider — no permanently weakest paper; "lowest-scoring" (P2) ≠
  "arithmetic average-dragger" (P3) (merge objectives-EK-0107 + confidence-model P3 view; supersedes EK-0005
  clause). Cite: pass counts + examiner_objectives + confidence_model §7.
- **EK-0112** (NEW, STRONG SIGNAL) reasoning>ID CONDITIONAL on plausible conclusion + correct structural read
  (qualifies EK-0007; pairs with M2). Cite: 2025 P1 verbatim; evidence_audit T1-2a.
- **EK-0113** (NEW, STRONG SIGNAL) independent critical thinking beats rote; no cut-and-paste (the
  study-system caution; merge distinction-EK-0108). Cite: 2017/2023/2024 Practical + 2024 Chief.
- **EK-0114** (NEW, STRONG SIGNAL) quality judged full-scale, within-classification, origin-blind; volunteer
  the official tier. Cite: 2018/2023/2024/2025; evidence_audit T2-7.
- **EK-0115** (NEW, STRONG SIGNAL) one-fact origin calls and bare macro-region drops are penalised, often to
  zero. Cite: 2024 verbatim "just Mosel" / "N Rhône → zero"; evidence_audit T2-6.
- **EK-0116** (NEW, STRONG SIGNAL) maturity = quantified window + BOTH trajectories (refines EK-0011). Cite:
  2023 maturity definition; evidence_audit SUPPORTED.

### PLAUSIBLE — apply ONLY with an explicit hedge

- **EK-0110** (NEW, PLAUSIBLE) integrated multi-factor synthesis is a recurring novel-question family —
  ~once/year recently, the examiners' anti-rote device; **NOT** "fastest-rising/dominant" (n=3, differently
  framed, double-counts climate). One option among many, never replacing the ~40% ID core; falsification = two
  consecutive absent years. *(Hedge baked into the entry.)*
- **EK-0117** (NEW, PLAUSIBLE) commercial is dual-pole (opportunities AND challenges — SUPPORTED) and is
  *likely* the lowest-weighted competency (~9% in 2022 — single data point, illustrative not a target).
- **EK-0106 fold (F-09)** — add ONE sentence noting the "wine globally" quality frame rests on n=1 (2025 P2Q3);
  treat as an emerging frame to recognise, not a confirmed target. **Do not create a standalone STRONG
  duplicate entry.**
- **EK-0090 refinement** — "latitude scales with difficulty: esoterica generous (strong), bankers strict
  (inferred — hedge)"; keep the constrained-option mechanism separate.
- **A≥70 / B 65-69 grade bands** — within the M1 entry, marked "plausible/indicative, not report-verified."

### UNPROVEN — route to EK §9 open questions; do NOT assert

- Climate-change **adaptation** (picking dates / canopy / variety choice) as its own examinable competency —
  not attested; keep out of EK-0105 and model-answer mandates.
- **"Bankers get zero latitude"** as graded policy — inference, conflated with constrained-option; needs an
  explicit examiner statement.
- **distinction = consistency across three days** — per-question-inexpressible in a single-question app; UI /
  methodology copy or §9, not a gradable EK entry.
- The **superlatives** themselves ("fastest-rising objective," "strongest forward signal in 14 years",
  "most-penalized") — removed by M4/M6/M7/EK-0110, not re-asserted anywhere.
- Reading per-paper composition decimals (EK-0023, EK-0098…0102) as assessment objectives — mis-file; covered
  by the M5 scope sentence.

---

## 7 · The 7 Mandatory Questions — answered at the SYSTEM level

**1. What currently contradicts the strongest evidence?**
Four things, all VERY STRONG-contradicted. (a) `marking-principles.ts:15` + EK-0093 "ABSOLUTE 65% per paper"
and "FOUR dimensions" — the public IMW Student Guide says 65% **average** + ~50% floor and names **three**
abilities. (b) EK-0007 + UI (`methodology/page.tsx:148/512`) assert "reasoning > ID" **unconditionally** — the
2025 report's verbatim form is conditional ("and their conclusion plausible"). (c) The prose grader receives
**no per-wine plausibility signal**, so the SUPPORTED gradient is unenforceable in the verdict path even though
the adjacency map already exists in `stem_answer_keys`. (d) EK-0005 "P3 usual decider" — pass counts show P3 is
often the strongest paper.

**2. What creates examiner-unrealistic behavior?**
The EK-0104+ **collision** silently injects the WRONG live entry into the feedback agent (db.ts pulls by
`ek_id`) — a prompt citing "EK-0108" gets orange-wine text. The **per-paper** pass framing makes the grader
treat one mid-range answer as if it must independently clear 65 (real bar is aggregate-with-floor, a weak paper
is survivable) → over-binary/harsh single-answer verdicts. The grader's wrong-call partial credit is
**uncalibrated to confusable distance** (USA→Australia "some credit" vs Italy "few marks" — 2021), so it can
grade two unequal wrong calls identically or invert them. And the simulated examiner **praises a scaffolded
flight** because each wine is individually differentiated, while the real 2024 Chief says recited structure
"creates considerable doubt."

**3. What teaches candidates the wrong lesson?**
"65% per paper" teaches candidates to over-fear a single paper instead of managing the average+floor (banking a
strong paper to carry a weak one). Unconditional EK-0007/UI teaches "any reasoning rescues any wrong call" —
the exact misconception the 2025 report corrects. "FOUR dimensions" teaches a framework the IMW does not use.
Fill-in-the-scaffold model answers teach candidates to populate a template instead of reasoning freshly per
glass — the rote habit the 2024 Chief warns "will not pass."

**4. What produces the largest simulation error?**
The **EK-0104+ collision (F-01)** — it is the substrate every prompt cites; stale citations silently inject
unrelated content into the live feedback agent. It is the prerequisite for everything else. The largest single
*content* error is the **pass-standard constant** (it sits in the grader's read-FIRST calibration block); the
largest *grading-mechanism* error is the **missing plausibility adjacency map** at grade time (the data exists
in the DB and simply isn't passed); the largest *model-answer* error is **cross-answer scaffold reuse** (the
grader under-penalises it, biasing the system's self-assessment of its own answers high).

**5. Which fixes immediately?**
F-01 collision renumber (PREREQUISITE), then: PS-1/PS-2 (pass-standard, `marking-principles.ts:15-16`) + M1
EK-0093 supersede; PG-1 (inject adjacency map) + PG-2 (telemetry); M2 EK-0007 conditional + PG-4 feedback +
PG-4-UI; AT-1 anti-scaffold + AT-2 conditional reconcile (hedged); and the EK-only batch M3-M10 (EK-0005,
EK-0006, EK-0091, EK-0105, EK-0107, EK-0078, EK-0035/EK-0001, and the new SUPPORTED entries). All EK-only or
prompt/UI except PG-1/PG-2 (the one MEDIUM code change). All SUPPORTED except the explicitly-hedged AT-2/EK-0110
(PLAUSIBLE).

**6. Which wait?**
PS-4 (`mw_exam_guide.md` echo — not injected, same pass lower urgency); AT-3 (grader scaffold clause — ship
AFTER AT-1 + artifact regeneration so the grader doesn't nuke the system's own outputs); PG-3-grader (soft
difficulty hint — gate on PG-2 telemetry); PS-5 (optional UI proxy clause); F-09 (fold global-quality into
EK-0106, do not standalone); the A≥70/B 65-69 cut-points (hedge as indicative, do not assert).

**7. Which need more validation?**
AT-5 (confirm offline mock-answer pipeline divergence, then mirror the clauses); banker-zero-latitude (needs a
graded-policy statement); climate-change adaptation (unattested in the practical corpus); commercial 9% +
global quality frame (single data points — re-confirm); A≥70/B 65-69 cut-points + 50% vs 55% floor (need a
readable public IMW source); whether scaffold-sameness should move the verdict band (calibration backtest); any
"14-year trend" (blind to 2011-2014 until structured-tagged); whether the LLM's unaided plausibility judgement
errs often enough to justify PG-3 (PG-2 telemetry answers this).

---

## 8 · Apply-order checklist (decisive)

1. **F-01** — paste de-dup EK-0109+ block (post-fold numbering, drop standalone global-quality, fold into
   EK-0106); update roadmap + future_exam_prediction cross-refs. *Nothing citing EK-0104+ ships before this.*
2. **M1 EK-0093 supersede** + **PS-1/PS-2** `marking-principles.ts:15-16` (framing fix; verified no numeric
   threshold in code).
3. **PG-1** inject adjacency map (both prose graders) + rubric line after L14; **PG-2** detect-only telemetry.
4. **M2 EK-0007 conditional** + **PG-4** feedback prompts + **PG-4-UI** `methodology/page.tsx:148/512`.
5. **AT-1** anti-scaffold + **AT-2** conditional reconcile (`model-answer-prompt.ts`).
6. **EK-only batch** M3-M10 (EK-0005, EK-0006, EK-0091, EK-0105, EK-0107, EK-0078, EK-0035/EK-0001; new
   SUPPORTED entries; PLAUSIBLE entries with hedges).
7. **WAIT batch** when prerequisites clear: PS-4, AT-3 (after regen), PG-3-grader (after PG-2 data), AT-5.

*Produced 2026-05-31 by the Synthesis Agent (Project 8). No code, prompt, or EK doc modified — proposal for
user review. Every recommendation tagged to its `evidence_audit.md` bucket; no PLAUSIBLE/UNPROVEN finding
promoted to fact.*
