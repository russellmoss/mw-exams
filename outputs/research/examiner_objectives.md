# Examiner Objectives — Reverse-Engineering the MW Practical Exam's Assessment Intent

> **Mandate.** This document reverse-engineers the *educational and assessment objectives* underlying
> the IMW practical (blind-tasting) exam. It is **not** a wine analysis and **not** a frequency study.
> The unit of analysis is **examiner intent**: what competency each question is built to test, what
> mistake it is built to expose, and what separates a pass from a distinction.
>
> **Epistemic stance (adversarial).** Findings that *disprove* a current `mw_exam_empirical_knowledge.md`
> (EK) entry are treated as more valuable than findings that confirm one. Every claim below is sourced;
> where the primary sources contradict existing EK, that is stated explicitly and ranked first.
>
> **Sources.** All 14 practical papers 2011–2019 + 2021–2025 (`data/exams.json`, 153 question records
> with printed mark tariffs; 2020 cancelled). Primary examiner reports read in full this pass: Practical
> 2017, 2018, 2022, 2023, 2024, 2025 and Chief 2022, 2023, 2024, 2025 (`docs/examiners reports/*.pdf`),
> cross-checked against `outputs/heuristics/examiner_report_synthesis.md` and the current EK doc.
> Author: Examiner Objective Research Team pass, 2026-05-31.

---

## 0 · Executive summary — the seven highest-value findings

1. **The exam tests transferable competencies, and the *specific wines are interchangeable vehicles* —
   except for production-method questions, where the wine *is* the objective.** For ~85% of questions the
   same examiner objective could be tested with completely different wines (see §3, Q5 column). The hard
   exception is the production-method / fortified-sweet cluster, where you must know *how that specific
   wine is made* (Sherry, Madeira, Port, Champagne, Sauternes, Tokaji) — there the wine and the
   competency are fused and cannot be swapped. This is the single most useful organizing insight and is
   **absent from EK**.

2. **"Paper 3 is the consistently weakest paper / the usual decider" is FALSE** (contradicts EK line 149
   `EK-0005` and `examiner_report_synthesis.md` §5). Documented paper outcomes: P3 was the **strongest**
   paper in 2017, 2023, and 2025; the weakest/deciding paper was **P1 in 2022, P2 in 2023, P3 in 2024,
   P2 in 2025.** If any paper is "the modern decider" it is **Paper 2**, not Paper 3. (§6, §7-C.)

3. **The "shift away from identification over time" is overstated.** The analytical emphasis is a
   *constant* present identically in 2017, 2018, and 2022 — not a trend that emerged recently — and the
   year-to-year mark split **rotates by design** rather than drifting monotonically: ID share 46%(2022)→
   39%(2023)→39%(2024) (flat 2023→2024); quality 24%→37%→19%→20%+ (non-monotonic). 2018 deliberately
   leaned *more* classic. Reframe `EK-0006`/`EK-0098` from "trend" to "stable de-emphasis + annual
   rotation." (§6, §7-A.)

4. **"Reasoning > identification" is real but conditional: only *plausible, structure-grounded* reasoning
   rescues a wrong conclusion.** A well-written but *implausible* wrong answer scores little (2025 Rhône
   flight), and a wrong *structural* read (alcohol/acidity/tannin/RS) cascades fatally, whereas a wrong
   *origin* call on a sound structural read is survivable. `EK-0007` should distinguish survivable-origin-
   miss from fatal-structural-miss. (§7-B.)

5. **Two genuinely new objective families emerged 2024–2025** and are under-represented in EK:
   **(a) integrated climate×winemaking×style×quality synthesis** (2024 P2Q3c — "the worst answered
   question on the paper") and its successor **"human inputs vs nature"** (2025 P1Q4, 15% of the paper);
   **(b) "quality within the context of wine *globally*"** (2025 P2Q3b — a quality frame that is the
   *world market*, not the local appellation ladder). Both target critical/independent thinking and
   defeat template recall. (§4 Obj-9, §4 Obj-5, §8 proposals.)

6. **The maturity rubric has been stated as both three and four elements.** 2022 (Mitchell) = three
   parts; 2023 (P3) = four parts, essentially verbatim to `EK-0011`. EK is correct to use the fuller
   2023 form but should note the rubric must be *quantified* (specific timeframes), which is the actual
   discriminator, not the count of bullets. (§7-D.)

7. **Commercial reasoning is the *lowest-weighted* competency (9% of marks in 2022) yet a recurring
   failure point.** EK emphasizes how to answer commercial questions but never flags that it is the
   smallest mark pool — a time-allocation insight candidates need. (§4 Obj-8.)

---

## 1 · Method

For every one of the 153 question records I determined the five mandated dimensions:

1. **Primary competency** tested (which of the underlying objectives in §4 the bulk of marks reward).
2. **Secondary competencies** (the lower-tariff sub-parts).
3. **The candidate mistake the question is built to expose** (the designed trap).
4. **Pass vs distinction** — what lifts an answer from competent to top-band.
5. **Wine-substitutability** — could the same objective be tested with completely different wines?

Because 153 individual entries would be unreadable and would obscure the pattern, the questions are
**clustered by their primary-objective configuration** (§3). Every question is assigned to a cluster
(cross-membership noted); the 5-dimension analysis is given per cluster, which is where the examiner
*intent* actually lives — two questions in the same cluster are testing the same thing with different
wines, which is itself finding #1. The cluster-level objectives are then abstracted into the ranked
**Core Examiner Objectives** (§4).

---

## 2 · The hard numbers (anchor for all weighting claims)

The only **primary-source per-competency mark splits** in the entire corpus (quote the report, not a
classifier):

| Year | Identification | Quality (+maturity/ageing) | Winemaking | Commercial | Source |
|------|---------------|----------------------------|-----------|-----------|--------|
| 2022 | **46%** | 24% (quality+maturity) | 21% | 9% | Marks, 2022 chair: *"approximately 46% of the marks across all three papers were for grape and/or origin identification… 24%… quality and maturity, 21%… winemaking and 9%… commercial potential."* |
| 2023 | **39%** | 37% (quality/maturity/ageing) | — | — | *"Only 39% of all marks were devoted to identification (compared to 46% last year) whereas 37%… related to quality, maturity, and aging potential (compared to 24%)."* |
| 2024 | **39%** | 19% (quality alone) | 42% combined (winemaking+maturity+style+commercial) | (in the 42%) | *"these latter four types of questions accounted for 42%… identification made up 39%… quality represented 19%."* |
| 2025 | — | **>20% (quality alone)** | — | — | *"Recognising quality… accounted for more than 20% of the marks… the other major reason many candidates failed."* |

**Reading of the table (this is the corrected trend statement):** identification is **a minority of marks
but still the single largest category**, and the non-ID/analytical pool (~54–61%) is where papers are
won and lost. The split between *quality* and *winemaking/commercial/style* **rotates each year** (quality
spikes to 37% in 2023, collapses to 19% in 2024). 2023 chair, verbatim: *"you never know where the
weighting will be."* Treat any single year's split as a sample from a rotating distribution, **not** a
trend line.

**Pass mechanics (stable across all years):** absolute **65%** average to pass (not a curve, no quota,
2017/2018); a paper averaging **<45% almost never recovers** (<5% go on to pass — 2018); a pass requires
mastery across **four dimensions** — structural reading, communication, theory accuracy, quality judgment
(2024) — a spike in one cannot rescue a hole in another; **consistency beats peaks** (*"no high pass marks…
one off-day will not ruin your chances, but consistency is essential"* — 2022).

**Pass rates (no secular difficulty trend):** 14% (2018), 15% (2019), 8% (2021), 13.3% (2022). The exam is
hard and roughly constant; it is not getting harder or easier.

---

## 3 · Question clusters (all 153 questions) with the 5-dimension analysis

Clusters are defined by the *configuration of objectives* the marks reward, not by wine style. Membership
lists use `YYYY Pn Qm`. A question can appear in two clusters when its marks split across configurations.

### Cluster A — Same-variety, multi-origin flight ("variety is given/cheap; the test is intra-varietal origin + quality discrimination")
- **Members:** 2011 P1Q2, 2012 P1Q2, 2012 P2Q3, 2013 P2Q3, 2014 P1Q2, 2014 P2Q1, 2015 P1Q2, 2016 P3Q1,
  2017 P1Q2, 2017 P2Q1, 2018 P1Q1, 2018 P2Q2, 2018 P1Q3, 2021 P1Q2, 2023 P3Q4, 2024 P2Q1, 2024 P2Q3,
  2025 P1Q2, 2025 P2Q1.
- **Primary competency:** discriminating *the same grape across climates/origins* + calibrating quality
  across the set. Variety ID is deliberately low-tariff or stated.
- **Secondary:** winemaking-from-climate inference; maturity; style.
- **Mistake exposed:** treating the variety call as the point and then writing the *same* note for every
  wine (cut-and-paste — *"unlikely examiners have chosen two wines with the same attributes"*, 2023);
  shoehorning each wine to a template.
- **Pass vs distinction:** pass gets the variety + rough origins; **distinction differentiates each
  expression's climate/winemaking fingerprint and ladders quality** ("the best candidates remembered to
  draw on all four wines," 2025; "5–6/8 if reasoning was sound" even with wrong origins, 2025).
- **Q5 — different wines?** **YES, strongly.** Any widely-planted variety (Chardonnay, Riesling, Syrah,
  Cabernet, Chenin, Pinot Noir) serves identically. The objective is wine-agnostic.

### Cluster B — Same region/country, different varieties ("hold the place, vary the grape")
- **Members:** 2011 P1Q1, 2011 P2Q1, 2013 P1Q3, 2013 P2Q2, 2014 P1Q1, 2014 P2Q3, 2015 P2Q3, 2015 P2Q4,
  2016 P1Q1, 2018 P3Q2, 2021 P1Q1, 2021 P1Q4, 2022 P1Q2, 2022 P1Q3, 2023 P1Q3, 2023 P2Q1, 2025 P1Q3,
  2025 P2Q2.
- **Primary competency:** recognizing *regional/national typicity* that persists across varieties.
- **Secondary:** per-wine variety ID; quality in regional context; winemaking.
- **Mistake exposed:** anchoring on one wine's country and *forcing* the rest; **asserting the country
  without justifying it** (2022 Australia flight: *"few articulated why the flight was from Australia"*).
- **Pass vs distinction:** distinction *argues* the common origin from shared signatures (acidity, oak
  regime, ripeness) before naming it; pass names it and moves on.
- **Q5 — different wines?** **YES.** Any country with multiple signature grapes (France, Italy, Spain,
  Australia, South Africa, Austria) works.

### Cluster C — Tight internal-hierarchy comparison (same region ± producer ± vintage; "which is better / compare and contrast")
- **Members:** 2012 P1Q3, 2012 P3Q1, 2013 P1Q1, 2013 P1Q2, 2013 P1Q4, 2013 P2Q1, 2014 P2Q2, 2015 P1Q1,
  2016 P2Q1, 2016 P2Q3, 2016 P2Q4, 2016 P3Q4, 2019 P3Q1, 2019 P3Q2, 2021 P1Q3, 2021 P2Q1, 2021 P2Q4,
  2021 P3Q3, 2022 P1Q1, 2022 P2Q2, 2022 P2Q3, 2022 P2Q4, 2022 P2Q5, 2023 P3Q3, 2024 P1Q1, 2024 P3Q2,
  2024 P3Q3.
- **Primary competency:** **fine-grained relative-quality discrimination** within a narrow band; direct
  comparison (`EK-0022`); vintage/producer-tier reasoning; "under the skin of the wine."
- **Secondary:** winemaking-style contrast; maturity; market position.
- **Mistake exposed:** writing **two separate tasting notes instead of comparing** (*"compare and
  contrast"* confused with *"describe each"*, every report); **playing it safe / not getting under the
  skin** (2022 — the named distinction-killer).
- **Pass vs distinction:** distinction commits to *which is higher quality and why*, with second-order
  insight (e.g. *"the exceptional quality indicates a producer whose wines exceed the minimum sugar levels
  required for those classifications"*, 2025 Tokaji); pass describes both adequately but hedges the verdict.
- **Q5 — different wines?** **PARTIALLY.** The objective (relative discrimination) is transferable, but the
  wines must form a genuine quality/style/vintage *gradient* within one origin — they cannot be arbitrary.

### Cluster D — Mixed-bag breadth ("each wine a different country + variety; no anchor")
- **Members:** 2011 P1Q3, 2012 P3Q2, 2013 P1Q5, 2015 P1Q3, 2016 P1Q5, 2017 P1Q4, 2017 P2Q3, 2018 P1Q2,
  2019 P3Q3, 2021 P2Q2, 2022 P1Q4, 2022 P3Q2, 2023 P2Q2, 2025 P2Q3.
- **Primary competency:** **generalist breadth** — cold ID with no within-flight anchor; honest
  engagement with unidentifiable wines.
- **Secondary:** quality; style; commercial; maturity (varies by sub-tariff).
- **Mistake exposed:** **panic and defaulting to famous appellations**; *"relying on expertise from a
  limited number of regions"* (2018); naming a region on a single clue (*"too many just stated Mosel…"*,
  2022).
- **Pass vs distinction:** distinction *describes what is in the glass* and offers evidence-led
  alternatives even when lost (*"a lot of points could have been gained from simply describing what was
  in the glass even if the region was unknown"*, 2024); pass nails the easy wines and writes something
  coherent on the hard ones.
- **Q5 — different wines?** **YES, maximally.** Breadth is the entire point; the wine set is the most
  interchangeable of any cluster.

### Cluster E — Production-method / "how was it made" (method ≥ ID; sparkling, fortified, sweet, oxidative — mostly P3)
- **Members:** 2011 P2Q2, 2011 P2Q3 (method sub-parts), 2013 P3Q3, 2014 P3Q1, 2014 P3Q2, 2014 P3Q3,
  2014 P3Q4, 2015 P3Q1, 2015 P3Q3, 2016 P3Q2, 2016 P3Q3, 2017 P3Q6, 2019 P3Q4, 2019 P3Q5, 2021 P3Q1,
  2021 P3Q2, 2021 P3Q3, 2023 P3Q1, 2023 P3Q2, 2023 P3Q3, 2024 P3Q1, 2024 P3Q4, 2025 P3Q1, 2025 P3Q3.
- **Primary competency:** **applied winemaking theory** — explaining *how* the wine was made (how the
  sparkle/RS/fortification/oxidation was achieved), not *what* it is; structural numbers (RS/ABV) used as
  evidence, not guesses.
- **Secondary:** origin/variety; quality; commercial.
- **Mistake exposed:** describing **WHAT not HOW**; **theory howlers** (*"Tawny aged in a solera,"
  "Amontillado at 14.5%,"* 2025; *"VDN at 20% alcohol,"* 2022) — fused with logical impossibility;
  **reverse-shoehorning** RS/ABV to a guessed ID (*"put in figures of alcohol and sugar to match"*, 2022).
- **Pass vs distinction:** distinction conveys *genuine enthusiasm* and mechanism mastery (*"when
  candidates can convey the genuine pleasure they experience in tasting a 40-year-old Tawny…"*, 2025);
  pass states the method correctly without error.
- **Q5 — different wines? NO — this is the exception.** The objective *is* knowledge of a specific
  production method. *"It is very hard, if not impossible, to pass the MW exam without knowing how Madeira
  or Sherry is made"* (2025). The wine and the competency are **fused**; you cannot swap a Sherry question
  for a Port question and test the same knowledge. This makes the P3 method canon (Champagne, Sherry,
  Madeira, Port, Sauternes/botrytis, Tokaji, VDN, passito/recioto) the most *memorizable and least
  substitutable* part of the exam.

### Cluster F — Commercial / market-positioning lead
- **Members:** 2011 P2Q5, 2012 P3Q2, 2013 P3Q1, 2016 P2Q5, 2016 P3Q4, 2017 P3Q1, 2017 P3Q4, 2019 P2Q2,
  2019 P3Q3, 2021 P2Q3, 2022 P3Q3, 2023 P2Q3, 2024 P3Q1, 2024 P3Q3, 2025 P2Q3, 2025 P3Q2.
- **Primary competency:** **commercial reasoning** — channel (on/off-trade, specialist/supermarket,
  Michelin/pub), geography (domestic + export), opportunities **and** challenges, tied to the glass.
- **Secondary:** style; quality; origin.
- **Mistake exposed:** **rote/boilerplate answers** (*"steakhouse,"* food-pairing as a crutch — *"rarely
  rewarded"*, 2022); answering only **opportunities** and neglecting **challenges** (2024); commercial in
  a vacuum, not wine-specific.
- **Pass vs distinction:** distinction is **wine-specific and theory-driven** (*"original responses…
  using their theory knowledge instead of offering rote responses"*, 2023); pass lists generic channels.
- **Q5 — different wines?** **YES**, though examiners pick commercially *contrastive* wines (high-volume
  vs icon) to give the reasoning something to bite on.

### Cluster G — Quality-in-context lead (origin deliberately deprioritized; quality elevated)
- **Members:** 2016 P2Q2, 2017 P1Q3, 2017 P2Q2, 2019 P1Q3, 2019 P2Q3, 2023 P1Q1, 2023 P1Q2, 2024 P1Q2,
  2025 P2Q3, 2025 P3Q3.
- **Primary competency:** **quality calibration in a stated frame** — region, official classification,
  *or the world market* (the new 2025 branch); maturity ≠ quality.
- **Secondary:** style; commercial; structural reading (acidity/texture → quality, 2023 P1Q2).
- **Mistake exposed:** **quality in a vacuum** (*"opted to assess intrinsic quality in isolation"*, 2017);
  **bidirectional mis-calibration** — over-calling (*Côtes du Rhône → Châteauneuf*, 2025) *and*
  under-calling (New-World/origin bias: *"hardly anyone was sufficiently effusive about… wine 12"*, 2018);
  **mistaking maturity for quality** (*"many mistook its maturity for quality"*, 2019).
- **Pass vs distinction:** distinction names the **official tier even when unasked** (*"why not mention it
  is a Grand Cru Classé?"*, 2024; *"we do expect an official quality level… if relevant"*, 2025) and, for
  esoteric wines, positions against **global** peers; pass gives a contextual but generic quality verdict.
- **Q5 — different wines?** **YES** for ordinary quality; the *global-context* variant specifically
  requires esoteric wines with no meaningful local peer set (its reason for existing).

### Cluster H — Maturity / vintage / ageing lead
- **Members:** 2011 P1Q1c, 2012 P1Q3 (vintage), 2014 P2Q2 (vintage), 2016 P2Q3 (vintage), 2017 P1Q5,
  2017 P3Q5, 2018 P3Q1, 2021 P2Q1, 2023 P1Q2c, 2024 P2Q2 (drinking window), 2025 P1Q2.
- **Primary competency:** **maturity assessment** — current age, position in evolution, improvement
  horizon, decline horizon (the 3–4 element rubric), *quantified*; vintage estimation from classic regions.
- **Secondary:** quality; winemaking (oak/tertiary development).
- **Mistake exposed:** vague *"matured for many years"* with no timeframe; not recognizing **"drinking
  window" = maturity** (2024); assuming the wine is from anywhere when a **vintage question implies a
  classic, vintage-legible origin** (*"The Anderson Valley or England would not come into this category"*,
  2018).
- **Pass vs distinction:** distinction gives **specific time frames and both positive and negative
  evolution trajectories** (*"The best answers described both positive and negative evolution
  trajectories"*, 2023); pass states "drink now, will hold."
- **Q5 — different wines?** **PARTIALLY** — must be a wine whose maturity/vintage is legible (classic
  region, structured for ageing); a fruity commercial white cannot host this objective.

### Cluster I — Novel analytical synthesis (climate × winemaking × style × quality; "human vs nature"; "why blend")
- **Members:** 2022 P2Q1 (why blend / why not), 2024 P2Q3c (climate→style→quality), 2024 P1Q1
  (compare maturity & capacity to age across pairs), 2025 P1Q4 (human inputs vs nature), 2025 P2Q1c.
- **Primary competency:** **integrated, multi-factor analytical reasoning** — apportioning a wine's
  character between climate, winemaking, and terroir, or reasoning about *why* a wine is/ isn't blended.
  This is winemaking inference elevated to an analytical-weighting task; it explicitly targets
  **critical/independent thinking over template recall.**
- **Secondary:** style; quality; ID (usually low-tariff).
- **Mistake exposed:** **template recall** and inability to handle a re-worded/novel framing (2024 P2Q3c
  was *"the worst answered question on the paper"* precisely because it was a new format); writing about
  the *guessed* wine rather than reasoning from the glass.
- **Pass vs distinction:** distinction *"logically described the style and quality and then tied these to
  how climate and winemaking would have played a part"* (2024); pass lists factors without integrating them.
- **Q5 — different wines?** **YES, fully** — the objective is meta-analytical and wine-agnostic; the
  examiner deliberately *orders* the wines (e.g. increasing winemaker influence, 2025 P1Q4) but any set
  spanning the relevant gradient works.

> **Coverage note.** Every 2011–2025 question record falls into at least one cluster above; high-mark
> compare/contrast and quality sub-parts frequently place a question in two (e.g. 2023 P1Q1 is A by
> variety-pair structure and G by its 50/100 quality+ageing weighting). The clustering is by primary
> objective, not a strict partition — and that overlap is the point: the exam recombines a small fixed
> set of competencies (§4) across an ever-changing wine set.

---

## 4 · Core Examiner Objectives (ranked)

Ranked by **decisiveness for the pass/fail outcome** (how often the reports attribute failure or
distinction to this competency), not by mark share. Each entry: description · evidence · years observed ·
trend · likely future importance.

### Obj-1 · Accurate structural reading of the glass (alcohol, acidity, tannin, RS, oak) — THE FOUNDATION
- **Description:** Correctly reading the wine's measurable structure *before* deducing identity. Everything
  downstream (ID, quality, maturity, commercial) is built on it; a wrong structural read cascades fatally.
- **Evidence:** *"The first theme was an inability to read the wine accurately. Too many candidates started
  on the wrong foot because they could not reliably identify the wine's components — alcohol, acidity,
  tannin and residual sugar"* (2025, named the **#1** failure theme). *"Hard evidence like alcohol and
  sugar are often more reliable than the flavour profile"* (2025). `EK-0013`.
- **Years observed:** 2017–2025 (every report); elevated to the explicit headline theme in 2025.
- **Trend:** **Increasing in explicit emphasis** (the antidote framing to shoehorning).
- **Future importance:** **Critical and rising.** As global styles converge, structure is the last
  reliable discriminator. Will remain the foundation indefinitely.

### Obj-2 · Deductive reasoning & argumentation (funnelling) — the most-rewarded skill
- **Description:** Constructing the *argument* — weigh 2–3 evidenced options, argue for/against each,
  commit to a decisive call. The argument carries more marks than the bare conclusion.
- **Evidence:** *"a much higher proportion of the marks available for identification for the argument
  rather than for the conclusion"* (2022); *"4 of the 5 marks available per wine were for reasoning"*
  (2024); *"taste like a detective; argue like a lawyer"* (2019). `EK-0007`, `EK-0014`, `EK-0090`.
- **Years observed:** 2017–2025 (universal, by name).
- **Trend:** **Stable-to-increasing.** Reasoning's share of ID marks rises on harder flights by examiner
  choice.
- **Future importance:** **Critical and rising** — the deliberate defence against rote/AI-template answers
  (2024 chief "critical thinking erosion" concern).
- **Conditional (corrects EK):** only *plausible, structure-grounded* reasoning rescues a wrong call;
  implausible wrong answers earn little (2025 Rhône flight).

### Obj-3 · Quality judgment in context (origin / classification / global / price) — bidirectional
- **Description:** Positioning a wine on a quality ladder relative to a stated frame; naming the official
  tier even when unasked; calibrating in *both* directions (don't over- or under-call); keeping maturity
  distinct from quality.
- **Evidence:** *"Recognising quality… accounted for more than 20% of the marks… the other major reason
  many candidates failed"* (2025); *"we do expect an official quality level if there is one and it is
  relevant"* (2025); over-call penalty (CdR→CdP, 2025); under-call/origin bias (Chile Cabernet, 2018).
  `EK-0008`, `EK-0092`. **New branch:** *"quality within the context of wine globally"* (2025 P2Q3b).
- **Years observed:** 2017–2025 (universal); global-context branch new in 2025.
- **Trend:** **Increasing** in weight and in framing variety (region → classification → global).
- **Future importance:** **Critical and rising.**
- **Corrects EK:** quality is *not* always anchored to classification/price — Perrotti-Brown (2022)
  values quality judged *"regardless of price or regionally designated position"*; mis-cited price loses
  marks (2018). The frame is whatever the stem names, which now includes the world market.

### Obj-4 · Theory knowledge & factual accuracy (no howlers) — the borderline decider
- **Description:** Underlying wine-science/region facts must be correct; a single howler corrodes examiner
  confidence in the whole paper and tips a borderline to fail.
- **Evidence:** *"what frequently determines whether a borderline candidate achieves an overall pass or
  not, is their theory knowledge"* (2024); *"The MW practical exam is a theory exam with a tasting. This is
  truer today than ever before"* (2024); howler lists every year. `EK-0006`, `EK-0015`, `EK-0093`.
- **Years observed:** 2017–2025 (universal); explicitly the borderline decider in 2024.
- **Trend:** **Stable** (structurally central; not rising, already maximal).
- **Future importance:** **Critical** — fused with Obj-5 in production-method questions.

### Obj-5 · Applied winemaking inference (HOW, tied to the glass; absence is a choice) — incl. production-method canon
- **Description:** Explaining *how* the wine was made and tying each technique to a sensory consequence;
  for P3, mastering the production canon (Champagne/Sherry/Madeira/Port/Sauternes/Tokaji/VDN/passito).
- **Evidence:** *"the best candidates were thorough in their winemaking observations and tied these back
  to what they could taste"* (2018); *"their absence is as much of a winemaking choice as their presence"*
  (MLF/lees, 2022); production-method mastery non-negotiable for P3 (2025). `EK-0013`.
- **Years observed:** 2011–2025.
- **Trend:** **Stable.**
- **Future importance:** **Critical for P3, high elsewhere.** This is the **least wine-substitutable**
  objective — the method *is* the answer.
- **Mistake exposed:** describing *what* not *how*; phantom oak (finding oak that isn't there *and*
  missing obvious new oak — 2018/2023, both directions).

### Obj-6 · Communication, exam discipline & "answer the question as asked" — cross-cutting gatekeeper
- **Description:** Clear written argument; correct reading of the stem's binding constraints; covering all
  sub-parts; time/mark management; differentiating each wine (anti-cut-and-paste).
- **Evidence:** *"Too often we see good thinking obscured by poor communication"* (2022 chief);
  *"Have you answered the question in front of you? Don't write an answer to the question you perhaps wish
  was in front of you"* (2025 chief); blank sections sank otherwise-passing papers (2018); compare/contrast
  done as two notes (every year). `EK-0010`, `EK-0017`, `EK-0022`.
- **Years observed:** 2017–2025 (universal).
- **Trend:** **Stable**, elevated to a named cross-paper theme from 2022.
- **Future importance:** **High** — the cheapest marks to lose and the easiest to coach.

### Obj-7 · Maturity, vintage & ageing assessment — quantified
- **Description:** State current age, position in evolution, improvement horizon, decline horizon — with
  specific timeframes and both positive and negative trajectories. "Drinking window" is the same skill.
- **Evidence:** 2023 P3 four-element definition (verbatim ≈ `EK-0011`); 2022 three-element form; *"another
  way of asking about maturity"* (drinking window, 2024).
- **Years observed:** 2011–2025; stated as a discrete rubric from 2022–2023.
- **Trend:** **Stable-to-increasing** (maturity's mark share roughly tripled pre-2014 → modern per
  `EK-0098`).
- **Future importance:** **High.**
- **Corrects EK:** the discriminator is *quantification*, not the bullet count (3 vs 4 elements).

### Obj-8 · Commercial / market reasoning — high-profile, low-weight
- **Description:** Channel + geography + opportunities **and** challenges, wine-specific and theory-driven.
- **Evidence:** 2025 channel checklist (on/off-trade, specialist/supermarket, Michelin/pub, local/intl +
  evidence from glass); *"we live and work in a commercial world… answers with complete disregard of
  financial issues will appear naïve"* (2023 chief). `EK-0012`, `EK-0019`.
- **Years observed:** 2011–2025; opportunities-AND-challenges framing from 2024.
- **Trend:** **Increasing in prominence/framing variety**, but the **lowest mark share (9%, 2022).**
- **Future importance:** **Moderate-high** — easy marks if specific, but never the largest pool. *EK does
  not currently flag its low weight; candidates over-invest time here.*

### Obj-9 · Integrated multi-factor analysis & critical thinking (climate×winemaking×style; human-vs-nature; why-blend) — NEW & rising
- **Description:** Synthesizing several factors into one argument, or apportioning character between human
  and natural inputs; the examiners' explicit weapon against rote/template answers.
- **Evidence:** 2022 P2Q1 "why blend / why not"; 2024 P2Q3c climate→style→quality (*"not a question format
  seen in previous exams… the worst answered question"*); 2025 P1Q4 human-vs-nature (*"a form of question
  that had not been used before"*, 15% of paper); 2024 chief critical-thinking-erosion concern.
- **Years observed:** **2022 → 2025** (genuinely new family).
- **Trend:** **Increasing — the clearest growth area in the corpus.**
- **Future importance:** **Rising fast.** Expect a novel synthesis question most years; prepare *method*,
  not memorized answers.
- **Not yet a first-class EK objective** (see §8 proposal).

### Obj-10 · Style articulation — near-ubiquitous, concise
- **Description:** A concise, accurate style descriptor; driven by global style convergence.
- **Evidence:** "style" in 60+ sub-questions, nearly every 2024–2025 question; `EK-0020`.
- **Years observed:** rising sharply post-2014 (style share ~doubled, `EK-0098`).
- **Trend:** **Increasing.**
- **Future importance:** **High** but usually low-tariff (~5 marks) — a quick, mandatory win.

### Obj-11 · Variety identification — largest single mark category, but declining share
- **Description:** Naming the grape; often the cheapest/most-anchored sub-part (stated, or given by the flight).
- **Evidence:** still the single largest category (46% ID composite in 2022, mostly recoverable by
  argument); `EK-0021` (mark size signals difficulty).
- **Trend:** **Declining share** (ID composite 59.7% pre-2014 → 46.2% modern, `EK-0098`).
- **Future importance:** **High but capped** — necessary, rarely sufficient.

### Obj-12 · Origin identification (country → region → sub-region) — declining share, reasoning-credited
- **Description:** Placing the wine as precisely as the evidence allows; *"as closely as possible"* invites
  a funnel, and credit accrues to the plausible set, not only the exact pick.
- **Evidence:** *"over half did not get a single origin exactly right, however many still managed 5–6/8 if
  reasoning was sound"* (2025); USA→Australia got partial credit, USA→Italy little (2021). `EK-0086`,
  `EK-0090`.
- **Trend:** **Declining share**, increasingly graded on a plausibility gradient.
- **Future importance:** **Moderate-high** — survivable to miss if structure is sound; fatal only if the
  structural read that produced it was wrong.

### Obj-13 · Generalist breadth (emerging regions, esoteric varieties, no over-reliance on a few areas)
- **Description:** An MW must be a generalist; the exam deliberately probes emerging regions and esoteric
  varieties to punish narrow expertise.
- **Evidence:** *"Masters of Wine need to be generalists"* (2018); Hawkes Bay Syrah probe (2018); 2025 P2
  *"esoteric varieties/regions"* deliberately introduced.
- **Years observed:** 2017–2025.
- **Trend:** **Increasing** (2025 esoteric-variety emphasis).
- **Future importance:** **Rising.**

### Obj-14 · Enthusiasm, conviction & "under the skin of the wine" — the distinction differentiator
- **Description:** Genuine passion and second-order insight; the marker that separates a good answer from
  an outstanding one. Playing it safe is the distinction-killer.
- **Evidence:** *"frequently lack confidence and play it safe by not truly getting 'under the skin of the
  wine'"* (2022); *"It's essential that enthusiasm and a genuine love of great wines comes through"* (2018);
  the 2025 Tokaji-Szamorodni answer. `EK-0094`.
- **Years observed:** 2017–2025.
- **Trend:** **Stable.**
- **Future importance:** **High for distinction**, not for the pass line.

---

## 5 · Ranked summary & trend verdict

**Decisiveness ranking (pass/fail impact):**
1. Obj-1 Structural reading · 2. Obj-2 Reasoning/funnelling · 3. Obj-3 Quality-in-context ·
4. Obj-4 Theory accuracy · 5. Obj-5 Winemaking/method · 6. Obj-6 Communication/discipline ·
7. Obj-7 Maturity · 8. Obj-9 Integrated analysis (rising) · 9. Obj-11 Variety ID · 10. Obj-12 Origin ID ·
11. Obj-8 Commercial · 12. Obj-10 Style · 13. Obj-13 Breadth · 14. Obj-14 Enthusiasm (distinction only).

**Increasing:** Obj-9 integrated/critical analysis (fastest); Obj-3 quality-in-context (esp. global frame);
Obj-1 structural reading (explicit emphasis); Obj-13 breadth/esoterica; Obj-10 style; Obj-7 maturity;
the *re-wording* of standard questions to defeat templates.

**Stable:** Obj-2 reasoning; Obj-4 theory; Obj-5 winemaking; Obj-6 communication; Obj-14 enthusiasm; the
overall pass bar (65%) and pass rates (~8–15%, no secular trend).

**Declining (in mark share, not importance):** Obj-11 variety ID and Obj-12 origin ID — both fell from a
~60% composite pre-2014 to ~46% modern and are now reasoning-credited rather than binary. *They are
declining in weight but remain necessary; "declining" ≠ "ignorable."*

**Meta-trend:** the exam recombines a **small, fixed competency set** across an ever-changing wine set and
ever-changing question *phrasing*. The defensible preparation is therefore **method over memorization** —
which is exactly the examiners' stated intent (2024 chief: rote assimilation *"will not pass the exam"*).

---

## 6 · Paper-difficulty reality (corrects a widely-repeated claim)

| Year | Strongest paper | Weakest / deciding paper | Source |
|------|-----------------|--------------------------|--------|
| 2017 | **P3** (highest average mark) | P1 (implied toughest) | 2017 practical |
| 2018 | mixed | P2Q1 was the pass gatekeeper; P3Q2 worst-answered single wine | 2018 practical |
| 2022 | P2 (22 passes) | **P1** (11 passes) | 2022 practical (Marks) |
| 2023 | **P3** (23.3% pass) | **P2** (14.3% pass) | 2023 practical |
| 2024 | P1 (31 passes) | **P3** (15 passes — "make-or-break") | 2024 practical |
| 2025 | **P3** (23 passes, best) | **P2** (12 passes, worst) | 2025 practical |

**Conclusion:** there is **no consistently weakest paper.** Paper 3 was the *strongest* in three of six
documented years and decisive (weakest) in only one (2024). The modern deciding/weak paper is more often
**Paper 2** (2023, 2025). The EK/synthesis claim that "P3 is consistently weakest / the usual decider" is
**contradicted** and should be corrected (§7-C). Paper 2's reputation as "the bankers' paper with the
highest pass rate" (true 2017, 2022) **also failed in 2023 and 2025** — recent P2 papers used esoteric
varieties and novel formats that made it the *hardest* paper.

---

## 7 · Review of `mw_exam_empirical_knowledge.md`

### A · Entries CONTRADICTED or materially weakened by the primary sources

**A1 — `EK-0005` (line 149) & `examiner_report_synthesis.md` §5: "P3 is the most stylistically diverse
and the usual decider" / "consistently the weakest paper."**
→ **CONTRADICTED.** See §6. P3 was strongest in 2017/2023/2025; the decider has rotated (P1 2022, P2 2023,
P3 2024, P2 2025). *Recommended fix:* "There is no consistently weakest paper; the deciding paper rotates,
and **Paper 2 has been the weakest in the two most recent documented years (2023, 2025)** despite its
historical 'bankers' reputation. P3 is the most *stylistically diverse* (true) but is often the
*strongest*-scoring."

**A2 — `EK-0006` / `EK-0098`: "the exam is shifting AWAY from ID over time" framed as a trend.**
→ **OVERSTATED.** The analytical emphasis is a *constant* (identical framing in 2017, 2018, 2022), and the
modern split **rotates** (ID 46→39→39 flat 2023–2024; quality 24→37→19→20). 2018 leaned *more* classic.
The pre-2014→modern redistribution (`EK-0098`) is real against the long baseline, but within the modern era
there is **no monotonic trend**. *Recommended fix:* reframe as "ID settled into a minority of marks
(~39–46%) post-2014 and the quality/winemaking/commercial/style split rotates unpredictably year-to-year
(2023 chief: 'you never know where the weighting will be') — do not extrapolate a trend line."

**A3 — `EK-0007`: "Reasoning > Identification" stated unconditionally.**
→ **TRUE BUT CONDITIONAL.** Only *plausible, structure-grounded* reasoning rescues a wrong conclusion; an
*implausible* wrong call earns little (2025 Rhône), and a wrong *structural* read cascades fatally while a
wrong *origin* on a sound structural read is survivable. *Recommended fix:* add the qualifier and the
"structural-miss (fatal) vs origin-miss (survivable)" distinction (ties to `EK-0091`).

**A4 — `EK-0008`: "Quality must always be contextualized with official classification levels and price;
'good' alone scores zero."**
→ **PARTLY OVERSTATED.** (i) Quality can be judged *"regardless of price or regionally designated
position"* (Perrotti-Brown 2022) — intrinsic merit relative to origin is valid; (ii) mis-cited price
*loses* marks (2018), so price is optional corroboration, not mandatory; (iii) the correct frame is
sometimes **global**, not local (2025 P2Q3b). "Scores zero" is the examiners' rhetorical emphasis, not a
literal rubric. *Recommended fix:* "context can be regional, classification-based, *or global*; price is
corroboration only and must be realistic; un-contextualized 'good' earns *minimal* (not necessarily zero)
marks."

**A5 — "Over-reliance on the nose is *the biggest* Paper 2 trap" (in `EK-0013`/synthesis §5).**
→ **PARTLY OVERSTATED.** It is an *explicitly named pitfall* (strongest in 2025) — keep it — but the
*biggest evidenced* P2 failure modes across years are **inaccurate quality assessment of classic reds**
and **shoehorning** (incl. American-oak→Rioja, 2022). *Recommended fix:* demote from "the biggest trap" to
"a named P2 pitfall (2025); structure is more diagnostic than aroma," and note quality-misjudgment +
shoehorning as the larger historical failure modes.

### B · WEAK entries (under-evidenced or vague)

**B1 — `EK-0011` maturity "four elements."** Stated as three (2022) and four (2023). The real discriminator
is **quantification + both trajectories**, not the bullet count. Add the 2022 three-part variant and note
that *specific timeframes* are what earn marks.

**B2 — `EK-0094` "under the skin of the wine" (tier: PLAUSIBLE).** Actually **well-evidenced** (2022 named
distinction-killer; 2025 Tokaji exemplar; 2018 enthusiasm). *Recommend upgrading to STRONG SIGNAL.*

**B3 — `EK-0021` variety-ID mark-size → difficulty (PLAUSIBLE).** Supported by 2022's deliberate
re-weighting of argument-over-conclusion on hard flights; could cite that primary quote.

### C · OVERFIT entries (corpus-statistical artifacts at risk of over-precision)

**C1 — `EK-0023` curveball "6.2% / 17.9% / 75.9%."** Three-significant-figure precision on a subjective
"curveball" label over 504 wines is false precision; the `[Last-10 refresh]` already shows the per-flight
rates are noisier (n=6–7 in places). *Recommend:* keep the directional finding, drop the decimals, flag
curveball-labelling as subjective.

**C2 — `EK-0099`/`EK-0100`/`EK-0101`/`EK-0102` per-paper bands (OW:NW 7.8:4.2, curveball budgets P1≈1.8
etc.).** These are *generation-tuning* statistics, not examiner-intent findings. They are fine as
composition guides but are **mis-filed if read as "what the examiner is testing."** They belong to wine
*selection mechanics*, which the mandate explicitly excludes from intent analysis. *Recommend:* tag them
clearly as composition/generation parameters, not assessment objectives, to avoid the study app teaching
candidates frequencies as if they were competencies.

**C3 — `EK-0098` per-paper modern shape (origin~38/quality~39/… to one decimal).** Same false-precision
risk; the rotating-allocation finding (A2) means these are samples, not stable targets.

### D · MISSING entries (objectives the corpus shows but EK does not capture as such)

1. **Wine-substitutability / "the wine is a vehicle, not the target"** — the most important missing meta-
   principle (§0 finding #1). Production-method questions are the fused exception.
2. **Integrated multi-factor analysis as a first-class, *rising* objective** (Obj-9): climate×winemaking×
   style×quality; human-vs-nature; why-blend. EK has fragments (`EK-0004` "new question types") but no
   dedicated objective.
3. **"Quality within the context of wine globally"** as a distinct quality frame (2025 P2Q3b).
4. **Critical/independent-thinking-over-rote** as an explicit examiner objective and the *reason* questions
   are re-worded (2024 chief; disguised "drinking window"/"human vs nature").
5. **Commercial is the lowest-weighted competency (9%)** — a time-allocation fact, currently absent.
6. **One-fact origin calls are actively penalized** ("just stated Mosel," "Northern/Southern Rhône" alone
   → often zero) — a citable, distinct rule.
7. **Vintage/maturity questions imply a classic, vintage-legible origin** (2018: "not Anderson Valley or
   England") — a citable stem-inference rule.
8. **Bidirectional quality calibration** — over-calling is penalized as much as under-calling (partly in
   `EK-0092`, but the *New-World-not-reflexively-downgraded* half deserves its own line: Chile Cabernet
   2018, Alsace over-rating 2017).
9. **No consistent weakest paper / Paper 2 is the modern decider** (§6) — corrects A1.

---

## 8 · Proposed new EK entries (document format)

> Drafted in the EK house style (`### EK-NNNN · title` · tier · status · evidence · claim). Numbers are
> provisional (next free block ≥ EK-0104); the user reviews before merging.

### EK-0104 · The wine is a vehicle; the competency is the target (production-method is the exception)
- **tier:** STRONG SIGNAL · **status:** proposed
- **evidence:** `outputs/research/examiner_objectives.md` §0/§3 (cluster-level Q5 analysis, all 153
  questions); 2024 practical ("seven question types… asked in different ways"); 2025 ("how Madeira or
  Sherry is made" non-negotiable)
- **claim:** For ~85% of questions the same examiner objective (origin discrimination, quality calibration,
  maturity, commercial, style, reasoning) could be tested with **completely different wines** — the wine is
  an interchangeable vehicle for a transferable competency. The hard exception is the **production-method /
  fortified-sweet cluster**, where the objective *is* knowledge of how that specific wine is made
  (Champagne, Sherry, Madeira, Port, Sauternes/botrytis, Tokaji, VDN, passito): there wine and competency
  are fused and cannot be swapped. **Implication:** study *methods and discriminators*, not wine lists,
  everywhere except the P3 production canon, which must be memorized cold.

### EK-0105 · Integrated multi-factor analysis is a distinct, rising objective
- **tier:** STRONG SIGNAL · **status:** proposed
- **evidence:** 2022 P2Q1 (why-blend); 2024 P2Q3c (climate→style→quality, "worst answered… not a format
  seen before"); 2025 P1Q4 (human-vs-nature, 15% of paper, "not used before"); 2024 chief (critical-
  thinking erosion)
- **claim:** Since 2022 the examiners deploy at least one **integrative analytical question** that asks the
  candidate to *synthesize* climate, winemaking, terroir, and style into one argument, or apportion a
  wine's character between human and natural inputs, or reason about *why* a wine is/isn't blended. These
  reward method over recall and are the deliberate defence against template/AI answers. Expect one most
  years; the wines are ordered to expose a gradient but are otherwise wine-agnostic. Prepare a *framework*,
  not memorized answers.

### EK-0106 · Quality context can be GLOBAL, not just local/classification (new 2025 frame)
- **tier:** PLAUSIBLE · **status:** proposed
- **evidence:** 2025 P2Q3b ("quality within the context of wine globally… has not been asked before…
  what other wines around the world they might be competing with")
- **claim:** Extends `EK-0008`/`EK-0092`. The frame a quality answer must use is whatever the stem names —
  region, official classification, **or the world market**. For esoteric varieties with no meaningful local
  peer set (Assyrtiko, Furmint, niche reds), the correct context is *global comparison*, not a local tier.
  Do not force a local classification onto a wine whose stem invites a global frame.

### EK-0107 · No consistently weakest paper; Paper 2 is the modern decider (supersedes the "P3 decider" claim)
- **tier:** STRONG SIGNAL · **status:** proposed (supersedes EK-0005's "usual decider" clause + synthesis §5)
- **evidence:** 2017 (P3 highest average), 2022 (P1 fewest passes 11), 2023 (P2 weakest 14.3%, P3 strongest
  23.3%), 2024 (P3 make-or-break, 15 passes), 2025 (P2 weakest 12 passes, P3 best 23)
- **claim:** The deciding/weakest paper **rotates**; Paper 3 was the *strongest* in 2017, 2023, 2025 and
  decisive in only 2024. In the two most recent documented years (2023, 2025) **Paper 2 was the weakest**,
  driven by esoteric varieties and novel formats — overturning P2's historical "bankers' paper" reputation
  (true only 2017, 2022). Do not tell candidates "P3 is the one to fear"; tell them the weak paper rotates
  and recent P2 papers have been the hardest.

### EK-0108 · "Reasoning > ID" is conditional on plausibility and a correct structural read
- **tier:** STRONG SIGNAL · **status:** proposed (qualifies EK-0007)
- **evidence:** 2025 ("5–6/8 if reasoning sound" — but Rhône flight "anyone who wasn't in the Rhône
  struggled"); 2025 chair (poor structural reading "leads to incorrect statements about quality, style and
  commercial appeal"); 2024 P2Q3 ("4 of 5 marks for reasoning"); `EK-0091`
- **claim:** Sound reasoning rescues a wrong *conclusion* only when (a) the conclusion is **plausible**
  (adjacent/stylistically-defensible) and (b) the underlying **structural read is correct**. A wrong
  *origin* call on an accurate structural read is survivable; a wrong *structural* read (alcohol/acidity/
  tannin/RS) cascades into wrong quality/style/commercial and is **fatal**. Grade and coach the two
  miss-types differently.

### EK-0109 · One-fact origin calls and vague region-dropping are actively penalized
- **tier:** PLAUSIBLE · **status:** proposed
- **evidence:** 2022 ("too many just stated Mosel… low alcohol and high sugar as the only argument…
  examiners suspect the student knows nothing else than Mosel… less marks"); 2024 ("Northern/Southern
  Rhône" alone "will often yield a zero mark")
- **claim:** Naming an origin on a single supporting fact, or giving a vague macro-region ("Northern
  Rhône") with no sub-region, signals narrow knowledge and draws few or zero marks even when *not wrong* —
  the examiner withholds credit because the answer fails to demonstrate range. Always supply ≥2 independent
  evidence strands and funnel to a sub-region.

### EK-0110 · Vintage/maturity questions presume a classic, vintage-legible origin
- **tier:** PLAUSIBLE · **status:** proposed
- **evidence:** 2018 P3Q1 ("Where a specific question is about the vintage, it is safe to assume the wine is
  from a sufficiently classic area for the vintage characteristics to be well known. The Anderson Valley or
  England would not come into this category")
- **claim:** A stem that asks for vintage or detailed maturity is itself a clue: the wine is from a classic,
  vintage-legible region (Bordeaux, Burgundy, Rioja, Mosel, Napa, Barolo, etc.), not an obscure or
  cool-marginal origin. Use the question type as a narrowing signal.

### EK-0111 · Commercial is the lowest-weighted competency (~9% of marks) — budget time accordingly
- **tier:** PLAUSIBLE · **status:** proposed
- **evidence:** 2022 mark split (commercial 9% vs ID 46% / quality+maturity 24% / winemaking 21%)
- **claim:** Commercial positioning, while a recurring failure point and easy marks when answered
  specifically, is the **smallest mark pool**. Candidates should answer it crisply (channel + geography +
  opportunities/challenges, wine-specific) but **not over-invest writing time** at the expense of the
  higher-tariff structural/quality/winemaking parts.

---

## 9 · Confidence & limitations

- **High confidence:** the paper-difficulty correction (§6, hard pass counts from the reports); the
  conditional nature of "reasoning > ID"; the existence and novelty of the 2024–2025 integrative questions;
  commercial = 9% (2022 direct quote).
- **Medium confidence:** the cluster assignments (by primary objective; some questions legitimately span
  two); the "rotating allocation" claim (4 data points 2022–2025).
- **Limits:** practical reports were read for 2017, 2018, 2022–2025; **2019 and 2021 practical reports were
  not in the PDF set** (their quotes come via the existing synthesis); 2011–2016 have no examiner reports
  in the corpus, so intent for those years is inferred from question wording + mark tariffs alone. 2020 was
  cancelled. 2025 PDF extraction had minor character-merge artifacts (de-garbled where unambiguous).
- **Not modified:** no code, no EK doc, no source files were changed (per mandate). All proposals in §8 are
  drafts for user review.
```