# Pass Standard Impact Analysis — Project 8, Agent 2

> **Scope.** Every location in the MW study system where a pass standard, grade boundary, or verdict
> threshold appears, audited against `outputs/research/evidence_audit.md` (the authoritative bucket
> assignment). Each finding is tagged with evidence strength + bucket and routed to the right fix type
> (prompt/code change vs EK change vs UI copy). **No code, prompt, or EK was modified — this is a proposal.**
>
> **Author:** Pass Standard Auditor (Agent 2). **Date:** 2026-05-31.

---

## 0 · The governing evidence (verbatim, from evidence_audit Audit A + T1-1)

**CORRECT model (VERY STRONG / SUPPORTED — public IMW Student Guide, overrides corpus):**
- Pass = **average 65% or more across the three practical papers, with a ~50% per-paper floor.**
- **Criterion-referenced, not a curve** (this part the corpus already had right).
- **C+ = 60–64% is CONFIRMED** (Student Guide + 2024 Practical, Marks MW). **A ≥70 / B 65–69 cut-points are
  sourced ONLY to the unreadable 2021 appendix → MODERATE / PLAUSIBLE — must be hedged, NOT asserted as fact.**
- **"sub-45% does not recover" is MIS-STATED**: the real 2018 source is an *average across the practical
  papers*, softened by the SPR mechanism — not a per-paper rule.

**CRUCIAL NUANCE (do not get this wrong):** the app grades **single questions**, not whole papers. Therefore
the per-question verdict thresholds are a **single-question PROXY** for the band — the correct fix is
**framing/messaging**, NOT a scoring-logic rewrite. There is no numeric threshold constant in code to "fix":
verified — `db.ts` and `grading-telemetry.ts` only persist/echo the LLM's emitted verdict *label*; the verdict
is produced entirely inside the grader prompt. So every fix below is one of: **(a) correct a false factual
statement, (b) relabel a per-question threshold as a proxy, (c) UI copy** — none is a logic rewrite.

---

## 1 · Surface-by-surface findings

Of the eight system surfaces, the pass standard touches exactly **three**: **Grading (5)**, **EK injection (7)**,
and (tangentially) **UI messaging (8)**. It does **not** appear in question generation, wine generation, model-
answer generation, feedback generation, or examiner simulation as a *standard/threshold* statement — those
surfaces were grepped and are clean of pass-mark language (the "65%" hits in question-generation/heuristics are
OW:NW ratios and ID-distribution averages, a different concept; the "FAIL" hits in question-generation-prompt
are validator-violation language, not verdicts). The wrong constant is shipped from **one** code site.

### FINDING PS-1 — `marking-principles.ts` L15: the false "65% per paper" constant *(THE headline)*
**Surfaces:** Grading (both graders). **Evidence:** VERY STRONG / **SUPPORTED** (evidence_audit Audit A row 3:
"No primary support anywhere. An internal invention. INCORRECT — must be replaced").

- **File:line:** `study-app/src/lib/prompts/marking-principles.ts:15`. Injected into **both** graders:
  `answer-evaluation-prompt.ts:21` (Sonnet, per-answer) and `evaluate-full/route.ts` (Opus, full debrief).
- **Current behavior (verbatim):**
  > `- **The pass mark is an ABSOLUTE 65% per paper, not a curve.** Anchor the verdict to marks, not vibes:`
  > `FAIL < 50, BORDERLINE ≈ 55–64, PASS ≥ 65 (D 50–54, C 55–59, B 65–69). A script averaging under ~45% does not recover.`
- **Conflict:** The real rule is a 65% **average across three papers + ~50% floor**, NOT "per paper." The
  "averaging under ~45% does not recover" clause is mis-stated as if per-paper (evidence_audit Audit A row 5:
  "average across practical papers, not a per-paper floor; SPR mechanism softens it"). The A/B/C/D band cut-
  points are stated as fact but A≥70/B 65–69 are only MODERATE/PLAUSIBLE (unreadable 2021 appendix).
- **Fix type:** (a) correct a false statement **+** (b) relabel the per-question line as a proxy. **Replace L15
  with** (preserving the legitimate "anchor to marks, not vibes / criterion-referenced" intent, fixing the
  falsehood, and naming the proxy):

  > `- **The IMW pass standard is criterion-referenced (an absolute bar, not a curve): a candidate must`
  > `average 65% or more across the three practical papers, with a ~50% minimum floor in any single paper`
  > `(public IMW Student Guide). It is NOT 65% on every paper — a strong paper can carry a weaker one above`
  > `the average provided the weak paper clears the floor. Because THIS TOOL grades a single question, treat`
  > `the per-question verdict as a PROXY for where this answer would sit in the band, not a paper-level pass`
  > `test: anchor to marks — FAIL < 50, BORDERLINE ≈ 55–64, PASS ≥ 65 (D 50–54, C 55–59, C+ 60–64, B 65–69`
  > `and A ≥70 are the reported bands; only C+ = 60–64 is publicly confirmed, treat the A/B edges as`
  > `indicative). A candidate whose answers persistently average well below ~45% would not, on aggregate,`
  > `recover.**`

  - Note: keep C+ = 60–64 (SUPPORTED); the A≥70/B 65–69 wording is softened to "reported/indicative" (PLAUSIBLE
    hedge per evidence_audit, do NOT assert as verified). The recovery clause is fixed to "persistently average"
    (aggregate), removing the per-paper implication.

### FINDING PS-2 — `marking-principles.ts` L16: "FOUR dimensions" mastery model *(false framework count)*
**Surfaces:** Grading (both graders). **Evidence:** MODERATE / **SUPPORTED-correction** (evidence_audit T1-1
Proposed EK Impact: "Re-label the 'four-dimension mastery' model as an internal reconstruction (the IMW's own
framework names *three* abilities — confidence model §7 row 2)"; examiner_confidence_model.md §7 row 2: PARTIAL/
reconstruction, the IMW framework is **three abilities** assess→judge/conclude→communicate).

- **File:line:** `study-app/src/lib/prompts/marking-principles.ts:16`.
- **Current behavior (verbatim):**
  > `- **A pass needs mastery across FOUR dimensions** — structural/tasting accuracy, communication, theory`
  > `accuracy, and quality judgement (2024). A spike in one cannot rescue a hole in another.`
- **Conflict:** The IMW's own stated framework is **three abilities** (assess the wine → judge/conclude →
  communicate), not four co-equal dimensions. The "four-dimension" model is a corpus reconstruction asserted as
  if it were IMW doctrine, attributed to "(2024)."
- **Fix type:** (a) correct/relabel a statement asserted as doctrine. The load-bearing, correct part is the
  **minimum-not-average** logic ("a spike in one cannot rescue a hole" — confidence model §7/EK-NEW-A: SUPPORTED).
  **Replace L16 with:**

  > `- **A pass requires competence across the IMW's three assessed abilities — accurately reading/assessing`
  > `the wine, reaching a sound judgement/conclusion, and communicating it (IMW Student Guide). (Internally we`
  > `also track theory accuracy as a fourth lens.) Crucially this is a MINIMUM across faculties, not an`
  > `average: a spike in one cannot rescue a hole in another.**`

  - Keeps the (SUPPORTED) min-not-mean logic; demotes "four dimensions" to an internal lens; restores the
    publicly-sourced "three abilities."

### FINDING PS-3 — EK-0093 carries the identical two errors *(EK injection)*
**Surfaces:** EK injection (7). **Evidence:** VERY STRONG / **SUPPORTED** (Audit A; corrected draft already
exists). **A corrected supersede entry is ALREADY DRAFTED** in `examiner_confidence_model.md` §8 (the
`✱ EK-0093 — CORRECTION` block) and flagged in memory `ek-0093-pass-standard-correction`.

- **File:line:** `mw_exam_empirical_knowledge.md:359-367` (EK-0093).
- **Current behavior (verbatim, L362-364):** "Pass is an **absolute 65%** per paper, not a curve … sub-45% does
  not recover. A pass needs mastery across **four dimensions** …"
- **Conflict:** Same two falsehoods as PS-1/PS-2 — and EK-0093 is the cited authority backing the prompt
  constant, so it must be corrected in lockstep or the prompt fix will be contradicted by injected EK.
- **Fix type:** **EK change.** Merge the already-drafted `examiner_confidence_model.md` §8 supersede verbatim:
  "average of 65% across the three papers, with a per-paper minimum floor (50% … some accounts cite 55%) …
  criterion-referenced (absolute), not a curve … not '65% per paper' … four-dimension model and howler-override
  remain as grading temperament." **Prerequisite ordering (evidence_audit Top-10 immediate #1, T1-5):** the
  EK-0104+ numbering collision should be reconciled first; but EK-0093 is a *low number, no collision*, so it can
  be superseded independently and immediately.

### FINDING PS-4 — `mw_exam_guide.md` L233-234: stale "65% per paper" echo *(internally self-contradicting)*
**Surfaces:** Documentation (feeds agents/answers as a reference, NOT injected at runtime — verified: sync only
ingests `mw_exam_empirical_knowledge.md`). **Evidence:** VERY STRONG / **SUPPORTED**.

- **File:line:** `mw_exam_guide.md:233-234`: "absolute **65% pass** per paper (not a curve); FAIL < 50,
  BORDERLINE ~55–64. A pass needs **mastery across four dimensions** …"
- **Conflict:** This **contradicts the same document's own corrected §200-210** (L200-202: "an average of 65%
  across the three practical papers, with a per-paper minimum floor"). The guide is internally inconsistent.
- **Fix type:** (a) correct a false statement — align L233-234 to L200-210 (average + floor; three abilities).
  Lower priority than PS-1/PS-3 because it is reference documentation, not a runtime-injected surface.

### FINDING PS-5 — `methodology/page.tsx`: PASS/BORDERLINE/FAIL used WITHOUT a false pass-standard claim *(no fix)*
**Surfaces:** UI messaging (8). **Evidence:** n/a (clean).

- **File:lines:** `methodology/page.tsx:198-203` (PLAUSIBLE/CURVEBALL confidence tiers), `:368` ("PASS (target:
  70%)" — a *backtest accuracy* target), `:505` ("Pass / borderline / fail assessment" — describing the grader's
  output). **None states the exam pass standard as 65%/paper.** The public methodology page does **not** expose
  the wrong constant.
- **Recommendation:** **No fix required.** Optionally (UI copy, low value) the §505 description could add one
  clause clarifying the per-question verdict is a proxy for the paper-average band — but this is not a correctness
  defect and can wait.

### FINDING PS-6 — `grading-telemetry.ts` / `db.ts` / `evaluate-*` routes: verdict label only, no threshold *(no fix)*
**Surfaces:** Grading (5). **Evidence:** n/a (clean — confirms the framing-not-logic conclusion).

- `grading-telemetry.ts:17-23` defines the `GRADING_META` tag carrying `verdict:"PASS|BORDERLINE|FAIL"` — a
  *label* the grader emits; the detect-only override (L58-59) only fires on **howler + BORDERLINE → FAIL**, which
  is independent of the pass-standard numbers. `db.ts:36/698-700` store/aggregate the `pass_estimate` label.
- **Confirmation:** there is **no `>= 65` / `< 50` numeric constant in code.** The pass standard lives ONLY in
  prose inside the grader prompt (PS-1/PS-2). This is why the fix is framing, not logic.

---

## 2 · Mandatory questions (scoped to the pass-standard domain)

**1. What currently contradicts the strongest evidence?**
`marking-principles.ts:15` ("ABSOLUTE 65% per paper") and `:16` ("FOUR dimensions"), plus the identical EK-0093
text (L362-364) and the stale `mw_exam_guide.md:233-234`. All four contradict the VERY STRONG, public IMW
Student Guide (65% **average** + ~50% floor; **three** abilities). The "sub-45% does not recover" clause is
mis-stated as per-paper.

**2. What creates examiner-unrealistic behavior?**
The "65% per paper" framing makes the grader treat each single question as if it must independently clear 65 to
"pass" — examiner-unrealistic because the real bar is an aggregate with a floor, and a weak paper is survivable.
It risks the grader being too binary/harsh on a single mid-range answer.

**3. What teaches candidates the wrong lesson?**
It teaches that every paper (and, by proxy, every answer) must independently hit 65% — discouraging the correct
strategy (bank strong papers to carry a weaker one above the average, while never letting any paper breach the
~50% floor). The "four dimensions" line teaches a framework the IMW does not use and obscures the real
min-across-three-abilities logic.

**4. What produces the largest simulation error?**
PS-1 (the per-paper constant) — it is the single most-injected falsehood (both graders, every evaluation) and
mis-frames the entire verdict model. Largest blast radius of any pass-standard issue.

**5. Which fixes should be implemented immediately?**
PS-1 and PS-2 (`marking-principles.ts` L15-16 — both graders) and PS-3 (supersede EK-0093 from the
already-drafted §8 block). These are safe correctness fixes (evidence_audit: "it corrects a false statement; it
cannot make grading worse," Implementation Risk LOW; ranked #2 immediate).

**6. Which fixes should wait?**
PS-4 (`mw_exam_guide.md` echo — reference doc, not injected; fix in the same pass but lower urgency). PS-5
optional UI clarification (no correctness defect). The **A≥70 / B 65–69 band cut-points must NOT be asserted as
verified** until a readable public IMW source is found — hedge them now, validate later.

**7. Which findings require additional validation?**
The A≥70 / B 65–69 grade-band cut-points (MODERATE/PLAUSIBLE — unreadable 2021 appendix; only C+ = 60–64 is
SUPPORTED). The 50% vs 55% floor figure (Student Guide says 50%; some candidate accounts say 55% — adopt 50% with
the "~" hedge). Neither blocks the headline fix.

---

## 3 · Implementation summary (ordered, with fix type + bucket)

| # | File:line | Change | Type | Strength / Bucket | Priority |
|---|---|---|---|---|---|
| PS-3 | `mw_exam_empirical_knowledge.md:359-367` | Supersede EK-0093 with the drafted §8 block (avg+floor; 3 abilities; fix recovery clause) | EK change | VERY STRONG / SUPPORTED | IMMEDIATE (EK first) |
| PS-1 | `study-app/src/lib/prompts/marking-principles.ts:15` | Replace "ABSOLUTE 65% per paper" with avg-65 + ~50% floor + per-question-PROXY framing; hedge A/B bands; fix recovery clause to "aggregate" | prompt change (a)+(b) | VERY STRONG / SUPPORTED | IMMEDIATE |
| PS-2 | `study-app/src/lib/prompts/marking-principles.ts:16` | Replace "FOUR dimensions" with IMW three abilities + keep min-not-mean | prompt change (a) | MODERATE / SUPPORTED-correction | IMMEDIATE |
| PS-4 | `mw_exam_guide.md:233-234` | Align stale echo to the doc's own corrected §200-210 | doc change (a) | VERY STRONG / SUPPORTED | WAIT (same pass) |
| PS-5 | `methodology/page.tsx:505` | (Optional) add "per-question verdict is a proxy for the paper-average band" clause | UI copy (c) | n/a | WAIT (optional) |
| — | `grading-telemetry.ts`, `db.ts`, `evaluate-*` routes | NO CHANGE — no numeric threshold in code; verdict is prompt-driven | — | clean | none |

**Net:** the wrong pass standard ships from a single code site (`marking-principles.ts` L15-16) plus its EK
mirror (EK-0093). Fix those three lines/entries and the system is corrected — no scoring-logic change, no UI
rewrite. Hedge the A/B band cut-points; do not promote them to fact.
