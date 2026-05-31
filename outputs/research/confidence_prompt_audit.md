# Confidence-Prompt Audit — Do the live LLM prompts reward examiner *confidence* or merely *technical correctness*?

> **Project 9 · Prompt Auditor.** This audit scores the study app's three live LLM prompt families
> against the **§5 criteria spec** of `examiner_confidence_construction_model.md` (the capstone confidence
> model). It determines whether the prompts model the examiner's *trust account* (confidence ≠ correctness,
> the contamination law, the wrong-but-trusted / right-but-doubted off-diagonals) or whether they collapse
> toward ID-against-a-key correctness. **Audit only — no code was changed.** All findings cite exact prompt
> text by `file:line`.

---

## 1 · Scope and prompts found

The study app routes every candidate answer through one of three graders, plus one model-answer generator.
All grading/feedback prompts are assembled from shared constants in `study-app/src/lib/prompts/`.

| Prompt family | What it does | System-prompt builder | Shared constants injected | API route(s) (model) |
|---|---|---|---|---|
| **Grading — single answer** | Scores a candidate answer vs the model answer; emits PASS/BORDERLINE/FAIL + per-sub-question marks | `answer-evaluation-prompt.ts` `buildAnswerEvaluationSystemPrompt` (L8–66) | `MARKING_PRINCIPLES`, `FUNNELLING_PRINCIPLE`, lexicon critique, `GRADING_META_INSTRUCTION` | `app/api/evaluate-answer/route.ts` (L31, L50 — Sonnet) |
| **Grading + feedback — full debrief** | Two-part before/after-glass debrief; same verdict + marks; the primary grader users see | inline in route, `systemPrompt` (L43–122) | `MARKING_PRINCIPLES`, `FUNNELLING_PRINCIPLE`, lexicon critique, `GRADING_META_INSTRUCTION` | `app/api/evaluate-full/route.ts` (L43–151 — Opus) |
| **Feedback — pre-glass coaching** | Coaches the candidate's stem analysis only (no marks) | `pre-glass-prompt.ts` `buildPreGlassSystemPrompt` (L3–56) | none of the marking constants | `app/api/evaluate-reasoning/route.ts` (L29 — Opus) |
| **Model answer** | Generates the exemplar answer + annotation + reasoning trace | `model-answer-prompt.ts` `buildModelAnswerPrompt` (L48–115) | `MARKING_PRINCIPLES`, `FUNNELLING_PRINCIPLE`, mock-answer-writer agent, decision tree | `app/api/generate-model-answer/route.ts` |
| **(Hard-rule observability)** | Detect-only telemetry; logs but never enforces howler→FAIL / cascade→zero | `grading-telemetry.ts` `GRADING_META_INSTRUCTION` (L17–23) | — | appended to both graders |

The two **prose graders** (`evaluate-answer`, `evaluate-full`) carry the substantive confidence logic and
share `MARKING_PRINCIPLES` (`marking-principles.ts` L10–45) + `FUNNELLING_PRINCIPLE` (`funnelling.ts` L9–18).
The **model-answer** generator and the **pre-glass** coach are evaluated separately where the criteria apply.

> **Deterministic path (not a prompt, but the working reference).** `stem-scoring.ts` already encodes the
> plausibility gradient as data (`PLAUSIBLE_OK=4` above `VARIETY=3` above `MISS=0`, per-question `plausible`
> confusable map, `CURVEBALL_BONUS`). The prose graders do **not** receive that map — see Gap 1. (Cross-ref
> `plausibility_grading_gap_analysis.md`.)

### Criteria used (verbatim from `examiner_confidence_construction_model.md` §5)
1. Credit a **wrong-but-well-reasoned** answer (5–6/8 band) — §2.10 / wrong-but-trusted cell.
2. **Penalise a correct ID with absent reasoning** below a well-argued wrong call — §2.11 / Pinot Grigio parity.
3. **Contamination law** — a theory howler poisons the surrounding answer and, at the borderline, withholds benefit of the doubt (not just a local sub-mark) — §3.
4. Distinguish a **survivable wrong origin** from a **fatal structural misread** (cascade) — §3 asymmetry table.
5. Catch **internal contradiction** on the answer's own terms ("VDN at 20%"), independent of the wine — P2.
6. Apply the **stylistic-adjacency gradient** (P8); on a banker latitude shrinks to correct/near-correct — needs a per-wine adjacency map.
7. Reward the **terminated funnel**, penalise the un-terminated one ("make a choice") — P3/P5.
8. Reward **second-order / under-the-skin insight** as the pass→distinction lift; do **not** reward completeness-for-its-own-sake — S1/S3/S4.
9. Penalise **cut-and-paste / undifferentiated** answers across wines as a doubt signal — §2.3.
10. Anchor verdicts to the **minimum faculty** and the **aggregate-65%-with-floor** standard — not per-paper 65%, not the average — §1.2 / F-S1/F-S2.

---

## 2 · Scoring matrix

Columns: **AE** = single-answer grader (`answer-evaluation-prompt.ts`), **FD** = full-debrief grader
(`evaluate-full/route.ts`), **MA** = model-answer generator (`model-answer-prompt.ts`). Pre-glass coach (PG)
scored only on the two criteria that apply to it (notes below the table). MET / PARTIAL / MISSING.

| # | Criterion | AE | FD | MA |
|---|---|---|---|---|
| 1 | Credit wrong-but-well-reasoned (5–6/8) | **MET** | **MET** | **MET** |
| 2 | Penalise correct-ID / absent-reasoning below a well-argued wrong call | **PARTIAL** | **PARTIAL** | n/a |
| 3 | Contamination law (howler poisons whole answer; borderline→FAIL) | **PARTIAL** | **PARTIAL** | **PARTIAL** |
| 4 | Survivable wrong origin vs fatal structural misread (cascade) | **MET** | **MET** | **PARTIAL** |
| 5 | Internal contradiction on its own terms ("VDN at 20%") | **MET** | **MET** | **PARTIAL** |
| 6 | Stylistic-adjacency gradient + banker latitude shrink | **PARTIAL** | **PARTIAL** | **PARTIAL** |
| 7 | Reward terminated funnel; penalise un-terminated | **MET** | **MET** | **MET** |
| 8 | Reward second-order insight; do NOT reward completeness-for-its-own-sake | **PARTIAL** | **PARTIAL** | **PARTIAL** |
| 9 | Penalise cut-and-paste across wines | **MET** | **MET** | **MISSING** |
| 10 | Minimum-faculty + aggregate-65%-with-floor verdict standard | **MISSING** | **MISSING** | n/a |

**Pre-glass coach (PG):** Criterion 7 (top-of-funnel) **MET** — `pre-glass-prompt.ts` L33–34 rewards laying
out the plausible universe and flags premature single-wine fixation as proto-shoehorning. Criterion 1's
spirit (reasoning over label) **MET**. The other criteria are out of scope for a no-marks stem coach.

---

## 3 · Per-prompt findings (quoted evidence)

### 3.1 `MARKING_PRINCIPLES` (shared by both prose graders — `marking-principles.ts`)

**Criterion 1 — MET.** Cardinal Rule 1, L19: *"**Reasoning > identification.** Sound logic to a
wrong-but-plausible call earns marks; a bare right answer with no argument earns little."* Reinforced by L12
("a wrong-but-well-reasoned ID can pass") and `FUNNELLING_PRINCIPLE` L10 (the verbatim "5 or 6 marks out of 8"
2025 quote). This is the strongest part of the rubric and directly encodes the wrong-but-trusted cell.

**Criterion 2 — PARTIAL.** The principle is *stated* (L19, "a bare right answer with no argument earns
little") but never given the **parity test** that the model demands — that a bare correct label must score
*below* a well-argued wrong call. The rubric tells the grader the correct call is worth "little," not that it
should be *outscored by the wrong one*. The Pinot Grigio exemplar (§2.11, the cleanest confidence≠correctness
proof) is absent. Risk: the LLM still floors the correct label at some positive partial because "the ID is
right," inverting the intended ranking.

**Criterion 3 — PARTIAL.** The howler rule exists and is strong on the *borderline* tip: L36, *"if your
aggregate lands the candidate at BORDERLINE and the script contains a clear howler, resolve to FAIL and name
it."* But two weaknesses: (a) the **contamination/propagation** clause is soft — L36 says a howler "reduces
confidence in adjacent claims," whereas the model's best-attested finding (F-1, ≥10 reports) is that it
"undermines confidence in **everything** a candidate has written," *retroactively*, across questions; the
prompt localises it to "adjacent." (b) The borderline→FAIL rule is **detect-only** — `grading-telemetry.ts`
L51–67 only `console.warn`s a mismatch; nothing enforces it (header L9–12). So the rubric *names* the rule
but the system cannot guarantee the verdict honours it.

**Criterion 4 — MET.** Cardinal Rule 10, L33, is exactly the asymmetry table: it penalises the cascade
("writes quality/style/commercial answers describing what they GUESSED rather than what is in the glass") yet
explicitly protects a survivable wrong origin ("do not cascade-penalise a sound answer merely because the ID
is wrong: if the downstream answer describes the GLASS faithfully, score it on its own merits — candidates
'could have misidentified the varieties and still passed'"). This is a model-faithful implementation. The
structural-misread-as-seed-of-cascade idea (model §3 row 2) is implied via L33's structural self-consistency
but not named as "the wrong number detonates everything downstream."

**Criterion 5 — MET.** Cardinal Rule 10, L33: *"A contradiction — 'Champagne at 14% alcohol', 'a VDN at 20%'
… is a logical impossibility: award NO conclusion mark for that sub-question even if a figure is individually
plausible."* Judged on the answer's own terms, independent of the wine. Exactly P2.

**Criterion 6 — PARTIAL.** The gradient is *stated* — L14: *"Grade wrong IDs on a PLAUSIBILITY GRADIENT — an
adjacent/stylistically plausible wrong call earns real partial credit; an implausible one earns little … Not
binary."* — but the grader is **never given the per-wine adjacency map** to apply it (confirmed:
`evaluate-answer/route.ts` L33–48 and `evaluate-full/route.ts` L124–145 pass only question + answer +
modelAnswer; no `stem_answer_keys.plausible` set is injected, though `stem-scoring.ts` already computes it).
The **banker-vs-curveball latitude conditional** (latitude shrinks to correct/near-correct on a banker) is
**entirely absent** from the rubric. This is the single largest operationalisation gap and matches
`plausibility_grading_gap_analysis.md` (the "data vs vibes" finding).

**Criterion 7 — MET.** `FUNNELLING_PRINCIPLE` L9–18 fully encodes the terminated funnel (L14: "Lands a
DECISIVE final call … 'A wrong answer yields more marks than an answer that is unfinished, so whatever you do:
make a choice'") and both anti-patterns (snap-call, shoehorning, L16–18). Both grader prompts add an explicit
instruction to assess funnelling and name shoehorning/hedging (`answer-evaluation-prompt.ts` L25;
`evaluate-full/route.ts` L55).

**Criterion 8 — PARTIAL.** The under-the-skin lift is present — L41–42: *"Reserve the highest marks for
answers that get 'under the skin of the wine' … second-order insight (e.g. reasoning that an exceptional
producer exceeds a classification's minimum sugar requirement)."* But the **anti-volume** half (S4 —
"an overabundance of examples can sometimes mask a lack of fundamental understanding"; selectivity >
completeness) is **missing**. The evaluation approach in `answer-evaluation-prompt.ts` L33–36 even lists
"Specificity" and "What they missed" as scoring axes, which can *reward* completeness — the opposite of S4.
The model warns this exact failure: a thorough catalogue must not out-score a selective causal answer.

**Criterion 9 — MET.** Cardinal Rule 9, L32: *"No cut-and-paste across wines … near-identical wording, the
same technique applied to every wine … recycled commercial boilerplate 'creates considerable doubt in the
mind of the reader' (2024). Mark down failure to differentiate even when each statement is individually
defensible."* Faithfully encodes F-21. (Caveat: a single-question grader rarely *sees* multiple wines'
answers together, so enforcement depends on the debrief/multi-wine context actually being supplied.)

**Criterion 10 — MISSING (and actively WRONG).** L15: *"The pass mark is an **ABSOLUTE 65% per paper**, not a
curve … FAIL < 50, BORDERLINE ≈ 55–64, PASS ≥ 65."* This directly contradicts the model's standing correction
(F-S1, EK-0093): the real rule is an **aggregate 65% across the three papers with a per-paper floor (~50%)**,
*not* 65% per paper. L16 gestures at four dimensions ("A spike in one cannot rescue a hole in another") which
is the right *minimum-faculty* spirit (F-S2), but the headline number is the wrong standard. A single-paper
study tool can't compute a 3-paper aggregate, but the prompt should not assert the wrong rule as fact.

### 3.2 `answer-evaluation-prompt.ts` (single-answer grader wrapper)

Adds a strong funnelling-as-primary-driver instruction (L25) and a faithful-verdict/constructive-voice rule
(L60). Inherits all `MARKING_PRINCIPLES` strengths and gaps above. Note L34–36 frames scoring around
"Identification accuracy / Reasoning quality / Specificity / What they missed" — the four-axis list leads with
ID and includes completeness, slightly under-weighting the confidence framing relative to the rubric body.

### 3.3 `evaluate-full/route.ts` (full-debrief grader — the primary one)

Same constants, plus L46 ("Grade exactly as the IMW would … including a howler tipping a borderline to fail")
and L55 (funnelling assessment). Strongest prompt overall. Same Criterion 3/6/10 gaps. Its `GRADING_META`
howler/cascade flags are detect-only (route L200–201).

### 3.4 `model-answer-prompt.ts` (model-answer generator)

**Criterion 1 / 7 — MET.** L96 forces the exemplar to demonstrate the terminated funnel ("commit to the
leading variety + broad-region call early, but visibly weigh the 1–2 plausible alternatives and rule them out
… then narrow … and land it decisively. Do not simply assert one wine"). Good — the exemplar *teaches* the
behaviour the grader rewards.

**Criterion 8 — PARTIAL.** Inherits `MARKING_PRINCIPLES` L41–42 (under-the-skin) but the user instruction
(L95–96) emphasises covering "every sub-question" — leaning completeness. The exemplar does not model the
*selective* second-order move as explicitly as it models the funnel.

**Criterion 9 — MISSING.** When generating a multi-wine package, nothing instructs the exemplar to
*differentiate* wines / avoid the same technique on every wine — so the model answer can model the very
cut-and-paste the grader is told to penalise.

**Criteria 3/5/6 — PARTIAL.** Because the exemplar weaves in plausible alternatives (L96), it *leaks* a
partial adjacency set into the grader (the only adjacency signal the prose grader gets — see Gap 1). It does
not explicitly model howler-avoidance or internal-consistency checks.

### 3.5 `pre-glass-prompt.ts` (stem coach) — confidence-aligned for its scope

L33–34 is well-aligned: it rewards opening the plausible universe and *gently flags premature single-wine
fixation as the seed of later shoehorning* — i.e. it coaches the top of the funnel and the doubt-signal early.
No marks issued, so Criteria 2/3/10 don't apply.

---

## 4 · Prioritised gap list (concrete suggested edits — recommendations only)

### GAP 1 — [HIGHEST LEVERAGE] Inject the per-wine plausibility-adjacency map into the prose graders (Crit 6)
**Prompt:** `marking-principles.ts` L14 + both grader routes. **What's missing:** the gradient is *stated* but
the grader is never handed the `stem_answer_keys.plausible` confusable map (which `stem-scoring.ts` already
computes), nor the banker-vs-curveball latitude conditional. The LLM judges plausibility "by vibes."
**Suggested edits:**
- In `evaluate-answer/route.ts` / `evaluate-full/route.ts`, when an answer key exists, add to the user
  message: `## Plausible neighbourhood for this wine (grade adjacency against THIS, not your own world model)\nGround truth: {ground_truth}. Stylistically adjacent (credit a wrong call landing here): {plausible[]}. Difficulty: {BANKER|CURVEBALL}.`
- Append to `MARKING_PRINCIPLES` L14: *"Latitude scales with difficulty: on a CURVEBALL, a wrong-but-adjacent
  call (in the supplied plausible set) earns near-full ID-argument marks; on a BANKER, latitude shrinks to
  correct/near-correct and a distant wrong call earns little even if well argued."*
This is the single fix the confidence model (§7) and `plausibility_grading_gap_analysis.md` both name as
highest-value.

### GAP 2 — Wrong pass standard asserted as fact (Crit 10)
**Prompt:** `marking-principles.ts` L15. **What's missing/wrong:** "ABSOLUTE 65% per paper" contradicts the
corrected standard (aggregate 65% across 3 papers + ~50% per-paper floor; EK-0093 / F-S1).
**Suggested edit (replace L15):** *"The pass standard is an **aggregate ~65% across the three papers with a
~50% per-paper floor** (criterion-referenced, not a curve) — **not** 65% per paper. For this single-paper
estimate, treat ≥65% as clear-pass-standard work, ~50–64% as borderline (a paper that would need other papers
to carry it), <50% as below the floor. Anchor the verdict to the **minimum faculty**, not the average — a
spike cannot rescue a hole."*

### GAP 3 — Strengthen the contamination law from "adjacent" to "whole script" + retroactive (Crit 3)
**Prompt:** `marking-principles.ts` L36. **What's missing:** the howler currently "reduces confidence in
adjacent claims"; the model's #1 finding (≥10 reports) is it contaminates **everything**, retroactively.
**Suggested edit (extend L36):** *"A howler does not just cap its own sub-question — it **undermines
confidence in everything the candidate has written** (2023/2024), including answers you had already credited:
re-read the whole script more sceptically after finding one, and say so in the feedback. Trust propagates
across sub-questions."*

### GAP 4 — Add the correct-ID/absent-reasoning parity test (Crit 2)
**Prompt:** `marking-principles.ts` L19 (Cardinal Rule 1). **What's missing:** the explicit ranking that a
bare correct label scores *below* a well-argued wrong call.
**Suggested edit (add to Rule 1):** *"Parity test: a correct identification stated with **no visible
derivation** must score **below** a wrong-but-plausible call that shows sound structure and a terminated
funnel — an un-argued right answer is, to the examiner, almost indistinguishable from a lucky guess (2024 P1
Pinot Grigio: the same correct ID earned good marks *with* argument and lost many marks *without*)."*

### GAP 5 — Add the anti-volume / selectivity rule (Crit 8)
**Prompt:** `marking-principles.ts` L41–42 ("Top-band differentiator") and the L33–36 scoring axes in
`answer-evaluation-prompt.ts`. **What's missing:** S4 — completeness must not out-score a selective causal
answer.
**Suggested edit (add to L41–42):** *"Reward **selectivity over completeness**: 'an overabundance of examples
can sometimes mask a lack of fundamental understanding' (2018). A focused, causal, second-order answer
out-scores an exhaustive catalogue. Do not award marks for breadth of name-dropping; award them for the depth
of the link to the glass."* And re-order `answer-evaluation-prompt.ts` L33–36 so reasoning/funnelling leads
and "specificity" is framed as *causal* specificity, not coverage.

### GAP 6 — Stop the model answer from modelling cut-and-paste (Crit 9, MA)
**Prompt:** `model-answer-prompt.ts` L95–96. **What's missing:** a differentiation instruction.
**Suggested edit (add to §1 Model Answer):** *"Differentiate the wines: do not apply the same winemaking
technique or commercial framing to every wine, and vary the argument structure — the grader penalises
cut-and-paste, so the exemplar must not model it."*

### GAP 7 — (Optional, structural) Move the howler→FAIL and cascade→zero rules from detect-only to enforced
**Prompt/code:** `grading-telemetry.ts` L51–67 (currently `console.warn` only). The rubric *names* the hard
rules but nothing guarantees the streamed verdict applies them. The model (F-20) flags this as a strong
tendency, publicly unverified — so a gated two-pass (decide verdict, then write prose) is the right design,
already noted as a separate project. Listed for completeness; not a prompt-text edit.

---

## 5 · Verdict

**The prompts reward a deliberate mix that leans toward examiner *confidence*, but with three load-bearing
holes that let *correctness* leak back in.** The confidence model's core off-diagonals are genuinely encoded:
the wrong-but-trusted cell is well-served (Cardinal Rule 1 + the funnelling constant + the verbatim "5–6/8"
quote), the funnel is the single best-implemented behaviour, internal-contradiction and the survivable-miss /
cascade asymmetry are faithfully rendered, and even the pre-glass coach is confidence-aligned. What is *stated
but not operationalised* (the plausibility gradient — judged by vibes because the per-wine adjacency map is
never injected), *softer than the evidence* (the contamination law localised to "adjacent" rather than the
whole script; the howler→FAIL rule detect-only), *missing* (the correct-ID-parity ranking, the anti-volume
selectivity rule), and *outright wrong* (the "65% per paper" pass standard) are exactly the places a grader
reverts to scoring the label against a key. **The single highest-leverage fix is GAP 1:** inject the existing
`stem_answer_keys.plausible` adjacency map + a banker/curveball difficulty flag into the two prose graders and
add the latitude conditional to `MARKING_PRINCIPLES` L14 — this converts plausibility from the LLM's
unguided guess into the data-driven gradient the system already computes, and is the one change that most
directly moves the graders from modelling correctness to modelling confidence.

---

*Output: `outputs/research/confidence_prompt_audit.md`. Inputs read in full:
`examiner_confidence_construction_model.md` (§5 criteria), `study-app/src/lib/prompts/{marking-principles,
funnelling,answer-evaluation-prompt,model-answer-prompt,pre-glass-prompt,tasting-prompt}.ts`,
`study-app/src/lib/grading-telemetry.ts`, `study-app/src/app/api/{evaluate-answer,evaluate-full,
evaluate-reasoning}/route.ts`; cross-referenced `outputs/research/plausibility_grading_gap_analysis.md`.
Audit only — no code changed.*
