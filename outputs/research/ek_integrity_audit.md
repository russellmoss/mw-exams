# EK Integrity Audit — Project 8, Agent 1

> **Mandate.** Audit every entry in `mw_exam_empirical_knowledge.md` for integrity problems
> (collisions, supersession, contradiction, duplication, unsupported superlatives, stale citations,
> scope-mislabels) and produce an apply-ready fix spec. **Governing authority:** every recommendation
> below is tagged to the bucket/strength assigned by `outputs/research/evidence_audit.md` and never
> promotes a PLAUSIBLE/UNPROVEN finding to fact.
>
> **Author:** EK Integrity Auditor (Agent 1), 2026-05-31. **Proposal only — no code/prompt/EK modified.**

---

## 0 · Bottom line

The single highest-priority defect is **F-01: the live EK-0104…EK-0108 ID collision** — four research
passes drafted *different* content under the same IDs, the evolution pass's numbering is already baked
into the live doc, and the roadmap/prediction docs already cite the **wrong** live entries
(EK-0108 cited for "reasoning conditional" but live EK-0108 = orange wine; EK-0107 cited for "banker
latitude" but live EK-0107 = scope label; EK-0105 cited for "synthesis" but live EK-0105 = climate).
Because EK is **injected** into the feedback-analysis agent live from the `empirical_knowledge` table
(`study-app/src/lib/db.ts:582-597`, sections 5/6/7 + paper-matched 1/4), **no EK-citing prompt edit
should ship until F-01 is resolved.** This is the prerequisite finding.

The remaining defects are: a factually wrong pass-standard constant (EK-0093 / `marking-principles.ts:15`),
an internal-reconstruction "FOUR dimensions" model asserted as fact (EK-0093 / `marking-principles.ts:16`),
an unconditional "reasoning > ID" claim that the evidence makes conditional (EK-0007), a one-sided
"usual decider" claim (EK-0005), false-precision and trend-as-fact in mark-distribution (EK-0006), three
baked-in superlatives (EK-0091 "most-penalized", EK-0105 "strongest forward signal", and the *future-pass*
"fastest-rising"), and a scope-label gap on EK-0096…0102 (live EK-0107 already exists and largely covers it,
but is incomplete).

Good news from the trace: the howler/cascade rules and the "65% / four-dimension" constants are **only
STATED in prompt text, never operationalized in verdict-computing code** (`grading-telemetry.ts` is
detect-only `console.warn`; there is no numeric 65%-threshold logic anywhere). So the pass-standard fix is
a **framing/messaging correction**, not a scoring-logic change — exactly as evidence_audit T1-1 says. That
bounds the blast radius and lowers risk on several fixes.

---

## 1 · F-01 (PREREQUISITE) — the EK-0104+ collision: apply-ready renumbering spec

**Problem type:** COLLISION (same ID, different content) + STALE CITATIONS.
**evidence_audit bucket:** SUPPORTED. **Strength:** VERY STRONG (T1-5, "Top 10 SURVIVED" #5; 98% conf).
**Surfaces:** 7 EK injection (primary), 4 Feedback generation, 5 Grading, 1/2/3 Generation (all read EK).

### 1.1 The four-pass collision matrix (verified by direct inspection)

| ID | **LIVE** (`mw_exam_empirical_knowledge.md`, committed) | evolution_analysis.md | examiner_objectives.md (L577+) | distinction_candidate_analysis.md (L457+) | future_exam_prediction.md |
|---|---|---|---|---|---|
| **EK-0104** | ID-suppression→ID-free arc (L1020) | EK-0104 = same (L414) | EK-0104 = "wine is vehicle / competency is target" (L577) | EK-0104 = "distinction = consistency" (L457) | FP-4 consolidates obj-EK-0104 (L520) |
| **EK-0105** | Climate is explicit driver (L1034) | EK-0105 = same (L425) | EK-0105 = "integrated multi-factor analysis, rising" (L590) | EK-0105 = "reconcile conflicting evidence move" (L473) | FP-1/FP-2 consolidate (L488/501) |
| **EK-0106** | Quality region→world + commercial dual-pole (L1046) | EK-0106 = same (L434) | EK-0106 = "quality can be GLOBAL" (L602) | EK-0106 = "ID weighting volatile ~40%" (L484) | — |
| **EK-0107** | Scope label / last-10 (L1060) | EK-0107 = same (L446) | EK-0107 = "no weakest paper; **P2** is decider" (L611) | EK-0107 = "latitude wine-dependent; bankers none" (L497) | FP-4 cites obj-EK-0107 (L468) |
| **EK-0108** | Orange peaked 2014–2019 (L1073) | EK-0108 = same (L457) | EK-0108 = "reasoning>ID conditional on plausibility" (L621) | EK-0108 = "independent thinking beats rote" (L506) | §Low cites evo-EK-0108 (L189) |
| **EK-0109** | *(none live)* | — | EK-0109 = "one-fact origin calls penalized" (L632) | EK-0109 = "quality full-scale/within-class/origin-blind" (L520) | — |
| **EK-0110** | *(none live)* | — | EK-0110 = "vintage presumes vintage-legible origin" (L642) | EK-0110 = "vintage breadth beyond Bordeaux" (L532) | — |
| **EK-0111** | *(none live)* | — | EK-0111 = "commercial lowest-weighted ~9%" (L651) | — | — |

**Resolution principle:** the live evolution-pass values for EK-0104…EK-0108 are committed and correct;
**keep them as-is.** Renumber every *un-merged* draft from the other three passes into the next free block,
**EK-0109 onward**, applying the evidence_audit bucket gate (SUPPORTED merge as fact; PLAUSIBLE merge hedged;
UNPROVEN do not merge → route to §9).

### 1.2 Canonical de-duplicated EK-0109+ block (apply-ready; user pastes after live EK-0108)

> Each entry below cites its evidence_audit verdict. **Bold** = the merge/flip/drop decision.

```markdown
### EK-0109 · The wine is a vehicle; the competency is the target (P3 production-canon is the exception)
- **tier:** STRONG SIGNAL · **status:** live · extends EK-0006, EK-0016
- **evidence:** outputs/research/examiner_objectives.md §0/§3 (cluster-level substitutability across 153 Qs);
  2025 P3 "how Madeira/Sherry is made" non-negotiable; evidence_audit "wine-is-vehicle/competency-is-target,
  except the P3 production canon" (SUPPORTED)
- **claim:** ~85% of objectives are wine-agnostic — the same competency can be tested with any wine — so
  reasoning targets competencies, not specific wines. The one exception is the P3 production-method canon
  (Madeira/Sherry/Port/Champagne method), where the production fact IS the answer. (MERGE — objectives-EK-0104.)

### EK-0110 · Integrated multi-factor synthesis is a recurring novel-question family
- **tier:** PLAUSIBLE · **status:** live · extends EK-0004
- **evidence:** 2022 P2Q1 (why-blend), 2024 P2Q3c (climate→style→quality, "worst answered, format not seen
  before"), 2025 P1Q4 (human-vs-nature, ~15% of paper); 2024 Chief (anti-rote). evidence_audit Audit C +
  T1-3: SUPPORTED that the family RECURS; UNPROVEN as "fastest-rising objective."
- **claim:** A novel integrative-synthesis question — apportion character among climate/winemaking/terroir,
  or reason why a wine is/isn't blended — has appeared ~once a year recently and is the examiners' explicit
  anti-rote device. Generators should support the archetype as ONE option among many (never a replacement
  for the ~40% ID core); model answers must integrate factors causally, not list them. **Prepare the method,
  not a script.** NOT described as a dominant or fastest-rising objective (n=3, differently framed, and the
  2024 instance double-counts with EK-0105 climate). **Falsification:** two consecutive absent years.
  (MERGE objectives-EK-0105 + distinction-EK-0105 reconcile-move; DROP the "fastest-rising" superlative.)

### EK-0111 · Quality can be judged on a GLOBAL scale (2025 frame) — single data point
- **tier:** PLAUSIBLE · **status:** live · extends EK-0008, EK-0106
- **evidence:** 2025 P2Q3 "quality … in the context of wine globally"; evidence_audit T2-1/Audit F: "wine
  globally" is n=1 (PLAUSIBLE, single-point).
- **claim:** A 2025 stem widened the quality frame from within-region/classification to a global scale. Treat
  as an emerging frame to recognise, NOT a confirmed standing target — it rests on one question. Re-confirm
  before generating around it. (MERGE objectives-EK-0106; HEDGE — single-point, do not assert as a target.)

### EK-0112 · No consistently weakest paper; "decider" operates at two levels (corrects EK-0005)
- **tier:** STRONG SIGNAL · **status:** live · supersedes the "usual decider" clause of EK-0005
- **evidence:** hard pass counts 2017/2022/2023/2024/2025 (P3 often the STRONGEST); examiner_objectives "P2
  lowest-scoring recently"; examiner_confidence_model §7 "P3 arithmetic average-dragger." evidence_audit
  Audit F/H8 + Coda: SUPPORTED; the P2-vs-P3 tension reconciles via lowest-scoring ≠ average-dragging.
- **claim:** There is no permanently weakest paper. "Decider" splits into two distinct senses that do not
  conflict: (a) the **lowest-scoring** paper recently tends to be **P2** (objectives); (b) the **arithmetic
  average-dragger** under the 65%-average rule is whichever paper a candidate is weakest on, historically
  often **P3** (confidence model). Encode the distinction; do NOT pick a side and do NOT assert "P3 is the
  usual decider." (MERGE objectives-EK-0107 + the confidence-model P3 view; resolves the §0 Coda tension.)

### EK-0113 · "Reasoning > ID" is CONDITIONAL on a plausible conclusion + correct structural read (qualifies EK-0007)
- **tier:** STRONG SIGNAL · **status:** live · qualifies EK-0007
- **evidence:** 2025 P1 (Mitchell) verbatim "5 or 6 marks out of 8 if their reasoning was sound AND their
  conclusion plausible"; 2025 Rhône "we do expect to see plausible options." evidence_audit T1-2a/Audit B:
  VERY STRONG, "the conditional form is better-evidenced than the live unconditional EK-0007."
- **claim:** Sound reasoning rescues a wrong call ONLY when the conclusion is plausible and the structural
  read (alcohol/acidity/tannin/RS) is correct. Implausible conclusions and structural misreads do not earn
  the rescue. (MERGE objectives-EK-0108; this is the SUPPORTED conditional — pairs with the EK-0007 edit in §3.)

### EK-0114 · Independent critical thinking beats rote; no cut-and-paste (the study-system caution)
- **tier:** STRONG SIGNAL · **status:** live · extends EK-0015 (cut-and-paste), EK-0004
- **evidence:** 2017/2023/2024 Practical (verbatim cut-and-paste penalties); 2024 Chief (Tully) "over-reliance
  on the study programme is eroding students' ability to think for themselves … will not pass." evidence_audit
  T1-4/Audit E: "repeatedly rewarded — STRONG."
- **claim:** Examiners reward independent reasoning and penalise template/cut-and-paste answers; a study app
  that ships recited templates trains the exact named failure. Model-answer generation must reason freshly
  per glass and not reuse phrasing across a flight. (MERGE distinction-EK-0108.)

### EK-0115 · Quality is judged full-scale, within-classification, origin-blind — volunteer the official tier
- **tier:** STRONG SIGNAL · **status:** live · extends EK-0008, EK-0092
- **evidence:** 2018/2023/2024/2025 (verbatim "official quality level if there is one and it is relevant").
  evidence_audit T2-7/Audit E: "repeatedly rewarded — STRONG."
- **claim:** Judge quality across the full scale, within the wine's own classification, without origin bias
  (neither up- nor down-rating for provenance), and volunteer the official/legal tier where one exists even
  when not explicitly asked. (MERGE distinction-EK-0109.)

### EK-0116 · One-fact origin calls and bare macro-region drops are penalised
- **tier:** STRONG SIGNAL · **status:** live · extends EK-0008
- **evidence:** 2024 verbatim — "Northern Rhône" with no sub-region "will often yield a zero mark"; "just
  Mosel." evidence_audit T2-6/"Top 10 SURVIVED" #9: SUPPORTED.
- **claim:** An origin call must funnel to a concrete sub-region and rest on ≥2 evidence strands; stopping at
  a country or a bare macro-region ("Northern Rhône", "Mosel" with no further narrowing) is penalised, often
  to zero. (MERGE objectives-EK-0109.)

### EK-0117 · Maturity = quantified window + both trajectories (refines EK-0011)
- **tier:** STRONG SIGNAL · **status:** live · refines EK-0011
- **evidence:** 2023 maturity definition; evidence_audit SUPPORTED ("maturity = quantified + both
  trajectories; the 3-vs-4-element count is secondary").
- **claim:** A maturity answer needs a quantified drinking window with BOTH trajectories (how long it
  improves AND how long it holds before decline). The exact 3-vs-4-element checklist is secondary to having
  concrete timeframes and both directions. (MERGE distinction-EK-0110 + objectives-EK-0110 vintage-legible
  note as a hedged sub-claim — see §6.)

### EK-0118 · Commercial is dual-pole (opportunities AND challenges); likely lowest-weighted (~9%, single-point)
- **tier:** PLAUSIBLE · **status:** live · extends EK-0012, EK-0106
- **evidence:** 2024 "opportunities and challenges" verbatim (SUPPORTED, dual-pole); ~9% mark-share is 2022
  only, NOT re-confirmed in 2024 (bundled into a 42% block). evidence_audit T2-4/Audit F: dual-pole STRONG,
  9% single-point.
- **claim:** Commercial answers must address BOTH opportunities and challenges with channel/market/price
  specificity (dual-pole — SUPPORTED). Commercial is *likely* the lowest-weighted competency (~9% in 2022)
  but that figure is a single data point — treat as illustrative, not a budgeting target. (MERGE
  objectives-EK-0111; HEDGE the 9%.)
```

**Drop / route-to-§9 (do NOT merge as fact):**
- distinction-EK-0104 "distinction = consistency, not peak" → **PLAUSIBLE, per-question-inexpressible**; route
  to §9 as a UI/framing note (evidence_audit T3-2). Do not give it a live EK number that downstream prompts
  read as a gradable rule.
- distinction-EK-0107 "bankers get NONE" → **PLAUSIBLE/inferred**; the latitude-scales-with-difficulty
  *direction* can refine EK-0090 with a hedge, but "bankers zero latitude" is not graded policy — route the
  absolute form to §9 (evidence_audit T1-2c, "Top 10 NOT IMPLEMENT" #2).
- distinction-EK-0106 "ID weighting volatile ~40%" → fold into the **EK-0006 reframe** (§3 below), not a new ID.
- future-pass **EK-FP-1…FP-5** → keep the `EK-FP-N` prefix as a *forward-prediction layer*; strip the
  superlatives ("fastest-rising", "strongest forward signal") before any merge (evidence_audit UNPROVEN).

### 1.3 Stale-citation cleanup (do at the same time)
`outputs/research/system_improvement_roadmap.md` and `future_exam_prediction.md` cite live EK-0107/0108/0105
for content those live IDs no longer hold. After 1.2 lands, the canonical IDs are: reasoning-conditional =
**EK-0113**; banker-latitude = **§9 / EK-0090 refinement**; synthesis = **EK-0110**; P2/P3 decider = **EK-0112**;
one-fact origin = **EK-0116**. Update those two docs' cross-refs. (Doc-only; no prompt cites these yet.)

---

## 2 · F-02 — EK-0093 pass-standard constant is factually wrong (+ "FOUR dimensions" is an internal reconstruction)

**EK ID / lines:** EK-0093, `mw_exam_empirical_knowledge.md:359-367`.
**Problem type:** SUPERSEDED (factually false constant) + UNSUPPORTED MODEL.
**evidence_audit bucket:** SUPPORTED (headline). **Strength:** VERY STRONG (headline) / MODERATE (A/B bands).
**Surfaces:** 5 Grading, 8 UI messaging, 7 EK injection.

| Element of EK-0093 | Verdict (evidence_audit Audit A) | Fix |
|---|---|---|
| "absolute **65% per paper**" | INCORRECT, zero primary support | Replace with **65% average across the 3 papers + ~50% per-paper floor**, criterion-referenced |
| "sub-45% does not recover" | Mis-stated as per-paper | Correct to "below ~45% **average** rarely recovers (statistical tendency, softened by the SPR mechanism)" |
| "FOUR dimensions" mastery | Internal reconstruction; IMW Student Guide names THREE abilities | Relabel as "an internal reconstruction; the IMW's own framework names three abilities (confidence model §7)" |
| bands A≥70 / B 65–69 | A/B sourced only to unreadable 2021 appendix | Keep C+ = 60–64 (verified); present A/B as **plausible, not report-verified** |
| Howler override | (operationalized as detect-only) | Keep claim; note it is detect-only telemetry, not auto-enforced (EK-0103) |

**Apply-ready EK edit (EK-0093 claim):** flip `status: live → superseded` and add a new entry **EK-0119**
(`supersedes: EK-0093`) carrying: *"Pass = 65% average across the three practical papers with a ~50%
per-paper floor, criterion-referenced (not a curve). Public IMW Student Guide (authoritative, overrides
corpus). C+ = 60–64% confirmed; A≥70 / B 65–69 are plausible but sourced only to the unreadable 2021
appendix — do not assert as verified. Below ~45% AVERAGE rarely recovers (tendency, softened by SPR). A
pass needs breadth across the IMW's three named abilities (structural reading, communication of reasoning,
quality/theory judgement) — the earlier 'four-dimension' phrasing was an internal reconstruction. The app
grades single questions, so the per-question PASS/BORDERLINE/FAIL thresholds are a single-question PROXY for
the band, not the official paper-level rule."* (Aligns with the staged `ek-0093-pass-standard-correction`
memory + `outputs/research/examiner_confidence_model.md`.)

**Apply-ready PROMPT edit (`marking-principles.ts`):**
- **L15** — replace `The pass mark is an ABSOLUTE 65% per paper, not a curve.` with:
  *"The IMW pass standard is a 65% AVERAGE across the three practical papers (with a ~50% per-paper floor),
  criterion-referenced — NOT 65% per paper, and not a curve. This app grades one question at a time, so the
  thresholds below are a single-question PROXY for that standard, not the official rule: FAIL < 50,
  BORDERLINE ≈ 55–64, PASS ≥ 65."* (Keep the proxy thresholds — they were never the real per-paper rule and
  this is a framing fix, not a scoring change. Verified: no code applies a 65% numeric threshold; graders are
  LLM prompts and `grading-telemetry.ts` only `console.warn`s.)
- **L16** — replace `mastery across FOUR dimensions … (2024)` with *"breadth across the IMW's named abilities
  — structural/tasting accuracy, clear communication of reasoning, and theory/quality judgement; a spike in
  one cannot rescue a hole in another."* (Removes the unsupported "FOUR".)

---

## 3 · F-03 — EK-0007 "reasoning > ID" is asserted UNCONDITIONALLY

**EK ID / lines:** EK-0007, `:177-182`. **Problem type:** SUPERSEDED-by-qualification.
**evidence_audit bucket:** SUPPORTED. **Strength:** VERY STRONG (T1-2a / Audit B). **Surfaces:** 5 Grading, 4 Feedback, 7 EK.

EK-0007's claim states "sound reasoning earns marks even when the conclusion is wrong" with no plausibility
gate. The 2025 verbatim it quotes actually reads "...if their reasoning was sound **and their conclusion
plausible**" — the conditional is in the source but dropped from the claim. **Fix:** add to EK-0007 claim:
*"— conditional on the conclusion being PLAUSIBLE and the structural read correct (see EK-0113). Implausible
calls and structural misreads do not earn the rescue."* (`marking-principles.ts` Cardinal Rule 1 at L19
already says "wrong-but-plausible", so the prompt is fine; this is an **EK-only** alignment edit.)

---

## 4 · F-04 — EK-0005 one-sided "P3 is the usual decider"

**EK ID / lines:** EK-0005, `:154-158`. **Problem type:** CONTRADICTORY (P2-vs-P3 tension) + one-sided.
**evidence_audit bucket:** SUPPORTED (the corrected nuance). **Strength:** STRONG (Audit F/H8 + §0 Coda).
**Surfaces:** 1 Generation (paper weighting), 7 EK, 8 UI.

EK-0005's "P3 is … the usual decider" contradicts hard pass counts (P3 is often the *strongest* paper) and
contradicts examiner_objectives ("P2 lowest-scoring recently"). **Fix:** strip "the usual decider" from
EK-0005 and replace with a pointer: *"(for the 'decider' question, see EK-0112 — there is no permanently
weakest paper; 'lowest-scoring' (recently P2) and 'arithmetic average-dragger' (often P3) are different
senses)."* Keep the rest of EK-0005 (classic/challenging balance, P2 most classic). **EK-only.**

---

## 5 · F-05 — EK-0006 false-precision decimals + trend-as-fact

**EK ID / lines:** EK-0006, `:167-175`. **Problem type:** UNSUPPORTED PRECISION + trend-as-permanent.
**evidence_audit bucket:** SUPPORTED (rotation reframe). **Strength:** STRONG (T2-2, FP-3). **Surfaces:** 1 Generation, 5 Grading, 7 EK.

EK-0006 presents "ID 46%→39% (2022→2023), Quality 22%→37%" as a directional *trend*. evidence_audit
(FP-3, "you never know where the weighting will be" — 2023 verbatim) says mark allocation **rotates**, not
slopes. **Fix:** reframe EK-0006 claim to *"Mark allocation ROTATES year-to-year within the modern era — do
NOT extrapolate any single competency's share linearly. ID sits ~39–46% (largest single category,
necessary-but-not-sufficient); the analytical pool (quality/winemaking/commercial/style) splits
unpredictably. The 46%→39% / 22%→37% figures are two adjacent years, not a slope."* Keep the
per-question-tariff guidance (it is correct and points to EK-0089). **EK-only.** (distinction-EK-0106
"ID volatile ~40%" folds in here rather than getting its own ID.)

---

## 6 · F-06 — Baked-in superlatives (UNPROVEN per evidence_audit)

**Problem type:** UNSUPPORTED SUPERLATIVE. **evidence_audit bucket:** UNPROVEN. **Surfaces:** 7 EK, 4 Feedback, 1 Generation.

| EK ID / line | Superlative | Strength | Fix |
|---|---|---|---|
| **EK-0091** `:339` | "the **most-penalized** 2021–2025 failure mode" | UNPROVEN (overfit ranking; misread is the upstream trigger) | Retitle "Internal-consistency / cascade error (**a heavily-penalised** failure mode)"; drop the ranking superlative from title + claim |
| **EK-0105** `:1034,1040` | "the **strongest forward signal in the corpus** for the next ~5 years" | WEAK (n=2, same question type, same paper) | Replace with the precise true claim: "**the only verbatim two-year stem repeat in the corpus** (2024 P2Q3 = 2025 P2Q1)"; keep the 3-absence falsification hedge already implied |
| EK-FP-1 (draft) | "the **fastest-rising** objective" | UNPROVEN (n=3, double-counted) | Handled in §1.2 EK-0110 — dropped before merge |

These are **EK-only / draft-only** edits. EK-0091's *substance* (cascade/internal-consistency is real and
heavily penalised) stays; only the "most-penalized" ranking claim goes. EK-0105's *substance* (climate is a
recurring driver, verbatim repeated) stays — only the "strongest signal in the corpus" rhetoric goes.
Climate-change **adaptation** (picking dates/canopy/variety choice) is UNPROVEN/unattested — it must NOT be
added to EK-0105 or model-answer mandates; route to §9 (evidence_audit T1-6 / Audit D / "Top 10 NOT" #3).
Note: live EK-0105 does **not** currently contain the adaptation content — good; keep it out.

---

## 7 · F-07 — EK-0096…0102 scope label is incomplete (live EK-0107 partially covers it)

**EK ID / lines:** EK-0096…0102 (`:929-1002`); the scope label lives at EK-0107 (`:1060-1071`).
**Problem type:** SCOPE-MISLABEL risk (composition parameters read as assessment objectives).
**evidence_audit bucket:** SUPPORTED. **Strength:** STRONG (T1-5, "Top 10 SURVIVED"/"IMMEDIATE" #9). **Surfaces:** 1 Generation, 2 Wine generation, 7 EK.

**Finding: this is LESS broken than the roadmap implies — live EK-0107 already states the scope label**
("every per-paper composition entry … is computed on the 2015–2025 structured corpus only and is blind to
2011–2014 … do not read last-10 distributions as timeless"). The remaining gap is that EK-0107 says "do not
use them to reason about evolution" but does **not** say "these are *composition parameters, not assessment
objectives*." evidence_audit's UNPROVEN bucket explicitly flags "reading the per-paper composition decimals
(EK-0023, EK-0098, EK-0099…0102) as assessment objectives." **Fix (EK-only):** append one sentence to
EK-0107: *"These are generation/composition PARAMETERS (what a realistic paper looks like), NOT assessment
objectives (what the examiners are testing); do not treat a distribution decimal as examiner intent."* No
renumbering needed — EK-0107 is the right home.

---

## 8 · F-08 — EK-0078 vintage framing (minor) + EK-0001/EK-0035 already-flagged corrections

**EK-0078** `:558-565`: claims vintage ID is "rarely asked" but the changelog (L48) and evolution doc note
vintage actually *declined* over time (revise rests on manually-summed Era-1 tariffs). evidence_audit
PLAUSIBLE ("vintage ID declined; revise EK-0078 — rests on Era-1 tariffs"). **Fix (EK-only, low priority):**
add hedge to EK-0078: *"vintage ID has *declined* over the corpus, not merely been statically rare; the
Era-1 baseline is manually summed and uncharacterised (EK-0107)."* — bucket PLAUSIBLE, do not over-state.

**EK-0001 / EK-0035:** the changelog (L40-48) already records these as flagged-for-correction by the
evolution analysis (EK-0001 pre-2013 "not 25/wine" boundary; EK-0035 "P3 always opens sparkling" broke 2025).
These corrections are **drafted in the analysis doc but not yet applied.** Not new findings — but they belong
in the same apply pass. EK-0035's 2025 break is **verified** (evidence_audit T3-6 "Top 10 IMMEDIATE" #10):
recast positional priors as tendencies. **Fix:** apply the drafted EK-0001/EK-0035 revisions; flip EK-0035's
"always opens sparkling" to a tendency. SUPPORTED.

---

## 9 · Duplicated-concept map (no action beyond the merges above)

These are tracked so the merge does not re-duplicate:
- **Cut-and-paste / anti-template:** EK-0015 (howler list) + new EK-0114 + `marking-principles.ts` Rule 9.
  Keep EK-0114 as the *study-system caution* framing; cross-ref EK-0015. No collision.
- **Quality contextualisation:** EK-0008 → EK-0092 (both ways) → EK-0106 (global/dual-pole) → new EK-0115
  (origin-blind/volunteer-tier) → new EK-0111 (global, hedged). Chain is fine *if* each cross-refs; ensure
  EK-0111 (global, PLAUSIBLE) does not contradict EK-0106 (which already states the global frame as STRONG).
  **Reconcile:** EK-0106 asserts global as STRONG on 2024+2025 framing; EK-0111 is the narrower n=1 2025 stem.
  Keep EK-0106 as the live frame; fold EK-0111's caution INTO EK-0106 rather than a separate entry to avoid a
  STRONG-vs-PLAUSIBLE duplicate on the same concept. **(Revision to §1.2: drop standalone EK-0111; add its
  single-point hedge as a sentence in EK-0106. Renumber EK-0112→0111, 0113→0112, etc.)**
- **Reasoning>ID:** EK-0007 (qualified) + new EK-0113/0112 (conditional) + EK-0090 (plausibility gradient).
  Cross-ref, no dup.

---

## 10 · Mandatory questions (scoped to EK integrity)

1. **What currently contradicts the strongest evidence?** EK-0093 "absolute 65% per paper" (zero primary
   support; public Student Guide says 65% *average* + 50% floor) and `marking-principles.ts:15`. Secondary:
   EK-0007 unconditional reasoning>ID (2025 source has "and conclusion plausible"); EK-0005 "P3 usual decider"
   (pass counts show P3 often strongest); EK-0093 "FOUR dimensions" (IMW names three).
2. **What creates examiner-unrealistic behavior?** The EK-0104+ collision feeds the **wrong** live entry into
   the feedback-analysis agent (db.ts injects sections 5/6/7 live by ek_id) — a prompt citing "EK-0108" pulls
   orange-wine text when it meant reasoning-conditional. EK-0006's trend-as-fact would push generation to a
   single linear mark-split instead of the real rotation.
3. **What teaches candidates the wrong lesson?** "65% per paper" teaches candidates to over-fear one paper
   instead of managing the average+floor. Unconditional EK-0007 teaches "any reasoning rescues any wrong call"
   — but implausible calls and structural misreads do NOT recover. The "FOUR dimensions" model teaches a
   framework the IMW does not use.
4. **What produces the largest simulation error?** The EK-0104+ collision (F-01) — it is the *substrate* every
   other prompt cites; a stale citation silently injects unrelated content. Largest single *content* error:
   the pass-standard constant (F-02), because it is in the grader's "read FIRST" calibration block.
5. **Which fixes should be implemented immediately?** F-01 (collision renumber — PREREQUISITE), then F-02
   (pass-standard, EK + prompt), F-03 (EK-0007 conditional), F-04 (EK-0005 decider nuance), F-05 (EK-0006
   rotation), F-06 (drop superlatives), F-07 (scope-label sentence), F-08 (EK-0035 tendency). All are EK-only
   except F-02's two-line prompt edit. All SUPPORTED except the explicitly-hedged PLAUSIBLE sub-claims.
6. **Which fixes should wait?** The A≥70/B 65–69 band cut-points (source from a readable public IMW doc first
   — MODERATE). distinction "bankers get zero latitude" and "distinction = consistency" — route to §9, do not
   give live gradable IDs. Climate-change *adaptation* — §9 watch-item. The commercial 9% figure — keep
   illustrative, do not make a target.
7. **Which findings require additional validation?** Banker-latitude (needs a graded-policy statement, not
   inference); the global quality frame and 9% commercial (single data points — re-confirm); any "14-year
   trend" claim (blind to 2011–2014 until structured tagging — EK-0107); climate-change adaptation (unattested).

---

## 11 · Apply order (decisive)

1. **F-01** — paste the de-duplicated EK-0109+ block (with the §9 EK-0111-fold correction); flip nothing else
   until done. Update roadmap + future_exam_prediction stale cross-refs.
2. **F-02** — EK-0093 supersede + new EK-0119; `marking-principles.ts:15-16` two-line edit (framing fix, no
   scoring-logic change — verified no numeric 65% threshold exists in code).
3. **F-03 / F-04 / F-05** — EK-0007 / EK-0005 / EK-0006 claim edits (EK-only).
4. **F-06 / F-07 / F-08** — strip superlatives (EK-0091, EK-0105), append EK-0107 scope sentence, apply the
   drafted EK-0001/EK-0035 + EK-0078 revisions.

**No prompt edit that cites any EK-0104+ ID ships before step 1 completes.**
