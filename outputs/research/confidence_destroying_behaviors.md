# Confidence-Destroying Behaviours — What Repeatedly Makes an MW Examiner Distrust a Candidate

> **Project 9 · Agent 3 — Doubt Signal Analyst.**
> **Scope.** This is a study of *examiner cognition*: the answer characteristics that repeatedly
> *destroy examiner confidence* and create the judgement "this candidate is guessing / does not truly
> understand the wine," as opposed to "this candidate understands the wine." It catalogues
> confidence-destroying behaviours, ranks them by strength of evidence, fully documents the
> "one-error-contaminates-everything" contamination effect, and isolates the cases where a *correct*
> identification still drew examiner doubt. It deliberately focuses on the **examiner's reaction**, not
> on the candidate error for its own sake.
>
> **Method.** Built on Agent 1's foundational corpus
> (`outputs/research/confidence_language_corpus.md`), then verified and expanded by direct
> ripgrep/Read sweeps of the source reports in `docs/examiners reports/extracted_txt/` (Practical
> 2017, 2018, 2019, 2021, 2022, 2023, 2024, 2025; Chief 2021–2025; Theory 2017, 2019, 2023, 2024,
> 2025). Cross-checked against `outputs/research/examiner_confidence_model.md`,
> `distinction_candidate_analysis.md`, and `examiner_objectives.md`. All quotes are reproduced
> verbatim; 2025 PDFs carry OCR character-merge artifacts, flagged `[sic/OCR]`.
>
> **Evidence tiers.** **STRONG SIGNAL** = the behaviour is named as a confidence/doubt driver in **3+
> distinct reports** (a report = one year × report-type file). **PLAUSIBLE** = **2** distinct reports.
> **EXAMPLE-ONLY** = **1** report. "Distinct-report count" counts files, not quotes.
>
> **Provenance caveat (inherited).** IMW examiner reports are member-gated, not public; the verbatim
> quotes are credible because the user holds the reports, but year/paper attributions are corpus
> claims, not web-verifiable facts.

---

## 1 · The one finding that frames everything: doubt is asymmetric and contaminating

The single most-repeated confidence judgement in the corpus is **not** "wrong answers lose marks." It
is that **a single demonstrable error poisons the examiner's trust in the *entire rest* of the
script** — confidence is slow to build and fast to collapse. Examiners say this almost verbatim,
across years and across both exam formats. Because this effect sits *underneath* every other
behaviour below (a howler contaminates; shoehorning contaminates the whole wine; cut-and-paste
signals the candidate stopped tasting *all* wines), it is documented in full in §3 and treated as the
master mechanism, with the specific behaviours that *trigger* it ranked in §2.

---

## 2 · Ranked catalogue of confidence-destroying behaviours

Ranked by evidence tier, then by destructive force as the examiners themselves frame it.

---

### B-1 · Theory error / factual impossibility that contaminates the whole answer — **STRONG SIGNAL (≥7 distinct reports)**

**What it looks like in an answer.** A stated fact that a Master of Wine could not get wrong: an
impossible structural figure for a named style ("Amontillado at 14.5%", "Muscat Beaumes de Venise has
90 g/L RS", "VDN with an alcohol of 20%"), an impossible production claim ("Tawny Port aged in a
solera", "Sauternes fermented at 16 °C in stainless steel", "Sherry made with 77% Brandy Alcohol"), a
geographic impossibility ("Douro, Spain"), a misplaced producer (Katnook Estate in Barossa not
Coonawarra), or SO₂ quoted in grammes per litre. The error need not be on the marked conclusion — it
can be incidental — but the examiner's trust in *everything else* collapses.

**Verbatim support (this is the corpus's single strongest recurring formula):**
- "Factual errors undermine confidence in everything a candidate has written. Statements like 'good
  SO2 management' … suggest the candidate does not know the required facts." — **2023 Theory**
- "such mistakes undermine confidence in everything a candidate has written." (re SO₂ in grammes per
  litre) — **2024 Theory**
- "it will undermine credibility of the rest of the paper's discussion. Candidates need to write from
  authority … factual errors are inexcusable." (Katnook Estate misplaced) — **2018 Practical, Paper 1**
- "the usual host of other theoretical inaccuracies that, whilst not always an absolute disaster
  individually, can serve to undermine the confidence of your examiner … the sorts of statements that
  are likely to ensure a borderline paper would fail to gain the final few marks." — **2018 Practical, Intro**
- "This totally undermines the confidence the examiner might have had in the candidate." (Vosne-Romanée
  1er Cru justified by "moderate alcohol of 15%"; "Further shattered by reading from the same paper
  'Douro, Spain' for Vintage Port in the next question") — **2017 Practical**
- "These errors can cost marks and do not encourage the examiners to have confidence in a candidate's
  abilities." (theory errors + misspelt regions/grapes) — **2021 Practical**
- "errors like these undermine confidence in the candidate." (TCA/VA microbiology errors) — **2019 Theory**
- "Misused terminology undermines the credibility of your response." — **2017 Theory**
- "calling a C[ô]tes du Rh[ô]ne … a Ch[â]teauneuf-du-Pape, or describing the Ruby Port … as a vintage
  Port, undermines the examiner's confidence." — **2025 Practical**
- "It always puts serious doubts in the mind of the examiner when theory knowledge is lacking." —
  **2019 Practical, Paper 3**
- "It is hard to feel confident about a borderline candidate when they make obvious theory mistakes." —
  **2024 Practical**

**Distinct-report support: ≥10** (Practical 2017, 2018, 2019, 2021, 2024, 2025; Theory 2017, 2019,
2023, 2024). This is the most over-determined doubt-signal in the entire corpus.

---

### B-2 · Shoehorning / forcing the wine to fit a premature identity — **STRONG SIGNAL (6 distinct reports for the behaviour; 5 use the word "shoehorn")**

**What it looks like.** The candidate latches onto one feature, decides what the wine "is," then bends
the remaining structural evidence (tannin, body, alcohol, acidity, oak, RS) to defend that
conclusion. The examiner sees the reasoning running *backwards from the label* rather than *forward
from the glass*. It is the precise inverse of "funnelling," and examiners detect it as the moment the
description stops matching the conclusion.

**Verbatim support:**
- "Often a candidate will latch onto a single feature … and then justify that initial assumption by
  forcing the wine's components or structure to fit it. We call this shoehorning, and it was a
  significant issue this year." — **2025 Practical, Intro**
- "[a single feature is used to] convince candidates of a wine's identity, leading them to force other
  … characteristics … such as tannin, body, alcohol, acidity, or oak use, into a mismatched identity.
  There was a lot of shoehorning on this year's paper two exam, and ultimately, it led to the failure
  of many candidates." — **2025 Practical, Paper 2** `[sic/OCR]`
- "argued logically even if their conclusion was wrong instead of trying to shoehorn their answer."
  (contrasting the strong candidates) — **2023 Practical, Intro**
- "tried to shoehorn the wines into a region/style that simply wasn't logical. A lot of points could
  have been gained from simply describing what was in the glass." — **2024 Practical, Paper 3 Q2 (Jura)**
- "origins were shoehorned into something that didn't always make much sense." — **2024 Practical, Paper 1**
- "candidates shoehorning a limited range of examples into all of their essays, regardless of their
  relevance. This is not a recipe for success." / "several papers often shoehorned examples haphazardly
  into unrelated essay sections." — **2023 Theory**
- The Chief Examiner elevated it to a cross-paper warning: "don't be tempted to 'shoehorn' — this word
  comes up more than once in the practical examiners' reports!" — **2025 Chief** `[sic/OCR]`
- Earlier un-named instances of the same behaviour: "those who failed … tended to try and shoehorn a
  style description that didn't fit" (**2021 Practical, Paper 2 Q3**); "immediately deciding that it
  was an amontillado and writing the answers from that. This was not a question where the old rule 'go
  for the first impression' was relevant." (**2019 Practical, Paper 3 Q3**).

**Distinct-report support: 5 reports use the word "shoehorn" (2023/2024/2025 Practical, 2023 Theory,
2025 Chief); 6+ reports describe the behaviour** (add 2019 and 2021 Practical for the un-named "decide
then write to fit" form).

---

### B-3 · The cascade error — misidentify, then write the rest of the answer for the *guess* instead of the glass — **STRONG SIGNAL (5 distinct reports)**

**What it looks like.** Distinct from B-2 in *mechanism*: here the failure is not bending the tasting
note to defend an ID, but **abandoning the glass entirely** once an ID is chosen — quality, style,
commercial, winemaking and even invented structural figures are written *for the imagined wine*. One
wrong call detaches the entire downstream answer from what is actually in the glass. Examiners
explicitly reward the inverse (describe the glass even when the region is unknown), which is what
makes this a confidence destroyer rather than a mere ID miss.

**Verbatim support:**
- "having guessed the identity incorrectly, a lot of candidates then dropped marks by writing an answer
  for what they had guessed it was, rather than referring to the wine itself." — **2021 Practical,
  Paper 1 Q1 (Rhône white)**
- "Many invented attributes based on what they had decided the wine was, rather than simply describing
  what was in the glass. Even if candidates don't know the wine, they should trust their palates." —
  **2021 Practical, Paper 2 Q4**
- "candidates identified the wine incorrectly and then put in figures of alcohol and sugar to match,
  rather than assess the evidence in the glass and come to a logical outcome." / "too many students
  lacked the ability to correctly identify the alcohol and acidity levels and tried to match the
  arguments with their guess." — **2022 Practical, Paper 3**
- "the answers to style and consumer appeal were written based on an erroneous identification rather
  than by discussing what was in the glass." — **2024 Practical, Paper 2**
- "Anyone who wasn't in the Rh[ô]ne for this flight struggled to get many marks." + the
  force-into-mismatched-identity passage — **2025 Practical, Paper 2**
- Inverse reward (corroborating the mechanism): "A lot of points could have been gained from simply
  describing what was in the glass even if the region was unknown." — **2024 Practical, Paper 3**

**Distinct-report support: 5** (Practical 2021, 2022, 2024, 2025; behaviourally reinforced by the
2024 Jura inverse). This is the operational *mechanism* by which B-2 (and a plain structural misread)
is detected and scored — Agent 1 grouped it with shoehorning, but the reports treat the "write for the
guess" detachment as a distinct, separately-named fault.

---

### B-4 · Cut-and-paste / undifferentiated, repetitive answers across wines — **STRONG SIGNAL (3 distinct reports; "considerable doubt" / "doubt in the mind of the reader")**

**What it looks like.** The same wording, or the same technique asserted on every wine — "cold soak"
on virtually every red, "whole bunch" everywhere — identical winemaking or commercial paragraphs
repeated. To the examiner this is positive proof the candidate *stopped reading the individual glass*,
because the examiner knows they did not choose two wines with the same attributes. This is one of the
few behaviours the examiners attach the literal word "doubt" to.

**Verbatim support:**
- "the overuse of copying and pasting, especially for winemaking and commercial questions, creates
  considerable doubt in the mind of the reader." — **2024 Practical, Intro**
- "some candidates seemed to use copy/paste for their winemaking answers, using for example cold soak
  on virtually every wine." — **2024 Practical, Paper 2** (same report, second instance)
- "an increasing number of answers appear repetitive and are clearly using cut and paste. It is
  unlikely examiners have chosen two wines with the same attributes, so whilst this method might save
  time, it is unlikely to impress the markers of your abilities." — **2023 Practical**
- Theory cognate: "candidates shoehorning a limited range of examples into all of their essays" —
  **2023 Theory** (overlaps B-2; counted there).

**Distinct-report support: 3** (2023 Practical, 2024 Practical ×2 instances, 2025 Chief echoes the
shoehorn-everywhere idea). The Practical evidence alone gives 2 distinct files; with the 2023 Theory
"limited range into all essays" and the recurring 2018/2022 "differentiate every wine" framing the
*principle* is firmly STRONG, though the literal "cut and paste / doubt" phrasing is concentrated in
2023–2024 Practical. Conservatively tiered STRONG on the *principle*, PLAUSIBLE if restricted to the
exact "considerable doubt from copy-paste" wording (2 files).

---

### B-5 · Going with first impression / failing to consider alternatives — **PLAUSIBLE→STRONG (3 distinct reports)**

**What it looks like.** A snap call from one or two cues, then an answer written to fit it, with no
weighing of alternatives — the candidate "leaves themselves little room to earn marks." Examiners note
that on some wines first impressions are *actively wrong*, so the un-revised snap call reads as
inexperience, not decisiveness.

**Verbatim support:**
- "there is a tendency for less successful candidates to go with their first impression based upon one
  or two pieces of evidence and then write an answer to fit that assumption." — **2022 Practical, Intro**
- "The old saying that you should trust your first impression was proven wrong with this wine." —
  **2022 Practical, Paper 3 Wine 5**
- "many candidates failed to consider alternative possibilities and left themselves little room to earn
  marks." / "when faced with the unknown, some panicked." — **2025 Practical**
- "This was not a question where the old rule 'go for the first impression' was relevant." — **2019
  Practical, Paper 3 Q3**

**Distinct-report support: 3** (Practical 2019, 2022, 2025). Overlaps B-2/B-3 as the *trigger* of the
shoehorn/cascade chain.

---

### B-6 · Hedging / listing everything without committing (bullet points, unfinished answers) — **PLAUSIBLE (2 distinct reports)**

**What it looks like.** The candidate keeps two or more options open to the end, never makes a call, or
falls back on bullet points. Examiners read this as a *lack of confidence*, and it scores worse than a
committed wrong answer.

**Verbatim support:**
- "Bullet points (or similar) … rarely make for a strong argument, and are unlikely to inspire
  confidence in an examiner." / "try to narrow the field to two or three options to avoid wasting
  precious time and showing a lack of confidence." — **2019 Practical**
- "Often candidates fail because they lack the confidence to provide in-depth analysis." / "they
  frequently lack confidence and play it safe by not truly getting 'under the skin of the wine'." —
  **2022 Practical**
- Inverse rule: "A wrong answer yields more marks than an answer that is unfinished, so whatever you
  do: Make a choice." — **2021 Practical** (the prescriptive counterpart).

**Distinct-report support: 2 reports name it directly as a confidence signal** (2019, 2022 Practical);
the 2021 "make a choice" rule is the counterpart. Tiered PLAUSIBLE.

---

### B-7 · Unprofessional / vague language and misspelling — **PLAUSIBLE→STRONG (3 distinct reports)**

**What it looks like.** Slang and marketing fluff used as substantive description ("stonking", "icon",
"Goldilocks", "PREMIUM" as a catch-all); misspelled appellations, regions, grapes and producers.
Individually trivial, but examiners say it cumulatively *erodes confidence* and reads as
unprofessional — a Master of Wine writing to a senior trade peer would not.

**Verbatim support:**
- "qualitative terms such as 'stonking' or 'icon', do not engender confidence, the latter being an
  overused marketing term." — **2018 Practical**
- "If a candidate cannot spell wine regions, winemaking terms etc., it does not imbue much confidence
  in the examiner." — **2017 Theory**
- "wine regions and grape varieties misspelt. These errors … do not encourage the examiners to have
  confidence." — **2021 Practical**
- "some spelling and grammar was shockingly bad: it undermines a script if important and recognised
  wine region names/villages/producers are misspelled." — **2024 Theory**

**Distinct-report support: 4** (2017 Theory, 2018 Practical, 2021 Practical, 2024 Theory). Promoted to
STRONG on count, but tier the *destructive force* as minor/cumulative — examiners frame it as eroding
rather than collapsing confidence.

---

### B-8 · Mismatch between description and conclusion / internal contradiction — **PLAUSIBLE (2 distinct reports)**

**What it looks like.** The stated structure cannot coexist with the stated identity — "A VDN with an
alcohol of 20%", a sweet wine called a dry style, "the wine has 70 g residual sugar and is therefore a
Beerenauslese" while the conclusion is something else. The internal contradiction is itself scored as
illogical and earns no points, independent of which half is "right."

**Verbatim support:**
- "statements such as 'A VDN with an alcohol of 20%' cannot earn points and is illogical." — **2022
  Practical** (also catalogued in `distinction_candidate_analysis.md` as the EK-0091 source)
- "the acidity across the wines was too high for this to be plausible." (a Pinot Gris guess
  contradicted by the wine's own acidity) — **2021 Practical, Paper 1 Q2**
- "implausible – Mourv[è]dre from Cahors? Tannat from Mendoza (not Cafayate)?" — **2018 Practical**

**Distinct-report support: 2–3** (2021, 2022 Practical; 2018 Practical for implausible conclusions).
This is closely related to B-3 (the cascade) but isolates the *self-contradiction* an examiner can
catch on the face of the answer without even knowing the wine.

---

### B-9 · Generic boilerplate / rote answers with no glass linkage ("steakhouse", "fine-dining by the glass") — **PLAUSIBLE (2 distinct reports, commercial-specific)**

**What it looks like.** Template commercial or maturity answers untethered from the specific wine —
the steakhouse trope, "sell it by the glass to affluent connoisseurs," food-pairing lists. Examiners
read these as a candidate covering territory rather than reasoning, and rarely award marks.

**Verbatim support:**
- "too many talked about steakhouses as the answer to commercial appeal." / "vague and poorly
  considered responses that failed to link what was in the glass to their points." — **2024 Practical**
- "be able to provide insightful answers instead of the typical, rote responses of selling the wine in
  fine-dining restaurant, by wine-by-the-glass, or to affluent connoisseurs." — **2024 Practical,
  Paper 1**
- "Answers with a complete disregard of financial issues will appear naïve and out of touch with the
  realities of the wine industry." — **2023 Chief**

**Distinct-report support: 2** (2024 Practical, 2023 Chief). Mostly a *missed-marks* fault, but the
"naïve and out of touch" framing makes it a confidence signal. Tiered PLAUSIBLE.

---

## 3 · The contamination effect — fully documented

This is the prime finding Agent 1 flagged, and the investigation confirms it is the **single most
recurrent confidence judgement in the corpus** and a near-fixed examiner formula.

**The exact recurring wording.** Two reports use it almost word-for-word:
- **2023 Theory:** *"Factual errors undermine confidence in everything a candidate has written."*
- **2024 Theory:** *"such mistakes undermine confidence in everything a candidate has written."*

These two are the closest thing in the corpus to a fixed examiner formula — verbatim but for the
opening noun phrase.

**The same idea, differently worded, across the Practical reports:**
- **2018 Practical, Paper 1:** "it will undermine credibility of the rest of the paper's discussion."
  (one misplaced producer → the *rest of the paper* is doubted)
- **2018 Practical, Intro:** theoretical inaccuracies "whilst not always an absolute disaster
  individually, can serve to undermine the confidence of your examiner."
- **2017 Practical:** "This totally undermines the confidence the examiner might have had in the
  candidate" — and crucially the parenthetical that proves the *propagation*: "(Further shattered by
  reading from the same paper 'Douro, Spain' for Vintage Port in the next question)." The examiner
  explicitly tracks distrust *across questions*.
- **2019 Practical, Paper 3:** "It always puts serious doubts in the mind of the examiner when theory
  knowledge is lacking."
- **2024 Practical, Intro:** copy-paste "creates considerable doubt in the mind of the reader."
- **2024 Practical, Intro:** "It is hard to feel confident about a borderline candidate when they make
  obvious theory mistakes" — the contamination operating specifically at the borderline.

**Theory-side beyond the verbatim formula:**
- **2017 Theory:** "Misused terminology undermines the credibility of your response."
- **2019 Theory:** "errors like these undermine confidence in the candidate."
- **2025 Theory:** confusions between pH/acidity or bacteria/yeasts "further weakened technical
  credibility."

**How many distinct reports?** The contamination effect (one error → confidence in the *whole* answer
lost) is stated in **at least 10 distinct reports**: Practical 2017, 2018, 2019, 2024, 2025; Theory
2017, 2019, 2023, 2024, 2025 — plus 2021 Practical's "do not encourage the examiners to have
confidence." **Far past the STRONG SIGNAL threshold.**

**Is it stated for theory, practical, or both? — BOTH, emphatically.**
- The *near-verbatim* "undermine confidence in everything a candidate has written" formula appears in
  the **Theory** reports (2023, 2024).
- The *practical* reports state the identical mechanism in their own register — "undermine credibility
  of the rest of the paper's discussion" (2018 Practical), the cross-question propagation in 2017
  Practical, "serious doubts in the mind of the examiner" (2019 Practical), and the borderline form in
  2024 Practical.
- It is therefore a **general examiner-cognition principle**, not a format-specific one: a single
  demonstrable error reclassifies the candidate in the examiner's mind from "knows the field" to "has
  gaps a Master shouldn't," and that reclassification is then applied retroactively to claims the
  examiner had previously been willing to trust. The 2017 Practical "Douro, Spain … further shattered"
  line is the clearest single proof that the effect *accumulates across questions within a paper*.

**Mechanism (examiner cognition).** Competence is *inferred*, never observed; the examiner reconstructs
"is this a trustworthy MW?" from the written trace. Trust is built additively over many wines but a
single impossibility cuts it sharply — the asymmetry is the engine. A howler is damaging out of all
proportion to its sub-mark because its damage is *reputational*: it changes the prior with which every
subsequent answer is read. (Consistent with `examiner_confidence_model.md` §1.3, §5.)

---

## 4 · Confidence vs correctness — when a *correct* (or wrong-but-fine) answer still moved confidence

The project's central hypothesis is that confidence is **distinct from correctness**. The corpus
furnishes clear evidence in *both* directions.

**A · Correct identification that still drew doubt / lost marks (right answer, wrong or absent reasoning):**
- **2024 Practical, Paper 1 (Pinot Grigio):** *the same correct ID earned good marks or lost many marks
  depending purely on the argument.* "Sadly, many candidates went straight for Pinot Grigio without
  proper arguments and lost many marks" vs "some got good pass marks for Pinot Grigio … with arguments
  … that made the choice more plausible." The label was identical; confidence (and the band) was set by
  the reasoning, not the correctness. **This is the cleanest "correct answer, destroyed confidence"
  case in the corpus.**
- **2018 Practical (Chilean Cabernet, Wine 12):** the origin was *correctly* identified as Chile, yet
  "hardly anyone was sufficiently effusive about the quality … just because the origin was correctly
  identified as Chile, the quality should [not] be downplayed." A correct ID coupled with a
  mis-calibrated (origin-biased) quality judgement still read as a weak answer.
- **2023 Practical, Paper 2 (Grenache, W8):** "any plausible origin could get good marks if well
  argued," but examiners condemned the *correct-ish* crowd who showed "little demonstration of
  knowledge of where Grenache wine is made … a feeling of trying to second guess the examiners'
  choices." Getting to the variety was not enough; the *absence of real reasoning* lost confidence.
- **2021 Practical, Paper 2 Q1 (Saint-Julien):** candidates correctly in Bordeaux still failed the
  question by "completely neglect[ing] the second half" (quality) — "a student failed this paper only
  because they completely neglected the second half of this question for all three wines." Correct
  region, confidence/marks lost on the un-answered dimension.

**B · Wrong identification that *kept* confidence (the inverse — confidence lost or retained
independent of the final answer):**
- **2025 Practical, Paper 1 Q2:** "many still managed 5 or 6 marks out of the allotted 8 if their
  reasoning was sound and their conclusion plausible." Wrong conclusion, confidence intact.
- **2025 Practical, Paper 2:** "A few candidates managed to earn good points with convincing arguments
  for Cabernet Sauvignon or Merlot, placing the third wine in Bordeaux instead of Tuscany" — a *wrong*
  origin that still earned confidence because the argument held.
- **2023 Practical, Intro:** the explicit principle — examiners weigh "whether the candidate shows
  convincing logic even if wrong." Confidence is read off the logic, not the verdict.
- **2017 Practical:** "You could get very high marks without identifying St Estèphe, but you did need
  to show authority in considering the appellation options." Precision of *reasoning* outranks
  precision of the *guess*.

**The synthesis of §4.** Confidence is **decoupled from correctness in both directions**: a correct ID
delivered by a snap call, an un-argued label, a mis-calibrated quality judgement, or a neglected
sub-question still *loses* examiner confidence; a wrong ID delivered by transparent, glass-grounded
reasoning *retains* it (and 5–6/8). The examiner is grading the *trustworthiness of the cognitive
process visible on the page*, with the conclusion as cheap-to-check corroboration — exactly the
project's hypothesis.

---

## 5 · Synthesis — the behaviours that most reliably make an examiner distrust a candidate

In descending order of how reliably (across how many independent reports) the examiners say it
destroys their confidence:

1. **A theory error / factual impossibility (≥10 reports).** The supreme destroyer because it
   *contaminates everything else the candidate wrote* — the near-verbatim "undermines confidence in
   everything a candidate has written" formula, stated for both theory and practical, and explicitly
   shown propagating across questions ("Douro, Spain … further shattered", 2017). Decisive at the
   borderline (2024).

2. **Shoehorning — forcing the wine's structure to fit a premature ID (6 reports).** The examiner watches
   the reasoning run backwards from a label; named "the failure of many candidates" on 2025 P2 and
   elevated to a cross-paper warning by the 2025 Chief.

3. **The cascade — writing quality/style/commercial/figures for the *guess*, not the glass (5 reports).**
   The mechanical heart of distrust: one wrong call detaches the whole downstream answer from what is
   actually in the glass; examiners reward the inverse (describe the glass even when origin is unknown).

4. **First-impression snap call with no alternatives considered (3 reports).** Reads as inexperience,
   not decisiveness — "trust your first impression was proven wrong with this wine" (2022); leaves the
   candidate "little room to earn marks" (2025). The trigger of behaviours 2 and 3.

5. **Cut-and-paste / undifferentiated answers across wines (3 reports).** Positive proof the candidate
   stopped tasting each glass — "considerable doubt in the mind of the reader" (2024).

6. **A correct conclusion delivered without reasoning, or with mis-calibrated quality (multiple
   reports; §4).** The purest confidence-vs-correctness case: the right label earns no trust if the
   process is invisible or the quality call is biased (Pinot Grigio 2024; Chilean Cab 2018; Grenache
   2023).

7. **Hedging / failing to commit (bullet points, unfinished, options left open) (2 reports).** Named a
   "lack of confidence"; scores below a committed wrong answer ("Make a choice", 2021).

8. **Unprofessional language and misspelling (4 reports, minor/cumulative).** Slang and misspelled
   appellations erode confidence incrementally and read as un-Masterly, decisive only at the margin of
   a borderline paper.

**The unifying principle.** Every behaviour above is a variant of one thing: **reasoning that is not
visibly, honestly grounded in the glass** — whether because a fact is impossible (1), the logic runs
backwards from a label (2, 3, 4), the answer is recycled rather than observed (5), the process is
hidden behind a bare correct label (6), or no commitment is made at all (7). Examiner confidence is
the inferred trust that *this person reasons like a Master*; it is built slowly across many wines and
collapsed fast by any single signal that the reasoning is not real — and that collapse then
contaminates the reading of everything else on the page.

---

*Sources: `outputs/research/confidence_language_corpus.md` (Agent 1); direct reads of
`docs/examiners reports/extracted_txt/` (Practical 2017, 2018, 2019, 2021, 2022, 2023, 2024, 2025;
Chief 2021–2025; Theory 2017, 2019, 2023, 2024, 2025). Cross-referenced with
`outputs/research/examiner_confidence_model.md`, `distinction_candidate_analysis.md`. All quotes
verbatim; 2025 OCR artifacts flagged. IMW reports are member-gated; attributions are corpus claims.*
