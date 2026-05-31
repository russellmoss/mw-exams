# Distinction Candidate Analysis — How Elite MW Practical Candidates Think

> **Scope.** This is a study of *distinction-level* practical-tasting behaviour — not average candidates.
> It mines every available IMW Practical and Chief Examiner report 2017–2025 for statements about the
> **best / stronger / outstanding / top-performing** candidates, clusters them by competency, builds a
> three-tier behaviour model (pass / strong pass / distinction), and adversarially audits the empirical
> knowledge base (`mw_exam_empirical_knowledge.md`) for places where distinction-level thinking is
> under-represented or where existing entries are overfit/incomplete/outdated.
>
> **Author's standing instruction honoured:** I searched as hard for evidence that current EK entries are
> *wrong* as for confirmation. The §5 audit below flags four places where the corpus actively complicates
> existing EK (EK-0006, EK-0007/0086/0090, and the study-system's own premise), not just gaps.
>
> **Primary sources (read in full):** `docs/examiners reports/` —
> Practical reports 2017, 2018, 2022, 2023, 2024, 2025; Chief Examiner reports 2021, 2022, 2023, 2024,
> 2025. Cross-checked against `outputs/heuristics/examiner_report_synthesis.md` and `grading_gap_analysis.md`.
> All quotes are verbatim from the named report; page numbers are approximate to the PDF.

---

## 0. The single most important framing fact: what "distinction" actually is

The MW practical has **no separate "distinction" award** — it has per-paper grade bands (2021 Chief
Examiner's Report, grade-boundary appendix, p.3):

| Band | Mark (per paper) | Meaning for this analysis |
|------|------|---------------------------|
| **A** | **70%+** | The "distinction" tier. Rare. The "outstanding / fantastic / full-marks" answers in the reports. |
| **B** | **65–69%** | Pass-band grade. |
| **C+** | **60–64%** | **Borderline** — the moderation band; "near pass". |
| C / D / E / F | <60% | Below pass-band. |

Two facts from the corpus reshape everything that follows:

1. **The bar is absolute (criterion-referenced), not a curve — and the overall standard is an *average*,
   not a per-paper hurdle.** "The standard required to pass the MW exam is fixed. There is not a quota for
   the pass rate, rather an absolute level (65%) which has to be met by candidates, year on year." (2021
   Chief). Crucially, the 2017 report states it as **"the average of 65% to pass"** — i.e. the overall
   pass is a **65% average across the three papers with a per-paper minimum floor** (~50%), so a strong
   paper can carry a weaker one provided the weak paper clears the floor. (This corrects the "65% **per
   paper**" wording in current **EK-0093**, which is flagged wrong — see the
   `ek-0093-pass-standard-correction` note and `outputs/research/examiner_confidence_model.md`, pending
   merge. It also explains why a weak Paper 3 is the classic borderline-decider: it drags the *average* or
   breaches the *floor*.) Pass rates swing wildly against this fixed bar — **8% (2021) vs 15% (2019) vs
   ~12% (2022–25)**. Distinction is clearing a fixed standard, independent of cohort.

2. **Distinction is consistency, not peak brilliance.** The decisive, repeatedly-stated finding:
   > "there were no high pass marks, which demonstrates that one off-day will not ruin one's chances, but
   > consistency is essential." (2022 Practical, Chair, p.1)

   In a year with passes, **not a single candidate scored an A.** Distinction-level performance is the
   ability to taste consistently well across **12 wines × 3 days, free from theoretical inaccuracy**
   (2017 Conclusion) — never a single brilliant flight carrying a weak paper. This is the most
   under-represented idea in the current EK and is the spine of the model in §4.

---

## 1. The distinction database — clustered, verbatim

Each record: **[year]** verbatim quote → *what distinction behaviour it implies*. `⚠` marks a finding
that complicates a common belief (mined under the adversarial mandate).

### 1.1 IDENTIFICATION

- **[2017]** "only the best candidates made intelligent guesses on possible origins, based on their
  theoretical knowledge of the options, using logical evidence from the glass as back-up… We did not
  expect candidates to get these wines spot on." → *On hard wines, pair theory-of-plausible-options with
  glass evidence; spot-on ID is not the expectation.*
- **[2017]** "The best answers went to Burgundy early in their argument and then used their theoretical
  knowledge of Burgundy to argue the correct origin." → *Commit to the broad region early, then deploy
  regional theory to narrow.*
- **[2017]** "where you have more than one wine to help you, one of them will show enough character to
  open the door… which many good students spotted." → *Use the most expressive wine in a flight as the
  key that unlocks the whole set.*
- **[2017]** "The best answers made a balanced argument for Cabernet Sauvignon across all four wines…
  whilst showing intelligent consideration to what it might have been, but was not." → *Name the variety
  AND explicitly weigh-and-reject the near-misses.*
- **[2017] ⚠** "You could get very high marks without identifying St Estèphe, but you did need to show
  authority in considering the appellation options." → *Precision of the reasoning outranks precision of
  the guess — you can score very highly without the exact appellation.*
- **[2018] ⚠** "Thankfully virtually everyone spotted Pinot Noir here. Not to have done so would have
  meant an inevitable failure in this question." / "a few didn't spot Riesling correctly – which made it
  almost impossible to pass this particular question." → *On a single-variety flight, missing the core
  variety is an automatic question-fail. ID still gates.*
- **[2018] ⚠** "the number who then went on to even consider that they might come from Hawkes Bay, one
  could count on the fingers of one hand… Please do not ignore Hawkes Bay as a source of first rate
  Syrah." → *Examiners plant emerging-region wines to reward a genuinely global frame; defaulting to
  established regions is a weakness.*
- **[2022]** "Examiners expected to see some justification for the country as well as the region within
  [Australia]." → *Justify the country, don't assume it.*
- **[2022] ⚠** "this year candidates did a better job of recognising the wines when they came from…
  classic varieties and classic regions… Yet they struggled when the origins were more obscure or were
  made from neutral varieties." → *The discriminator is performance on neutral/obscure wines, not the
  classics everyone gets.*
- **[2022] ⚠** "The old saying that you should trust your first impression was proven wrong with this
  wine." → *First impressions actively mislead on some wines; override instinct with analysis.*
- **[2023]** "W3 was only identified by a small number of students. Those who were familiar with the
  combination of moderate acidity and very high, dry tannins could take the opportunity to shine." →
  *Recognising a precise structural signature (→ Nebbiolo/Sagrantino) is a distinction differentiator.*
- **[2024] ⚠** "the SAME identification (Pinot Grigio) earned good marks OR lost marks depending purely
  on the supporting argument." (paraphrase of: "many went straight for Pinot Grigio without proper
  arguments and lost many marks… some got good pass marks for Pinot Grigio… with arguments… that made
  the choice more plausible.") → *Band is set by argument, not by the label.*
- **[2024] ⚠** "These were classic examples and with the question limiting the number of possible
  origins, successful candidates really needed to be correct and give good reasoning." → *When the option
  set is constrained, ID accuracy genuinely matters — latitude shrinks.*
- **[2024] ⚠** "the stumbling block was straight-up identifications of regions, grapes, residual sugars,
  and alcohols… there is no substitute for breadth of experience." → *On mixed flights, raw ID/calibration
  IS the discriminator.*
- **[2025]** "A lot of leeway was given when finding the identities of the most esoteric wines… Austrian
  Zweigelt and a Greek Xinomavro. Yet there were a few who correctly identified these." → *A small elite
  nails genuinely esoteric varieties; everyone else gets leeway only if logical.*
- **[2025] ⚠** "candidates relying too much on their noses… leading them to force… tannin, body, alcohol,
  acidity, or oak use into a mismatched identity." → *Distinction weights structure above aroma when they
  conflict.*

### 1.2 QUALITY

- **[2017] ⚠** "please do not assume that old world wines will always be the superior examples." /
  **[2018]** "The Kumeu River Chardonnay was frequently mistaken for good Burgundy… the quality was
  comparable." → *Judge quality on the wine's own merits; New World can equal Old World benchmarks.*
- **[2018] ⚠** "hardly anyone was sufficiently effusive about the quality of wine 12 [Chilean Cabernet]…
  just because the origin was correctly identified as Chile, the quality should be downplayed. … Chile is
  making world class Cabernet Sauvignon." / "the Chambolle-Musigny… the quality here was seriously
  underestimated." → *Origin-prestige bias runs BOTH ways; subtle/fine wines are commonly under-rated.
  Distinction = calibrated, origin-blind quality judgement.*
- **[2022]** "Quality answers generally do refer well to BLIC… but they frequently lack confidence and
  play it safe by not truly getting 'under the skin of the wine', which would show mastery." → *Go beyond
  the BLIC checklist to confident second-order insight.* **(This is the EK-0094 source quote.)**
- **[2023]** "many students stopped at 'Grand Cru Classé quality' although there is a rather large span
  between the top and bottom performers within that group." → *Discriminate WITHIN a classification, not
  just to it.*
- **[2024]** "Many candidates successfully identified the different levels of quality… using the full
  scale of quality levels from Grand Cru to high-volume entry-level wine. Those who were less successful
  stayed in the mid field, commenting more on differences in style than quality." → *Distinction uses the
  FULL quality range decisively; weak candidates hedge mid-field and conflate style with quality.*
- **[2024]** "few were prepared to sing the praises of wine 7 as much as they should have." → *Be boldly
  effusive about a genuinely great wine — under-calling greatness loses marks.*
- **[2025]** "calling a Côtes du Rhône a Châteauneuf-du-Pape, or describing the Ruby Port… as a vintage
  Port, undermines the examiner's confidence." (quality >20% of marks; a top-2 cause of failure) →
  *Calibrate to the correct rung; over-calling dents confidence as much as under-calling.*
- **[2025]** "Even if we don't ask for it specifically, we do expect an official quality level if there
  is one and it is relevant" (Beerenauslese, Reserva, VORS volunteered unprompted). → *Volunteer the
  correct official tier whenever the inferred origin has a defined ladder.*
- **[2025]** "a significant minority thought it was exceptional quality despite the rather clumsy oak
  use." → *Read winemaking faults as quality-limiting evidence.*

### 1.3 COMMERCIAL

- **[2022]** "the best answers considered domestic against international appeal, on trade versus off
  trade, supermarkets versus specialists, summer versus winter… some students only seemed to know the on
  trade." → *Span multiple axes (geography, channel, retail tier, seasonality), not a single lens.*
- **[2023]** "they offer original responses to commercial potential questions by using their theory
  knowledge instead of offering rote responses." → *Original, theory-informed commercial reasoning beats
  templates.*
- **[2023] ⚠** "Steakhouses are often mentioned… The examiners were happy to see that food recommendations
  were much less common this year." / **[2022]** "Food pairings… rarely rewarded with any marks." →
  *Food pairing and the steakhouse trope are time-wasting and rarely scored.*
- **[2024]** "Candidates should be able to easily garner full marks for commercial responses if they have
  thought about and studied the types of wines that may show up… instead of the typical, rote responses
  of selling the wine in fine-dining restaurant, by wine-by-the-glass, or to affluent connoisseurs." →
  *Full commercial marks come from pre-prepared, wine-specific insight, not generic channels.*
- **[2024]** "Using 'entry level' with a £15 price tag clearly shows the candidate has no idea of the
  price of a bottle of Yellowtail… candidates who thought 50 USD was a normal price for a top-quality
  Premier Cru white Burgundy." → *Accurate real-world price anchors at both ends of the market.*
- **[2025]** "We expect students to tell us where we can find this wine. On or off trade? Specialist or
  supermarket? Michelin Star restaurant or the local pub?… And don't forget to use evidence from the
  glass." → *Concrete, specific placement justified by the glass.*
- **[2025]** "the question becomes what other wines around the world they might be competing with, and
  how they compare qualitatively." → *Benchmark esoteric wines against their true GLOBAL competitive set.*
- **[2023]** "Answers with a complete disregard of financial issues will appear naïve and out of touch
  with the realities of the wine industry." (Chief) → *Commercial awareness is a cross-paper distinction
  marker; ignoring it reads as naïve regardless of tasting skill.*

### 1.4 MATURITY

- **[2017]** "When discussing vintage, it is important to show logical consideration of all the possible
  vintages." → *Weigh several plausible vintages logically, don't assert one.*
- **[2022 / 2023]** The four-part formula (full-mark maturity answer): "current age (incl. vintage) →
  ready now vs benefit from ageing → how long it might improve → how long it will hold before it
  declines." → *Complete, four-part maturity answer.* **(Already EK-0011.)**
- **[2023]** "The best answers described both positive and negative evolution trajectories." → *Describe
  BOTH the upside and the decline path, not just upside.*
- **[2023]** "examiners expect some reasonable time frame for the long maturation, not just 'matured for
  many years'." → *Specific quantified timeframes.*
- **[2024] ⚠** "any number of answers showed no knowledge of the characteristics of recent vintages in
  the classic regions of Italy and Spain… exposed the lack of vintage knowledge many have outside of
  Bordeaux." → *Command of recent AND historic vintages across multiple classic regions (not just
  Bordeaux) is a real differentiator.*
- **[2024]** "Q2 asked to suggest an ideal drinking window, which is another way of asking about maturity,
  but some candidates failed to recognize that." → *Recognise re-framings ("drinking window" = maturity).*

### 1.5 WINEMAKING

- **[2017/2018] ⚠** "Many more answers found oak when it wasn't there than vice versa." / **[2023]** "how
  many candidates missed the obvious new oak use on wines 6, 8 and 11." → *Honest, evidence-led oak
  detection (both false-positives and false-negatives are weak-candidate tells).*
- **[2022]** "examiners look for winemaking answers that mention concise fermentation temperatures or
  discuss not only the type and size of oak… but how long in oak and the percent of new oak used with
  evidence." → *Specific and quantified: ferment temps, oak size/age/duration/%new, each tied to the
  glass.*
- **[2022]** "far too many do not consider malolactic conversion and lees work… Their absence is as much
  of a winemaking choice as their presence." → *Treat the ABSENCE of MLF/lees as a deliberate decision
  worth discussing.*
- **[2022/2023]** "describe the production process in a more logical manner, from reception to bottling."
  / "For all sweet wines we expected candidates to answer how fermentation was stopped. Cooling?
  Fortification? Naturally?… a short sentence about HOW this was done [earns the extra marks]." →
  *Chronological process; prioritise the style-defining production question; explain the mechanism, not
  just the outcome.*
- **[2023]** "too few considered the use of reserve wines or gave an accurate assessment of the time
  spent on lees." → *Name the less-obvious levers (reserve wines, accurate lees duration).*
- **[2024] ⚠** "some candidates seemed to use copy/paste… using cold soak on virtually every wine." /
  "obsessed by whole bunch and found evidence of it in every wine, whilst missing the oak usage present."
  → *Distinction reads each glass freshly; fixating on a fashionable technique blinds you to actual
  evidence.*
- **[2024/2025]** Borderline-sinking theory howlers: "Sauternes fermented at 16°C in stainless steel";
  "Muscat Beaumes de Venise has 90 g/L RS"; "Tawny Port aged in a solera"; "Amontillado has 14.5%
  alcohol." → *Technically credible numbers/processes are a distinction gatekeeper. "It is very hard, if
  not impossible, to pass… without knowing how Madeira or Sherry is made" (2025).*

### 1.6 COMMUNICATION

- **[2018]** "It's essential that enthusiasm and a genuine love of great wines comes through… the best
  candidates clearly enjoyed those wines, despite the pressure." / **[2025]** "When candidates can convey
  the genuine pleasure they experience in tasting a 40-year-old Tawny, that enthusiasm is shared by those
  reading the paper." → *Conveyed, evidenced enthusiasm registers positively.*
- **[2018]** "We are looking for confidence and authority… written convincingly and with consistency." /
  "use professional language… Imagine you are talking to a respected, senior member of the trade." (slang
  like "stonking," "icon," "Goldilocks" reflects poorly). → *Confident, authoritative, professional
  MW-to-MW register.*
- **[2022]** Chief: "Too often we see good thinking obscured by poor communication… write, or type, at an
  appropriate pace, with clarity and accuracy." / "if typing, please type less and check your work."
  (2018) → *Concise, accurate, well-paced writing; a "word-dump" hurts. Less-but-checked beats more.*
- **[2023] ⚠** "an increasing number of answers appear repetitive and are clearly using cut and paste. It
  is unlikely examiners have chosen two wines with the same attributes." → *Differentiate every wine;
  templated/cut-paste answers are penalised.*
- **[2025]** "structuring their answers carefully and being selective in their arguments." → *Selective,
  structured argument — not exhaustive — is itself rewarded.*
- **[2024]** "Most of those who passed answered parts [worth over a third of the marks] thoughtfully and
  comprehensively; those who fell short nearly always gave inadequate answers to these two questions." /
  "look carefully at mark allocation before starting writing and plan their time accordingly." → *Triage
  to the highest-mark sub-questions and answer them in full; read the tariff first, time-budget to it.*
- **[2018/2022/2023]** Blank sections / uneven depth repeatedly named as the literal reason C+ papers miss
  a B. → *Complete every section; depth proportional to marks.* **(Links EK-0017.)**

### 1.7 ANALYTICAL REASONING (the master competency)

- **[2022]** "taking a step back, considering all the relevant evidence from the glass and then using
  deductive reasoning (funneling) to consider a few options. This allows the examiner to see your logic
  and award marks even if your conclusion is incorrect." → *The signature distinction move: funnel from
  full evidence to a shortlist with for/against.* **(EK-0014.)**
- **[2022]** "statements such as 'A VDN with an alcohol of 20%' cannot earn points and is illogical." →
  *Internal consistency between stated structure and conclusion is itself scored.* **(EK-0091.)**
- **[2023] ⚠** "there was a feeling of trying to second guess the examiners' choices and little
  demonstration of knowledge of where Grenache wine is made." → *Reason from the glass and real regional
  knowledge — NOT from meta-gaming what the examiner "probably" chose.*
- **[2023]** "The best answers wove a beautiful argument; far too many were lacking any justification
  beyond 'it can only be Grenache'." / **[2024]** "The best covered all of the structural elements and
  referred to each of the wines drawing together a convincing argument." → *Weave a SINGLE coherent
  argument across all wines in a flight, anchored in structure + rejected alternatives.*
- **[2024]** "The best answers logically described the style and quality and then tied these to how
  climate and winemaking would have played a part… Too many concentrated on just one thing." → *Chained
  causal reasoning (style/quality ← climate + winemaking); monothematic answers under-score.*
- **[2025] — THE NAMED GOLD-STANDARD EXAMPLE.** A candidate identified a Tokaji Szamorodni and reasoned
  that "although the sugar level suggests 5 or 6 Puttonyos, the exceptional quality indicates a producer
  whose wines would exceed the minimum sugar levels required for those classifications. It was an
  insightful observation that instilled much confidence in the eyes of the examiners." → *Reconcile
  CONFLICTING evidence (sugar vs classification) with a producer-level inference. This single, examiner-
  praised move is the clearest concrete picture of distinction reasoning in the entire corpus.*
- **[2025]** "some panicked [when faced with the unknown]." → *Composure with unfamiliar wines.*
- **[2024] Chief ⚠** "an over-reliance on the excellent study programme is eroding students' ability to
  think for themselves… Those who simply assimilate information that is provided for them and repeat this
  in the exam room will not pass." / "a general lack of critical thinking seen throughout the exam." →
  *Independent critical thinking — not rote recall of study materials — is the Chief Examiner's named
  top-band discriminator. (Direct tension with any template/decision-tree study method; see §5.)*
- **[2023] Chief ⚠** "knowledge… commonly limited to the standard written references and seminar
  presentations. Where information has been gathered from wider sources, preferably at first hand… greater
  depth of understanding may be achieved." → *First-hand, diverse sourcing beyond the canon gives the
  depth that separates the top band.*
- **[2025] Chief** "Be honest with yourself… don't be tempted to 'shoehorn'… Have you answered the
  question in front of you?… be certain you can answer all parts of the question to the required standard."
  → *Ruthless self-honesty: describe only what the glass shows; answer the actual question; self-select
  questions you can fully complete.*

---

## 2. Pass vs distinction — the separators, in one table

| Competency | What PASS-level candidates do | What DISTINCTION candidates do | The separator |
|---|---|---|---|
| **Identification** | Get variety + broad region with leeway; well-argued wrong answers score 5–6/8 | Nail even esoteric varieties; use the most expressive wine to unlock the flight; weight structure over aroma; read counterintuitive IDs | **Precision of *reasoning*, not of the guess** — plus genuine breadth that lands the hard wine |
| **Quality** | Place wine on a ladder with some context; spot relative quality in a pair | Use the FULL range decisively; discriminate WITHIN a classification; volunteer official tiers unprompted; effusive about greatness; origin-blind | **Decisive, calibrated, origin-blind judgement across the whole scale** |
| **Commercial** | Name a channel + a price | Multi-axis (geo/channel/tier/season); theory-informed; global competitive set; glass-linked; no clichés | **Original insight tied to the glass, not rote channels** |
| **Maturity** | Comment on bottle age | Four-part formula; BOTH evolution trajectories; quantified timeframes; vintages beyond Bordeaux | **Specificity + breadth of vintage knowledge + the decline path** |
| **Winemaking** | Identify headline techniques (oak) | Quantified specifics; absence-as-choice; mechanism not just outcome; reads each glass freshly; technically flawless | **Specific, mechanism-level, evidence-led, theory-accurate** |
| **Communication** | Full sentences; addresses most parts | Confidence + authority + enthusiasm; bespoke per wine; selective; triages to high-mark parts; completes everything | **Voice + completeness + mark-aware triage across 3 days** |
| **Analytical reasoning** | Makes a choice; logical even if wrong | Single woven argument across the flight; reconciles conflicting evidence; independent critical thinking; composure | **Synthesis + conflict-resolution + thinking for oneself** |

---

## 3. The cross-cutting distinction meta-findings

These sit above any single competency and are the least represented in current EK:

1. **Distinction = consistency, not peak.** "No high pass marks" even in good years (2022). The A grade
   comes from no weak sections across 12 wines × 3 days, not from one virtuoso flight.
2. **Theory accuracy is the borderline gate — and the distinction ceiling.** "what frequently determines
   whether a borderline candidate achieves an overall pass… is their theory knowledge" (2024). A single
   howler tips a C+ to F; for an A, theory must be flawless. **"The practical exam is a theory exam with
   a tasting."**
3. **Independent critical thinking > rote knowledge.** The Chief Examiner's explicit headline (2024).
   Memorised templates repeated in the room "will not pass."
4. **Honesty is a named MW skill.** Describe only what's in the glass; answer the actual question; pick
   questions you can fully complete (2025 Chief).
5. **Preparation quality, not attempts, drives results.** First-time sitters slightly out-performed
   repeat sitters (2024: 13.2% vs 11.8%); clear first-time passes are "a sign… of better prepared
   candidates" (2023).
6. **Distinction reasoning is the SAME move everywhere:** evidence first → plausible options → for/against
   → decisive commit → linked to quality/commercial. The Tokaji example (§1.7) is its purest form.

---

## 4. The Distinction Candidate Model

For each competency, three graduated bands. **Pass** ≈ scrapes/holds a B (65–69%); **Strong pass** ≈
comfortable B / low A; **Distinction** ≈ A-grade (70%+) behaviour as described by examiners as
"outstanding / fantastic / full marks." These are *behaviours*, observable in a written answer.

### 4.1 Identification
- **Pass:** Commits to a variety and a broad region. Makes a choice rather than hedging. On a hard wine,
  offers a plausible guess. Gets the bankers/classics right.
- **Strong pass:** Funnels — lays out 2–3 options with evidence for and against, justifies the *country*
  (doesn't assume it), and narrows with regional theory. Cross-references the flight. Lands the
  near-miss within the right family (5–6/8 on origin even when literally wrong).
- **Distinction:** Lets *hard structural evidence override a tempting aromatic guess*. Uses the single
  most expressive wine as the key to the whole flight. Lands genuinely esoteric varieties (Zweigelt,
  Xinomavro, Palo Cortado, St-Péray Roussanne) and counterintuitive identities (a *dry* Sauternes). On a
  constrained-option or banker question, is simply *correct* — recognising that latitude has shrunk.

### 4.2 Quality
- **Pass:** Positions the wine on a quality ladder with some context. Recognises which wine in a pair is
  better.
- **Strong pass:** Anchors to the official classification (Grand Cru Classé, DOCG, Prädikat, VORS, Cru
  Classé) and judges quality *in the context of origin* when asked. Pairs a quality statement with a
  realistic price.
- **Distinction:** Uses the *full* quality scale decisively (Grand Cru ↔ entry-level) and discriminates
  *within* a classification (top vs bottom of Grand Cru Classé). Is boldly effusive about a great wine
  and unsentimental about a flawed one. Origin-blind in both directions (no Old-World halo, no New-World
  penalty). Reads winemaking faults (clumsy oak) as quality-limiting. Gets "under the skin" — a
  second-order, producer- or site-level insight (the Tokaji producer-exceeds-minimum-sugar move).

### 4.3 Commercial
- **Pass:** Names a trade channel and a price point.
- **Strong pass:** Covers domestic + export, on/off-trade, specialist/supermarket, and a realistic
  evidence-based price. Avoids the steakhouse/food-pairing trap.
- **Distinction:** Offers original, theory-informed positioning (drawing on Papers 4/5 market knowledge),
  benchmarks the wine against its true *global* competitive set, and ties every commercial claim back to
  evidence in the glass. Reads as a working professional, not a candidate reciting channels.

### 4.4 Maturity
- **Pass:** Notes the apparent bottle age.
- **Strong pass:** Delivers the four-part formula — current age/vintage → drink-now vs hold → how long it
  improves → how long it holds before decline — with specific timeframes.
- **Distinction:** Describes *both* the positive and negative evolution trajectories, deploys command of
  *recent and historic* vintages across *multiple* classic regions (Italy, Spain, not just Bordeaux), and
  recognises maturity re-framings ("ideal drinking window").

### 4.5 Winemaking
- **Pass:** Identifies the headline techniques and gets the obvious oak call right.
- **Strong pass:** Walks the process chronologically (reception → ferment → maturation → bottling), treats
  the *absence* of MLF/lees as a deliberate choice, and ties each technique to a sensory marker.
- **Distinction:** Specific and quantified (ferment temps, oak size/age/duration/%new, lees duration,
  reserve-wine use), explains the *mechanism* (how the rosé colour was achieved, how fermentation was
  stopped), reads each glass freshly (no copy-paste cold-soak/whole-bunch), and is *technically flawless*
  — no impossible numbers on fortified/sweet wines.

### 4.6 Communication
- **Pass:** Writes full sentences and addresses most parts of the question.
- **Strong pass:** Reads the mark allocation first and time-budgets to it; answers every sub-part;
  describes style succinctly; writes bespoke notes per wine (no templating).
- **Distinction:** Confident, authoritative, professional MW-to-MW register; conveys *genuine, evidenced
  enthusiasm*; is *selective* (argues the few decisive points, not everything); triages comprehensively to
  the highest-mark sub-questions; and sustains this with **zero weak sections across all three days.**

### 4.7 Analytical reasoning
- **Pass:** Makes a logical deduction from the glass — and commits to a conclusion even when unsure.
- **Strong pass:** Funnels with explicit for/against, keeps the structure–conclusion internally
  consistent, and reasons *from the glass outward* (never from a guessed label).
- **Distinction:** Weaves a *single coherent argument across the entire flight*; *reconciles conflicting
  evidence* with insight (the gold-standard move); reasons *causally* (style ← climate + winemaking);
  stays composed with the unknown; and — the Chief Examiner's headline — *thinks independently* rather
  than reciting study material.

---

## 5. EK audit — where distinction-level thinking is under-represented or contradicted

The user's standing instruction was to hunt as hard for evidence that EK is *wrong* as for confirmation.
Four findings, ordered by importance.

### 5.1 EK-0094 is the only distinction entry, and it is thin (GAP)
EK-0094 (tier PLAUSIBLE) captures "under the skin" + enthusiasm + the producer-sugar inference. But the
corpus shows distinction is a **system of cross-competency behaviours**, repeated every year, not a
single "top-band differentiator." EK-0094 omits, among others: *use the full quality range decisively*
(2024); *discriminate within a classification* (2023); *distinction = consistency not peak / no-A-years*
(2022); *weave one argument across the whole flight* (2023/2024); *reconcile conflicting evidence* (the
named 2025 example — present in EK-0094 but framed too narrowly as "exceeds minimum sugar," not as a
general move). **Recommendation:** keep EK-0094 but add a cluster of new entries (§6) and promote the
consistency finding to STRONG SIGNAL.

### 5.2 EK-0006 "ID is being de-emphasized" is overfit to a 2022→2023 slope (CONTRADICTION/OUTDATED)
EK-0006 reads the trend as a *directional decline* (ID 46%→39%, Quality 22%→37%). The fuller corpus shows
ID weighting is **volatile and plateaued, not monotonically declining**: 46% (2022) → 39% (2023) → **39%
(2024, still the single largest category)**. The Chair's own 2024 framing: theory-type questions are 42%,
**ID 39%, quality 19%** — ID remains the *largest single category*. And examiners repeatedly tie *ID
ability to pass volume*: 2022 P2 (classic wines) had the most passes *because* the wines were
identifiable; 2023's *lowest-pass* paper (P2, 14.3%) was full of easy-to-ID classics that candidates
couldn't *quality-assess*. **The accurate claim is not "ID is being de-emphasized" but "ID is necessary
but not sufficient, its weighting swings ±7 pts year to year and is unknowable in advance, and it remains
~40% of marks and the largest single category."** This nuance protects against a student under-investing
in identification. (It does *not* contradict CLAUDE.md's "variety+region is the target, producer/vintage
is bonus" — that distinction is sound; it's the "being de-emphasized" *trend language* that overfits.)

### 5.3 EK-0007/0086/0090 reasoning-credit is real but the latitude is WINE-DEPENDENT (INCOMPLETE)
EK rightly states wrong-but-reasoned answers score well (EK-0007) on a plausibility gradient (EK-0090).
But the corpus adds a hard boundary EK doesn't state: **for "paramount" classic regions and "must-know"
bankers, only the correct answer gets full ID marks — latitude is reserved for genuinely hard/esoteric
wines.** "To get full points… candidates had to be in Tuscany" (2022); "California Zinfandel remains a
must-know" (2022); "with the question limiting the number of possible origins, successful candidates
really needed to be correct" (2024). A grader that awards generous partial credit on a *banker* miss is
mis-calibrated. **Recommendation:** new entry making the banker/esoteric latitude split explicit (links
EK-0029).

### 5.4 The study system's own premise is flagged by the Chief Examiner (META-CONTRADICTION)
The 2024 Chief Examiner: "an over-reliance on the excellent study programme is eroding students' ability
to think for themselves… Those who simply assimilate information… and repeat this in the exam room will
not pass." Copy-paste/templated answers are explicitly penalised (2023, 2024). **This is a direct,
load-bearing tension with a decision-tree / template-driven study app.** It does *not* invalidate the
trees — but it means the trees must be positioned as *scaffolding for independent reasoning*, and the
app's generated model answers must never read as recited templates (they must reconcile evidence freshly
per wine). This belongs in EK as an explicit design caution, because it constrains how every downstream
generator should behave.

*(Minor, also worth noting: "trust your first impression" is contradicted for some wines (2022); the
decision trees' "fast family recognition" should carry a revise-against-structure step.)*

---

## 6. Proposed EK additions

Drafted in the house format, tiered and cited, numbered from the next free ID (highest existing is
EK-0103). These are proposals for the user to review and merge into §2/§3 of
`mw_exam_empirical_knowledge.md`.

---

### EK-0104 · Distinction is consistency across three days, not peak brilliance
- **tier:** STRONG SIGNAL · **status:** proposed
- **evidence:** 2022 Practical (Chair, p.1); 2017 Conclusion ("the average of 65% to pass"); 2021 Chief (grade bands)
- **claim:** The **per-paper** grade bands are **A 70%+ (top/"distinction" tier), B 65–69%, C+ 60–64%
  (borderline), <C below-pass**, against a *fixed criterion-referenced* standard (no curve). The overall
  pass is a **65% average across the three papers with a per-paper floor (~50%)** — NOT 65% per paper
  (corrects EK-0093; see `ek-0093-pass-standard-correction` / `examiner_confidence_model.md`). The A grade
  is rare — in some
  passing years (2022) **no candidate scored a high pass at all**. Distinction-level performance is
  therefore defined by **consistency** — tasting well and answering completely across all 12 wines × 3
  days, "free from theoretical inaccuracy" — **not** by one brilliant flight. One off-day will not sink a
  candidate, but a single weak section caps the ceiling. **Implication for generators/graders:** reward
  sustained competence; do not let a virtuoso passage on one wine inflate an overall verdict when other
  sections are thin. (Complements EK-0093's absolute-65% mechanics with the band structure and the
  consistency principle.)

### EK-0105 · The Distinction Reasoning Move — reconcile conflicting evidence
- **tier:** STRONG SIGNAL · **status:** proposed
- **evidence:** 2025 Practical P3 Q3 (the examiner-praised Tokaji example); 2023 P3 Q4; 2024 P2 Q3
- **claim:** The single behaviour examiners most explicitly reward at the top band is **resolving
  contradictory evidence with an insightful, often producer- or site-level inference** — e.g. "the sugar
  suggests 5–6 Puttonyos, but the exceptional quality indicates a producer whose wines exceed the minimum
  required, so this is a top Szamorodni." The same move appears as **weaving one coherent argument across
  every wine in a flight** (not piecemeal notes) and as **causal chaining** (style/quality ← climate +
  winemaking). Generated model answers should demonstrate this where the evidence genuinely conflicts;
  graders should award top marks for it. This is the operational definition of EK-0094's "under the skin."

### EK-0106 · ID weighting is volatile and ~40% — necessary but not sufficient (refines EK-0006)
- **tier:** STRONG SIGNAL · **status:** proposed (refines EK-0006)
- **evidence:** 2022 (ID 46%), 2023 (39%), 2024 (39%, largest single category; quality 19%, theory-type
  42%); 2022 P2 high-pass / 2023 P2 low-pass paradox
- **claim:** Replace the "ID is being de-emphasized" *trend* framing with: **ID weighting swings ±7 pts
  year to year (46→39→39) and is unknowable in advance, but remains ~40% of marks and the single largest
  category.** It is **necessary-but-not-sufficient**: examiners tie ID *ability* to pass volume (the most
  identifiable paper, 2022 P2, had the most passes), yet the *lowest-pass* paper (2023 P2) was full of
  easy classics that candidates failed to quality-assess. Do not let a candidate (or a generator)
  under-invest in identification on the assumption it is "being phased out." (Does not change the
  variety+broad-region = target / pinpoint-appellation+producer+vintage = bonus split, which holds.)

### EK-0107 · Latitude for wrong answers is wine-dependent — bankers get none (refines EK-0090)
- **tier:** STRONG SIGNAL · **status:** proposed (refines EK-0007/EK-0086/EK-0090)
- **evidence:** 2022 P2 Q2 ("had to be in Tuscany" for full points); 2022 ("California Zinfandel remains
  a must-know"); 2024 P2 Q2 ("really needed to be correct" on constrained options)
- **claim:** The reasoning-credit / plausibility-gradient principle (EK-0007/0090) applies to **genuinely
  hard or esoteric wines**. For **bankers and paramount classic regions** (the wines EK-0029 says every
  flight must contain), examiners give **little or no latitude** — only the correct region earns full ID
  marks, and a banker miss reads as a knowledge gap. Graders should scale partial credit by wine
  difficulty: generous on the curveball, strict on the banker.

### EK-0108 · Independent critical thinking beats rote — the study-system caution
- **tier:** STRONG SIGNAL · **status:** proposed
- **evidence:** 2024 Chief ("over-reliance on the… study programme is eroding students' ability to think
  for themselves… repeat this in the exam room will not pass"; "lack of critical thinking… throughout");
  2023/2024 copy-paste penalties; 2023 Chief (first-hand/diverse sourcing → depth)
- **claim:** The Chief Examiner's named top-band discriminator is **independent critical thinking**, not
  recall of study materials; templated/cut-paste answers are explicitly penalised and "create
  considerable doubt in the mind of the reader." **Design implication for this app:** decision trees and
  matrices are *scaffolding for reasoning under time pressure, not answers to recite.* Every generated
  model answer must reason **freshly from the specific glass** (differentiated per wine, evidence-led,
  reconciling its own structure) and must never read as a recited template. Also: depth comes from
  first-hand/diverse experience beyond the canonical texts — reflected by varying examples and avoiding
  seminar-stock phrasing.

### EK-0109 · Quality is judged across the full scale, within-class, and origin-blind (extends EK-0008/EK-0092)
- **tier:** STRONG SIGNAL · **status:** proposed (extends EK-0008, EK-0092)
- **evidence:** 2024 P1 Q1 (full Grand-Cru-to-entry scale; weak candidates "stayed in the mid field");
  2023 P2 (discriminate within Grand Cru Classé); 2018 (Chambolle under-rated, Chilean Cab under-praised);
  2025 (quality >20% of marks, a top-2 failure cause)
- **claim:** Distinction quality assessment (a) uses the **full quality range decisively** rather than
  hedging mid-field, (b) **discriminates within a classification** (top vs bottom of Grand Cru Classé),
  (c) is **origin-blind in both directions** (no Old-World halo, no New-World penalty; subtle classics are
  commonly under-rated and great "lesser-origin" wines under-praised), and (d) **volunteers the official
  tier unprompted** when the inferred origin has one. Over-calling (CdR→CdP, Ruby→Vintage Port) dents
  examiner confidence as much as under-calling. Conflating *style* with *quality* is a pass-level tell.

### EK-0110 · Vintage/maturity breadth beyond Bordeaux, and both evolution paths (extends EK-0011)
- **tier:** PLAUSIBLE · **status:** proposed (extends EK-0011)
- **evidence:** 2023 P1 Q2 ("best answers described both positive and negative evolution trajectories");
  2024 P2 Q2 ("no knowledge of recent vintages in… Italy and Spain… outside of Bordeaux")
- **claim:** Beyond the four-part maturity formula (EK-0011), distinction answers (a) describe **both the
  positive and the negative** evolution trajectory (not just upside), and (b) deploy **recent and historic
  vintage knowledge across multiple classic regions** (Italy, Spain, Germany — not only Bordeaux).
  Recognise maturity re-framings such as "ideal drinking window." Vintage knowledge is a real
  differentiator, not "bonus."

---

## 7. One-line summary for the candidate

> **Pass** = make a defensible choice and answer every part. **Distinction** = read structure before
> aroma, funnel to a decisive call, judge quality across the full scale with the official tier,
> reconcile conflicting evidence with one insightful inference, write with honest authority and genuine
> enthusiasm — and do it with **no weak section across all three days.**

---

*Sources: `docs/examiners reports/` (Practical 2017, 2018, 2022, 2023, 2024, 2025; Chief 2021, 2022,
2023, 2024, 2025), cross-checked against `outputs/heuristics/examiner_report_synthesis.md`,
`outputs/heuristics/grading_gap_analysis.md`, and `mw_exam_empirical_knowledge.md` §2–§3. All quotes
verbatim from the named report.*
