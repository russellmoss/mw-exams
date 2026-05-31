# Anti-Template Gap Analysis — Model Answer Auditor (Project 8, Agent 3)

> **Mandate.** Determine whether the system's GENERATED MODEL ANSWERS (and, where relevant, generated
> questions) reuse reasoning structures, language, or conclusions, or otherwise violate the anti-template
> examiner doctrine that `evidence_audit.md` rates **STRONG / SUPPORTED** (T1-4, Audit E:
> "no two answers should ever be completely the same" — 2017/2023/2024 Practical + 2024 Chief). A
> template-shipping study app trains the exact failure the Chief named.
>
> **Author:** Model Answer Auditor, 2026-05-31. Proposal only — no code, prompt, or EK doc was modified.
> Every recommendation is tagged with the `evidence_audit.md` strength + bucket and routed through its verdicts.

---

## 0 · Bottom line

The anti-cut-and-paste doctrine is **already wired into both generation and grading** — but only at one of
two levels. The system forbids **within-flight wine cut-and-paste** (don't put "cold soak" on all 12 wines)
in both the model-answer generator and the grader, so on *that* axis generation and grading are aligned.

The **real, un-addressed gap** is a *different* template behaviour the doctrine also condemns: **cross-answer
structural-scaffold reuse**. Inspection of the live generated artifacts shows every wine, in every question,
across papers, is poured through the *same fixed paragraph machine*: an identical maturity formula ("improve
N years and hold M"), an identical "Wine X is [excellent/very good] quality, [tier] level, $A-B" opener, and
a structurally identical commercial paragraph. Each wine is *individually* differentiated (distinct origin,
distinct fruit) so it passes the existing rule 9 check — yet the *shape* of the reasoning never varies. That
is "cut and paste" in the sense the 2017 report meant ("no two answers should ever be **completely** the
same") and the precise rote-template failure the 2024 Chief warned trains the wrong instinct.

Second finding: the **"reconcile conflicting evidence" second-order move** (the 2025 Tokaji exemplar) is
**rewarded by the grader** (`marking-principles.ts:42`, the "under the skin" top-band rule) but is **never
instructed in generation**. The generator is graded on a behaviour it is never told to produce — a
generation↔grading misalignment, exactly parallel to the one the mandate flagged for cut-and-paste.

Both are **prompt-only, low-risk** fixes. Neither requires an EK promotion beyond what `evidence_audit.md`
already places in SUPPORTED (anti-template) / PLAUSIBLE-as-exemplar (reconcile move).

---

## 1 · What is actually wired today (verified, with file:line)

### Generation path (single-question, live app)
- `generate-model-answer/route.ts:28` calls `buildModelAnswerPrompt(...)`.
- `model-answer-prompt.ts:61-81` builds the system prompt by injecting, from
  `public/data/pipeline-context.json`: `mockAnswerWriterAgent`, `sharedRules`, `examinerReportSynthesis`,
  then `MARKING_PRINCIPLES` (line 73) and `FUNNELLING_PRINCIPLE` (line 75).

### The anti-cut-and-paste clause IS present (within-flight axis)
- `marking-principles.ts:32` (rule 9), injected into BOTH the generator (`model-answer-prompt.ts:73`) and
  the grader (`evaluate-full/route.ts:51`): *"No cut-and-paste across wines… the same technique applied to
  every wine ('cold soak' or 'whole-bunch' on all of them)… 'creates considerable doubt'… Mark down failure
  to differentiate."*
- The injected `mockAnswerWriterAgent` JSON carries the same doctrine verbatim (confirmed by grep of
  `pipeline-context.json`, key `mockAnswerWriterAgent`; source is `.claude/agents/mock-answer-writer.md:234`):
  *"Differentiate every wine — never cut-and-paste… near-identical wording… 'creates considerable doubt'."*
- `examinerReportSynthesis` (the other injected key) repeats the same line (grep hit line 5).

**So generation and grading ARE aligned on the within-flight axis.** The mandate's framing ("the grader
already penalises cut-and-paste so the gap is generation not aligning with grading") is **half-true**: it is
already aligned for *within-flight* cut-and-paste. The misalignment that remains is on the two axes below.

### Question generation already has a strong anti-template clause
- `question-generation-prompt.ts:299-304`: *"QUESTION NOVELTY — DO NOT REUSE THE STRUCTURAL TEMPLATE…
  Swapping the specific wines while keeping the same stem template AND the same contrast axis is NOT
  enough — that is the exact repetition we are eliminating."* This is good and needs no change.

---

## 2 · The gaps (what evidence_audit's strongest doctrine still catches)

### GAP A — Cross-answer structural-scaffold reuse is NOT forbidden (the live gap)
**Evidence strength: STRONG. Bucket: SUPPORTED.** (evidence_audit T1-4 anti-template; Audit E "avoidance of
templates/cut-and-paste — repeatedly rewarded — STRONG".)

The existing rule 9 forbids putting the *same content* (one technique) on every wine. It does **not** forbid
pouring every wine through the *same structural mould*. The generated artifacts do exactly that. Quoted real
repetition from `outputs/mock_exams/mock_full_2026_05_27_v11_answers_p2.md` (Question 1, quality/maturity
sub-part), one fixed scaffold reused verbatim in shape for all four wines:

- W1: *"is excellent quality, equivalent to Pauillac classified growth… improve 10-15 years and hold 25+."*
- W2: *"is excellent Napa Cabernet, premium estate level… improve 8-12 years, then hold a further decade."*
- W3: *"is outstanding Chilean Cabernet… improve 8-12 years and hold 20."*
- W4: *"is very good to excellent premium Australian Cabernet-Shiraz… drink now to 10 years, holding a
  further 5."*

The same `[tier] level → youthful/primary → improve N → hold M` machine reappears in Q2 (Rioja), Q3 (breadth
flight), and across Paper 1 (`..._answers_p1.md`: "improve 8-12 years and hold a further decade" pattern on
the Riesling flight). Commercial sub-parts are the same: one run-on paragraph that ticks
channel→geography→price→competitive-set for each wine in identical order. Every wine is individually
*defensible* (so rule 9 passes), but the **reasoning shape is a template**. Under the 2017 standard ("no two
answers should ever be *completely* the same") and the 2024 Chief's anti-rote warning, this is the failure
mode the doctrine names. A candidate who internalises these model answers learns to fill in a scaffold, not
to reason freshly per glass — the opposite of what the exemplars are supposed to teach.

**Why the current clauses miss it:** rule 9 and the mock-answer-writer clause are scoped to *content*
repetition ("same technique on every wine," "near-identical wording"). They never address *scaffold*
repetition — identical sentence architecture, identical sub-part ordering, identical maturity/commercial
formula — which is the dominant template behaviour the artifacts actually exhibit.

### GAP B — The "reconcile conflicting evidence" move is graded but never generated
**Evidence strength: STRONG (anti-template half) / MODERATE (reconcile-as-exemplar). Bucket: SUPPORTED for
the doctrine; PLAUSIBLE for the reconcile move as a *frequency* claim — adopt as ILLUSTRATIVE EXEMPLAR, not a
blanket mandate.** (evidence_audit T1-4 Counter Evidence: single named 2025 Tokaji instance; "demonstrate it
*where evidence conflicts*, not 'every answer must reconcile'.")

- The grader **rewards** it: `marking-principles.ts:42` reserves top-band marks for second-order insight
  "(e.g. reasoning that an exceptional producer exceeds a classification's minimum sugar requirement)" — the
  Tokaji move, verbatim.
- The generator is **never told to produce it.** Grep of all of `study-app/src/lib/prompts/` for
  "reconcil / conflicting evidence / second-order / exceed minimum" returns **only** the grader line
  (`marking-principles.ts:42`). `model-answer-prompt.ts` and the injected `mockAnswerWriterAgent` have an
  "under the skin" *quality* note but no instruction to **demonstrate a reconciling inference when the glass
  evidence genuinely conflicts**.

This is a generation↔grading misalignment of the same species the mandate flagged: the model answer is held
to a top-band bar it is never instructed to clear, so it will only reach it by luck.

**Risk to manage (named in evidence_audit T1-4 Implementation Risk):** mandating reconciliation every answer
would push the model to **manufacture false conflicts**. The fix must be **conditional** ("where the
structural evidence genuinely points two ways") and framed as *one illustration*, never an every-answer
requirement.

---

## 3 · The eight system surfaces — how this issue lands on each

| # | Surface | Relevant? | Current behavior (file:line) | Conflict with strongest evidence | Fix |
|---|---|---|---|---|---|
| 1 | Question generation | **Yes** | `question-generation-prompt.ts:299-304` already forbids template/contrast-axis reuse. | None — this surface is compliant. | No change. (Confirm-only.) |
| 2 | Wine generation | Marginal | Wine-bank classify on insert; no answer-prose template. | None on the anti-template axis. | No change. |
| 3 | **Model answer generation** | **Yes — primary** | `model-answer-prompt.ts` + injected `mockAnswerWriterAgent`/`marking-principles.ts:32` forbid within-flight content reuse only; no cross-answer scaffold ban; no reconcile instruction. | GAP A (scaffold reuse) + GAP B (reconcile move ungenerated) vs T1-4 SUPPORTED doctrine. | §4 edits #1, #2. |
| 4 | Feedback generation | **Yes** | `feedback-analysis-prompt.ts:115` references novelty for *generated questions* only; says nothing about scaffold-template feedback to the candidate. | Weak — feedback could coach candidates to vary reasoning shape (T1-4 / Audit E). | §4 edit #4 (optional, low priority). |
| 5 | Grading | **Yes** | `marking-principles.ts:32` (rule 9) penalises within-flight cut-and-paste; `:42` rewards reconcile/under-the-skin. | Grader is *correct* and *ahead of* the generator — that asymmetry IS the misalignment. | Tighten rule 9 to name *scaffold* reuse so grader+generator move together (§4 edit #3, optional). |
| 6 | Examiner simulation | **Yes** | Simulated examiner praise/penalty rides `marking-principles.ts`; will reward a scaffolded answer because each wine is individually differentiated. | Simulation under-penalises the rote-scaffold answer the real Chief condemns → simulation error (§Q4). | Covered by §4 edits #1+#3. |
| 7 | EK injection | **Yes** | EK reaches prompts via `sync-empirical-knowledge.mjs` / `sync-ek-table.mjs`. evidence_audit T1-5 warns EK-0104+ IDs collide and roadmap citations are stale. | Citing a numeric EK ID in the new clause risks pointing at the wrong live entry. | §4: cite the **doctrine in prose**, NOT an EK number, until T1-5 renumber lands. |
| 8 | UI messaging | Minor | `methodology/page.tsx` describes the study method. | None load-bearing. | Optional: state that model answers are deliberately varied in structure, not a fill-in template. |

---

## 4 · Implementation-ready edits

All edits are **PROMPT changes** unless tagged otherwise. None cites an EK number (per T1-5: EK-0104+ IDs are
in collision and roadmap citations are stale — cite the doctrine in prose until the renumber lands).

### EDIT #1 — Add a cross-answer anti-scaffold clause to the model-answer generator
**File:** `study-app/src/lib/prompts/model-answer-prompt.ts`, in the user-message block, immediately after the
`### 1. Model Answer` instruction (currently ends `...Follow the mock-answer-writer rules exactly.` at line 96).
**Type:** prompt change. **Evidence:** STRONG / SUPPORTED (T1-4 anti-template; Audit E).
**Add:**

> **Reason freshly per glass — vary the *shape*, not just the content.** It is not enough that each wine has a
> different grape/origin: the *structure* of your reasoning must differ too. Do NOT run every wine through one
> fixed scaffold (e.g. the same "[tier] level → youthful → improve N years → hold M" maturity formula, or an
> identical channel→geography→price→competitor commercial sentence, repeated verbatim in shape for all wines).
> Examiners deliberately choose wines that differ; "no two answers should ever be completely the same" (2017).
> Let the wine that most invites a maturity discussion get the fullest maturity treatment; let the
> commercially interesting wine carry the fullest commercial reasoning; lead different wines with different
> evidence (one from structure, one from a distinctive aromatic, one from a contrast with its neighbour).
> Recited scaffolds "create considerable doubt in the mind of the reader" (2024) and train rote habits the
> Chief Examiner warns against (2024 Chief).

### EDIT #2 — Add the CONDITIONAL reconcile-conflicting-evidence instruction
**File:** `study-app/src/lib/prompts/model-answer-prompt.ts`, same `### 1. Model Answer` block, after Edit #1.
**Type:** prompt change. **Evidence:** STRONG (doctrine) / MODERATE (reconcile-as-exemplar). **Bucket:**
PLAUSIBLE as a frequency claim → adopt as ILLUSTRATIVE EXEMPLAR, **conditional**, never blanket (T1-4).
**Add:**

> **Where the glass evidence genuinely conflicts, demonstrate ONE second-order reconciling inference** — but
> only when a real tension exists; never manufacture one. Example of the move (2025 Tokaji exemplar): "the
> sugar reads like a lower Puttonyos level, yet the concentration and balance indicate an exceptional producer
> whose wines exceed the classification minimum." If the wines in this flight present no genuine evidential
> conflict, do NOT force a reconciliation — a fabricated conflict is worse than none.

*(Guardrail wording "only when a real tension exists… never manufacture one" directly implements the T1-4
Implementation-Risk mitigation: a mandatory reconcile move otherwise pushes the model to invent false
conflicts.)*

### EDIT #3 — (Optional, grading) Extend rule 9 to name *scaffold* reuse so grader and generator move together
**File:** `study-app/src/lib/prompts/marking-principles.ts:32` (rule 9). **Type:** prompt change.
**Evidence:** STRONG / SUPPORTED. **Risk note:** Medium — see below.
**Append to rule 9, after "even when each statement is individually defensible.":**

> This includes *structural* cut-and-paste: if every wine's answer follows the identical sentence scaffold and
> the identical maturity/commercial formula — even with different grapes and regions — mark down the failure to
> reason freshly per glass.

**Why optional / why a caveat:** the grader is currently *correct and ahead of* the generator; tightening it
without first shipping Edit #1 would penalise the system's own model answers before generation is fixed.
**Sequencing:** ship Edits #1+#2 first; ship Edit #3 only after regenerating the affected artifacts, to avoid
the grader nuking outputs the generator still produces. Also keep it a *tendency* ("mark down"), not a howler
(do not cap to zero) — evidence_audit places only factual howlers in the zero-cap class, not stylistic
sameness.

### EDIT #4 — (Optional, low priority) Feedback prompt: coach reasoning-shape variety
**File:** `study-app/src/lib/prompts/feedback-analysis-prompt.ts`. **Type:** prompt change.
**Evidence:** STRONG doctrine, but the surface is candidate-feedback not generation; lower leverage.
When a candidate's own answer repeats one scaffold across a flight, the feedback should name it as a
template/rote habit and point to fresh per-glass reasoning. Defer behind Edits #1-#3.

### NON-edit — UI (optional copy)
`methodology/page.tsx`: a one-line note that model answers are intentionally varied in structure (not a
fill-in template) reinforces the pedagogy. Cosmetic; lowest priority.

---

## 5 · What NOT to do (over-reach guards from evidence_audit)

- **Do NOT mandate the reconcile move on every answer.** PLAUSIBLE-as-frequency only; adopt as a *conditional
  exemplar* (T1-4 Counter Evidence; Audit E "occasional / single exemplar"). Manufactured conflicts are the
  named failure mode.
- **Do NOT cite EK-0104…EK-0111 numeric IDs** in any shipped clause. T1-5 (VERY STRONG) shows those IDs are in
  live collision and roadmap citations are stale. Cite the doctrine in prose; let the T1-5 renumber land first.
- **Do NOT escalate scaffold-sameness to a howler / zero-cap** in the grader. evidence_audit reserves
  zero-capping for factual impossibilities (rule 9's existing cascade/howler logic); stylistic template reuse
  is a "mark down," not a fail trigger.
- **Do NOT touch question-generation novelty** (`question-generation-prompt.ts:299-304`) — already compliant.

---

## 6 · Mandatory questions (scoped to model-answer / generation domain)

1. **What currently contradicts the strongest evidence?** The model-answer generator produces structurally
   identical per-wine scaffolds across an entire flight and across questions (GAP A; quoted §2), contradicting
   the STRONG/SUPPORTED anti-cut-and-paste doctrine ("no two answers should ever be completely the same,"
   2017). The within-flight *content* ban exists; the cross-answer *scaffold* ban does not.

2. **What creates examiner-unrealistic behavior?** The simulated examiner (`marking-principles.ts` driving
   `evaluate-full`) will praise a scaffolded flight because each wine is individually differentiated, whereas
   the real 2024 examiner says recited structure "creates considerable doubt." Also, the grader rewards the
   reconcile/under-the-skin move (`:42`) that the generator is never told to produce (GAP B) — so the
   simulated top band is unreachable by design.

3. **What teaches candidates the wrong lesson?** Model answers that fill a fixed scaffold teach candidates to
   *fill in a template* rather than reason freshly per glass — precisely the rote habit the 2024 Chief warns
   "will not pass." This is the product-validity risk in T1-4: a template-shipping study app trains the named
   failure.

4. **What produces the largest simulation error?** GAP A. The grader under-penalises the rote-scaffold answer
   (it only checks content-level differentiation), so the system's *self-assessment* of its own model answers
   is biased high, and candidate practice answers that mimic the scaffold get scored more generously than a
   real examiner would. GAP B is a smaller, top-band-only error.

5. **Which fixes should be implemented immediately?** Edits #1 and #2 (model-answer-prompt.ts) — prompt-only,
   Low risk, directly implement T1-4 (rated ADOPT IMMEDIATELY in evidence_audit). They align generation with
   the already-correct grader.

6. **Which fixes should wait?** Edit #3 (grader scaffold clause) — ship *after* #1/#2 and after regenerating
   artifacts, so the grader doesn't penalise outputs the generator still emits. Edit #4 (feedback) and the UI
   copy — defer; low leverage. Any clause that would cite an EK number must wait on the T1-5 renumber.

7. **Which findings require additional validation?** The **frequency** of the reconcile move (single 2025
   Tokaji instance → PLAUSIBLE, not a rule); keep it conditional/illustrative pending more sittings. Whether
   the scaffold-sameness penalty should ever influence the verdict band (vs prose-only) needs a calibration
   pass against real examiner reports before being more than a "mark down."

---

## 7 · Open questions

- Does the *offline* mock-exam answer pipeline (three parallel per-paper agents per
  `pipeline-context.json` → `.claude/agents/mock-answer-writer.md`) read the SAME injected clauses as the live
  `buildModelAnswerPrompt`, or can they drift? Edits #1/#2 land in the live prompt; the offline agent file
  (`mock-answer-writer.md:234`) needs the parallel cross-answer-scaffold clause added too, or the two paths
  will diverge.
- Should rule 9's scaffold extension carry any verdict weight, or remain prose-only feedback? (Needs a
  calibration backtest before promotion.)
- Confirm the T1-5 EK renumber has landed before any future clause cites EK-0104+ by ID.
