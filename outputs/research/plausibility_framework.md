# Plausibility Framework — What Makes a Conclusion *Feel* Plausible to an MW Examiner

> **Project 9, Agent 4 — Plausibility Analyst.** This document models the **structural properties of
> reasoning that earn an MW examiner's assent** — independent of, and prior to, whether the wine ID is
> correct. The object of study is *examiner cognition*: what causes the marker to believe a candidate's
> chain of reasoning, even when the conclusion is wrong. It is a sibling to
> `examiner_confidence_model.md` (the general trust model) and `distinction_candidate_analysis.md`
> (top-band behaviours); this file isolates the **plausibility** sub-component of confidence.

---

## 1 · Header — scope, method, inputs

**Scope.** *Plausibility as the examiner perceives it.* The central finding of the corpus is that the
MW practical separates two things the lay reader conflates: **correctness** (is the named wine right?)
and **plausibility** (does the conclusion *feel* like it follows from the evidence the candidate
actually reported?). Marks for identification are awarded overwhelmingly for the latter. This document
derives, names, and evidences the components of plausibility, documents the "wrong-but-plausible"
principle in full, catalogues the anti-patterns that make a conclusion feel implausible, and ends with
a testable checklist.

**What this is NOT.** It is not a wine-knowledge guide, not a frequency study, and not a restatement of
correctness rules. Where a conclusion is *correct*, plausibility is moot — it has already earned assent.
The interesting region is the wrong-or-uncertain conclusion, which is where the examiner's plausibility
judgement actually operates and where the bulk of ID marks are won or lost.

**Method.** (1) Read Agent 1's `confidence_language_corpus.md` (the Plausibility/Convincing family B and
the Logic/Reasoning family D are the core seam). (2) Direct-read the practical reports in
`docs/examiners reports/extracted_txt/` (2017, 2018, 2019, 2021, 2022, 2023, 2024, 2025) and verify every
load-bearing quote verbatim against source line numbers. (3) Cross-check against
`examiner_confidence_model.md`, `examiner_objectives.md`, `distinction_candidate_analysis.md`,
`plausibility_grading_gap_analysis.md`. Every component below carries **verbatim quotes + citations +
distinct-report count + evidence tier**.

**Evidence tiers (project rule).** **STRONG SIGNAL** = stated/illustrated in **3+ distinct reports**
(year × report-type); **PLAUSIBLE** = **2 distinct reports**; **EXAMPLE-ONLY** = **1 report** (an
anecdote that stays an anecdote). A "distinct report" counts each `(year, report-type)` file separately.

**Provenance caveat (inherited).** IMW examiner reports are member-gated, not public. The verbatim quotes
are credible because the user holds the reports, but year/paper attributions are *corpus claims*, not
web-checkable facts. A public IMW document (e.g. the Student Guide on the pass standard) overrides a
corpus paraphrase on any hard fact.

---

## 2 · The Plausibility Framework

**Definition.** A conclusion *feels plausible* to an MW examiner when the **written reasoning chain is a
sufficient and self-consistent route from the evidence the candidate reports in the glass to the
conclusion they commit to** — such that a competent reader, holding the answer key, can see *why* a
sensible taster would land there, even if it is not where the wine actually sits.

Plausibility is therefore a property of the **link**, not the **endpoint**. The corpus is explicit that
the examiner reads *for* this link: a 2023 chair lists, as the things three-paper moderation reveals,
"whether the candidate shows **convincing logic even if wrong**, whether they recognize and clearly
depict quality, style, and commercial aspects, and whether they can relate evidence from the glass"
(2023 Practical, intro, lines 25–27). The components below decompose that "convincing logic" into its
load-bearing parts.

### Component P1 — Evidence→conclusion linkage (the conclusion is *derived*, not asserted)

**Claim.** Plausibility requires that the conclusion be *visibly produced by* the reported evidence. A
named wine with no argument scores little or nothing **even when correct**; the same name *with* a
visible derivation scores well **even when wrong**. The marks live in the link.

**Evidence (verbatim):**
- "The examiners awarded **a much higher proportion of the marks available for identification for the
  argument rather than for the conclusion**." (2022 Practical, Paper 3, line 78)
- "many candidates went straight for Pinot Grigio **without proper arguments and lost many marks**. On
  the other hand, some candidates got good pass marks for Pinot Grigio, **but with arguments in
  winemaking and origin that made the choice more plausible**." (2024 Practical, Paper 1, lines 124–126)
- "If you, as an example, go straight to Napa Valley for W10 (which is from Cahors), **without any
  arguments for why that is such a natural choice, you will gain very few**" marks. (2023 Practical,
  Paper 2, lines 155–156)
- "this allows the examiner to **see your logic and award marks even if your conclusion is incorrect**."
  (2022 Practical, intro, line 31)

**Distinct reports:** 2022, 2023, 2024 Practical (+ the same principle in 2025, B11 below) → **4+**.
**Tier: STRONG SIGNAL.**

> *Mechanism.* The examiner cannot watch the candidate taste; the *only* observable is the written link.
> A bare label transmits no reasoning, so there is nothing to assent to — hence the 2024 Pinot Grigio
> case where the **identical conclusion** scored high or low purely on whether the link was shown.

### Component P2 — Internal consistency (tasting note, structure, and verdict do not contradict each other)

**Claim.** A conclusion is implausible the moment it contradicts the candidate's *own* reported
structure. The examiner checks the conclusion *against the evidence the candidate themselves wrote* — if
the stated alcohol/acidity/sugar/tannin cannot belong to the named wine, the conclusion is unbelievable
regardless of reasoning eloquence. This is the most mechanically detectable plausibility failure.

**Evidence (verbatim):**
- "the acidity across the wines was too high for this to be plausible." (re a Pinot Gris call) (2021
  Practical, Paper 1 Q2, line 101)
- "statements such as 'A VDN with an alcohol of 20%' cannot earn points and is illogical." (2022
  Practical) — internal impossibility between stated structure and named style.
- "candidates identified the wine incorrectly and **then put in figures of alcohol and sugar to match,
  rather than assess the evidence in the glass and come to a logical outcome**." (2022 Practical, Paper
  3, line 131)
- "to force other … characteristics of the wine, such as **tannin, body, alcohol, acidity, or oak use,
  into a mismatched identity**." (2025 Practical, Paper 2, lines 176–177)

**Distinct reports:** 2021, 2022, 2025 Practical → **3+**. **Tier: STRONG SIGNAL.**

> *Mechanism.* Internal consistency is the cheapest thing for the examiner to falsify — they need no
> wine knowledge, only to read the candidate's own numbers against the candidate's own label. A
> self-contradiction is the strongest single implausibility signal because it proves the reasoning was
> *retrofitted*, not derived (see §3 conditions and §4 anti-patterns).

### Component P3 — The deductive funnel (breadth of options visibly narrowed to a commitment)

**Claim.** The structural form that most reliably reads as plausible is the **funnel**: take a step back,
lay out the full evidence, put 2–3 genuine options on the table, argue for and against each, and narrow
to a decisive call. The funnel *makes the reasoning falsifiable and visible* — it shows the examiner the
route, not just the destination.

**Evidence (verbatim):**
- "taking a step back, considering all the relevant evidence from the glass and then using **deductive
  reasoning (funneling) to consider a few options. This allows the examiner to see your logic and award
  marks even if your conclusion is incorrect**." (2022 Practical, intro, line 31)
- "the funnelling technique is **by far the best method to construct a compelling argument** for
  geographical origin." (2017 Practical, Q, line 116)
- "Use the 'funnelling' technique for when the identity of a wine is unclear … try to narrow the field
  to two or three options." (2019 Practical, advice, lines 222–224)
- "Many students should have **used funnelling techniques more** or referred to the other wine in the
  pair." (2023 Practical, Paper 2, line 154)
- "taste like a detective; **argue like a lawyer**." (2019 Practical, Paper 3 Q3, lines 110–111)

**Distinct reports:** 2017, 2019, 2022, 2023 Practical → **4+**. **Tier: STRONG SIGNAL.**

> *Mechanism.* The funnel externalizes the deduction. An examiner reading "considered Barossa and
> Washington, rejected Washington for X, committed to Barossa" can audit each step; an examiner reading
> "Barossa Shiraz" can only check the endpoint. The funnel converts a guess into an *argument*, and the
> argument is the gradeable object.

### Component P4 — Ruling-out as well as ruling-in (the near-misses are visibly weighed and rejected)

**Claim.** Plausibility is reinforced not only by arguing *for* the chosen answer but by arguing *against*
the credible alternatives. Demonstrating that the candidate *considered and rejected* the near-misses
signals range and proves the commitment was deliberate, not lucky or narrow.

**Evidence (verbatim):**
- "The best answers made a balanced argument for Cabernet Sauvignon across all four wines … **whilst
  showing intelligent consideration to what it might have been, but was not**." (2017 Practical, via
  distinction_candidate_analysis §1.1)
- "we saw some beautiful answers using this knowledge to **exclude France and Hungary** from the list of
  possible origins." (re W7 botrytis flight) (2022 Practical, Paper 3, line 133)
- "You could get very high marks without identifying St Estèphe, but **you did need to show authority in
  considering the appellation options**." (2017 Practical, via distinction_candidate_analysis §1.1)
- The inverse failure — leaving alternatives *unconsidered* — is named: "many candidates **failed to
  consider alternative possibilities and left themselves little room to earn marks**." (2025 Practical,
  intro)

**Distinct reports:** 2017, 2022, 2025 Practical → **3**. **Tier: STRONG SIGNAL.**

> *Mechanism.* Ruling-out is evidence of *breadth* — the examiner is certifying a generalist. A candidate
> who only argues for one answer might know only one wine; a candidate who weighs and rejects two others
> demonstrates the comparative field-knowledge a Master is supposed to have. This is why "one-fact origin
> calls" are penalized even when not wrong (EK-0109): a single supporting fact shows no range.

### Component P5 — Commitment to a single best answer (the funnel must *terminate*)

**Claim.** A plausible answer **ends in a decision.** Reasoning that lays out options but never commits
reads as a lack of confidence and scores *worse than a committed wrong answer.* The funnel is only
persuasive if it narrows to a point; an un-terminated funnel transmits doubt.

**Evidence (verbatim):**
- "do not hide the answer in cryptic hints within the arguments. In some cases, it was hard to determine
  what answer the funneling ended up in, since arguments seemed to end with two or more options still
  considered. **A wrong answer yields more marks than an answer that is unfinished, so whatever you do:
  Make a choice.**" (2021 Practical, advice, line 174)
- "try to narrow the field to two or three options to avoid wasting precious time and **showing a lack
  of confidence**." (2019 Practical, advice, line 224 / corpus A20)

**Distinct reports:** 2019, 2021 Practical → **2**. **Tier: PLAUSIBLE** (strongly stated but in two
reports). *Note:* the underlying "make a choice / commit" prescription is the explicit complement to P3
and is reinforced indirectly by the many "well-argued committed wrong answer scored 5–6/8" cases (P6),
so the *behaviour* is better-attested than the two head-on statements; the head-on rule itself is tier
PLAUSIBLE.

> *Mechanism.* An open-ended answer gives the examiner nothing to assent *to* — there is no single claim
> to test for plausibility. Commitment is what converts a weighing exercise into a conclusion. Decisiveness
> is read as a competence signal (the calibration point in §3.4 of `examiner_confidence_model.md`).

### Component P6 — Calibrated confidence / appropriate hedging (the register matches the certainty the evidence supports)

**Claim.** Plausibility includes *tone calibration*: commit firmly when the evidence is decisive; weigh
openly (but still terminate) when it is genuinely ambiguous. Over-hedging a clear wine and over-claiming
an ambiguous one both dent plausibility. The examiner reads the *match* between the candidate's confidence
and what the glass actually supports.

**Evidence (verbatim):**
- "many still managed 5 or 6 marks out of the allotted 8 **if their reasoning was sound and their
  conclusion plausible**." (2025 Practical, Paper 1 Q2, line 87) — calibrated, plausible commitment is
  explicitly rewarded.
- "When they recognize a wine, they demonstrate confidence by **efficiently using relevant and correct
  evidence to prove their point. When unsure, these candidates offered reasonable alternatives based on
  evidence from the glass and then argued logically even if their conclusion was wrong**." (2023
  Practical, intro, lines 36–38) — the two-mode calibration, stated directly.
- "you must demonstrate consistency over three days of tasting and **justify your answers convincingly
  and with confidence**." (2023 Practical, intro / corpus A6)
- Over-claiming dents it: "calling a Côtes du Rhône … a Châteauneuf-du-Pape … **undermines the examiner's
  confidence**." (2025 Practical, intro / corpus A10)

**Distinct reports:** 2023, 2025 Practical (commit-vs-weigh, both directions) → **2**, with the building
direction reinforced across 2017/2018/2022 ("confidence and authority," "convincingly"). **Tier:
PLAUSIBLE** for the precise *two-mode calibration*; the components it is built from (commit-when-sure,
weigh-when-unsure) are individually STRONG. (See `examiner_confidence_model.md` EK-NEW-B: funnel when
uncertain, commit when certain.)

> *Mechanism.* Calibration is a meta-signal: it shows the candidate can tell *how hard the wine is*, which
> is itself a competence the exam certifies. A confident assertion on an ambiguous wine reads as not having
> noticed the ambiguity; over-hedging a banker reads as not knowing the banker.

### Component P7 — Glass-anchoring (every link is tied to a tasted attribute, not to the guessed label)

**Claim.** The single most important precondition of plausibility: the reasoning must run **from the
glass outward**, with each inference tied to a *reported sensory attribute*. The moment the answer starts
describing the *guessed wine* rather than the *wine in the glass*, plausibility collapses — the chain has
detached from its evidence base.

**Evidence (verbatim):**
- "a lot of points could have been gained from **simply describing what was in the glass even if the
  region was unknown**." (2024 Practical, Paper 3 Q2, lines 241–242)
- "having guessed the identity incorrectly, a lot of candidates then dropped marks by writing an answer
  for **what they had guessed it was, rather than referring to the wine itself**." (2021 Practical,
  Paper 1 Q1 / corpus D10)
- "answers to style and consumer appeal were **written based on an erroneous identification rather than
  by discussing what was in the glass**." (2024 Practical, Paper 2, lines 185–187)
- "candidates **relying too much on their noses** … leading them to force … tannin, body, alcohol,
  acidity, or oak use into a mismatched identity." (2025 Practical, Paper 2, lines 176–177)
- "Many invented attributes based on what they had decided the wine was, **rather than simply describing
  what was in the glass**. Even if candidates don't know the wine, they should **trust their palates**."
  (2021 Practical, Paper 2 Q4 / corpus D12)

**Distinct reports:** 2021, 2024, 2025 Practical → **3+**. **Tier: STRONG SIGNAL.**

> *Mechanism.* Glass-anchoring is what makes a wrong conclusion *survivable* (§3). If the downstream
> answer (quality, maturity, style, commercial) describes the glass, those marks stand on their own merits
> regardless of the ID. If it describes the guess, every downstream sub-answer inherits the wrong premise
> and the whole answer detaches. This is the hinge between "wrong but plausible" (rewarded) and "wrong and
> shoehorned" (the named cause of failure).

### Component P8 — Stylistic adjacency of the conclusion (the wrong answer lands in the right neighbourhood)

**Claim.** Even a perfectly-argued, glass-anchored chain earns *little* if the conclusion is
**stylistically implausible** for the wine. Plausibility of the *endpoint* still matters: partial credit
scales with how *close* the wrong call is to the truth in style-space. Reasoning rescues a wrong call
**only when the call is adjacent**; an implausible call earns little even with sound reasoning.

**Evidence (verbatim):**
- "Those who considered the USA and ended up in Australia still received some credit, however **Italy …
  was less plausible and few marks could be gained**." (2021 Practical, Paper 1 Q4 / corpus B5)
- "we do expect to see **plausible options for a wine of that style**, rather than an assumption that it
  is whatever the candidate has in mind … **Anyone who wasn't in the Rhône for this flight struggled to
  get many marks.**" (re Cornas) (2025 Practical, Paper 2, lines 152–154)
- "some of the conclusions were a little **implausible — Mourvèdre from Cahors? Tannat from Mendoza (not
  Cafayate)?**" (2018 Practical, Rhône-clue flight, line 291)
- "Spain, South Africa and Germany were **less plausible**." (2018 Practical, Q, line 284)
- "A few candidates managed to earn good points with **convincing arguments for Cabernet Sauvignon or
  Merlot, placing the third wine in Bordeaux instead of Tuscany**." (2025 Practical, Paper 2 / corpus
  B12) — Bordeaux↔Tuscany is *adjacent*, hence creditable.

**Distinct reports:** 2018, 2021, 2025 Practical → **3+**. **Tier: STRONG SIGNAL.**

> *Mechanism.* Adjacency is the examiner's proxy for "a sensible taster could land here." Australia-for-USA
> Syrah is a near-miss in the same warm-climate Shiraz space; Italy is not. The plausibility gradient is
> the conditional that the whole "wrong but plausible" principle rests on (§3), and it is exactly the
> signal the prose grader currently fails to operationalize (`plausibility_grading_gap_analysis.md`).

### Component P9 — Cross-referencing the flight (the conclusion is consistent with the rest of the set)

**Claim.** Within a flight, a conclusion gains plausibility when it is reconciled with the *other wines*
— using the most expressive wine to unlock the set, or excluding an origin because it is already
represented. A call that ignores the flight context (e.g. putting two wines in regions that the flight's
own logic forbids) reads as less plausible.

**Evidence (verbatim):**
- "where you have more than one wine to help you, **one of them will show enough character to open the
  door** … which many good students spotted." (2017 Practical, via distinction_candidate_analysis §1.1)
- "Most candidates … **remembered to draw on all four wines in their arguments**." (2025 Practical,
  Paper 1 Q2, line 88)
- "Many students should have used funnelling techniques more or **referred to the other wine in the pair
  for support of their choice of origin**." (2023 Practical, Paper 2, lines 154–155)
- "we saw some beautiful answers using this knowledge to **exclude France and Hungary**" because the
  classic alternatives were already in the same flight. (2022 Practical, Paper 3, line 133)

**Distinct reports:** 2017, 2022, 2023, 2025 Practical → **4+**. **Tier: STRONG SIGNAL.**

> *Mechanism.* The flight is a closed system the examiner designed; reasoning that exploits it (cross-
> referencing, mutual exclusion) demonstrates the candidate is treating the paper as the structured puzzle
> it is, which reads as sophistication. Ignoring it (e.g. 2021 P3Q1: "Although funneling led to Champagne,
> they still went for England or Italy") reads as not noticing the available evidence.

### Component P10 — Second-order insight that *reconciles conflicting evidence* (the distinction-tier plausibility move)

**Claim.** The most powerful single plausibility move in the corpus is **reconciling apparently
contradictory evidence with a higher-order inference** — turning a contradiction (which would normally
*destroy* plausibility, P2) into a *demonstration* of plausibility by explaining *why* both observations
are true. This is "under the skin of the wine," and it is the named gold-standard.

**Evidence (verbatim):**
- The named exemplar: a candidate reasoned that "although the sugar level suggests 5 or 6 Puttonyos, the
  exceptional quality indicates a producer whose wines would exceed the minimum sugar levels required for
  those classifications. It was an **insightful observation that instilled much confidence in the eyes of
  the examiners**." (2025 Practical, Paper 3 / corpus C4, A12)
- "they frequently lack confidence and play it safe by **not truly getting 'under the skin of the wine'**,
  which would show mastery." (2022 Practical, intro, line 35)
- "The best answers **logically described the style and quality and then tied these to how climate and
  winemaking would have played a part**." (2024 Practical, via distinction_candidate_analysis §1.7)

**Distinct reports:** 2022, 2024, 2025 Practical → **3** (the *reconciliation* form is fully spelled out
only in 2025; "under the skin" in 2022; causal chaining in 2024). **Tier: PLAUSIBLE→STRONG** — the
"under the skin" differentiator is STRONG across years; the specific *reconcile-conflicting-evidence*
form is illustrated in depth by one report (2025) but is the apex of the same family.

> *Mechanism.* Normally a contradiction between two pieces of evidence is the strongest implausibility
> signal (P2). The distinction move *resolves* it with a plausible higher-order cause (a top producer
> exceeding a legal minimum). This simultaneously (a) removes the contradiction and (b) demonstrates the
> candidate sees *one level deeper* than the rule — which is precisely what "confidence in the eyes of the
> examiners" responds to.

### The framework in one diagram

```
                    PLAUSIBILITY = believable link from reported glass to committed conclusion
                                              │
        ┌──────────────────────┬─────────────┼──────────────┬────────────────────────┐
   FOUNDATION              FORM            ANCHOR          ENDPOINT               APEX
   P2 internal             P3 funnel       P7 glass-       P5 commit              P10 reconcile
      consistency          P4 rule-out        anchoring    P6 calibrate              conflicting
   P1 evidence→            P9 cross-ref                    P8 stylistic              evidence
      conclusion link                                         adjacency           ("under the skin")
```
Read left-to-right: a plausible answer is **internally consistent** and **derived** (foundation), built
in **funnel form with the alternatives ruled out and the flight cross-referenced** (form), **anchored to
the glass throughout** (anchor), **committed and calibrated to a stylistically-adjacent endpoint**
(endpoint), and — at the top band — **reconciles its own contradictions with insight** (apex).

---

## 3 · The "Wrong but Plausible" Principle — fully documented

**The principle.** *A wrong conclusion can earn most of the available identification marks — and can
carry a borderline candidate to a pass — when the reasoning chain that produced it is sound, glass-
anchored, and lands on a stylistically plausible answer.* Conversely, a **correct** conclusion reached
**without** a visible plausible chain earns little. The exam grades the *route*, with the destination as
a multiplier scaled by adjacency.

**The strongest single piece of evidence** (2025 Practical, Paper 1 Q2, lines 85–87, verbatim):

> "this was reflected by very few of the marks available being awarded for getting the origin correct.
> No candidate identified all the origins correctly; indeed **over half did not get a single origin
> exactly right, however many still managed 5 or 6 marks out of the allotted 8 if their reasoning was
> sound and their conclusion plausible.**"

This is decisive: a majority of candidates got **zero origins exactly right** yet earned **5–6/8**. The
marks cannot be coming from correctness; they are coming from *plausible reasoning*. The sentence also
names both conditions in one breath — **"reasoning was sound AND their conclusion plausible"** — which is
the entire principle in the examiners' own words.

**Corroborating evidence across reports (the multi-report base):**
- "logical conclusion that gained good marks, **even if wrong**." (2018 Practical, re the Soave, line 180)
- "**convincing logic even if wrong**." (2023 Practical, intro, line 26)
- "the capability to make logical conclusions from the evidence in the glass (**even if conclusion is
  wrong**)." (2024 Practical, intro, line 48)
- "this allows the examiner to see your logic and **award marks even if your conclusion is incorrect**."
  (2022 Practical, intro, line 31)
- "Many students went for Grenache on W8, and **any plausible origin could get good marks if well
  argued**." (2023 Practical, Paper 2, lines 148–149)
- "some candidates got good pass marks for Pinot Grigio … with arguments … that **made the choice more
  plausible**." (2024 Practical, Paper 1, lines 125–126)

**Distinct reports for "wrong but well-reasoned still scores":** 2018, 2022, 2023, 2024, 2025 Practical →
**5**. **Tier: STRONG SIGNAL** (one of the best-attested findings in the entire corpus).

### Conditions under which "wrong but plausible" WORKS (earns the marks)

1. **The structural read is correct (P2/P7).** The wrong call must be a wrong *origin/variety* sitting
   on top of an *accurate* read of alcohol/acidity/tannin/RS. A wrong *structural* read does not qualify —
   it cascades (see fails, below). 2025 chair: poor structural reading "leads to incorrect statements
   about the wine's quality, style and commercial appeal" (intro). The origin-miss is survivable; the
   structural-miss is not.
2. **The conclusion is stylistically adjacent (P8).** USA→Australia: credit. USA→Italy: few marks.
   Bordeaux↔Tuscany: credit. "Anyone who wasn't in the Rhône … struggled" (Cornas). The wrong answer must
   be a *near-miss in style-space.*
3. **The downstream answer describes the glass, not the guess (P7).** Quality/maturity/style/commercial
   must be written about the wine actually in front of the candidate. If they are written about the
   guessed wine, the marks are lost regardless of the ID.
4. **The reasoning is committed and visible (P3/P5).** The funnel must terminate in a choice and the
   logic must be legible on the page (not "hidden in cryptic hints").
5. **There is no disqualifying theory howler attached.** A plausible chain that ends in a logical
   impossibility ("a VDN at 20%") is self-defeating — the impossibility re-asserts implausibility.

### Conditions under which it FAILS (does not rescue the answer)

- **Implausible endpoint** (violates P8): "Italy … less plausible and few marks." (2021)
- **Shoehorned / glass-detached** (violates P7): writing the answer for the guess. "led to the failure
  of many candidates." (2025 P2, line 178)
- **Internally inconsistent** (violates P2): structure invented to fit the label. "cannot earn points and
  is illogical." (2022)
- **Un-terminated** (violates P5): "arguments seemed to end with two or more options still considered …
  an answer that is unfinished" scores below a committed wrong answer. (2021)
- **Bare assertion** (violates P1): the correct *or* wrong name with no argument. "without proper
  arguments and lost many marks." (2024) / "lacking any justification beyond 'it can only be Grenache'."
  (2023)
- **On a banker, latitude shrinks** (qualifies P8): for must-know classics and constrained-option
  questions, only the correct/near-correct call earns full ID marks — "had to be in Tuscany" for full
  points (2022); "with the question limiting the number of possible origins, successful candidates really
  needed to be correct" (2024). The plausibility latitude is *generous on the curveball, strict on the
  banker* (see `distinction_candidate_analysis.md` §5.3, EK-0107).

**Net statement of the principle.** *Plausibility is reasoning-soundness × glass-anchoring × stylistic
adjacency, with theory-consistency as a gate and difficulty as a latitude multiplier.* Get the route
right and land in the right neighbourhood, and being at the wrong house still scores. Assert the right
house with no route, or build a flawless route to an impossible neighbourhood, and it does not.

---

## 4 · Anti-patterns — what makes a conclusion feel *implausible*

Each anti-pattern is the negative image of one or more components. Tiers as above.

### AP1 — Shoehorning: deciding the identity first, then forcing the evidence to fit (violates P1, P2, P7)

The master implausibility pattern, and the one the examiners name most. The candidate latches onto a
single feature, commits to an identity, then bends the remaining evidence to defend it — the reverse of
the funnel.

- "Often a candidate will **latch onto a single feature** … and then justify that initial assumption by
  **forcing the wine's components or structure to fit it. We call this shoehorning, and it was a
  significant issue this year.**" (2025 Practical, intro, lines 28–31)
- "tried to **shoehorn the wines into a region/style that simply wasn't logical**." (2024 Practical,
  Paper 3 Q2, line 241)
- "argued logically even if their conclusion was wrong **instead of trying to shoehorn their answer**."
  (2023 Practical, intro, line 38)
- "There was a lot of shoehorning on this year's paper two exam, and ultimately, it led to the **failure
  of many candidates**." (2025 Practical, Paper 2, line 178)

**Distinct reports:** 2023, 2024, 2025 Practical (word "shoehorn") → **3**; underlying first-impression-
write-to-fit behaviour also 2022 (E1) and 2019 (E9) → 5 for the behaviour. **Tier: STRONG SIGNAL.**

> *Why it reads as implausible:* shoehorning *inverts the direction of inference*. Plausible reasoning runs
> glass→conclusion; shoehorning runs conclusion→glass. The examiner detects it as a cascade: the structure
> contradicts the label (P2 fail) and the downstream answer describes the guess (P7 fail). It is the exact
> negative of the "wrong but plausible" virtue.

### AP2 — The description/verdict mismatch: the conclusion contradicts the candidate's own reported evidence (violates P2)

The conclusion is implausible *on the candidate's own terms*. "The acidity across the wines was too high
for this to be plausible" (2021, Pinot Gris); "A VDN with an alcohol of 20%" (2022). Also the
**quality-calibration** mismatch: describing modest structure but verdicting "exceptional," or vice
versa — "a significant minority thought it was exceptional quality despite the rather clumsy oak use"
(2025, distinction_candidate_analysis §1.2).

**Distinct reports:** 2021, 2022, 2025 Practical → **3+**. **Tier: STRONG SIGNAL.**

### AP3 — Unsupported leaps: a conclusion (right or wrong) with no visible derivation (violates P1, P5)

The bare label. "went straight for Pinot Grigio without proper arguments and lost many marks" (2024);
"go straight to Napa Valley … without any arguments … you will gain very few" (2023); "lacking any
justification beyond 'it can only be Grenache'" (2023, distinction_candidate_analysis §1.7). Also the
single-fact leap: "too many just stated Mosel … low alcohol and high sugar as the only argument" → few
marks (EK-0109, 2022).

**Distinct reports:** 2022, 2023, 2024 Practical → **3+**. **Tier: STRONG SIGNAL.**

### AP4 — Conclusions that ignore stated evidence / the flight (violates P9, and P3's "consider all evidence")

A call that disregards evidence the candidate had available. "Although funneling led to Champagne, they
still went for England or Italy" (2021 P3Q1) — the funnel pointed one way and the candidate went another.
Putting flight-mates in mutually-forbidden origins, or ignoring the most expressive wine that would
"open the door" (2017).

**Distinct reports:** 2017, 2021 Practical → **2**. **Tier: PLAUSIBLE.**

### AP5 — Second-guessing the examiner instead of reading the glass (violates P7)

Reasoning from "what the examiner probably chose" rather than from the evidence. "trying to guess what
the examiners had been planning" (2018, line 189); "a feeling of trying to second guess the examiners'
choices and little demonstration of knowledge of where Grenache wine is made" (2023, corpus D20); "It is
dangerous to second-guess examiners; much better to just look at what's in the glass" (2019, corpus D21).

**Distinct reports:** 2018, 2019, 2023 Practical → **3**. **Tier: STRONG SIGNAL.**

### AP6 — The un-terminated funnel: weighing forever, never committing (violates P5)

"arguments seemed to end with two or more options still considered … an answer that is unfinished" — and
"a wrong answer yields more marks than an answer that is unfinished" (2021). Reads as a lack of
confidence (2019, A20).

**Distinct reports:** 2019, 2021 Practical → **2**. **Tier: PLAUSIBLE.**

### AP7 — Trusting a misleading first impression on a counterintuitive wine (violates P3, P6)

On certain wines the snap call is *designed* to be wrong; committing to it without the funnel is
implausible. "immediately deciding that it was an amontillado and writing the answers from that. This was
not a question where the old rule 'go for the first impression' was relevant" (2019 P3Q3, line 109); "The
old saying that you should trust your first impression was proven wrong with this wine" (2022 P3 W5, line
139).

**Distinct reports:** 2019, 2022 Practical → **2**. **Tier: PLAUSIBLE.**

### AP8 — Theory howler at the end of the chain (violates the §3 gate)

A logical/factual impossibility re-asserts implausibility no matter how good the lead-up: "Sherry made
with 77% Brandy Alcohol"; "15 years Old Tawny Port"; "The wine has 70 g residual sugar and is therefore
a Beerenauslese" (2022, line 137); "Tawny Port aged in a solera," "Amontillado at 14.5%" (2025). At the
borderline this is decisive: "It is hard to feel confident about a borderline candidate when they make
obvious theory mistakes" (2024, corpus A9).

**Distinct reports:** 2022, 2024, 2025 Practical → **3+**. **Tier: STRONG SIGNAL.** (Documented at length
in `examiner_confidence_model.md` §3.1; included here as the plausibility *gate*.)

---

## 5 · The Plausibility Checklist

A written ID/origin answer can be tested against this. Each item maps to a component (P#) or anti-pattern
(AP#). Items 1–6 are the *necessary* conditions for a wrong answer to still score; 7–10 are the
*amplifiers* that lift a plausible answer toward the top band.

**Necessary (a wrong call survives only if ALL are yes):**

1. **Is the structural read accurate?** Are alcohol, acidity, tannin, RS read correctly *before* any ID
   is named? *(P2/P7; a wrong structural read cascades fatally — §3.)*
2. **Is the conclusion derived, not asserted?** Can the reader see the *route* from evidence to
   conclusion, not just the name? *(P1; fails AP3 if no.)*
3. **Is the answer anchored to the glass throughout?** Are quality/maturity/style/commercial written about
   the wine in front of the candidate, not the guessed wine? *(P7; fails AP1/AP5 if no.)*
4. **Is the conclusion internally consistent?** Does the named wine fit the candidate's own reported
   numbers, with no impossibility? *(P2; fails AP2/AP8 if no.)*
5. **Is the endpoint stylistically adjacent to the truth?** Is the wrong call a near-miss in style-space
   (warm-climate Syrah for warm-climate Syrah), not a different universe? *(P8.)* — *On a banker, this
   tightens to "is it correct?"; latitude is generous only on curveballs.*
6. **Does the funnel terminate in a single committed choice?** Is there one best answer, not a list left
   open? *(P5; fails AP6 if no.)*

**Amplifiers (turn a surviving answer into a strong/top one):**

7. **Are the credible alternatives visibly weighed and ruled out?** *(P4 — shows range.)*
8. **Is the flight cross-referenced?** Is the call reconciled with the other wines (most-expressive-wine
   key, mutual exclusion)? *(P9.)*
9. **Is the confidence calibrated to the evidence?** Firm where decisive, openly weighed where genuinely
   ambiguous — and not second-guessing the examiner? *(P6; fails AP5/AP7 if no.)*
10. **Does it reconcile any conflicting evidence with a higher-order insight?** Does it turn a
    contradiction into a producer-/site-level inference ("under the skin")? *(P10 — the distinction move.)*

**Scoring intuition (from the corpus, not a rubric):** 1–6 all yes on a curveball ≈ the "5–6/8 with sound
reasoning and plausible conclusion" band (2025) even with a wrong ID. Any of 1–4 "no" ≈ the shoehorn
cascade (few marks, borderline→fail risk). 7–10 present ≈ the strong-pass/distinction territory.

---

## 6 · Relationship to the rest of the study

- **Subset of confidence.** Plausibility is the *reasoning-quality* sub-component of the broader
  examiner-confidence judgement modelled in `examiner_confidence_model.md`. Confidence also draws on theory
  accuracy, communication, and quality calibration; plausibility is specifically "does this chain hang
  together and earn assent." A script can be plausible yet still fail confidence on a howler (the gate).
- **Operationalization gap (live).** `plausibility_grading_gap_analysis.md` shows the prose grader is
  *told* the plausibility gradient (P8) but is **not given the per-wine adjacency map** it needs to enforce
  it — so P8 is currently judged "by vibes." This framework's P8 + the §3 conditions are exactly what the
  recommended `stem_answer_keys.plausible` injection (P-1 in that doc) would let the grader apply.
- **EK ties.** P1/P3 ↔ EK-0007/0014/0090 (reasoning > ID, funnelling); P8 ↔ EK-0090 + EK-0108 (conditional
  on plausibility); P7 ↔ EK-0016/0091 (describe the glass; the cascade); P10 ↔ EK-0094/0105 (under the
  skin / reconcile conflicting evidence); AP1 ↔ EK-0009 (shoehorning); AP8 ↔ EK-0015/0093 (howler gate).

---

*Inputs: `outputs/research/confidence_language_corpus.md`; practical reports 2017–2025 in
`docs/examiners reports/extracted_txt/` (all load-bearing quotes verified verbatim against source line
numbers); `outputs/research/examiner_confidence_model.md`, `examiner_objectives.md`,
`distinction_candidate_analysis.md`, `plausibility_grading_gap_analysis.md`. Multi-report rule honoured:
STRONG SIGNAL = 3+ distinct reports, PLAUSIBLE = 2, EXAMPLE-ONLY = 1. Provenance: IMW reports are
member-gated; quotes are credible but year/paper attributions are corpus claims, not web-verifiable.*
