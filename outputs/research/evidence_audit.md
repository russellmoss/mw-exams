# Adversarial Evidence Audit & Replication Study (Project 7)

> **Mandate.** Determine which findings from the six completed research projects survive a hostile audit.
> Disconfirmation is worth more than confirmation. Every recommendation in
> `system_improvement_roadmap.md` is treated as possibly wrong until it survives an aggressive attempt at
> falsification. A finding that fails is downgraded regardless of how attractive it is.
>
> **What was done.** (1) Re-read all six research reports. (2) Re-mined the *primary* examiner-report PDFs
> (Practical 2017, 2018, 2022, 2023, 2024, 2025; Chief 2022, 2023, 2024, 2025; 2017/2018 theory; 2021 Chief)
> for verbatim quotes that **support or contradict** each Tier-1 claim. (3) Verified the load-bearing
> "climate stem repeated verbatim" claim directly against the source question text in `data/exams.json`.
> (4) Checked the **live** EK state (`mw_exam_empirical_knowledge.md`) to test the EK-collision premise of
> T1-5. (5) Separated historical observation from assessment doctrine, and examiner behaviour from
> candidate folklore, per the four core principles.
>
> **Author:** MW Evidence Audit Team, 2026-05-31.

---

## 0 · Provenance and method notes (these bound every verdict below)

- **The examiner reports are member-gated and not web-verifiable.** Year/paper attributions are the
  corpus's claims; a *public* IMW document (the Student Guide) overrides a corpus paraphrase on a hard fact.
  This is itself a confirmed finding (confidence model §7) and is honoured throughout.
- **The 2021 Chief Examiner's Report PDF is image-based and unreadable.** Only the appendix *header*
  ("Grade Boundary Comparison (Practical) — Pre-2021 boundaries / 2021 boundaries") extracts. **The grade-band
  cut-points A≥70 / B 65–69 / C+ 60–64 that `distinction_candidate_analysis.md` §0 attributes to "2021 Chief,
  p.3" cannot be read from that file.** C+ = 60–64% is independently confirmed (2024 Practical, Peter Marks
  MW; IMW Student Guide), but the A≥70 / B 65–69 cut-points are, on the available evidence, **weakly sourced.**
- **2019 and 2021 Practical reports are absent from the PDF set.** Some "2019"/"2021" quotes ride the
  pre-existing synthesis, not a primary read. Counts below reflect this.
- **The single most important verification result:** the "climate stem repeated *verbatim* 2024→2025" claim
  (T1-6 / H2 / EK-FP-2, billed "the strongest forward signal in 14 years") is **TRUE** at the source level.
  `data/exams.json` shows **2024 P2Q3c** and **2025 P2Q1c** are word-for-word identical
  ("Discuss how climate and winemaking techniques have influenced the quality and style of the wine"); only
  the mark multiplier differs (5×15 vs 3×15). The PDF agents' "no verbatim match" referred to the *reports'*
  paraphrase, not the question text. The claim's *factual core* stands; its *interpretation* ("strongest
  forward signal in 14 years") is where the audit pushes back (Audit D).

---

# PART I — TIER 1 RECOMMENDATION AUDITS

---

# Recommendation T1-1 — Correct the pass-standard constant (65% AVERAGE + floor, with grade bands)

## Summary
The claim: the live grading constant ("the pass mark is an ABSOLUTE 65% per paper," `marking-principles.ts`
L15; live **EK-0093** verbatim: "Pass is an **absolute 65% per paper**, not a curve") is factually wrong;
the real IMW rule is a **65% average across the three practical papers with a per-paper minimum floor (~50%)**,
criterion-referenced, plus a band structure (A ≥70 / B 65–69 / C+ 60–64). Proposed change: correct the prompt
and EK; relabel the per-question verdict thresholds as a single-question *proxy* for the band.

## Supporting Evidence
- **Public IMW Student Guide (authoritative, overrides corpus):** *"To pass the practical component you need
  to average 65% or more across all three papers, with a minimum of 50% in any one paper."* — **decisive,
  verbatim, public.**
- **Examiner reports:** 2017 Practical (Tuck MW): *"to achieve the average of 65% to pass"* (SUPPORTS averaging,
  CONTRADICTS "per paper"). 2023 Practical (Marks MW): moderation language about candidates "between 60.0% to
  64.9%… due to one or two papers that fall below the 65% threshold" (per-paper threshold is soft and
  moderatable, not a hard 65%/paper rule). 2024 Practical (Marks MW): *"the C+ or 60% – 64% range **across all
  three papers**"* — bands are defined on the aggregate. **≈3 practical reports + Student Guide.**
- **Floor / recovery:** 2018 Chief (Hoskins MW): *"below an average of 45% across their Practical Papers…
  almost never go on to pass… less than 5%."* **1 report, verbatim.**
- **EK entries supporting:** memory `ek-0093-pass-standard-correction` (HIGH severity); confidence model §7
  row 1; distinction §0.

## Counter Evidence
- **No examiner report or public doc states "65% per paper."** The current EK/prompt constant has **zero
  primary support** — it appears to be an internal invention. (This is disconfirmation *in favour* of the rec.)
- **The grade-band cut-points are only partly supported.** C+ = 60–64% is confirmed (Student Guide + 2024
  Practical). **A ≥70 / B 65–69 are sourced to the unreadable 2021 appendix** and appear in no readable report.
  Adopting the *averaging+floor* fix is fully evidenced; adopting the *specific A/B numbers* is not.
- **The "sub-45% does not recover" clause in live EK-0093 is mis-stated.** The real source (2018) is an
  *average across the practical papers*, not a per-paper floor; and the Student Guide's SPR mechanism shows a
  single paper below 40% is not automatically fatal if the averages hold. So "sub-45% does not recover" is a
  statistical tendency, not a rule — it should be corrected alongside the headline.

## Strength Of Evidence
**VERY STRONG** for the headline correction (public, authoritative, directly contradicts the live constant).
**MODERATE** for the specific A≥70 / B 65–69 band cut-points.

## Assessment
**ADOPT IMMEDIATELY** (headline) **+ ADOPT WITH MODIFICATION** (bands). Correct the averaging+floor immediately;
present the A/B cut-points as *plausible but not report-verified*, or source them from a readable public IMW
document before asserting them. Honour the roadmap's own caveat: the app grades single questions, so this is a
**framing/messaging** fix, not a scoring-logic change — and the prompt should say so.

## Implementation Risk
**Low.** It corrects a false statement; it cannot make grading worse. The only risk is *over-precision* —
asserting unverified band numbers (A≥70) as if confirmed. Mitigate by hedging the cut-points.

## Confidence
**95%** (headline). **65%** (specific A/B band cut-points).

## Proposed EK Impact
- **Revise (SUPPORTED):** EK-0093 — replace "absolute 65% per paper" with "65% average across three papers +
  ~50% per-paper floor, criterion-referenced"; fix the "sub-45% does not recover" clause to "below ~45%
  *average* rarely recovers." Re-label the "four-dimension mastery" model as an internal reconstruction (the
  IMW's own framework names *three* abilities — confidence model §7 row 2).
- **Plausible:** the A/B band cut-points (pending a readable public source).

---

# Recommendation T1-2 — Make "reasoning > ID" CONDITIONAL; encode structural/origin asymmetry + banker/esoteric latitude

## Summary
A three-part claim: (a) sound reasoning rescues a wrong call **only** when the conclusion is plausible and the
structural read is correct; (b) a wrong **structural** read cascades **fatally**, a wrong **origin** on a sound
read is **survivable**; (c) **latitude scales with wine difficulty** — bankers get little/none, esoterica get
generous credit. Proposed change: thread a `wineDifficulty` hint into grading and encode the asymmetry.

## Supporting Evidence
- **(a) Conditional-on-plausibility — STRONG, ~all reports:** 2025 P1 (Mitchell MW, verbatim): *"over half did
  not get a single origin exactly right, however many still managed 5 or 6 marks out of 8 **if their reasoning
  was sound and their conclusion plausible**."* 2024 P2 (Mitchell): *"4 of the 5 marks available per wine were
  for reasoning."* 2022 P1 (Mitchell): *"the argument is as important as the conclusion… the key to passing
  identification questions"* and *"a much higher proportion of the marks… for the argument rather than for the
  conclusion."* 2023 P1 (Perrotti-Brown MW): *"students could have misidentified the varieties and still
  passed."* 2017/2018: Lagrein/Soave "good credit for a logical argument… even if wrong." **≈6 practical
  reports.**
- **(b) Structural read is the foundation — STRONG, 2025:** Marks MW (verbatim): *"a candidate who reads the
  wine correctly and makes a logical deduction… can still achieve a pass. By contrast, poor tasting ability not
  only limits marks for identification but also leads to incorrect statements about the wine's quality, style
  and commercial appeal."* 2025 #1 failure theme: *"an inability to read the wine accurately — alcohol,
  acidity, tannin and residual sugar."* 2025 P2: structural elements "sometimes more critical" than aroma.
- **(c) Esoterica get leeway — STRONG; bankers strict — INFERRED:** 2023 P1 South Africa: *"much leeway was
  given to well-argued wrong answers."* 2025 P2 Cornas: *"we do not expect everyone to be able to 'nail' a
  Cornas, but we do expect to see plausible options."* For bankers: 2022 P2 *"had to be in Tuscany"* for full
  points; 2024 P2 *"with the question limiting the number of possible origins, successful candidates really
  needed to be correct."* 2018: missing Riesling/Pinot on a classic flight made it *"almost impossible to pass."*

## Counter Evidence
- **(b) "Structural-miss is FATAL" is too absolute — documented counterexample.** 2023 P3Q3 (Mitchell MW):
  *"most that had the identification wrong generally **misidentified alcohol or acidity**… however with good
  answers to parts b) and c), could still achieve strong marks."* Here a **structural misread was survived.**
  The clean "structural fatal / origin survivable" dichotomy does not hold; structural misreads are *high-risk*
  but recoverable when downstream answers still describe the glass.
- **"Origin-miss is survivable" also has counterexamples.** On bankers/classics, an origin/variety miss is
  *near-fatal* (2018 Riesling/Pinot "inevitable failure"; 2017 "almost impossible to pass"). So neither half of
  the asymmetry is unconditional — both depend on wine difficulty, which collapses (b) and (c) into one
  principle rather than two.
- **(c) "Bankers get NO latitude" is never stated as graded policy.** It is *inferred*. Moreover the strongest
  "bankers strict" quotes (2022 Tuscany, 2024) are about a **constrained/given option set**, a *different*
  mechanism from wine difficulty. Per Principle 3, this is partly inference, not doctrine.

## Strength Of Evidence
**(a) VERY STRONG. (b) MODERATE** (real direction, but "fatal" is contradicted by 2023 P3Q3 and the
origin-miss half is contradicted on bankers). **(c) PLAUSIBLE** (esoterica half strong; banker half inferred
and partly conflated with the constrained-option mechanism).

## Assessment
**ADOPT WITH MODIFICATION.** Adopt (a) as written. Reword (b): a structural misread is **usually decisive but
recoverable** if downstream answers still describe the glass — *not* an automatic cascade-to-zero. Adopt (c)
as a **grading/coaching tendency** ("generous credit on esoterica/curveballs, strict on bankers"), explicitly
flagged PLAUSIBLE, and keep the *constrained-option* case separate. Do **not** hard-wire "structural miss →
fatal cascade" into the grader.

## Implementation Risk
**Medium.** Encoding "structural miss = fatal" too literally would over-penalise the exact 2023 P3Q3 candidate
the reports reward, and could double-punish via the existing cascade-zeroing telemetry. The difficulty-hint
plumbing is low-risk; the asymmetry wording is where the risk lives.

## Confidence
**80%** for the bundle. (a) 92%; (b) 70%; (c) 60%.

## Proposed EK Impact
- **SUPPORTED:** qualify EK-0007 — reasoning rescues a wrong call only when *plausible*.
- **PLAUSIBLE:** latitude scales with difficulty (refine EK-0090); the structural/origin asymmetry as a
  *tendency, with the 2023 P3Q3 recoverability counterexample noted*.

---

# Recommendation T1-3 — Add the integrated multi-factor synthesis archetype to generation

## Summary
Add a first-class question archetype: apportion character among climate/winemaking/terroir; human-vs-nature;
why/why-not blend. Justification: it is the "fastest-rising objective in the corpus" and the examiners' explicit
anti-rote weapon, currently absent from generation.

## Supporting Evidence
- **The family is real and novel — verbatim:** 2024 P2Q3c (Mitchell MW): *"not a question format seen in
  previous exams… the worst answered question on the paper."* 2025 P1Q4 (Mitchell): *"a form of question that
  had not been used before"*, *"accounted for 15% of the total marks"*, "human inputs vs nature… weaving in
  winemaking and terroir." 2022 P2Q1 (Perrotti-Brown MW): the blend/"reasons for not blending" question,
  *"an unconventional question."*
- **Anti-rote intent — verbatim:** 2024 Chief (Tully MW): *"an over-reliance on the… study programme is
  eroding students' ability to think for themselves… those who simply assimilate information… will not pass."*
- **EK/reads:** all four research reads independently flag it (objectives Obj-9; evolution Future-Direction;
  distinction §1.7; future H1/EK-FP-1). **3 practical questions across 2022/2024/2025; 1 Chief report.**

## Counter Evidence
- **"Fastest-rising objective in the corpus" is an extraordinary claim on n=3.** Three questions across four
  sittings, each *differently framed* (blend / climate / human-vs-nature), is a **recent cluster**, not a
  measurable growth rate. Per Principle 4, a "fastest-rising / strongest growth area" claim needs more than a
  3-point series.
- **Double-counting inflates the trend.** 2024 P2Q3c is the **shared** primary evidence for *both* this rec and
  T1-6 (climate). Counting the same question twice across two "rising" signals overstates both.
- **It may be a re-skin of existing competencies, not a new one.** The objectives doc itself calls these
  "winemaking inference elevated to an analytical-weighting task" — i.e., Obj-5 (winemaking) re-worded. The
  *novelty* is in phrasing (the anti-template move), which argues for T1-4/T1-? framing-freshness more than for
  a brand-new content archetype.

## Strength Of Evidence
**STRONG** that the family exists and recurs; **WEAK–MODERATE** that it is the "fastest-rising / dominant
emerging objective" (n=3, differently framed, double-counted).

## Assessment
**ADOPT WITH MODIFICATION.** Add the archetype (low harm; it drills a genuinely attested, genuinely hard
competency). But **drop the "fastest-rising objective" superlative** — describe it as "a recurring
novel-synthesis *family* that has appeared ~once a year recently; prepare the method, not a script." Treat it
as *additive*, never a replacement for ID/structure (the roadmap's own §3.3 caveat).

## Implementation Risk
**Medium.** The risk is exactly the mandate's "encode a recent cluster as a dominant permanent objective" —
over-weighting synthesis in generation at the expense of the ~40% ID core. Bounded by making it one option
among many and by a falsification watch (two consecutive absent years → downgrade).

## Confidence
**Existence: 90%. "Fastest-rising/dominant": 55%.**

## Proposed EK Impact
- **SUPPORTED:** "integrated multi-factor synthesis is a distinct, recurring novel-question family" (new entry).
- **UNPROVEN (do not assert):** "the fastest-rising objective" / quantified growth trajectory.

---

# Recommendation T1-4 — Model answers reason freshly per glass + demonstrate the "reconcile conflicting evidence" move

## Summary
Two changes to `model-answer-prompt.ts`: (1) forbid templated phrasing reused across a flight; (2) where
evidence genuinely conflicts, demonstrate one second-order reconciling inference (the Tokaji "exceptional
quality ⇒ producer exceeds the classification minimum" move). Framed as a *correctness* requirement.

## Supporting Evidence
- **Anti-template / cut-and-paste — STRONG, multi-year, verbatim:** 2017 Practical: *"the use of 'cut and
  paste'… creates a really bad impression – no two answers should ever be completely the same."* 2023 Practical
  (Mitchell MW): *"clearly using cut and paste. It is unlikely examiners have chosen two wines with the same
  attributes."* 2024 Practical (Marks MW): copy/paste *"creates considerable doubt in the mind of the reader."*
  2024 Chief: the critical-thinking-erosion warning. **3 practical + 1 Chief.**
- **The reconcile move — verbatim, named gold standard:** 2025 P3 (Sjödin MW): the Tokaji-Szamorodni candidate
  who reasoned *"although the sugar level suggests 5 or 6 Puttonyos, the exceptional quality indicates a
  producer whose wines would exceed the minimum sugar levels… It was an insightful observation that instilled
  much confidence in the eyes of the examiners."*
- **Aligns generation with existing grading** (the grader already penalises cut-and-paste — roadmap §0).

## Counter Evidence
- **The "reconcile conflicting evidence" move rests on a SINGLE named instance** (2025 Tokaji). The distinction
  doc itself calls it "the clearest concrete picture… in the entire corpus" — i.e., the *clearest*, not a
  *frequent* one. As a *frequency* claim it is weak; as an *illustrative best-practice* it is strong. This
  argues for "demonstrate it *where evidence conflicts*" (conditional), not "every answer must reconcile."
- No counter-evidence against the anti-template half — it is one of the best-supported doctrines in the corpus.

## Strength Of Evidence
**STRONG** (anti-template); **MODERATE** (reconcile-move as a teachable best-practice, single named exemplar).

## Assessment
**ADOPT IMMEDIATELY.** This protects the product's core validity (a study app that ships recited templates
trains the exact failure the Chief named) and aligns generation with grading. Keep the reconcile instruction
**conditional** ("where the evidence genuinely conflicts"), not blanket.

## Implementation Risk
**Low.** Prompt-only; aligns with existing grading. Minor risk: a mandatory reconcile move could push the model
to *manufacture* false conflicts — mitigated by the "genuinely conflicts" condition.

## Confidence
**92%.**

## Proposed EK Impact
- **SUPPORTED:** independent-thinking-over-rote / no cut-and-paste study-system caution (new entry).
- **PLAUSIBLE:** the reconcile move as the named distinction exemplar (adopt as one illustration, not a
  frequency claim).

---

# Recommendation T1-5 — Reconcile the colliding EK-0104…EK-0111 drafts + scope-label EK-0096…0102

## Summary
Merge four research passes' overlapping EK drafts into one consecutive de-duplicated block; flip superseded
entries; tag EK-0096…0102 as composition parameters, not assessment objectives.

## Supporting Evidence
- **The collision is real and now PARTLY BAKED IN — verified against the live doc.** `mw_exam_empirical_knowledge.md`
  now contains **live EK-0104…EK-0108** (commit 2026-05-31) drawn from **the evolution doc only**:
  - live **EK-0104** = ID-suppression→ID-free arc; **EK-0105** = climate; **EK-0106** = region→world quality;
    **EK-0107** = scope label; **EK-0108** = orange wine.
  - But objectives/distinction/future drafted *different* content under the *same IDs*: objectives EK-0105 =
    "integrated synthesis", distinction EK-0105 = "reconcile move", objectives EK-0107 = "P2 is the decider",
    distinction EK-0107 = "banker latitude", objectives/distinction EK-0108 = "reasoning conditional" /
    "independent thinking."
- **The roadmap's OWN citations are already stale.** T1-2 cites "EK-0108/0107 drafts" for the
  reasoning-conditional + banker-latitude claims — but **live EK-0108 = orange wine** and **live EK-0107 =
  scope label.** T1-3 cites "objectives-EK-0105" for synthesis — but **live EK-0105 = climate.** Any prompt
  shipped citing those IDs today would cite the *wrong* live entry.
- future_exam_prediction explicitly flags the "Numbering caution"; the collision is documented.

## Counter Evidence
- None. This is the rare item with no disconfirming evidence — the collision is mechanically verifiable.

## Strength Of Evidence
**VERY STRONG** (verified by direct inspection of the live file).

## Assessment
**ADOPT IMMEDIATELY — and as a hard prerequisite.** Because EK is *injected* into feedback and is the cited
authority for every other prompt edit, **no prompt change that cites EK-0104+ should ship until this is
resolved.** The situation is *worse* than the roadmap states, because the evolution-pass numbering is already
live and now silently conflicts with the other three passes' drafts.

## Implementation Risk
**Low to do; HIGH to skip.** EK editing is low-risk; *not* doing it propagates ambiguous/wrong citations
everywhere EK is injected.

## Confidence
**98%.**

## Proposed EK Impact
- **SUPPORTED:** the whole renumbering + the EK-0096…0102 scope label ("last-10 composition parameters, blind
  to 2011–2014 — not assessment objectives"). This is a force-multiplier that unblocks T1-2/T1-3/T1-4/T1-6
  citations.

---

# Recommendation T1-6 — Add climate-as-driver framing to generation and model answers

## Summary
Make "how climate (and winemaking) influenced quality and style" a recurring (not every-question) option; model
answers must reason cool-vs-warm expression, vintage conditions, and **climate-change adaptation**. Justified as
"the strongest forward signal in 14 years" — the only stem repeated verbatim two years running.

## Supporting Evidence
- **The verbatim repeat is TRUE — verified against `data/exams.json`:** 2024 P2Q3c and 2025 P2Q1c are
  word-for-word identical. This is a genuine, checkable fact (the agents' "no verbatim match" was about the
  reports' paraphrase). **The strongest single piece of evidence in the entire roadmap that survived
  verification.**
- **Examiner reports corroborate climate's centrality:** 2024 Practical: *"Q3 asked candidates to discuss
  climate with respect to quality and style… few made reasoned arguments regarding climate."* 2025 P2: climate
  "influence on style" for the Cabernet Franc flight. **Cross-syllabus support:** the *theory* reports
  (2017 P1: 3/6 questions required climate-change consideration; 2018 P1Q2 climate-change viticulture; 2022/2023
  heat/drought) show climate is a standing IMW examinable theme.

## Counter Evidence
- **"Strongest forward signal in 14 years" rests on n=2.** Both appearances are the *same competency*, *same
  paper (P2)*, *same flight structure* (same-variety-across-countries → "how did climate+winemaking shape
  quality/style"). It is arguably **one recurring question type sampled twice**, not a broad rising axis. Per
  Principle 4, "strongest signal in 14 years" is a superlative on two data points.
- **The "climate-change ADAPTATION" content (picking dates, canopy, variety choice) is NOT in the practical
  corpus.** future_exam_prediction M7 explicitly flags it as "logically implied… but not yet directly
  attested." So the adaptation half of the model-answer instruction is **extrapolation**, not evidence.
- **The docs themselves attach a 3-absence falsification test** — an implicit admission this is not yet a
  permanent rule.

## Strength Of Evidence
**STRONG** for "climate-as-driver is a recurring, examinable framing (verbatim 2× + heavy theory support)."
**SPECULATIVE** for "climate-change adaptation as a graded competency." **WEAK** for the "strongest forward
signal in 14 years" superlative.

## Assessment
**ADOPT WITH MODIFICATION.** Add climate-as-driver as a *recurring, optional* generation framing and as a
model-answer reasoning axis — well-justified. **Drop the "strongest forward signal in 14 years" rhetoric**
(replace with the precise, true claim: "the only verbatim two-year stem repeat in the corpus"). Treat
**climate-change adaptation** as a watch-item (route to EK open questions), not a model-answer mandate, until
attested.

## Implementation Risk
**Medium.** This is the textbook "encode a temporary trend as a permanent rule" risk the mandate names. Bounded
by: recurring-not-mandatory framing, the verbatim-repeat being a *real* anchor (not noise), and the explicit
falsification test.

## Confidence
**Climate as a recurring examinable driver: 85%. "Standing furniture / strongest signal": 60%. Climate-change
adaptation as graded: 35%.**

## Proposed EK Impact
- **SUPPORTED:** "climate is a recurring examinable quality/style driver (verbatim 2024→2025)" — *with* the
  3-absence falsification test (live EK-0105 already captures this; keep the hedge).
- **UNPROVEN:** climate-change *adaptation* as its own competency (open question).

---

# PART II — REQUIRED SPECIAL AUDITS

---

## Audit A — Pass Standard

**Verified independently.**

| Element | Finding | Verdict |
|---|---|---|
| 65% **average** across 3 papers | Confirmed verbatim by public IMW Student Guide + 2017 Practical ("the average of 65%") + 2024 Practical (bands defined "across all three papers"). | **CORRECT** |
| Per-paper **floor** | Student Guide: **"minimum of 50% in any one paper."** (Some candidate accounts cite 55%; the Guide says 50%.) | **CORRECT (~50%)** |
| "65% **per paper**" (the live constant) | **No primary support anywhere.** An internal invention. | **INCORRECT — must be replaced** |
| Grade **bands** A≥70 / B 65–69 / C+ 60–64 | C+ = 60–64% confirmed (Student Guide + 2024 Practical). **A≥70 / B 65–69 sourced only to the unreadable 2021 appendix** — not report-verified. | **PARTIALLY correct** |
| "sub-45% does not recover" (live EK-0093) | Real source (2018) but it is an *average across practical papers*, not a per-paper floor; SPR mechanism softens it. | **Mis-stated — correct it** |
| Criterion-referenced, not a curve | Confirmed (2021 Chief framing via synthesis; consistent with Student Guide). | **CORRECT** |

**Is roadmap T1-1 fully correct, partially correct, or incorrect?** **Fully correct on the headline** (the
averaging+floor correction is decisively supported and the live "per paper" constant is decisively wrong).
**Partially correct on the bands** (C+ verified; A/B cut-points weakly sourced) **and on the recovery clause**
(needs the "average, not per-paper" fix). Net: **adopt the headline immediately; hedge the band cut-points.**

---

## Audit B — Reasoning vs Identification *(the most important audit — exhaustive)*

**Claim under test:** "Reasoning > ID is conditional," plus the structural-miss/origin-miss asymmetry and the
banker/esoteric latitude split.

### B.1 How often examiner reports SUPPORT "reasoning > ID (conditional)"
Effectively **every** primary practical report 2017–2025 (6 of 6 read):
- 2017: Lagrein "good credit for a logical argument"; Soave "logical conclusion… gained good marks, even if
  wrong."
- 2018: Soave "best answers concentrating on structural elements… even if wrong"; Australia stabs "could still
  have garnered enough marks to pass… but only with logical reasoning."
- 2022: "the argument is as important as the conclusion… key to passing"; "much higher proportion of the marks…
  for the argument"; "latitude… for well-argued and logical conclusions."
- 2023: "could have misidentified the varieties and still passed"; South Africa "much leeway… to well-argued
  wrong answers."
- 2024: **"4 of the 5 marks available per wine were for reasoning."**
- 2025: **"5 or 6 marks out of 8 if their reasoning was sound and their conclusion plausible."**

The **conditional** qualifier is explicit in the 2025 verbatim ("**and their conclusion plausible**") and in
the 2025 Rhône flight ("anyone who wasn't in the Rhône struggled"; "we do expect to see plausible options").
**Verdict: the conditional form is VERY STRONGLY supported — stronger than the unconditional EK-0007.**

### B.2 How often reports CONTRADICT it
- The unconditional reading (any reasoning rescues anything) is contradicted by the plausibility quotes above —
  but that *supports* the rec, which is itself a conditional. No report contradicts the *conditional* claim.

### B.3 Is the structural-miss vs origin-miss asymmetry real?
- **Direction: yes.** 2025 (Marks MW) is near-verbatim for the rec: correct structural read → can still pass;
  poor tasting → cascades into wrong quality/style/commercial.
- **As a clean dichotomy: NO.** Documented counterexamples on **both** sides:
  - *Structural miss survived:* 2023 P3Q3 — "misidentified alcohol or acidity… however with good answers to
    b) and c), could still achieve strong marks."
  - *Origin miss fatal:* 2018 — missing Riesling/Pinot on a classic flight = "almost impossible to pass" /
    "inevitable failure."
- **Conclusion:** the asymmetry is a real *tendency* (structural reads are higher-leverage and seed the
  cascade), but "structural-miss = fatal" and "origin-miss = survivable" are both **contingent on wine
  difficulty**, not absolutes. Encode as a tendency with recoverability, not a hard cascade rule.

### B.4 Is the banker vs esoteric latitude real?
- **Esoterica get latitude: STRONGLY supported** (2017 Lagrein, 2023 South Africa, 2025 Cornas/Xinomavro/
  Zweigelt — verbatim leeway language).
- **Bankers get NO latitude: INFERRED, not stated.** Supported indirectly by "had to be in Tuscany" (2022),
  "really needed to be correct" on **constrained option sets** (2024), and classic-wine misses being near-fatal
  (2018). But: (i) no examiner states it as graded policy; (ii) the strongest "strict" quotes describe a
  *narrow given option set*, a distinct mechanism. Per Principle 3, the banker half is candidate-folklore-adjacent
  inference.
- **Conclusion:** "latitude scales with difficulty" is **PLAUSIBLE and directionally right**; the specific
  "bankers earn zero latitude" is an inference to encode softly, and the constrained-option mechanism should be
  kept separate.

### B.5 Audit B verdict
The **headline ("reasoning > ID is conditional") is VERY STRONG and should be adopted as written.** The two
sub-claims are weaker: the **asymmetry is a tendency with counterexamples** (soften "fatal"), and the
**banker-latitude split is plausible but partly inferred**. The rec is correct in spirit; its absolute wording
("cascades fatally," "bankers get no latitude") over-reaches the evidence.

---

## Audit C — Integrated Multi-Factor Synthesis

| Test | Finding |
|---|---|
| **Frequency** | 3 practical questions: 2022 P2Q1 (blend), 2024 P2Q3c (climate→style→quality), 2025 P1Q4 (human-vs-nature). |
| **Recency** | 2 of 3 in the last two sittings; the 2024/2025 ones were each flagged "not seen before." |
| **Growth trajectory** | **Cannot be measured from n=3.** Three differently-framed questions over four sittings. One (2024 P2Q3c) double-counts with the climate signal (T1-6). |

**Emerging objective or recent cluster?** **A genuine emerging *family*, not a measurable trend.** The strongest
support is *meta* (the examiners explicitly engineer novel formats to defeat rote — 2024 Chief), which makes
"expect *some* novel-synthesis question most years" a sound directional prediction. But "fastest-rising
objective" / "the clearest growth area" are **superlatives a 3-point series cannot support**, and the
double-count with climate inflates both. **Adopt the archetype; downgrade the growth-rate language to "a
recurring novel-synthesis family — prepare the method."**

---

## Audit D — Climate-As-Driver *(attempt to disprove)*

| Test | Finding |
|---|---|
| **Appears repeatedly?** | In the **practical**: exactly **twice** (2024 P2Q3c, 2025 P2Q1c) — but **verbatim identical**, verified in `data/exams.json`. In **theory**: a standing heavy theme every year. |
| **Central or incidental?** | Central in those 2 practical questions (15 marks/wine each); otherwise a passing phrase in the practical. Pre-2017 the practical's climate language was incidental/procedural (evolution §1.7). |
| **Adaptation emerging?** | **No direct attestation.** Climate-change *adaptation* as a graded stem is "logically implied… but not yet directly attested" (future M7). |
| **Deserves permanent EK status?** | The recurrence is real and cross-syllabus, but basing *permanence* on n=2 practical is the trend-as-permanent-rule trap. |

**Skeptical verdict:** the attempt to disprove **fails for the narrow, true claim** ("climate-as-driver is a
recurring, verbatim-repeated examinable framing") — that survived verification and is **STRONG**. The attempt
**succeeds against the inflated claim** ("the strongest forward signal in 14 years" / "standing furniture" /
"climate-change adaptation is examinable"): those are **WEAK/SPECULATIVE**. **EK status: yes, as a recurring
driver with an explicit falsification test (3 absences) — not as an unconditional permanent rule, and not the
adaptation extension.**

---

## Audit E — Distinction Candidate Behaviour

Which behaviours are **repeatedly** rewarded vs **occasional**?

| Behaviour | Evidence base | Frequency verdict |
|---|---|---|
| **Independent / critical thinking over rote** | 2017 theory, 2018, 2022 (Blanning), 2023, **2024 Chief headline** | **Repeatedly rewarded — VERY STRONG** |
| **Avoidance of templates / cut-and-paste** | 2017, 2023 (verbatim), 2024 | **Repeatedly rewarded — STRONG** |
| **"Under the skin" / second-order insight** | 2017 (beyond oak), 2022 (verbatim "under the skin"), 2025 (Tokaji) | **Repeated — STRONG** |
| **Reconcile conflicting evidence (the *specific* named move)** | 2025 Tokaji-Szamorodni — **one** named instance | **Occasional / single exemplar** — adopt as illustration, not frequency |
| **Confidence calibration — *funnel when uncertain*** | Every report 2017–2025 | **Repeatedly rewarded — STRONG** |
| **Confidence calibration — *commit when certain / don't over-funnel*** | Coaching blogs only (Gayán/Skelton); **no examiner report** | **Candidate folklore — PLAUSIBLE/WEAK** |
| **Full-scale, within-classification, origin-blind quality + volunteer the tier** | 2018, 2023, 2024, 2025 | **Repeatedly rewarded — STRONG** |

**Verdict:** the distinction model's *spine* (independent thinking, anti-template, second-order insight,
funnel-when-uncertain, full-scale origin-blind quality) is **repeatedly and explicitly rewarded**. The two
weakest threads are (1) **"reconcile conflicting evidence" as a frequent move** — it is one (excellent)
exemplar, not a pattern, and (2) **"commit when certain / over-hedging is a fault"** — coaching-sourced, not
examiner-doctrine (Principle 3). Adopt the spine; treat those two as illustrative/plausible, not load-bearing.

---

## Audit F — Future Prediction Reliability

| Future claim | Classification | Note |
|---|---|---|
| Structural reading remains foundational (H3) | **High-confidence** | Universal across reports; rises as styles converge. |
| Reasoning>ID conditional; ID stays ~40% (H4) | **High-confidence** | Best-evidenced correction in the corpus. |
| Anti-template re-wording continues (H7) | **High-confidence** | Stated by the Chief; structurally corroborated. |
| 25/wine + structural invariants persist (H9) | **High-confidence** | Verified across all 14 years. |
| No consistently weakest paper / P2 modern decider (H8) | **High-confidence — with an unresolved tension** | Hard pass counts support it, but it *contradicts* the confidence model's "P3 is the arithmetic decider." Both are partly right (lowest-scoring ≠ average-dragging); the live EK-0005 "usual decider" needs the nuance, not deletion. |
| Climate persists/spreads (H2) | **Medium–High** | Verbatim 2× verified, but n=2 same-type; cross-syllabus support lifts it. |
| Integrated synthesis recurs ~annually (H1) | **Medium** | n=3, differently framed; "fastest-rising" is overclaimed (Audit C). |
| Quality frame goes GLOBAL (H5) | **Medium** | "wine globally" is **n=1** (2025). |
| Commercial = lowest weight ~9% (M1) | **Medium → really single-point** | 9% is **one year** (2022); 2024 bundled commercial into a 42% block, so it is not re-confirmed. |
| Sub-region precision rises (M5) | **Medium–High** | Verbatim "just Mosel" + "N/S Rhône zero." |
| Producer verticals grow (M4) | **Medium** | Selection-device observation; reasonable. |
| ID-light/zero-ID continues (M3) | **Medium** | n=2 zero-ID; rotation caveat applies. |
| Climate-change *adaptation* as own stem (M7) | **Speculation** | "Not yet attested" — self-flagged. |
| Low/no-alcohol, sustainability, vessel/closure (L1–L3/EK-FP-5) | **Speculation** | Corpus-absent; correctly quarantined as watch-list. |
| Orange/skin-contact will NOT surge (anti-forecast) | **Medium (counter-signal)** | Argument from absence; directionally sound but absence ≠ proof. |
| Positional priors will keep breaking (L4) | **Low/Speculation** | 2025 sparkling-opener break verified; extrapolation otherwise. |

**Reliability verdict:** `future_exam_prediction.md` is **unusually disciplined** — it attaches falsification
tests, flags single-data-points, and reports inter-doc disagreements honestly. Its **genuinely
trend-supported** predictions are H3/H4/H7/H8/H9 (and H2 at the directional level). Its **extrapolations**
(climate-adaptation, the watch-list) are correctly labelled. Its **overclaims** are the *superlatives* that
leaked from the source docs — "fastest-rising objective," "strongest forward signal in 14 years," and the
single-point figures (9% commercial, "wine globally") presented with more weight than one data point warrants.

---

# PART III — FINAL DELIVERABLE

## Executive Summary

### Top 10 findings that SURVIVED scrutiny
1. **The live pass-standard constant is factually wrong** ("65% per paper"); the real rule is **65% average +
   ~50% floor** (public Student Guide). *(T1-1, Audit A — VERY STRONG.)*
2. **"Reasoning > ID" is conditional on plausibility** — verbatim across all six practical reports; the
   *conditional* form is better-evidenced than the live unconditional EK-0007. *(T1-2a, Audit B.)*
3. **The climate stem repeated word-for-word 2024 P2Q3c → 2025 P2Q1c** — verified in source. *(T1-6, Audit D.)*
4. **Anti-rote / anti-cut-and-paste is load-bearing examiner doctrine** — verbatim 2017/2023/2024 + 2024 Chief.
   A template-shipping study app trains the named failure. *(T1-4.)*
5. **The EK-0104…0108 collision is real and already partly baked into the live doc**, making the roadmap's own
   citations stale. *(T1-5 — VERY STRONG, mechanically verified.)*
6. **Structural reading is the foundation and rising** — 2025 #1 failure theme, verbatim. *(Audit B/F.)*
7. **No consistently weakest paper; P3 is often the *strongest*** — hard pass counts 2017/2022/2023/2024/2025
   contradict the live EK-0005 "usual decider." *(Audit F.)*
8. **Quality is judged full-scale, within-classification, origin-blind, with the official tier volunteered** —
   multi-year. *(T2-7, Audit E.)*
9. **One-fact / bare-macro-region origin calls are penalised** — verbatim "just Mosel," "N/S Rhône → zero."
   *(T2-6.)*
10. **Mark allocation rotates** — "you never know where the weighting will be" (2023, verbatim) + 4-year splits.
    *(T2-2.)*

### Top 10 findings that WEAKENED substantially
1. **"Fastest-rising objective" (integrated synthesis)** — n=3, differently framed, double-counted with climate.
2. **"Strongest forward signal in 14 years" (climate)** — true *verbatim repeat*, but n=2 of one question type.
3. **"Structural-miss is FATAL"** — contradicted by 2023 P3Q3 (structural misread survived).
4. **"Bankers get NO latitude"** — never stated as policy; inferred and conflated with the constrained-option
   mechanism.
5. **"Climate-change adaptation is examinable"** — not attested; pure extrapolation.
6. **Grade bands A≥70 / B 65–69** — sourced only to the unreadable 2021 appendix; only C+ = 60–64 is verified.
7. **"sub-45% does not recover" (EK-0093)** — mis-stated as per-paper; it is an *average*, softened by SPR.
8. **Commercial = 9% lowest weight** — a *single* data point (2022); not re-confirmed in 2024.
9. **Quality frame "global"** — a *single* data point (2025 "wine globally").
10. **"Commit when certain / over-funnelling is a fault" (EK-NEW-B)** — coaching-blog-sourced, not examiner
    doctrine.

### Top 10 findings that SHOULD CHANGE THE SYSTEM IMMEDIATELY (safe, high-value)
1. **T1-5** — reconcile the EK-0104+ collision *first* (prerequisite for all EK-citing edits).
2. **T1-1 headline** — fix the 65%-average + floor constant in `marking-principles.ts` and EK-0093.
3. **T1-4** — forbid templated phrasing in model answers; conditionally demonstrate the reconcile move.
4. **T1-2a** — make "reasoning > ID" conditional on plausibility (qualify EK-0007).
5. **T2-7** — model-answer quality discipline (full-scale, within-class, origin-blind, volunteer tier).
6. **T2-6** — penalise one-fact / bare-macro-region calls; demand sub-region + ≥2 evidence strands.
7. **EK-0005 revision** — drop "usual decider," add the lowest-scoring-vs-average-dragging nuance.
8. **EK-0006 reframe** — "stable de-emphasis + rotation," strip the false-precision decimals.
9. **EK-0096…0102 scope label** — composition parameters, not assessment objectives.
10. **T3-6** — soften positional priors (2025 broke the sparkling opener — verified).

### Top 10 findings that should NOT be implemented (as currently framed)
1. **"Structural-miss → fatal cascade" as a hard grader rule** (T1-2b) — would over-penalise the 2023 P3Q3 case.
2. **"Bankers get zero latitude" as graded policy** (T1-2c) — inference, not doctrine.
3. **Climate-change *adaptation* as a model-answer mandate** (T1-6) — unattested.
4. **The "fastest-rising objective" framing for synthesis** (T1-3) — superlative on n=3.
5. **The "strongest forward signal in 14 years" framing for climate** (T1-6) — superlative on n=2.
6. **Asserting A≥70 / B 65–69 cut-points as verified** (T1-1) — unreadable source.
7. **Generating around low/no-alcohol, sustainability, vessel/closure** (EK-FP-5) — corpus-absent.
8. **"Commit when certain" funnelling nuance as examiner doctrine** (T3-3) — coaching-sourced.
9. **Treating commercial's 9% as a stable target** — single data point; treat as illustrative.
10. **Making ID-free questions anything more than rare** (T2-3) — n=2; do not normalise.

---

## Revised Priority Ranking

**Priority Score = (Expected Impact × Evidence Strength × Confidence) ÷ Implementation Risk.**
Scales: Impact 1–5; Evidence (VERY STRONG 5 / STRONG 4 / MODERATE 3 / WEAK 2 / SPECULATIVE 1); Confidence 0–1;
Risk (Low 1 / Medium 2 / High 3). *Caveat: the formula divides by **risk**, not **effort** — so a safe-but-slow
item (e.g. T3-5) scores high despite large effort; effort is noted separately where it matters.*

| Rank | Rec | Impact | Evid | Conf | Risk | **Score** | Note |
|---|---|---|---|---|---|---|---|
| 1 | **T1-5** EK collision reconcile | 5 | 5 | 0.98 | 1 | **24.5** | Prerequisite; mechanically verified. |
| 2 | **T1-1** pass-standard fix (headline) | 4 | 5 | 0.95 | 1 | **19.0** | Correctness; framing-only caveat. |
| 3 | **T1-4** fresh reasoning + reconcile | 5 | 4 | 0.90 | 1 | **18.0** | Protects product validity. |
| 4 | **T3-5** Era-1 structured tagging | 3 | 5 | 0.90 | 1 | **13.5** | Low risk, **HIGH effort**; unblocks trend claims. |
| 5 | **T2-7** model-answer quality discipline | 3 | 4 | 0.82 | 1 | **9.84** | Strong multi-year evidence, low risk. |
| 6 | **T1-2** reasoning conditional (bundle) | 5 | 4 | 0.80 | 2 | **8.0** | Adopt (a); soften (b)/(c). |
| 7 | **T2-2** mark allocation rotating | 4 | 4 | 0.85 | 2 | **6.8** | Verbatim 2023 anchor. |
| 8 | **T3-6** soften positional priors | 2 | 4 | 0.85 | 1 | **6.8** | 2025 break verified. |
| 9 | **T1-3** synthesis archetype | 4 | 4 | 0.80 | 2 | **6.4** | Adopt; drop "fastest-rising." |
| 10 | **T1-6** climate-as-driver | 4 | 4 | 0.78 | 2 | **6.24** | Adopt; drop superlative + adaptation. |
| 11 | **T3-4** feedback prompt rotation/global | 2 | 4 | 0.75 | 1 | **6.0** | Rides T1-5/T2-1/T2-2. |
| 12 | **T2-4** commercial dual-pole + low-weight | 3 | 3 | 0.65 | 1 | **5.85** | Dual-pole strong; 9% single-point. |
| 13 | **T2-6** sub-region precision | 3 | 4 | 0.80 | 2 | **4.8** | Verbatim penalties. |
| 14 | **T3-2** distinction=consistency (bands/UI) | 2 | 4 | 0.60 | 1 | **4.8** | Mostly framing; per-question-inexpressible. |
| 15 | **T2-5** demote orange/skin-contact | 2 | 3 | 0.60 | 1 | **3.6** | Argument from absence. |
| 16 | **T2-1** quality-frame global | 3 | 3 | 0.70 | 2 | **3.15** | "wine globally" is n=1. |
| 17 | **T3-1** producer verticals | 2 | 3 | 0.60 | 2 | **1.8** | Selection device; medium effort. |
| 18 | **T2-3** ID-light / zero-ID | 2 | 3 | 0.60 | 2 | **1.8** | n=2; keep rare. |
| 19 | **T3-3** funnelling "commit when certain" | 2 | 2 | 0.45 | 2 | **0.9** | Coaching-sourced. |

**Headline re-ranking effect of the audit:** the low-risk *correctness* items (T1-5, T1-1, T1-4) and the
*research-integrity* item (T3-5) rise to the top; the attractive but higher-risk, smaller-n *feature additions*
(T1-2 bundle, T1-3, T1-6) fall below them. This is the intended adversarial outcome — truth and safety over
novelty.

---

## Safe-To-Implement Changes (adopt now)
- **T1-5** — reconcile EK-0104…0108 collision + scope-label EK-0096…0102. *(Do first.)*
- **T1-1 headline** — 65% average + ~50% floor in `marking-principles.ts` and EK-0093 (framing fix; hedge the
  A/B band numbers).
- **T1-4** — anti-template instruction + conditional reconcile move in `model-answer-prompt.ts`.
- **T2-7** — model-answer quality discipline (full-scale, within-class, origin-blind, volunteer tier).
- **T1-2a** — qualify EK-0007: reasoning rescues only a *plausible* call.
- **T2-6** — penalise one-fact / bare-macro-region origin calls; demand sub-region + ≥2 strands.
- **T3-6** — recast positional priors as tendencies.
- **EK revisions:** EK-0005 ("usual decider" → nuance), EK-0006 (rotation, drop decimals), EK-0096…0102 (scope
  label).

## Changes Requiring Further Research (keep as hypotheses)
- **T1-2b** structural-miss-fatal asymmetry — research the recoverability boundary (2023 P3Q3) before
  hard-coding any cascade rule.
- **T1-2c / EK-0107(distinction)** banker-zero-latitude — needs an explicit graded-policy statement, not
  inference; separate it from the constrained-option mechanism.
- **T1-3 "fastest-rising" / T1-6 "strongest signal" / climate-adaptation** — adopt the *features*, hold the
  *superlatives and the adaptation content* until more sittings (the docs' own falsification tests apply).
- **T2-1 global frame** and **T2-4 9% commercial** — single data points; re-confirm before treating as targets.
- **T3-5** — Era-1 (2011–2014) structured tagging is the precondition for *any* "14-year trend" claim; until
  done, all such claims (including several "High-confidence" ones) inherit a hidden caveat.
- **A≥70 / B 65–69 cut-points** — source from a readable public IMW document before asserting.

---

## EK Revision Recommendations — three buckets

### SUPPORTED (strong primary/public evidence — merge as live)
- Pass standard = 65% average + ~50% floor, criterion-referenced *(corrects EK-0093)*.
- "Reasoning > ID" is **conditional on plausibility** *(qualifies EK-0007)*.
- Integrated multi-factor synthesis is a **recurring novel-question family** (without the "fastest-rising"
  superlative).
- Climate is a **recurring examinable driver** (verbatim 2024→2025), **with the 3-absence falsification test**
  *(live EK-0105 — keep the hedge)*.
- Wine-is-vehicle / competency-is-target, except the P3 production canon.
- Independent critical thinking over rote / no cut-and-paste — the study-system caution.
- Mark allocation **rotates** *(reframes EK-0006; strip decimals)*.
- **No consistently weakest paper; P3 often strongest** *(corrects EK-0005's "usual decider"; keep the
  arithmetic-decider nuance from the confidence model — they reconcile via lowest-scoring ≠ average-dragging)*.
- Quality is full-scale, within-classification, origin-blind, volunteer-the-tier *(extends EK-0008)*.
- One-fact / vague-macro-region origin calls are penalised.
- Maturity = quantified + both trajectories (the 3-vs-4-element count is secondary) *(refines EK-0011)*.
- Commercial requires opportunities **and** challenges *(extends EK-0012)*.
- "Theory exam with a tasting" / theory decides borderline — verbatim 2024 *(supports EK-0006/EK-0093)*.
- EK-0096…0102 scope label (composition parameters, not objectives); EK-0035/0096/0025 positional priors are
  tendencies *(2025 break verified)*.

### PLAUSIBLE (directional / single-point / inferred — merge with an explicit hedge)
- Latitude scales with difficulty — **esoterica generous** (strong), **bankers strict** (inferred)
  *(refines EK-0090)*.
- Structural/origin **asymmetry as a tendency** *(with the 2023 P3Q3 recoverability counterexample)*.
- Quality context can be **global** — n=1 (2025).
- Commercial is the lowest-weighted competency (~9%) — n=1 (2022).
- Distinction = consistency, not peak — strong claim, per-question-inexpressible *(carry the caveat)*.
- The reconcile-conflicting-evidence move — adopt as the named *exemplar*, not a frequency.
- Vintage/maturity presumes a vintage-legible origin — n=1 (2018).
- ID weighting volatile ~40% *(refines the "de-emphasized trend" of EK-0006)*.
- Vintage ID *declined* *(revise EK-0078 — rests on manually-summed Era-1 tariffs)*.
- A≥70 / B 65–69 grade bands — C+ verified, A/B pending a readable source.
- Single howler tips borderline → FAIL — corpus-supported, publicly unverified; keep as a strong *tendency*,
  not an iron law.
- Examiner-report provenance note (member-gated; public IMW overrides corpus) — *process, effectively SUPPORTED*.

### UNPROVEN (speculation / extrapolation / coaching-only — do NOT merge as fact; route to EK §9 open questions)
- Climate-change **adaptation** as its own examinable competency (picking dates/canopy/variety) — not attested.
- "Commit when certain / over-funnelling is a fault" (EK-NEW-B) — coaching blogs only.
- Communication-as-transmission-channel / **legibility** (EK-NEW-C) — real-exam only, not app-testable; the
  framing is inferred.
- Low/no-alcohol, sustainability/packaging, vessel/closure (EK-FP-5 watch-list) — corpus-absent.
- The **superlatives**: "fastest-rising objective," "strongest forward signal in 14 years" — overclaims on
  small-n.
- "**Most-penalised** failure mode" (EK-0091 superlative) — overfit ranking; misread is the upstream trigger.
- Reading the per-paper composition decimals (EK-0023, EK-0098, EK-0099…0102) as **assessment objectives** —
  mis-filed; they are last-10 generation parameters (scope-label, do not treat as intent).

---

## Coda — honest uncertainty map (carried forward, not resolved away)
- **P2 vs P3 as "the decider"** — objectives says P2 (lowest-scoring recently); confidence model says P3
  (arithmetic average-dragger). **Both are right at different levels;** EK-0005 should encode the distinction,
  not pick a side.
- **The whole corpus rests on member-gated reports** for everything except the public pass standard. Treat
  year/paper attributions as corpus claims; let public IMW docs win on hard facts.
- **Era-1 (2011–2014) is quantitatively uncharacterised** — until T3-5 is done, every "14-year trend" inherits
  a caveat, including some predictions this audit rated "High."

**Net outcome:** of the six Tier-1 recommendations, **two are adopt-immediately as written (T1-4, T1-5)**, **one
adopt-immediately with a hedged sub-claim (T1-1)**, and **three adopt-with-modification after stripping
over-claims (T1-2, T1-3, T1-6)**. Roughly **40–50% of the roadmap's *claims* (mostly superlatives,
single-data-point figures, and absolute wordings) were weakened or rejected**, while their *underlying
features* mostly survived — a successful hostile audit by the mandate's own success criterion.

---

*Produced 2026-05-31 by the MW Evidence Audit Team. Primary evidence: examiner-report PDFs (Practical 2017,
2018, 2022, 2023, 2024, 2025; Chief 2022–2025; 2017/2018 theory), verbatim-extracted and labelled
SUPPORTS/CONTRADICTS; the climate claim verified directly against `data/exams.json`; the EK collision verified
against the live `mw_exam_empirical_knowledge.md`. No code, prompts, validators, or the EK doc were modified —
all recommendations are proposals for user review.*
