# Plausibility-Grading Gap Analysis (Project 8 · Agent 4 — Grading Logic Auditor)

**Author:** Grading Logic Auditor · 2026-05-31
**Mandate:** Does the system's grading actually distinguish "wrong but PLAUSIBLE" from "wrong and IMPLAUSIBLE", or does it anywhere collapse to `incorrect == incorrect`?
**Evidence gate:** every recommendation is routed through `outputs/research/evidence_audit.md` (Audit B / T1-2a). The governing finding is **VERY STRONG / SUPPORTED**: "reasoning > ID is CONDITIONAL on plausibility" — a wrong call earns 5–6/8 *only if* reasoning is sound AND the conclusion is plausible; an implausible call earns little ("USA→Australia still received some credit, however Italy … few marks" — 2021). I do **not** recommend promoting any PLAUSIBLE/UNPROVEN finding to system fact.

---

## Bottom line

The system has **two grading paths with opposite plausibility behaviour**:

- **The deterministic Stem Sniper scorer** (`study-app/src/lib/stem-scoring.ts`) *fully operationalizes* the plausibility gradient: it has a `PLAUSIBLE_OK` grade (4 pts, ranked **above** a random `VARIETY`-only call and far above `MISS`=0), a `plausible` confusables list, and a `difficulty`→`CURVEBALL_BONUS`. This path is **correct** and is the proof that the gradient *can* be encoded.
- **The two prose graders** (`evaluate-answer/route.ts`, `evaluate-full/route.ts`) — the ones that actually grade a candidate's written answer and emit PASS/BORDERLINE/FAIL — **state** the plausibility gradient in `marking-principles.ts` L14 but **do not operationalize it**. The grader receives *only the model answer*. It is **never** handed the structured `stem_answer_keys.plausible` adjacency map, nor any difficulty hint, even though that data exists in the DB for generated questions. The LLM is left to judge "is this wrong call plausible or implausible?" entirely unaided, from its own world knowledge.

So the answer to the mandate is: **the gradient is stated but not enforced in the prose path; whether it is applied is left to the LLM's discretion, with no signal of what is plausible for THIS wine.** It does not hard-collapse to `incorrect==incorrect` (the rubric text actively tells it not to), but it has **no mechanism** to prevent that collapse, and **no mechanism** to prevent the opposite error (rewarding an implausible call as if it were adjacent). The single highest-value fix is to **inject the existing `plausible`/`ground_truth` adjacency map into the prose grader prompt** — closing the gap with data the system already computes.

---

## The full grading path, traced

### 1. What the prose grader is TOLD (rubric — `marking-principles.ts`)
- **L14** STATES the gradient: *"Grade wrong IDs on a PLAUSIBILITY GRADIENT — an adjacent/stylistically plausible wrong call earns real partial credit; an implausible one earns little … Not binary."* This is correct and matches Audit B (VERY STRONG / SUPPORTED).
- **L19** Cardinal Rule 1: *"Reasoning > identification. Sound logic to a wrong-but-plausible call earns marks."* Note the embedded *"-but-plausible"* qualifier — this is the conditional, correctly stated.
- **L33** Cardinal Rule 10: the cascade nuance, correctly two-sided — penalise a guessed-wine cascade, *but* "do not cascade-penalise a sound answer merely because the ID is wrong: if the downstream answer describes the GLASS faithfully, score it on its own merits — candidates 'could have misidentified the varieties and still passed' (2023)." This already encodes the 2023 P3Q3 recoverability counterexample the audit insists on (Audit B.3). **Good — do not touch.**
- **L36** Howler rule: a clear howler tips BORDERLINE→FAIL.

### 2. What the prose grader RECEIVES (routes)
- `evaluate-answer/route.ts` L19, L33-48: the user message contains **only** `questionText`, the candidate `answer`, and (optionally) `modelAnswer`. No answer key, no `plausible` set, no difficulty.
- `evaluate-full/route.ts` L19-27, L124-145: same — `questionText`, `userAnswer`, `modelAnswer`, plus `wineAppearances`/`wines` (used only for image allow-listing, L149). No `stem_answer_keys` row is read or injected, even though `evaluate-full` *imports* `StemKey` types elsewhere (the import surfaced in grep is unused for plausibility).
- **Conclusion:** the grader's only signal of "what would be plausible for this wine" is whatever the **model answer prose** happens to mention. `model-answer-prompt.ts` L96 *does* ask the model answer to "visibly weigh the 1–2 plausible alternatives and rule them out" — so a *good* model answer leaks a partial confusable set into the grader. But this is unstructured, optional, and absent for the historical-question path where no model answer is supplied.

### 3. What is ENFORCED vs DETECT-ONLY (`grading-telemetry.ts`)
- The howler→FAIL and cascade→zero rules are **detect-only** (file header L1-12; `recordGradingOverrideCheck` L51-67 only `console.warn`s a mismatch). Nothing changes the verdict.
- **Nothing in the telemetry biases scores by plausibility.** The two flags it extracts are `howlerPresent` and `cascadeFlag` (L17-23). There is **no `plausibilityMismatch` signal** — i.e., the system does not even *observe* whether the grader credited an implausible call or zeroed a plausible one. So we cannot currently measure the gap, let alone enforce it.

### 4. The deterministic path (the working reference — `stem-scoring.ts`)
- `POINTS` (L63): `HIT 10 / NEAR 6 / PLAUSIBLE_OK 4 / VARIETY 3 / MISS 0`. A variety-correct call whose region is a **listed confusable** is promoted to `PLAUSIBLE_OK` (L280-283) — explicitly "above a random wrong region" (L247-248 docstring). This is the gradient, in code.
- `difficulty: Tier` on the ground-truth bucket (L26) drives `CURVEBALL_BONUS` (L65, L284): nailing a CURVEBALL wine scores extra. This is "latitude scales with difficulty" — but applied as a *correct-answer bonus*, not a *wrong-answer latitude*, so it sidesteps the over-implementation the audit warns about.
- The `plausible` set is built by `plausibleFor()` (`stem-answer-key.mjs` L168-187): same variety, other classic regions + curated `confusables` from proprietary blends, tiered `PLAUSIBLE`. **This is a ready-made, per-question adjacency map already persisted to `stem_answer_keys`.**

**The gap in one sentence:** the prose grader and the deterministic scorer disagree on whether plausibility is data or vibes — the scorer has the adjacency map, the prose grader (the one that issues the verdict a candidate sees) does not.

---

## The eight surfaces — where this issue lands

| # | Surface | Affected? | Current behaviour | Conflict with strongest evidence |
|---|---|---|---|---|
| 1 | Question generation | Indirect | `stem-answer-key` builds `plausible`/`difficulty` at generation time | None — it produces the very signal the grader ignores |
| 2 | Wine generation | No | — | — |
| 3 | Model answer generation | Yes (mild) | `model-answer-prompt.ts` L96 asks for 1–2 weighed alternatives | Adjacency leaks only as prose, only when a model answer exists |
| 4 | Feedback generation | Yes | Feedback explains funnelling, not *why this wrong call was/ wasn't plausible* | Misses the teachable distinction (Audit B, VERY STRONG) |
| 5 | **Grading** | **Yes — primary** | Prose grader judges plausibility unaided; no adjacency/difficulty signal injected | The conditional gradient (T1-2a, VERY STRONG/SUPPORTED) is stated, not operationalized |
| 6 | Examiner simulation | Yes | Same prose graders; no plausibility signal | Largest realism error (see Q4) |
| 7 | EK injection | Yes (latent) | EK-0007 reads unconditional; audit says qualify it | Per T1-2a, EK-0007 should be "reasoning rescues only a *plausible* call" |
| 8 | UI messaging | Yes | `methodology/page.tsx` L148, L512 state the rule **unconditionally** | Teaches the wrong (unconditional) lesson — see Q3 |

---

## Mandatory questions (scoped to grading)

**1. What currently contradicts the strongest evidence?**
The prose grader has **no per-wine plausibility signal**, so the gradient (T1-2a, VERY STRONG/SUPPORTED) is unenforceable in the path that issues verdicts. Secondarily, **UI** (`methodology/page.tsx` L148/L512) and **EK-0007** state "Reasoning > ID" *unconditionally*, directly contradicting the conditional-on-plausibility form the audit rates better-evidenced than the live unconditional claim.

**2. What creates examiner-unrealistic behavior?**
Because plausibility is judged "by vibes," the grader's partial-credit for a wrong call is **uncalibrated to the actual confusable distance**. A real examiner gave USA→Australia "some credit" but Italy "few marks" (2021) because of *known stylistic adjacency*. The app's grader has no adjacency map, so it can grade two equidistant-looking-but-actually-different wrong calls identically — or invert them.

**3. What teaches candidates the wrong lesson?**
`methodology/page.tsx` L148: *"A wrong answer with sound reasoning earns more marks than a right answer with no reasoning"* — stated with **no plausibility condition**. A candidate reads this as "reasoning always rescues me," which is exactly the misconception the 2025 report corrects ("*and their conclusion plausible*"). This is the most damaging teaching error in the grading domain.

**4. What produces the largest simulation error?**
The **absence of the adjacency map at grade time** (Surfaces 5+6). For any generated question (where `stem_answer_keys.plausible` exists), the simulation is strictly worse than it needs to be: the data to grade plausibility correctly is already in the DB and simply isn't passed.

**5. Which fixes should be implemented immediately?**
- **P-1 (CODE):** Inject the structured `ground_truth` + `plausible` adjacency map into both prose grader prompts.
- **P-2 (CODE/telemetry):** Add a detect-only `plausibilityMismatch` flag to `grading-telemetry.ts` so we can *measure* the gap before any enforcement.
- **P-4 (UI copy):** Add the plausibility condition to `methodology/page.tsx` L148/L512.
- **P-5 (feedback prompt):** Require feedback to name *why* a wrong call was/wasn't plausible.

**6. Which fixes should wait?**
- **P-3 (difficulty hint):** a *soft* difficulty hint into the prose grader — wait until P-2 telemetry shows the grader under-credits hard wines. Per audit, "latitude scales with difficulty" is **PLAUSIBLE**, so ship as a soft hint, never a multiplier.
- **Any verdict-changing enforcement** of plausibility (auto-zeroing/auto-crediting) — wait; this is a gated two-pass project like the howler/cascade enforcement.

**7. Which findings require additional validation?**
- The "bankers get NO latitude" half (PLAUSIBLE/inferred) — do **not** encode; keep the constrained-option mechanism separate.
- The structural-miss-fatal asymmetry — do **not** hard-wire cascade-to-zero (2023 P3Q3 counterexample). The existing L33 wording already handles it; leave it.
- Whether the LLM's unaided plausibility judgement is actually wrong often enough to justify P-3 — P-2 telemetry answers this.

---

## Recommendations (implementation-ready)

### P-1 — Inject the existing adjacency map into the prose graders **[CODE · evidence VERY STRONG · bucket SUPPORTED · effort MEDIUM · IMMEDIATE]**
**Why:** This is the core fix. The `plausible`/`ground_truth` data already exists; the grader just isn't given it.
**Where (read path):** `evaluate-full/route.ts` L19-27 (request body) and L124-145 (userMessage); `evaluate-answer/route.ts` L19 and L33-48.
**Edit:**
1. For generated questions, read the persisted `stem_answer_keys` row by `question_id` (it has `ground_truth`, `plausible`). For historical questions where no key exists, derive `plausible` on the fly via `deriveStemKey` (`stem-answer-key.ts` L58), or skip gracefully (the block is optional).
2. Inject a new block into the grader **user message** (not the model answer), e.g.:
   ```
   ## Plausibility reference (for grading wrong calls — NOT the answer to reveal)
   Ground truth: slot 1 = Syrah, Northern Rhône (France) …
   Stylistically PLAUSIBLE confusables for these wines (a wrong call landing here = real partial credit):
     - Syrah / Barossa (Australia); Syrah / Washington (USA) …
   A wrong call NOT among these and not otherwise stylistically adjacent earns little (2021 "Italy … few marks").
   ```
3. Add one rubric line in `marking-principles.ts` after L14: *"When a Plausibility reference is provided, anchor wrong-call partial credit to it: a call matching a listed confusable earns meaningful partial credit; a call neither listed nor otherwise stylistically adjacent earns little. When no reference is provided, judge adjacency from style."*
**Guardrail (audit):** This is *credit calibration*, not a cascade rule. Do **not** add any auto-zero. The 2023 P3Q3 protection at L33 stays intact.

### P-2 — Add a detect-only `plausibilityMismatch` flag **[CODE · evidence VERY STRONG · bucket SUPPORTED · effort LOW · IMMEDIATE]**
**Why:** We currently cannot even *see* whether the grader honours the gradient. Mirror the existing howler/cascade detect-only pattern before any enforcement.
**Where:** `grading-telemetry.ts` — extend `GradingMeta` (L25-30) with `wrongCallPlausible?: boolean | null` and `creditGiven?: "none"|"partial"|"full"`; extend `GRADING_META_INSTRUCTION` (L17-23) to ask the grader to self-report, for the primary ID sub-question, whether the candidate's wrong call was plausible and how much credit it gave; extend `recordGradingOverrideCheck` (L51-67) to `console.warn` when `wrongCallPlausible===false && creditGiven==="full"` (over-credit) or `wrongCallPlausible===true && creditGiven==="none"` (under-credit).
**Guardrail:** Pure observability. Never changes the verdict (consistent with the file's own contract, L9-12).

### P-3 — Soft difficulty hint into the prose grader **[CODE · evidence PLAUSIBLE · bucket PLAUSIBLE · effort LOW · WAIT]**
**Why:** "Latitude scales with difficulty" is real but **PLAUSIBLE/inferred** (Audit B.4). The deterministic scorer already models the *correct-answer* side via `CURVEBALL_BONUS`. For the prose grader, ship only a **soft hint** once P-2 shows under-crediting of hard wines.
**Where:** the same injected block in P-1; append e.g. *"These wines are rated CURVEBALL/esoteric — examiners give generous latitude to well-argued plausible options here (2025 Cornas: 'we do not expect everyone to nail a Cornas, but we do expect plausible options')."* for high-difficulty buckets only.
**Guardrail (audit, do NOT do):** No hard multiplier. No "bankers get zero latitude" rule — that is inferred and conflated with the constrained-option mechanism (Audit B.4). Keep constrained-option handling (already in L20 "will often yield a zero mark") separate.

### P-4 — Add the plausibility condition to UI copy **[UI COPY · evidence VERY STRONG · bucket SUPPORTED · effort LOW · IMMEDIATE]**
**Where:** `methodology/page.tsx` L148 and L512.
**Edit:** L148 desc → *"A wrong answer with sound reasoning earns more marks than a right answer with no reasoning — **provided the wrong call is still plausible.** An implausible call earns little even with reasoning (2021)."* L512 similarly add the conditional.

### P-5 — Make feedback explain the plausibility verdict **[CODE/PROMPT · evidence VERY STRONG · bucket SUPPORTED · effort LOW · IMMEDIATE]**
**Where:** `answer-evaluation-prompt.ts` (the per-sub-question block ~L52-54) and `evaluate-full` per-sub-question format (~L96-107).
**Edit:** Add a feedback instruction: *"If the candidate's ID was wrong, state explicitly whether it was a *plausible* miss (adjacent style — earns partial credit) or an *implausible* one (earns little), and name the nearer plausible call they should have funnelled to."* Routes the SUPPORTED teaching distinction to the candidate instead of treating all wrong answers identically.

### EK note (not a code change) **[EK · evidence VERY STRONG · bucket SUPPORTED]**
EK-0007 should be qualified to the conditional form ("reasoning rescues a wrong call **only when plausible**"), per T1-2a. **Blocked on T1-5** (the EK-0104+ collision) per the audit's hard prerequisite — flag only; do not edit here.

---

## What must NOT be hard-coded (audit guardrails, restated)
- **No structural-miss → fatal cascade-to-zero.** Contradicted by **2023 P3Q3** (Mitchell MW: candidates "misidentified alcohol or acidity… however with good answers to parts b) and c), could still achieve strong marks"). The current `marking-principles.ts` L33 already gets this right ("do not cascade-penalise a sound answer merely because the ID is wrong"). **Leave it.**
- **No "bankers get zero latitude" rule.** INFERRED, not graded policy (Audit B.4). Keep the constrained-option case (L20) separate.
- **No difficulty multiplier; soft hint only** (P-3, gated on P-2).
- **No verdict-changing plausibility enforcement** until a gated two-pass project, exactly as the howler/cascade enforcement is deferred (`grading-telemetry.ts` L9-12).

---

## Evidence tags summary
| Rec | Type | Evidence strength | Bucket | Priority |
|---|---|---|---|---|
| P-1 inject adjacency map | CODE | VERY STRONG | SUPPORTED | IMMEDIATE |
| P-2 plausibilityMismatch telemetry | CODE | VERY STRONG | SUPPORTED | IMMEDIATE |
| P-3 soft difficulty hint | CODE | PLAUSIBLE | PLAUSIBLE | WAIT (gate on P-2) |
| P-4 UI conditional copy | UI COPY | VERY STRONG | SUPPORTED | IMMEDIATE |
| P-5 feedback plausibility verdict | PROMPT | VERY STRONG | SUPPORTED | IMMEDIATE |
| EK-0007 qualify | EK | VERY STRONG | SUPPORTED | WAIT (blocked on T1-5) |
