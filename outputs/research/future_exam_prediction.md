# Future Exam Prediction — MW Practical Assessment Priorities, 2026–2030

> **Mandate.** Predict the IMW practical exam's *assessment priorities* over the next ~5 years — not
> specific wines. What competencies will be tested, what misconceptions targeted, which question styles
> rise and fall, which wine-selection principles persist and which evolve.
>
> **Adversarial stance (binding).** A finding that *disproves* a current `mw_exam_empirical_knowledge.md`
> (EK) entry is treated as more valuable than one that confirms it. Predictions are graded by the strength
> and *convergence* of the evidence, and every confidence tier is hedged against its own failure mode.
>
> **Inputs read in full:** `outputs/research/evolution_analysis.md` (14-year era analysis, direct
> `data/exams.json` read), `outputs/research/examiner_objectives.md` (153-question objective clustering +
> primary-source mark splits), `outputs/research/distinction_candidate_analysis.md` (top-band behaviour
> model), `outputs/research/examiner_confidence_model.md` (latent-trust grading model), `mw_exam_empirical_knowledge.md`
> (EK-0001…EK-0103), and `outputs/heuristics/` (examiner_report_synthesis, examiner_patterns,
> curveball_analysis). Examiner reports themselves are the upstream primary source for all four research
> files (Practical 2017/2018/2022/2023/2024/2025; Chief 2021/2022/2023/2024/2025).
>
> **Author:** Future Exam Prediction Team pass, 2026-05-31.

---

## 0 · Method and the three load-bearing cautions

This forecast is built by triangulating *four independent adversarial reads* of the same primary corpus.
Where all four converge, confidence is High. Where they diverge, that divergence is itself reported as the
finding. Three cautions bound everything below — and each is itself a prediction-relevant correction to EK:

1. **The mark allocation ROTATES; it does not trend monotonically.** The single most important methodological
   correction. The primary-source per-competency splits are ID 46% (2022) → 39% (2023) → 39% (2024); quality
   24% → 37% → 19% → 20%+ (2025). The 2023 chair states it outright: *"you never know where the weighting
   will be."* (`examiner_objectives.md` §2, §7-A2; `distinction_candidate_analysis.md` §5.2.) So "the exam is
   shifting away from ID" is true *only* against the pre-2014 baseline (ID composite 59.7% → ~46%, EK-0098);
   *within* the modern era it plateaued and the analytical pool's internal split is a rotating sample, not a
   trend line. **Prediction implication:** do not forecast any single competency's mark-share to keep climbing
   linearly. Forecast the *rotation set* — which competencies are eligible to spike in a given year — not a
   slope.

2. **The exam recombines a small, fixed competency set across an ever-changing wine set and ever-changing
   phrasing.** (`examiner_objectives.md` §0, §5.) The wine is a *vehicle*; the competency is the target — with
   one fused exception, the P3 production-method canon. This means the most reliable predictions are about
   *competencies and question framings*, and the least reliable are about specific wines or regions. We lean
   into the former.

3. **The corpus's quantitative backbone (EK-0096…EK-0102) is "last-10" (2015–2025) and blind to 2011–2014.**
   (`evolution_analysis.md` §0.) Any 14-year trend claim that rests only on those entries is structurally
   unsafe. Where this report asserts an evolution, it is grounded in the era analysis that read all 14 years
   directly, not in the last-10 distribution entries.

---

# High Confidence Predictions

> Supported by *convergent* evidence across ≥3 of the four research reads, or by a repeated structural signal
> in the corpus itself. These are the predictions to build training and generation around.

### H1 · Integrated multi-factor synthesis questions will become standing furniture (the fastest-growing competency)
**What:** Questions that ask the candidate to *synthesise* climate, winemaking, terroir, and style into one
argument, or apportion a wine's character between human and natural inputs, or reason about *why* a wine is/
isn't blended. Examples: 2022 P2Q1 "purpose of blending / reasons for not blending"; 2024 P2Q3c "how climate
and winemaking techniques have influenced the quality and style" (*"not a format seen in previous exams… the
worst answered question on the paper"*); 2025 P1Q4 "the relative importance of human inputs vs natural factors"
(*"a form of question that had not been used before,"* ~15% of the paper).
**Why High:** All four reads independently flag this as the clearest growth area (`examiner_objectives.md`
Obj-9 "rising fast"; `evolution_analysis.md` "Future Direction → most likely"; `distinction_candidate_analysis.md`
§1.7 the named gold-standard reasoning move; it is the operational form of the confidence model's "coherent
argument > correct answer"). It is the examiners' *explicit, stated* weapon against rote/template/AI answers
(2024 Chief: critical-thinking erosion). Three consecutive sittings (2022, 2024, 2025) each introduced a new
member of this family. **Expect ~one novel synthesis question per year**, usually P1 Q4 or a P2/P3 anchor.
**Falsification watch:** if 2026–2027 contain *no* integrative/abstract stem, this downgrades — but two
consecutive misses would be needed to break it.

### H2 · Climate as a named, examinable quality/style driver will persist and spread
**What:** "How climate and winemaking techniques have influenced the quality and style of the wine" appeared
**verbatim in both 2024 (P2Q3) and 2025 (P2Q1)** — the only stem repeated two years running in 14 years of
corpus. (`evolution_analysis.md` proposed EK-0105; "the strongest forward signal in the corpus.")
**Why High:** A two-year identical repeat is the strongest forward indicator the data contains, and it rides a
real-world wave (climate change is now central to the MW theory syllabus and trade discourse). It also serves
H1 — climate is the most natural axis for a multi-factor synthesis.
**Prediction:** climate-driver framing recurs in P1/P2 most years; model answers must reason cool-vs-warm
expression, vintage conditions, and *climate-change adaptation* (earlier picking, site selection, canopy/
irrigation, variety choice), not just cellar winemaking. **Falsification watch:** a single year's absence is
expected noise; three consecutive absences would falsify.

### H3 · Accurate structural reading (alcohol/acidity/tannin/RS) will remain THE foundation — and rise in explicit emphasis
**What:** Correctly reading measurable structure *before* deducing identity. In 2025 this was named the **#1
failure theme**: *"an inability to read the wine accurately… alcohol, acidity, tannin and residual sugar"*;
*"hard evidence like alcohol and sugar are often more reliable than the flavour profile."*
**Why High:** Universal across every report 2017–2025, ranked #1 for pass/fail decisiveness
(`examiner_objectives.md` Obj-1), the *seed of the fatal cascade* (`examiner_confidence_model.md` §5A), and —
crucially — **its importance grows as global styles converge.** When New/Old World aromatic profiles blur,
structure is the last reliable discriminator. This is a rare case where a competency is both foundational and
*rising*.
**Prediction:** expect continued explicit weighting on structural accuracy, more "state the RS/ABV" 2-mark
anchors (EK-0018), and continued penalisation of nose-led identity-forcing.

### H4 · "Reasoning > identification" persists — but conditionally, and ID stays ~40% and necessary
**What:** Well-argued wrong answers continue to score (2025: *"over half did not get a single origin exactly
right, however many still managed 5–6/8 if their reasoning was sound"*). BUT: (a) only *plausible,
structure-grounded* reasoning rescues a wrong call — an implausible wrong call earns little (2025 Rhône flight),
and a wrong *structural* read cascades fatally; (b) for **bankers / paramount classic regions there is little
or no latitude** — only the correct call earns full ID marks (2022 "had to be in Tuscany"; 2024 "really needed
to be correct" on constrained options); (c) ID remains **~40% of marks and the single largest category**.
**Why High:** This is the point of sharpest *convergence and correction* across the reads: `examiner_objectives.md`
(A3, Obj-11/12), `distinction_candidate_analysis.md` (§5.2, §5.3), and `examiner_confidence_model.md` (§1.1)
all independently qualify the unconditional "reasoning > ID" of EK-0007. **Prediction:** the reasoning-credit
regime is stable; the misconception it will keep targeting is "ID is being phased out, so I can under-invest"
(see M-Misconceptions). Graders/generators must scale partial credit by wine difficulty: generous on the
curveball, strict on the banker.

### H5 · Quality calibration widens from regional to GLOBAL and stays bidirectional + classification-aware
**What:** The quality frame moved region → classification → *world market*. 2025 P2Q3b: *"quality within the
context of wine globally… what other wines around the world they might be competing with"* (never asked before).
Calibration errors are penalised in **both** directions — over-calling (CdR→CdP, Ruby→Vintage Port, 2025) and
under-calling (Chilean Cab / Chambolle under-rated, 2018). Candidates must volunteer the official tier even
when unasked (2025).
**Why High:** Convergent across `examiner_objectives.md` (Obj-3, new global branch), `evolution_analysis.md`
(region→world philosophical shift), and `distinction_candidate_analysis.md` (§4.2 full-scale, within-class,
origin-blind). Quality was >20% of marks and a top-2 cause of failure in 2025.
**Prediction:** the "global context" frame recurs, especially for esoteric wines with no meaningful local peer
set. The misconception targeted: assessing quality "in a vacuum" or reflexively applying an Old-World halo /
New-World penalty.

### H6 · The production-method canon stays non-negotiable and non-substitutable (the fused exception)
**What:** For ~85% of questions the wine is an interchangeable vehicle, but the **P3 production-method cluster
is the hard exception** — you must know *how that specific wine is made* (Champagne, Sherry, Madeira, Port,
Sauternes/botrytis, Tokaji, VDN, passito/recioto). 2025: *"it is very hard, if not impossible, to pass the MW
exam without knowing how Madeira or Sherry is made."*
**Why High:** `examiner_objectives.md` §0 finding #1 + Cluster E (Q5 = "NO, the exception"); reinforced by every
report's howler list (theory impossibilities on fortified/sweet wines sink borderline papers). This is the most
*memorizable and least substitutable* part of the exam.
**Prediction:** P3 continues to demand mechanism-level "HOW" answers (how the sparkle/RS/fortification/oxidation
was achieved), and theory howlers on these styles continue to be the borderline killer. This is also why a weak
P3 remains the classic borderline-decider *arithmetically* (drags the 65% average / breaches the floor) — even
though P3 is NOT the consistently weakest-*scoring* paper (see H8).

### H7 · The exam will keep re-wording standard questions to defeat templates (anti-rote / anti-AI)
**What:** "Drinking window" = maturity in disguise (2024); "human vs nature" = winemaking inference re-framed
(2025); novel verbs and abstractions layered onto familiar competencies. The 2024 Chief named *"an over-reliance
on the… study programme… eroding students' ability to think for themselves; those who simply assimilate
information and repeat this in the exam room will not pass."* Cut-and-paste answers are explicitly penalised.
**Why High:** Stated directly by the Chief Examiner and corroborated by the corpus's escalating abstraction
(`distinction_candidate_analysis.md` §5.4 — flagged as a direct tension with template-driven study;
`examiner_objectives.md` Obj-9). **This is the single most important meta-trend for a study-app to internalise:**
the examiners are actively engineering *against* the exact preparation method this system represents.
**Prediction:** re-framings increase; the defensible preparation is **method over memorization**, and generated
model answers must reason freshly per glass, never read as recited templates.

### H8 · There is NO consistently weakest paper; Paper 2 is the modern decider (overturns a widely-repeated belief)
**What:** Documented paper outcomes: P3 was the **strongest** paper in 2017, 2023, and 2025; the weakest/
deciding paper was P1 (2022), P2 (2023), P3 (2024), **P2 (2025)**. P2's "bankers' paper, highest pass rate"
reputation held in 2017/2022 but **failed in 2023 and 2025**, when esoteric varieties (Xinomavro, Zweigelt)
and novel formats made it the hardest paper.
**Why High:** This is `examiner_objectives.md`'s #2 headline finding (§6, hard pass counts from the reports),
directly **contradicting EK-0005 / synthesis §5** ("P3 consistently weakest / the usual decider"). The
confidence model reconciles it: P3 is the *arithmetic* borderline-decider (weak P3 drags the average), not the
lowest-*scoring* paper. **Prediction:** the deciding paper rotates; recent P2 difficulty (driven by esoterica +
synthesis questions) is the live trend. Do not train candidates to "fear P3"; train them that the weak paper
rotates and recent P2s have been hardest.

### H9 · Structural invariants persist: 25 marks/wine, 3–4 questions/paper, Chardonnay-in-P1, Bordeaux-in-P2, sweet-flight mechanism diversity
**What & Why High:** These survived falsification in the era analysis across all 14 years. 25 marks/wine is
**invariant 2011–2025** (`evolution_analysis.md` Audit A, *correcting* EK-0001's pre-2013 boundary — the
correction *strengthens* the rule). Questions/paper settled at ~3.5 (3–4), after a 2016–17 fragmentation peak
(2017 P3 = 6, the corpus max, not repeated). Chardonnay appears in P1 **every single year** (14/14); Riesling
**12/14** (slightly *more* reliable than EK-0034's "8/10"). P2 carries a Bordeaux/Bordeaux-variety flight most
years. P3 sweet flights spread across sweetness-creation *mechanisms* (EK-0039/0080).
**Prediction:** all persist. These are the safest scaffolding for mock-exam generation.

---

# Medium Confidence Predictions

> Supported by 2 reads, or by a directional corpus signal with small-n or known volatility.

### M1 · Commercial framing keeps maturing ("opportunities AND challenges") but stays the LOWEST-weighted competency (~9%)
"Opportunities and challenges" (2024 P3 Q1/Q3) is becoming the default commercial verb (appeal → selling →
opportunities-and-challenges). But commercial was only **9% of marks in 2022** — a fact EK never flags
(`examiner_objectives.md` Obj-8, §8 EK-0111). **Prediction:** commercial questions get more strategically
worded and continue to punish rote "steakhouse"/food-pairing answers, but candidates should answer them crisply
and **not over-invest writing time**. Medium (not High) because the dual-pole verb is only two sittings old and
the 9% figure is a single data point.

### M2 · Generalist breadth / esoteric varieties rise — but from the *persistent* indigenous family, not orange wine
**What:** Greece (Xinomavro, Assyrtiko, Agiorgitiko), Austria (Blaufränkisch, Zweigelt), Hungary (Furmint),
Portugal (Touriga Nacional as a varietal, 2025), and emerging-region classics (Hawke's Bay Syrah) are deployed
to punish narrow expertise (*"Masters of Wine need to be generalists,"* 2018; 2025 esoterica emphasis).
**Why Medium + a sharp counter-signal:** breadth is rising (`examiner_objectives.md` Obj-13), BUT
`evolution_analysis.md` (proposed EK-0108) **disproves the tempting "orange/skin-contact wine will surge"
forecast** — skin-contact/qvevri peaked 2014–2019 (Rkatsiteli, Cullen Amber, Chinuri, Vecchio Samperi) and is
**absent 2021–2025**. Oxidative/flor styles (Jura, oxidative white Rioja, Sherry) persist; skin-contact does
not. **Prediction:** expect more rare-but-*established* indigenous varieties (those with a real production base
and benchmark presence — EK-0073); do **not** model orange wine as a future theme.

### M3 · ID-light and fully ID-free questions continue, concentrated in P3 and final questions
**What:** The ID-suppression → ID-free arc: 2017 P3Q2 "unknown origin" → 2019 P1Q3 "do not spend time on origin"
→ 2024 P3Q1 & 2025 P3Q3 with **zero ID marks**. (`evolution_analysis.md` proposed EK-0104.)
**Why Medium:** the arc is real and is the strongest *structural* proof of "theory exam with a tasting," but
0-ID questions are still rare (2 instances) and ID's overall share *rotates* (H4) rather than monotonically
falling. **Prediction:** a generator should be willing to emit questions with no variety/origin marks,
especially in P3 and final questions, but should not assume ID-free becomes the norm.

### M4 · Producer verticals/horizontals grow as a selection device
Reading "the same producer, change one variable" (vintage / site / élevage): Ducru ×3 vintages (2021),
same-producer Meursault/Corton (2022), Rieussec trio (2024). (`evolution_analysis.md` §1.3, Future Direction
"plausible".) **Prediction:** more verticals, especially in P1/P2 compare-and-contrast and maturity questions —
they isolate a single variable cleanly, which suits the synthesis/maturity competencies that are rising.

### M5 · Sub-region precision rises *where ID survives*
When ID is asked, the demand sharpens to sub-region: 2022 P2Q2/Q3 "identify the sub-region as closely as
possible" (Chianti Classico vs Brunello; Hautes-Côtes vs Clos Vougeot). Conversely, **one-fact origin calls and
vague macro-region drops are actively penalised** (2022 "too many just stated Mosel"; 2024 "Northern/Southern
Rhône" alone "will often yield a zero mark" — `examiner_objectives.md` proposed EK-0109). **Prediction:** the
bar for an origin call that scores is "≥2 independent evidence strands + funnel to a sub-region."

### M6 · "Distinction = consistency, not peak" hardens as the operative model for the top band
In some passing years (2022) **no candidate scored an A**; the A grade comes from no weak section across 12
wines × 3 days, not one virtuoso flight (`distinction_candidate_analysis.md` §0, §3). The single most
examiner-praised top-band move is **reconciling conflicting evidence** with a producer/site-level inference (the
2025 Tokaji-Szamorodni example). **Prediction:** the discriminator between pass and distinction stays
"completeness + calibration + one insightful reconciliation," not breadth of correct IDs.

### M7 · Climate-adaptation reasoning bleeds into winemaking and variety-choice questions
A second-order extension of H2: as climate is named explicitly, expect questions to reward reasoning about
*how producers are adapting* (picking dates, alcohol management, site/altitude, drought-tolerant or
later-ripening varieties, fresher styles). **Why Medium:** logically implied by H2 + the real-world syllabus
direction, but not yet directly attested as its own stem — an extrapolation, flagged as such.

---

# Low Confidence Predictions

> Single-read, weak-signal, or pure extrapolation. Useful as watch-items, not as a basis for training design.

### L1 · Low/no-alcohol and alcohol-reduction may enter as a winemaking-theory or commercial topic
Industry momentum (de-alc, lighter styles) is strong, and the exam tracks trade reality. **But the corpus shows
no instance**, and the practical is a *tasting* exam where a 0% wine is a poor blind-tasting object. More likely
to appear as a *commercial/theory* angle ("opportunities and challenges" for a lower-alcohol style) than as a
wine in the glass. Watch-item only.

### L2 · Sustainability / packaging / climate-mitigation as an explicit commercial sub-axis
Plausible given the trade and theory emphasis and the "opportunities and challenges" verb, but unattested in the
practical corpus. If it appears, expect it folded into commercial reasoning, not as a standalone.

### L3 · An "alternative format / closure / vessel" reasoning prompt (amphora, concrete, PET, can)
Vessel reasoning already appears implicitly (oak vs steel vs concrete in winemaking inference). A more explicit
"reason about the vessel/closure choice and its style/commercial consequence" stem is a plausible synthesis-
family extension (H1), but speculative.

### L4 · A second consecutive break of a positional prior
2025 already broke the "P3 opens sparkling" streak (Riesling variety flight). Positional priors ("curveball in
the last question," "P3 Q1 is sparkling") are *tendencies, not laws* (`evolution_analysis.md` §Structural-5;
EK-0096 already superseded the last-question prior). **Prediction (low):** expect at least one more positional
prior to break in 2026–2030; do not build position logic on any single slot rule.

### L5 · Mark-allocation volatility could widen further
If the examiners lean harder into anti-template re-wording (H7), the year-to-year mark rotation (Caution 1)
could become even less predictable. Low confidence, but it argues for training to a *distribution* of possible
weightings rather than a fixed target.

---

# What is likely to DECREASE

- **Pinpoint origin/variety ID as the scoring centre of gravity** — already a minority of marks; reasoning-
  credited and, in places, suppressed to zero. (Declines in *share*, never to *ignorable*.)
- **Standalone, paid vintage ID** — Era 1–2 paid 15–32 marks for vintage (2012, 2014, 2015, 2016); Era 3 folds
  it into "identify the vintage and suggest a drinking window" (2024). (`evolution_analysis.md` proposed
  EK-0078 revision — vintage *declined*, it is not statically rare.)
- **Highly fragmented papers** (the 2016–17 five/six-question paper) — consolidated to 3–4 larger, more
  analytical flights.
- **The lightly-contextualised "comment on the level of quality" line** — now always frame-anchored (region/
  classification/global).
- **Rote commercial tropes** (steakhouse, generic food pairing, "fine-dining / by-the-glass / affluent
  connoisseur" boilerplate) — explicitly less rewarded year on year.
- **Orange/skin-contact wine as a theme** — *receded* after 2019 (counter to intuition). Do not forecast a surge.

# What is likely to PERSIST (wine-selection principles)

- **Classic + challenging balance within each paper** ("for every challenging question, a correspondingly
  straightforward one," 2017); a **banker** in every 3–4-wine flight (EK-0029).
- **Mid-tier and commercial producers are normal** — constant across *all* eras (Wolf Blass 2011 → Yellow Tail
  2024; Tesco own-label 2014). The reflexive "they'd never put that in" is wrong (EK-0031).
- **The production-method canon** (Champagne/Sherry/Madeira/Port/Sauternes/Tokaji/VDN/passito) — fused,
  must-know, recurring (H6).
- **Sweet-flight mechanism diversity** (botrytis / passerillage / late-harvest / icewine / fortification-arrest
  / oxidative) as the organizing axis (EK-0039/0080).
- **Old-World skew, strongest in P3** (P3 ≈ 82% OW, never NW-majority; P1/P2 ~63–65% OW but each *can* go
  NW-majority — EK-0099 as corrected).
- **Chardonnay every year in P1; Bordeaux-variety flight most years in P2; fortified/sweet in P3 slots 10–12.**

# What is likely to EVOLVE (wine-selection principles)

- **More indigenous/esoteric *established* varieties** (Greece/Austria/Hungary/Portugal) to test generalist
  breadth — but from the persistent indigenous family, not orange wine (M2).
- **Climate-stressed / warm-vintage and climate-adapted expressions** chosen so the flight "lights up" a
  climate-driver argument (H2/M7).
- **Producer verticals/horizontals** as a routine P1/P2 device (M4).
- **The wine increasingly chosen to enable a *synthesis* argument** (a deliberate climate/human-input gradient
  across the flight, 2025 P1Q4) rather than to host an ID puzzle.
- **Quality flights chosen to invite a *global* comparison** for esoteric wines with no local peer set (H5).

---

# Misconceptions most likely to be TARGETED

These are the candidate errors the examiners are *designing questions to expose* — and will keep targeting:

1. **"ID is being phased out, so I can under-invest in it."** False — ID is still ~40% and the largest single
   category, necessary-but-not-sufficient (H4). The exam punishes both the snap-call *and* the candidate who
   neglects identification.
2. **Shoehorning / reverse-engineering structure to a guessed identity** — deciding the wine first, then forcing
   alcohol/acidity/tannin/RS or a tasting note to fit (named the cause of many 2025 P2 failures). The antidote
   the exam rewards: read structure first, let ID float.
3. **Quality in a vacuum, and origin-prestige bias in *both* directions** — un-contextualised "good"; the
   Old-World halo; the New-World penalty (Chilean Cab under-praised, 2018). Over-calling (CdR→CdP) dents
   confidence as much as under-calling.
4. **Template recall / cut-and-paste** — the same technique ("cold soak," "whole-bunch") on every wine; the
   answer to the question you *wished* was asked; "compare and contrast" rendered as two separate notes. The
   re-worded synthesis questions (H1/H7) exist precisely to expose this.
5. **Theory howlers on the production canon** — "Tawny aged in a solera," "Amontillado at 14.5%," "VDN at 20%,"
   "Sauternes fermented at 16 °C in stainless." A single impossibility tips a borderline script to fail.
6. **One-fact / vague-macro-region origin calls** — "just Mosel," "Northern Rhône" with no sub-region and one
   supporting fact: penalised even when not wrong, because they signal narrow knowledge (M5).
7. **Mistaking maturity for quality**, and failing to recognise re-framings ("drinking window" = maturity).
8. **Nose-over-structure** — reaching for identity from aromatics while ignoring the more diagnostic structure
   (named a P2 pitfall, 2025).

---

# Question styles likely to INCREASE vs DECREASE (summary table)

| Direction | Question style | Confidence | Lead evidence |
|---|---|---|---|
| ▲ Increase | Integrated synthesis (climate×winemaking×style; human-vs-nature; why-blend) | High | 2022/2024/2025; `examiner_objectives.md` Obj-9 |
| ▲ Increase | Climate-as-driver framing | High | 2024+2025 verbatim repeat |
| ▲ Increase | Global / classification-anchored quality calibration | High | 2025 P2Q3b "wine globally" |
| ▲ Increase | Re-worded / abstract / anti-template stems | High | 2024 Chief; "drinking window," "human vs nature" |
| ▲ Increase | Structural-reading emphasis ("state RS/ABV"; structure > nose) | High | 2025 #1 failure theme |
| ▲ Increase | Sub-region precision *where ID is asked* | Medium | 2022 P2Q2/Q3 |
| ▲ Increase | Producer verticals/horizontals | Medium | 2021/2022/2024 |
| ▲ Increase | Commercial "opportunities and challenges" (but low-weight) | Medium | 2024 P3Q1/Q3 |
| ▲ Increase | ID-light / ID-free flights (esp. P3, final Qs) | Medium | 2024 P3Q1, 2025 P3Q3 |
| ━ Persist | 25/wine; 3–4 Qs/paper; compare-and-contrast (cyclical) | High | all 14 years |
| ▼ Decrease | Pinpoint ID as the scoring centre | High (share) | EK-0098; ID-free arc |
| ▼ Decrease | Standalone paid vintage ID | Medium | Era 1–2 → "drinking window" |
| ▼ Decrease | Highly fragmented 5–6-question papers | High | 2017 peak, not repeated |
| ▼ Decrease | Rote commercial / food-pairing tropes | High | every report |
| ✗ Not a future theme | Orange/skin-contact wine | Medium (counter-signal) | absent 2021–2025 |

---

# Implications For Training Candidates

1. **Train method, not memorization.** The examiners are explicitly engineering against rote study (H7). The
   single highest-leverage skill is the **funnelling reasoning move** — read structure first, table 2–3
   plausible options with for/against, commit decisively — *plus* the distinction-level extension: **reconcile
   conflicting evidence with one insightful inference** (the Tokaji-Szamorodni move). Drill the *process* across
   unfamiliar wines, not answer keys for familiar ones.
2. **Structure before aroma, always.** Make accurate alcohol/acidity/tannin/RS calls the non-negotiable first
   step; a wrong structural read cascades fatally, whereas a wrong origin on a sound structural read is
   survivable. As styles converge, structure is the discriminator that still works.
3. **Do not under-invest in ID.** It is still ~40% and the largest category. But spend the marks where they are:
   for bankers, *be correct* (no latitude); for esoterica, *argue plausibly* (latitude exists). Always supply ≥2
   evidence strands and funnel to a sub-region — never drop a bare macro-region.
4. **Build a single global quality scale.** Practise placing any wine against its *world* competitive set and
   volunteering its official tier unprompted. Calibrate both ways: be effusive about greatness, unsentimental
   about flaws, and resist Old-World halo / New-World penalty.
5. **Prepare a climate-and-synthesis framework.** Have a reusable structure for "apportion this wine's character
   between climate, terroir, and human input," and for "how has climate (and its change) shaped quality and
   style." Expect ~one novel synthesis question per year and prepare the *scaffold*, not a script.
6. **Memorize the P3 production canon cold.** This is the one place the wine *is* the answer. Know *how* each
   fortified/sweet/sparkling style is made (and the plausible RS/ABV ranges) well enough that no howler is
   possible — howlers here are the borderline killer.
7. **Aim for consistency, not heroics.** No weak section across 12 wines × 3 days beats one brilliant flight.
   Read the mark tariff first, triage to the highest-mark sub-parts, answer *every* part, and keep depth
   proportional to marks. A blank or shallow section is the classic reason a C+ misses a B.
8. **Re-frame the paper-fear.** Don't fear P3 most; the weak paper rotates and **recent Paper 2s have been the
   hardest** (esoterica + novel formats). Protect the 65% *average* and clear the per-paper floor on every paper
   — a sub-floor P3 is fatal regardless of average.
9. **Commercial: crisp, not lengthy.** Channel + geography + opportunities *and* challenges + global competitive
   set, all tied to the glass — then move on. It is the smallest mark pool (~9%); do not over-write it.

# Implications For Question Generation

1. **Generate the synthesis family as first-class.** Build a question archetype for integrated multi-factor
   stems (climate×winemaking×style×quality; human-vs-nature; why/why-not-blend). Choose wine sets that form a
   deliberate *gradient* on the relevant axis (increasing human input, cool→warm climate) — the wines are
   wine-agnostic vehicles; the gradient is the point.
2. **Bake climate framing into P1/P2 quality/style questions** as a recurring (not every-question) option, with
   model answers that reason cool-vs-warm expression, vintage, and adaptation — not just cellar technique.
3. **Default quality sub-questions to a *frame* parameter:** region | official classification | global. Use the
   global frame for esoteric wines with no local peer set; require the answer to name the official tier when one
   exists.
4. **Emit ID-light and occasional 0-ID questions**, concentrated in P3 and final questions, paying only for
   quality/winemaking/style/commercial — and bias commercial to the dual-pole "opportunities and challenges"
   verb for 2021+-style questions.
5. **Make generated model answers reason freshly per glass.** This is a *correctness* requirement, not a style
   preference: the exam penalises cut-and-paste, and a study app that ships templated answers trains the exact
   failure the Chief Examiner named. Differentiate every wine; reconcile each wine's own structure; show one
   second-order inference where the evidence genuinely conflicts.
6. **Scale partial-credit and grader strictness by wine difficulty:** generous reasoning-credit on curveballs,
   strict on bankers (only-correct-scores). Encode the "structural-miss is fatal, origin-miss is survivable"
   asymmetry — do not cascade-penalise a sound answer merely for a wrong ID.
7. **Hold the structural invariants** (25/wine, 3–4 Qs/paper, Chardonnay-in-P1, Bordeaux-in-P2, sweet-flight
   mechanism diversity, P3 OW skew, fortified/sweet in slots 10–12) — but treat *positional* priors (sparkling
   opener, last-question curveball) as soft tendencies, not hard rules (2025 broke the sparkling opener).
8. **Treat the mark allocation as a rotating distribution, not a fixed target.** Vary the analytical split
   (quality vs winemaking vs commercial vs style) across a generated mock suite rather than locking one ratio —
   this mirrors the real "you never know where the weighting will be" and trains candidates to the variance.
9. **Source esoterica from the persistent indigenous family** (established Greek/Austrian/Hungarian/Portuguese
   varieties with a real production base) — *not* orange/skin-contact wine, which is not a current theme.

---

# Current EK entries LIKELY TO REMAIN VALID

> Survive the adversarial reads; safe to keep building on.

- **EK-0001** (25 marks/wine) — *after* the era-analysis revision (invariant 2011–2025; the "pre-2013 differed"
  boundary was contradicted and dropped — the correction *strengthens* the rule). Hard rule (EK-0041).
- **EK-0007 / EK-0086 / EK-0090** (reasoning > ID; plausibility-gradient credit) — valid **with the H4
  conditionals** (plausibility + structural-soundness; banker-vs-esoterica latitude split).
- **EK-0011** (four-part maturity) — valid; the real discriminator is *quantification + both trajectories*, not
  the bullet count (3 vs 4).
- **EK-0013** (structural evidence is the foundation) — valid and *rising* (H3).
- **EK-0014** (funnelling) — valid, with the calibration refinement (funnel when uncertain, commit when certain).
- **EK-0015 / EK-0091 / EK-0093 (howler/cascade mechanics)** — valid as grading temperament (with the EK-0093
  pass-standard correction already in flight, and the "most-penalised" superlative softened).
- **EK-0031** (mid-tier/commercial producers normal) — confirmed *constant across all eras*.
- **EK-0034** (Chardonnay in P1 every year; Riesling frequent) — confirmed; Riesling is **12/14**, stronger than
  stated.
- **EK-0038** (Bordeaux/Bordeaux-variety flight in P2 most years) — confirmed.
- **EK-0039 / EK-0080** (sweet-flight mechanism diversity) — confirmed.
- **EK-0002** (3–4 Qs/paper, fewer/larger) — confirmed; add 2017 P3 = 6 as the corpus max.
- **EK-0004** (the exam evolves; new types appear) — strongly confirmed; should be promoted/specialised into the
  synthesis-objective entry (see additions).

# Current EK entries LIKELY TO BECOME OUTDATED / NEED REVISION

> Flagged by ≥1 adversarial read as wrong, overfit, era-blind, or already broken.

- **EK-0005 "P3 is the most stylistically diverse and the usual decider" — the "decider" clause is CONTRADICTED.**
  No consistently weakest paper; P3 was *strongest* in 2017/2023/2025; **Paper 2 is the modern decider** (2023,
  2025). Keep "most stylistically diverse"; drop "usual decider / consistently weakest." (`examiner_objectives.md`
  §6; H8.)
- **EK-0035 "P3 Q1 was explicitly sparkling every time 2021–2024" — STALE/now false.** 2025 P3Q1 opened on a
  Riesling variety flight, breaking the streak. Recast as a tendency, not a lock. (`evolution_analysis.md` Audit.)
- **EK-0006 / EK-0098 "the exam is shifting AWAY from ID over time" framed as a *trend* — OVERSTATED.** True vs
  the pre-2014 baseline; within the modern era ID *plateaued* (~39–46%) and the analytical split *rotates*. Re-
  frame as "stable de-emphasis + unpredictable annual rotation." (`examiner_objectives.md` A2;
  `distinction_candidate_analysis.md` §5.2.)
- **EK-0008 "quality must always be classification/price-anchored; 'good' scores zero" — PARTLY OVERSTATED.**
  Quality can be judged "regardless of price or regionally designated position" (2022); mis-cited price *loses*
  marks (price is corroboration, not mandatory); the frame is now sometimes *global*; un-contextualised "good"
  earns *minimal*, not necessarily *zero*. (`examiner_objectives.md` A4.)
- **EK-0093 "65% per paper" — WRONG (already corrected, pending merge).** Real rule: **65% *average* across the
  three papers + a per-paper floor (~50%)**, criterion-referenced. This is the highest-severity factual fix.
  (`examiner_confidence_model.md` §7 row 1; memory `ek-0093-pass-standard-correction`.)
- **EK-0078 "vintage is statically rarely asked" — INCOMPLETE (era-blind).** Vintage *declined* (paid 15–32
  marks in Era 1–2); it is not a flat low-frequency fact. (`evolution_analysis.md` Audit B.)
- **EK-0023 curveball "6.2% / 17.9% / 75.9%" and EK-0098 per-paper splits to one decimal — FALSE PRECISION.**
  Subjective labels / rotating allocations reported to 3 sig figs; keep the direction, drop the decimals.
  (`examiner_objectives.md` C1/C3.)
- **EK-0099…EK-0102 (per-paper OW:NW, curveball budgets, price/age bands) — MIS-FILED if read as examiner
  intent.** They are *generation-tuning composition stats*, "last-10" and blind to 2011–2014. Tag clearly as
  composition parameters, not assessment objectives. (`examiner_objectives.md` C2; `evolution_analysis.md`
  proposed EK-0107.)
- **EK-0025 / EK-0096 (curveball position) — already superseded once; treat *all* positional priors as soft.**
  The "last-question curveball" prior is wrong; P3 end-loads; 2025 broke the sparkling opener. Positional logic
  is the most fragile thing in the EK.
- **EK-0046 (P1 sparkling/off-dry boundary) — minor revise.** Add the attested edge case: Moscato d'Asti (2019
  P1, 5.5% frizzante sweet). (`evolution_analysis.md` Audit C.)

---

# Draft Proposed EK Additions (forward-prediction layer)

> **Numbering caution (must resolve before merge).** Four research passes have *independently* drafted entries
> in the EK-0104…EK-0111 range with **colliding IDs and overlapping content** (e.g. EK-0104 is variously
> "ID-suppression arc," "wine-is-vehicle," and "distinction = consistency"; EK-0105 is variously "climate" and
> "integrated analysis"). **The user must reconcile these into a single consecutive block before merging.** To
> avoid adding to the collision, the *new* forward-prediction entries below use a provisional `EK-FP-N` prefix
> and explicitly note where they consolidate or extend the existing drafts. The existing drafts in
> `evolution_analysis.md`, `examiner_objectives.md`, `distinction_candidate_analysis.md`, and
> `examiner_confidence_model.md` should be merged *first*; these FP entries layer the *predictive* claim on top.

### EK-FP-1 · Integrated multi-factor synthesis is the fastest-rising objective and will recur ~annually
- **tier:** STRONG SIGNAL · **status:** proposed (consolidates the duplicate "integrated analysis" drafts;
  forward-prediction layer over EK-0004)
- **evidence:** 2022 P2Q1 (why-blend); 2024 P2Q3c (climate→style→quality, "worst answered, not a format seen
  before"); 2025 P1Q4 (human-vs-nature, ~15% of paper, "not used before"); 2024 Chief (critical-thinking
  erosion). Convergent across all four `outputs/research/` reads.
- **claim:** Expect at least one *novel integrative-synthesis* question per year for 2026–2030, asking the
  candidate to apportion a wine's character among climate, winemaking, and terroir, or to reason about why a
  wine is/isn't blended, or some not-yet-seen re-framing. These are the examiners' explicit defence against
  rote/template/AI answers; they reward *method* over recall and are wine-agnostic (the wines are ordered to
  expose a gradient). Generators must support this archetype; model answers must integrate factors causally,
  not list them. **Falsification:** two consecutive years with no such question.

### EK-FP-2 · Climate is a standing examinable driver (the strongest forward signal in the corpus)
- **tier:** STRONG SIGNAL · **status:** proposed (consolidates the duplicate "climate" drafts)
- **evidence:** identical stem "how climate and winemaking techniques have influenced the quality and style of
  the wine" in **both 2024 P2Q3 and 2025 P2Q1** — the only two-year verbatim repeat in 14 years.
- **claim:** Climate-driver framing recurs in P1/P2 most years through 2030. Model answers must reason
  cool-vs-warm expression, vintage conditions, and climate-change adaptation (picking dates, alcohol/site/canopy
  management, variety choice) — not just cellar winemaking. Wine selection increasingly favours sets that "light
  up" a climate argument. **Falsification:** three consecutive absences.

### EK-FP-3 · Mark allocation is a ROTATING distribution, not a trend — forecast the rotation set, not a slope
- **tier:** STRONG SIGNAL · **status:** proposed (corrects the trend-language risk in EK-0006/EK-0098)
- **evidence:** primary-source splits ID 46→39→39, quality 24→37→19→20+ (2022–2025); 2023 chair "you never know
  where the weighting will be." (`examiner_objectives.md` §2.)
- **claim:** Do not extrapolate any single competency's mark-share linearly. Within the modern era, ID sits
  ~39–46% (largest single category, necessary-but-not-sufficient) and the analytical pool's internal split
  (quality / winemaking / commercial / style) rotates unpredictably year to year. Generators should vary the
  split across a mock suite; graders should not assume a fixed per-paper target. **This is the methodological
  spine of all forecasting here.**

### EK-FP-4 · The wine is a vehicle; the competency is the target — except the P3 production canon (forward-stable)
- **tier:** STRONG SIGNAL · **status:** proposed (consolidates `examiner_objectives.md` EK-0104; forward-stability claim)
- **evidence:** `examiner_objectives.md` §0/§3 (all 153 questions, cluster-level substitutability); 2025 "how
  Madeira/Sherry is made" non-negotiable.
- **claim:** This substitutability principle is *itself a prediction*: because ~85% of objectives are
  wine-agnostic, future papers can (and will) test the same competencies with entirely new wines, so prediction
  should target competencies, not wines. The fused exception — the P3 production-method canon — is the one place
  the wine *is* the answer and is the most memorizable, most stable part of the exam. Forecast: this divide
  persists unchanged through 2030.

### EK-FP-5 · Forecasting watch-list (low-confidence emerging themes; do NOT treat as established)
- **tier:** CURVEBALL · **status:** proposed (open hypotheses, for monitoring)
- **evidence:** industry trend + corpus-absence (this report §Low Confidence).
- **claim:** Monitor but do not yet train/generate around: (a) low/no-alcohol or alcohol-reduction as a
  commercial/theory angle; (b) sustainability/packaging as a commercial sub-axis; (c) explicit vessel/closure
  reasoning prompts; (d) further breaks of positional priors. **Explicit anti-forecast:** orange/skin-contact
  wine is *not* a rising theme — it peaked 2014–2019 and is absent 2021–2025 (supersedes any intuition to the
  contrary; see `evolution_analysis.md` proposed EK-0108). Re-evaluate this list after each sitting.

---

## Appendix · Where the four research reads AGREE and DISAGREE (the honest uncertainty map)

**Strong agreement (→ High-confidence predictions):**
- Integrated synthesis is the fastest-growing objective (all four).
- Structural reading is foundational and rising (all four).
- "Reasoning > ID" is real but conditional, and ID stays ~40% and necessary (objectives + distinction +
  confidence).
- Anti-rote/anti-template re-wording is a deliberate, stated examiner strategy (objectives + distinction;
  confidence model's "coherence > correctness").
- 25/wine and core structural invariants persist (evolution + EK).

**Genuine disagreement / tension (→ reported, not resolved away):**
- **"P3 vs P2 as decider."** `examiner_objectives.md` says P2 is the modern decider and "P3 weakest" is false;
  `examiner_confidence_model.md` reconciles that P3 is the *arithmetic* borderline-decider (weak P3 drags the
  65% average) even though it is often the highest-*scoring* paper. Both are right at different levels — resolved
  in H8 by separating "lowest-scoring" from "average-dragging."
- **"ID declining trend" vs "ID rotating plateau."** EK-0006/0098 lean "trend"; the objectives and distinction
  reads insist "rotation/plateau." Resolved in favour of *rotation against a de-emphasized baseline* (EK-FP-3).
- **"Most-penalised failure mode."** Confidence model softens EK-0091's "the most-penalised" (cascade) toward
  "a most-penalised," noting structural *misreading* is the upstream trigger. Adopted.
- **Climate as the dominant future theme vs small-n.** Evolution analysis calls the 2024+2025 climate repeat
  "the strongest forward signal"; it is also only two data points. Rated High but with an explicit
  three-absence falsification test (EK-FP-2).

**Provenance caveat (inherited).** The examiner-report quotes are member-gated and not web-verifiable; year/
paper attributions are corpus claims, and a public IMW document overrides a corpus paraphrase on hard facts
(as the Student Guide overrode "65% per paper"). (`examiner_confidence_model.md` §7.)

---

*Synthesised 2026-05-31 from the four `outputs/research/` adversarial reads + `mw_exam_empirical_knowledge.md`
+ `outputs/heuristics/`. No source files, code, or the EK doc were modified; all EK additions/revisions are
drafts for user review. Forward predictions carry explicit falsification tests where the signal is small-n.*
