# System Report Card — MW Practical Study Engine

> **Baseline graded 2026-05-31.** An honest, evidence-cited assessment of how the system **generates
> questions, model answers, grades, and feedback** — and where it must improve beyond what the
> feedback loop alone can fix. This is a **tracked baseline**: re-grade against it after material
> changes and record the new grade + date in the changelog at the bottom.
>
> Grades are evidence-based (this session's direct tests + the LOYO backtest + the live DB + the EK
> canon), not aspirational. Citations: EK-#### = `mw_exam_empirical_knowledge.md`; commit hashes are on
> `master`; "this session" = the 2026-05-31 confidence/grading hardening pass.

## Scoreboard

| Surface | Grade | One-line |
|---|---|---|
| Question generation | **B+** | Served output is clean & realistic; the *raw* generator is leaky (caught by a strong validator) |
| Model-answer generation | **B+** *(was C)* | Now differentiates + reconciles; was leaking sections into the answer until this session |
| Grading / evaluation | **A−** | Examiner-faithful trust-account modelling; key hard rules still detect-only |
| Feedback analysis | **A−** *(was B)* | Now grounded in the full grading canon; was blind to scoring disputes until this session |
| Empirical grounding & self-correction | **A** | Cited, tiered, gated canon + live projection + backtest + telemetry — the real edge |
| **Overall** | **B+ , trending A−** | Strong delivered output; quality leans on validation/grounding more than first-pass generation |

---

## 1 · Question generation — B+

- **Evidence.** 489-line constraint-dense `question-generation-prompt.ts` + hard `question-validator.ts`;
  LOYO identification **72.8% top-1 / 89.2% top-3 / 95.6% candidate-set** (EK-0082;
  `outputs/backtest_reports/loyo_postfix_audit.md`). Live DB (2026-05-31): **83 generated, 42 quarantined
  (~51%), 38 served**; a 6/6 random sample of the **served** set was coherent and scope-valid.
- **Strength.** What reaches users is examiner-plausible and well-composed (e.g. a single-variety Pinot
  Gris tour across Alsace/Friuli/Oregon/Austria; a 4-country mixed bag; Syrah France-vs-South-Africa under
  a correct "same single grape" stem). The validator reliably gates scope/variety/marks violations
  (EK-0040/0042/0043/0044).
- **Honest weakness.** The **raw generator is error-prone** — ~51% of drafts are quarantined,
  **overwhelmingly on the 25-marks-per-wine arithmetic** (EK-0041), plus occasional variety/scope slips
  (a white blend inside a single-variety flight; two cask-oxidative white Riojas placed in Paper 3 against
  the prompt's own hard sub-rule). Delivered quality is carried by the **gate**, not by first-pass
  generation. Blend→dominant-variety collapse remains a known failure mode (EK-0083).
- **Highest-leverage fix.** Make mark allocation **deterministic** (compute 25×N in code, not by LLM
  arithmetic) — this single change would cut the dominant quarantine cause and lift served throughput.

## 2 · Model-answer generation — B+ *(was C until this session)*

- **Evidence.** R4 (differentiate wines + reconcile move) verified old-vs-new on a 4-wine flight (commit
  `7c1e102`); all **72 stored exemplars refreshed** clean — 0 boundary leaks across P1/P2/P3, normalized
  from 13–16k-char blobs to ~2.6–3.6k (~400-word) answers.
- **Strength.** Now funnels, gives each wine its own argument, lands a second-order "under the skin" move
  (EK-0094), and writes to the actual marking rubric.
- **Honest weakness.** It was **shipping a real defect until 2026-05-31**: the shared section parser let
  `model_answer` swallow sections 2–4 whenever the model titled section 1 "# Mock answer" instead of
  "### 1. Model Answer" (fixed in `13b33af`; AT-1/AT-2 in `7c1e102`). A minor section-titling fragility
  remains. The 112 historical `outputs/mock_answers/*.md` (separate Python pipeline) were **not** in scope
  and have not been refreshed against the R4 standard.

## 3 · Grading / evaluation — A− *(strongest surface)*

- **Evidence.** R1/R2 old-vs-new re-grade behaved correctly (commit `a654bbc`); a live "Sancerre-not-
  Chablis" analysis applied the plausibility gradient precisely (right-grape-wrong-place vs wrong-grape-
  contradicted-by-own-note); PG-1 injects the per-wine adjacency map from data (`9a9e147`).
- **Strength.** Examiner-faithful **trust-account** modelling, grounded in cited EK rather than vibes:
  plausibility gradient (EK-0090/0112), confidence≠correctness (EK-0123), contamination law (EK-0122),
  correct-ID parity, funnelling, full-scale quality calibration (EK-0114), howler/cascade detection. Pass
  standard corrected to the real aggregate-65%+floor (EK-0116).
- **Honest weakness.** The **howler→FAIL / cascade→zero rules are detect-only** (`grading-telemetry.ts`
  console.warn; R8 not built) — a streamed verdict can silently violate the rules the rubric names.
  Banker/curveball **difficulty does not yet reach the grader** (R5; the scorer's `CURVEBALL_BONUS` is
  unfed). The single-question PASS/BORDERLINE/FAIL is a **proxy** for the 3-paper standard, not the real
  thing (EK-0116).

## 4 · Feedback analysis — A− *(was B until this session)*

- **Evidence.** Live test on a synthetic grading dispute produced expert-level adjudication (commit
  `f1c9e5a`); live DB accept/reject split **24 accepted / 10 rejected** shows it discriminates rather than
  rubber-stamps.
- **Strength.** Now grounded in the full EK canon **including §2/§3 (grading)** + the exact marking rubric
  for evaluation disputes; checks precedent (§6 ledger), fact-checks the candidate, and routes fixes to the
  correct code layer (answer-key / question / generation / validator / grading-rubric).
- **Honest weakness.** Until 2026-05-31 it had **zero grading grounding** for scoring disputes — the most
  common kind — because `getEmpiricalKnowledgeForAnalysis` filtered out §2/§3. Now fixed but **freshly
  deployed and unproven at scale**. The evaluation-dispute detector is a keyword heuristic (broad, but a
  heuristic).

## 5 · Empirical grounding & self-correction — A *(the real edge)*

- **Evidence.** `mw_exam_empirical_knowledge.md` (cited, tiered canon) → live Neon `empirical_knowledge`
  projection feeding every agent; §6 feedback ledger as precedent; LOYO backtest (EK-0082); grading
  telemetry now persisting (`478c97c`); the `evidence_audit.md` **gate** sorting STRONG/PLAUSIBLE/UNPROVEN
  and superseding wrong claims (e.g. the "65% per paper" → EK-0116 correction).
- **Strength.** Unusually rigorous discipline — claims are cited, tiered, and gated, so agents reason from
  vetted canon, not anecdote. Three real defects were surfaced **and fixed** in a single session, evidence
  the loop works.
- **Weakness.** Some doctrine is **theory-weighted vs practical** (flagged in the confidence study —
  "under the skin" / reconcile are PLAUSIBLE-on-the-practical); the loop depends on the EK projection
  staying synced (`sync-ek-table.mjs` after every doc change).

---

## The through-line (read this if nothing else)

**Delivered quality is high, but a large share of that quality is the validator gate, the EK grounding,
and the feedback loop catching the raw generators' mistakes — not the generators being right first time.**
The strongest layer is reasoning/grading/grounding; the weakest is **raw generation fidelity** (mark
arithmetic, occasional variety/scope slips). The maturity is "rapidly hardening," not "finished."

## Roadmap — what the feedback loop *cannot* fix for itself

The candidate feedback loop fixes **per-question** errors. It will **never** surface these **systemic /
architectural** gaps (no candidate can see a quarantine rate or a detect-only verdict path), so they need
deliberate engineering:

| # | Improvement | Why it's invisible to the feedback loop | Status |
|---|---|---|---|
| **1** | **Deterministic mark allocation** in generation (compute 25×N in code) | The ~51% quarantine rate is a pipeline metric; users only ever see *served* questions | Open — highest ROI |
| **2** | **Enforce howler→FAIL / cascade→zero** (R8; gated two-pass behind a flag) | Detect-only today; a wrong verdict that "feels right" draws no feedback | Open — gated on telemetry false-positive rate |
| **3** | **Wire banker/curveball difficulty to the grader** (R5) | Latitude calibration is internal; users can't see the missing difficulty signal | Open — needs a structured difficulty data source + telemetry |
| **4** | **Let `grading_telemetry` accrue, then tune** (R5/R7/R8 are data-gated) | The data sink is new (`478c97c`); decisions should be data-driven | In progress — collecting |
| **5** | **Refresh the 112 historical `outputs/mock_answers/`** to the R4 standard (Python pipeline) | Repo artifacts, not user-facing questions | Open — separate pipeline |
| **6** | **Section-titling robustness** in the model-answer generator (belt-and-braces on the parser fix) | A parsing edge case, invisible unless inspected | Minor — parser hardened `13b33af` |

Full per-recommendation detail (R1–R9, ROI vs risk, file-level): `confidence_implementation_recommendations.md`.

---

## Re-grade checklist (for the next baseline)

1. Re-run the LOYO backtest → update the identification grade (currently 72.8/89.2/95.6).
2. Pull live DB: `generated_questions` total / quarantined %, served-set spot-check (6+), feedback
   accept-reject split.
3. Re-run the grading old-vs-new probes (R1/R2 exemplars) and one live feedback-dispute analysis.
4. Query `grading_telemetry` for howler-borderline / over-credit / under-credit base rates.
5. Update the scoreboard + the roadmap table; append to the changelog.

## Changelog

- **2026-05-31** — Baseline established (B+ overall). Graded immediately after the confidence/grading
  hardening pass: R1/R2/R3/R9 rubric (`a654bbc`), PG-1/PG-2 (`9a9e147`), telemetry persistence
  (`478c97c`), R4 (`7c1e102`), model-answer regen path + 72-exemplar refresh (`3e64769`, `13b33af`),
  feedback §2/§3 grounding (`f1c9e5a`), AT-3 (`c2b3c32`).
