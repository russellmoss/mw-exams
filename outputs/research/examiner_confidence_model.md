# The Examiner Confidence Model — How MW Examiners Infer Candidate Competence

> **Brief.** Model how IMW practical examiners build, lose, and resolve *confidence* in a candidate —
> the latent trust judgement that decides borderline scripts. Adversarial mandate: search as hard for
> evidence that current EK is **wrong / overfit / outdated** as for evidence that confirms it. A
> disconfirmation is worth more than a confirmation.
>
> **Primary sources.** `outputs/heuristics/examiner_report_synthesis.md` (8 practical + 5 chief
> examiner reports, 2017–2025) and `outputs/heuristics/grading_gap_analysis.md` (291 raw principles
> mined from the same 13 reports). These quote member-gated IMW examiner reports the user holds; they
> are treated as genuine primary evidence. **Public IMW documents** (the IMW Student Guide; the MW Exam
> page) are treated as *authoritative and overriding* where they directly contradict the repo
> synthesis. Coaching/candidate sources (David Way MW, Marina Gayán MW via Way, Stephen Skelton MW,
> Tim Gaiser MS, Jennifer Docherty MW) are treated as PLAUSIBLE complications, not doctrine.
>
> **Provenance caveat (important).** Two adversarial web sweeps confirmed that the IMW does **not**
> publish examiner-report prose openly — it is distributed to students/members behind a login. So the
> verbatim examiner quotes in this corpus cannot be independently web-verified; they are credible
> because the user has the reports, **but** any single quote's exact year/paper attribution should be
> regarded as the corpus's claim, not a publicly checkable fact. Where a public IMW document gives a
> harder fact (e.g. the pass standard), it wins. See §7.

---

## 1 · The core model: competence is *inferred*, never observed

An examiner cannot watch a candidate taste. They read a **written trace** — for the whole exam, ~36
wines across three papers, often marked sub-question by sub-question. From that trace they reconstruct
a single latent judgement:

> **"Is this person a Master of Wine — a trustworthy generalist authority whose written opinion on an
> unknown wine I would stand behind?"**

That judgement is *confidence*. Marks are the instrument; confidence is the thing the marks are trying
to measure, and — critically — it is what breaks ties when the marks land in the borderline band.

Four properties define how confidence behaves:

1. **It is inferred from coherence, not correctness.** The examiner has the answer key; the candidate's
   *conclusion* is cheap to check and, deliberately, lightly weighted (ID is ~39–46% paper-wide and
   falling — EK-0006, EK-0098). What the examiner actually reads *for* is whether the candidate's
   reasoning **hangs together** and is **grounded in the glass**. "More marks can be given when the
   conclusion is wrong, as we can then see and reward intelligent thinking" (2019); Stephen Skelton MW,
   publicly: "if you explain your working, and your working is essentially sound, you could score points
   even if you come to the wrong conclusion"
   ([wineanorak.com](https://www.wineanorak.com/wineblog/uncategorized/blind-tasting-exam-mw-style-whats-it-like)).
   → **The unit of competence is a coherent argument, not a right answer.**

2. **It is the MINIMUM across dimensions, not the average.** A pass requires demonstrated competence in
   *several* faculties at once — the IMW Student Guide states three required abilities: (a) accurately
   assess visual/olfactory/taste/physical aspects; (b) use judgement to draw logical conclusions about
   quality, origin, variety, maturity, winemaking, commercial potential; (c) **communicate concisely and
   persuasively under time pressure**
   ([IMW Student Guide](https://apply.gatenbysanderson.com/download/561799-82e7b252ecbd7f3313b3412049ed937147af2787/IMW%20Student%20Guide.pdf)).
   The corpus reconstructs this as four graded dimensions (structural reading, communication, theory
   accuracy, quality judgement — EK-0093, 2024). Either way the operative rule is the same: **a spike in
   one faculty cannot rescue a hole in another.** Brilliant tasting expressed illegibly, or flawless
   structure resting on a theory impossibility, both read as *not yet competent*.

3. **It is asymmetric — slow to build, fast to collapse.** Competence has to be demonstrated *repeatedly*
   (wine after wine, paper after paper) to accumulate; a single impossibility can puncture it. "This
   totally undermines the confidence the examiner might have had in the candidate" (2017). This is the
   ordinary economics of trust: many consistent signals to earn it, one disqualifying signal to lose it.
   The asymmetry is the engine of every borderline decision (§4–§5).

4. **It is transmitted only through writing.** The examiner has no access to the candidate's palate
   except the words on the page. Communication is therefore not cosmetic — it is the **channel** through
   which competence is observed. A competent taster who signposts poorly, buries the conclusion, answers
   an adjacent question, or (in the real exam) writes illegibly, transmits *less* competence than they
   possess, and is graded on what transmitted. "Almost every year the examiner's report mentions that
   illegible handwriting is the cause of lost marks or even failure" — Jennifer Docherty MW
   ([decanterchina.com](https://www.decanterchina.com)).

**Formal sketch.** Let competence `C` be latent. The examiner reads evidence `e₁…eₙ` (each sub-answer)
and maintains a belief about `C`. Building signals raise the belief slowly and additively; destroying
signals (impossibilities, cascades, incoherence) cut it sharply and multiplicatively. The final verdict
is a threshold on `min(structural, theory, judgement, communication)` evaluated against an **absolute**
criterion (not a class rank — §7). At the borderline, the examiner asks not "what is the mark?" but
"**do I believe this person is competent?**" — and the accumulated confidence signal answers it.

---

## 2 · Confidence Building Signals

Ordered roughly by weight. Tier and source in brackets.

1. **Glass-first, transparent reasoning (funnelling — *when uncertain*).** Read the hard structural
   evidence first (alcohol, acidity, tannin, RS), put 2–3 genuinely plausible options on the table with
   evidence for/against each, commit to the broad anchor early, then narrow to a decisive call. Endorsed
   across every report since 2017. The marks live in the *argument*, not the bare name (EK-0014, EK-0090;
   synthesis §3). [STRONG]
2. **Appropriate confidence / calibration — commit when sure, weigh when unsure.** A decisive, well-argued
   *wrong* call outscores a hedge or an unfinished answer: "make a choice" (2021). And — a nuance the
   corpus under-weights — when the candidate genuinely *knows* the wine, examiners reward a confident,
   authoritative commitment: Marina Gayán MW's coaching, "If you know what the wine is, show your
   confidence, argue authoritatively for it and do not consider other options"
   ([winefriend.org](https://winefriend.org/david-way/master-of-wine-studies/mw-studies/)). Calibration
   — knowing *which* mode the wine calls for — is itself a competence signal. [STRONG for commit-on-
   uncertainty; PLAUSIBLE for commit-on-certainty]
3. **Accurate structural reading.** Correct alcohol/acidity/tannin/RS is the non-negotiable foundation
   and the thing examiners trust most: "hard evidence like alcohol and sugar are often more reliable than
   the flavour profile" (2025) (EK-0013). [STRONG]
4. **Contextualised quality on a real ladder.** Quality positioned against the wine's peers, named
   official tier where one exists (Grand Cru Classé, DOCG, VORS, Prädikat), corroborated by a realistic
   price (EK-0008, EK-0092). [STRONG]
5. **Cross-referencing wines within a flight.** Using one wine to unlock another: "where you have more
   than one wine to help you, one of them will show enough character to open the door" (2017); "the best
   candidates remembered to draw on all four wines" (2025) (synthesis §3). [STRONG]
6. **Winemaking tied to the glass.** Not a list of techniques but each inferred technique connected to a
   tasted attribute, chronologically (reception → ferment → maturation → bottling) (synthesis §3). [STRONG]
7. **Honest engagement with an unidentifiable wine.** Describing what is actually in the glass even when
   origin is unknown banks real marks: "a lot of points could have been gained from simply describing
   what was in the glass even if the region was unknown" (2024) (EK-0016). [STRONG]
8. **Maturity assessed in four parts.** Current age; drink-now vs hold; how long it will improve; how long
   before decline — with concrete timeframes (EK-0011). [STRONG]
9. **Commercial realism — specific, global, channel-aware.** Channel (on/off-trade, specialist/supermarket,
   by-the-glass/list), geography (domestic + export), evidence-based price, competitive set (EK-0012). [STRONG]
10. **Second-order insight — "under the skin of the wine."** The top-band differentiator: reasoning a
    step beyond the obvious (e.g. an exceptional producer exceeding a classification's minimum sugar),
    and genuine engagement conveyed in the prose (EK-0094, 2022/2025). [PLAUSIBLE]

---

## 3 · Confidence Destroying Signals

Ordered by destructive force.

1. **Theory howlers / factual impossibilities.** "Tawny Port aged in a solera," "Amontillado at 14.5%,"
   "Meursault Grand Cru," "Pouilly-Fuissé in the Loire," "Douro, Spain," "Sauternes fermented at 16 °C in
   stainless." Production-method, appellation and legal facts are *marked*, not decorative — the exam is
   "a theory exam with a tasting." A howler caps the affected conclusion mark at zero and, more
   dangerously, **contaminates trust in adjacent claims** (EK-0015; grading_gap §P1). [STRONG]
2. **Internal-consistency / cascade error.** The candidate names a wine, then invents structural figures
   to fit it ("a VDN at 20%," "Champagne at 14%"), or — having misidentified — writes quality/style/
   commercial for the *guessed* wine rather than the glass. Flagged as **the most-penalised failure mode
   of 2021–2025** in the corpus (EK-0091; grading_gap §2). *Adversarial caveat:* "most-penalised" is the
   corpus's ranking and is not independently verifiable; a public MW source instead identifies plain
   **organoleptic misreading** ("just misreading the wines — residual sugar, acidity, tannin") as the most
   basic killer ([winefriend.org](https://winefriend.org/things-can-go-wrong-mw-tasting-exam)). These are
   two ends of the same chain: a structural misread is what *triggers* the cascade. [STRONG for the
   mechanism; the "single most-penalised" ranking is PLAUSIBLE, not established]
3. **Shoehorning.** Deciding identity first, then bending the tasting note to fit. Named the cause of
   "the failure of many candidates" on 2025 P2 (EK-0009). *Adversarial caveat:* the word and the "many
   failed" framing are not publicly verifiable; the underlying trap is real and self-reported by
   candidates (Way). Treat shoehorning as the *behaviour* and the cascade error (#2) as how it is
   *detected and scored*. [STRONG as behaviour; year/paper attribution PLAUSIBLE]
4. **Quality mis-calibration — both directions.** Over-calling (a Côtes-du-Rhône called Châteauneuf, a
   Ruby called Vintage Port) dents confidence as much as under-calling; "Old World = superior" left
   unargued; mistaking a *developed* wine for a *great* one (EK-0092). [STRONG]
5. **Cut-and-paste / undifferentiated answers.** Identical wording or the same technique ("cold soak,"
   "whole-bunch") asserted on every wine: "it is unlikely examiners have chosen two wines with the same
   attributes"; "creates considerable doubt in the mind of the reader" (2023/2024). Signals the candidate
   stopped reading the glass (grading_gap §P2). [STRONG]
6. **Answering an adjacent question.** Omitting an explicit half ("opportunities AND challenges"),
   "compare and contrast" rendered as two separate notes, "quality in the context of origin" with no
   reference to origin, or restating the stem for credit. Each is scored as a *non-answer* (EK-0010,
   EK-0022; grading_gap §P2). [STRONG]
7. **Over-reliance on the nose (esp. reds).** Reaching for identity from aromatics while ignoring the more
   diagnostic structure: "one potential pitfall in paper two is candidates relying too much on their
   noses" (2025). *Adversarial caveat:* the structure-over-aroma principle is well attested generally; its
   specific framing as "the biggest P2 trap" is the corpus's, not publicly confirmed. [STRONG principle;
   P2-specific framing PLAUSIBLE]
8. **Unprofessional / vague language and misspelling.** "Stonking," "icon," "Goldilocks," "PREMIUM" used
   as a catch-all, misspelled appellations — "do not encourage the examiners to have confidence"
   (2018/2019/2021). [PLAUSIBLE — minor but cumulative]
9. **Illegibility (real exam only).** Examiners cannot mark what they cannot read; cited "almost every
   year" as a cause of lost marks or outright failure (Docherty MW). **Not testable in the typed study
   app** — flagged for the real-exam model only. [PLAUSIBLE]

---

## 4 · Borderline Candidate Decision Factors

The borderline band (≈55–64%) is where confidence *is the verdict*. Because marking is moderated by a
panel with an external adjudicator (IMW: "set and marked by a panel of MWs with guidance from an external
adjudicator"), borderline scripts get a second read in which the panel decides whether to extend the
**benefit of the doubt**. What tips it:

**Tips a borderline → PASS**
- A coherent, glass-grounded argument *throughout*, even with several wrong IDs ("over half did not get a
  single origin exactly right, however many still managed 5–6/8 if their reasoning was sound," 2025).
- No disqualifying howler — nothing that says "this person doesn't know the basics."
- Demonstrated breadth: the curveball handled gracefully (described honestly rather than forced).
- Mastery visible in *all* required faculties — no empty dimension to point to.
- Genuine engagement / second-order insight on at least the standout wines (EK-0094).

**Tips a borderline → FAIL**
- **A clear theory howler.** This is the decisive mechanism: when the aggregate sits at borderline and the
  script contains an obvious impossibility, the panel withholds the benefit of the doubt and resolves to
  FAIL — "it is hard to feel confident about a borderline candidate when they make obvious theory
  mistakes" (2024) (EK-0093 howler override). *Adversarial caveat:* the "single howler flips borderline
  to fail" rule is the corpus's reading of report language; no *public* source states it as a hard rule,
  and one public MW account says misidentifications are survivable. Treat it as a strong tendency the
  grader should encode, not an iron law. [STRONG within corpus; UNVERIFIED publicly]
- A hole in one faculty (e.g. quality never contextualised anywhere; commercial answered with rote
  "steakhouse"; structure consistently misread).
- Cut-and-paste across wines — reads as a candidate who stopped tasting.
- A whole sub-question's marks forfeited by answering the wrong question.

**The decisive structural fact about "borderline" (corrects EK-0093).** The pass standard is **an average
of 65% across the three practical papers, with a per-paper minimum floor (50% per the current IMW Student
Guide; some candidate accounts cite 55%)** — *not* 65% on every paper, and *not* a curve. It is
criterion-referenced (absolute), which the corpus had right; but "65% per paper" is wrong (§7). This
reframes the borderline:
- "Borderline" is fundamentally an **aggregate** state. A strong P1/P2 can carry a shaky P3 *above* the
  65% average — **provided P3 clears the per-paper floor.**
- This is *why* P3 (sparkling/fortified/sweet/oxidative) is "the deciding factor for borderline
  candidates" (synthesis §5): not because 65% is needed on P3, but because a P3 that drops below the floor
  is fatal regardless of average, and a weak P3 is the most common thing dragging an otherwise-passing
  average under 65%. The corpus's P3 narrative is *more* coherent under the correct rule, not less.

---

## 5 · Confidence Cascade Effects

Confidence does not reset between answers — distrust propagates. Three nested cascades:

**A · Within a single wine (documented, EK-0091).**
`structural misread → wrong ID → quality/commercial/style written for the guessed wine → entire answer
detaches from the glass.` One organoleptic error contaminates every downstream sub-question. This is the
mechanical core of both shoehorning (the behaviour) and the cascade error (the detection). The antidote
the examiners reward is the inverse: report the glass faithfully *first*, let the ID float — and even a
wrong ID keeps its dependent marks because the dependents describe the glass, not the guess.
**Asymmetry rule (EK-0016 / grading_gap §4):** do **not** cascade-penalise a sound answer merely because
the ID is wrong; cascade-penalise only when the downstream content describes the *guess* rather than the
glass.

**B · Across a paper (trust priming).**
An early howler or impossibility primes the reader to read subsequent answers sceptically — the asymmetry
of §1.3 operating in real time. Accumulated small credibility hits (misspellings, vague jargon, rote
commercial) compound into a "this candidate is shaky" prior that, at the borderline, withdraws the benefit
of the doubt. Conversely a run of glass-grounded, well-calibrated answers builds a "this is a safe pair of
hands" prior that *extends* it. [PLAUSIBLE — inferred from the asymmetry + moderation behaviour, not from
a single quote]

**C · Across the exam (marks aggregate; reader-trust mostly doesn't).**
Marks **do** cascade across papers via the 65% aggregate (a strong P1/P2 literally raises the P3 hurdle's
tolerance, down to the floor). But the *psychological* trust cascade is largely **bounded within a paper**:
different papers are marked by panel members, so a P1 howler does not directly poison the P2 reader's
prior. The cross-paper carry is therefore arithmetic (the average) plus the floor, not reputational. This
is a useful correction to any model that imagines a single examiner's global impression following the
candidate across all three papers. [PLAUSIBLE]

---

## 6 · Faculty-by-faculty analysis

**Theory howlers.** The highest-leverage destroyer because the exam is knowledge-gated: you cannot pass
without knowing how Madeira or Sherry is made (2025). The howler's damage is *reputational*, not just the
lost sub-mark — it reclassifies the candidate from "knows the field" to "has gaps a Master shouldn't."
Hence the borderline override. *Open question:* the corpus treats one howler as potentially decisive;
public evidence suggests the effect may be cumulative/recoverable. The honest synthesis: **howlers are the
strongest single distrust signal, decisive specifically at the borderline, softer in the body of a strong
script.**

**Shoehorning.** Not a knowledge failure but a *process* failure — evidence subordinated to a premature
conclusion. Examiners detect it as the cascade (§5A). It is the precise inverse of funnelling, and the
reason funnelling is endorsed: funnelling makes the reasoning *visible and falsifiable*; shoehorning hides
the leap. Note the calibration boundary (§2.2): *committing* to a wine you genuinely recognise is **not**
shoehorning — shoehorning is committing and then *fabricating evidence* to defend it.

**Quality calibration.** The largest single scoring domain (20%+ in 2025) and a pure confidence test:
naming where a wine sits on its ladder, with the official tier, is exactly the "MW-to-MW" communication the
exam exists to certify. Errors in *both* directions destroy confidence; maturity must not be mistaken for
quality. This is where origin bias surfaces ("Old World = superior"; under-rating a great New-World wine —
the 2018 Chilean Cabernet "hardly anyone was sufficiently effusive about").

**Structural accuracy.** The foundation of trust because it is the least bluffable and the most diagnostic
("more reliable than the flavour profile," 2025). A misread here is the *seed* of the within-wine cascade.
Public MW commentary elevates plain misreading to *the* most basic failure — arguably under-weighted by a
corpus that foregrounds theory howlers.

**Commercial realism.** A breadth-of-trade test: can this person place the wine in the real market
(channel, geography, price, competitors) rather than recite "pairs with steak"? Rote/food-pairing answers
are penalised; the commercial dimension is genuinely examined (e.g. "Who would buy this wine?" 2×8 marks,
[somm.us](https://somm.us/master-of-wine-exam/)). *Adversarial caveat:* the specific "steakhouse penalty"
is the corpus's; what is publicly verifiable is that *commercially framed* answers are on-rubric and lazy
pairings are not the ask.

**Communication.** The transmission channel (§1.4). Funnelling structure, conclusion-up signposting,
answering the literal question, concision proportional to marks, professional register, legibility (real
exam). A competent palate that transmits poorly is graded as the lesser thing it transmitted. This is the
most *under-modelled* dimension in the EK relative to its weight in the IMW's own stated criteria
(communication is one of the three named required abilities).

---

## 7 · How well does current EK capture this? (adversarial evaluation)

**What EK captures well.** The faculty-level building/destroying signals are thoroughly and accurately
encoded: EK-0007–0016 (cardinal rules), EK-0089–0094 (grading mechanics) cover funnelling, glass-first
reasoning, the cascade error, quality mis-calibration both ways, the howler override, and the top-band
differentiator. The grading_gap_analysis is a genuinely strong, quote-traced mining of the reports. On the
*content* of confidence, EK is in good shape.

**Where EK is WRONG, OVERFIT, or UNVERIFIED** (the point of the exercise):

| # | EK claim | Finding | Severity | Action |
|---|----------|---------|----------|--------|
| 1 | **EK-0093 / grading_gap §4: "Pass is an absolute 65% per paper, not a curve."** | **CONTRADICTED by the official public IMW Student Guide:** pass = **average 65% across the three papers, with a per-paper minimum floor (50% per the Guide; 55% per some candidate accounts).** "Absolute / criterion-referenced, not a curve" is *correct*; "65% **per paper**" is *wrong* — you do not need 65 on each paper. | **HIGH — factual error in a load-bearing grading rule** | Correct EK-0093; reframe "borderline" as aggregate-with-floor (§4). |
| 2 | EK-0093: pass = mastery across **four named dimensions** (structural / communication / theory / quality). | **PARTIAL / reconstruction.** The IMW's own stated framework is **three abilities** (assess → judge/conclude → communicate), not four co-equal dimensions. The four-dimension model maps loosely but is not IMW language. | MEDIUM | Re-label as a useful internal reconstruction, not verbatim examiner doctrine. |
| 3 | EK-0093: "one howler tips borderline → FAIL" (hard override). | **UNVERIFIED publicly.** Corpus-supported (2024 language) but no public source states it as a hard rule; one public MW account says misidentifications are survivable. | MEDIUM | Keep as a strong *tendency* the grader encodes; soften "iron law" wording. |
| 4 | EK-0006 et al.: "**a theory exam with a tasting**" as a verbatim 2024 quote. | Exact phrase **not publicly findable** (reports are gated). The *concept* is solidly supported. | LOW (provenance) | Keep; note it is corpus-attributed, not web-verifiable. |
| 5 | EK-0014: funnelling endorsed; snap-call is an anti-pattern. | **INCOMPLETE.** Misses the calibration boundary: respected MW coaching says **commit hard when you genuinely know the wine — "do not consider other options"** — and that first impressions are often most reliable. Over-funnelling a recognised wine is itself a (minor) fault. | MEDIUM — a real refinement | Add the commit-when-certain / funnel-when-uncertain conditional. |
| 6 | Distrust signals list. | **MISSING:** legibility (real-exam failure cause, "almost every year"); and an explicit statement that **communication is the transmission channel for competence**, not a cosmetic. | LOW–MEDIUM | Add as new entry (real-exam scope; not app-testable). |
| 7 | EK-0091: cascade error is "**the most-penalised** failure mode 2021–2025." | **OVERFIT ranking.** "Most-penalised" is the corpus's superlative; a public MW source ranks plain organoleptic **misreading** as the most basic killer. They are the same chain (misread → cascade). | LOW | Soften superlative; note misreading is the trigger. |

**Provenance meta-finding.** Two independent web sweeps established the examiner reports are
member-gated, so ~5 of the headline "examiner quotes" cannot be web-verified. This does **not** mean they
are fabricated (the user holds the reports) — but the EK should carry a standing provenance note so future
agents don't treat year/paper attributions as publicly checkable, and so a public IMW document always
overrides a corpus paraphrase on hard facts (as in row 1).

---

## 8 · Draft new / corrected EK entries (for user review — not yet merged)

> Per CLAUDE.md the EK doc grows via the resolved-feedback sync; these are **drafts** for the user to
> merge/supersede. Highest-value first.

### ✱ EK-0093 — CORRECTION (supersede current wording)
- **tier:** STRONG SIGNAL · **status:** live · **supersedes prior EK-0093 pass-standard clause**
- **evidence:** [IMW Student Guide](https://apply.gatenbysanderson.com/download/561799-82e7b252ecbd7f3313b3412049ed937147af2787/IMW%20Student%20Guide.pdf) (authoritative, public); corroborated winefriend.org, fishgutswine.com
- **claim:** The practical pass standard is **an average of 65% across the three papers, with a per-paper
  minimum floor (50% per the current IMW Student Guide; some candidate accounts cite 55%).** It is
  **criterion-referenced (absolute), not a curve** — that part of the prior entry stands. But it is **not
  "65% per paper"**: a strong paper can carry a weak one above the 65% average *provided the weak paper
  clears the floor*. The four-dimension mastery model and the howler-override remain as grading
  *temperament*, but anchor verdicts to this aggregate-plus-floor structure. **Implication:** "borderline"
  is an aggregate state; P3 is the usual deciding paper because a sub-floor or average-dragging P3 is what
  fails otherwise-competent candidates — not a missing 65 on P3.

### ✱ EK-NEW-A · Examiner confidence is the latent currency of the verdict (asymmetric, min-not-mean)
- **tier:** STRONG SIGNAL · **status:** proposed
- **evidence:** synthesis §2/§4; grading_gap §4; IMW Student Guide (3 required abilities)
- **claim:** Examiners infer one latent judgement — *is this a trustworthy MW?* — from the written trace.
  It (1) tracks **coherence + glass-grounding, not correctness**; (2) is the **minimum across faculties**,
  so a spike cannot rescue a hole; (3) is **asymmetric** — built slowly over many wines, collapsed by one
  impossibility; (4) is the tiebreaker at the borderline. Encode as: at BORDERLINE, ask "do I believe this
  candidate is competent?" and resolve using accumulated confidence signals (a clean glass-grounded script
  → benefit of the doubt → pass; a howler or an empty faculty → withhold it → fail).

### ✱ EK-NEW-B · Calibration: funnel when uncertain, commit when certain (refines EK-0014)
- **tier:** PLAUSIBLE · **status:** proposed
- **evidence:** Gayán MW via [winefriend.org](https://winefriend.org/david-way/master-of-wine-studies/mw-studies/);
  Skelton MW & "first impression most reliable" via [wineanorak.com](https://www.wineanorak.com/wineblog/uncategorized/blind-tasting-exam-mw-style-whats-it-like)
- **claim:** Funnelling is correct **under uncertainty**; when the candidate genuinely recognises the wine,
  examiners reward a **confident, authoritative commitment** ("do not consider other options"). The deep
  failure is **opaque or self-contradictory reasoning**, not a committed call — so *over-hedging a wine you
  actually know* is a (minor) fault, the mirror of shoehorning. Reward calibration: choosing the right mode
  for the wine's difficulty. (Distinct from EK-0009: committing to a recognised wine ≠ shoehorning;
  shoehorning is committing and then *fabricating* supporting evidence.)

### ✱ EK-NEW-C · Communication is the transmission channel for competence (not cosmetic)
- **tier:** PLAUSIBLE · **status:** proposed
- **evidence:** IMW Student Guide (communication is 1 of 3 named required abilities); Docherty MW on
  legibility ([decanterchina.com](https://www.decanterchina.com)); synthesis §4 (slang/spelling)
- **claim:** A competent palate is graded only on what it *transmits*. Conclusion-up signposting, answering
  the literal question, concision proportional to marks, professional register, and — **real exam only** —
  **legible handwriting** ("almost every year… illegible handwriting… a cause of failure"). A competent
  taster who transmits poorly is scored as the lesser thing transmitted. **App scope note:** legibility is
  not testable in the typed study app; the rest (signposting, on-question answering, register) is.

### ✱ EK-NEW-D · Standing provenance note on examiner-report quotes
- **tier:** PROCESS · **status:** proposed
- **evidence:** two independent adversarial web sweeps (this report); [mastersofwine.org/mw-exam](https://www.mastersofwine.org/mw-exam)
- **claim:** IMW examiner/chief-examiner reports are **member-gated, not public.** The corpus's verbatim
  quotes are credible (the user holds the reports) but **not web-verifiable**, so year/paper attributions
  are corpus claims, not publicly checkable facts. **A public IMW document always overrides a corpus
  paraphrase on a hard fact** (as the Student Guide overrode the "65% per paper" clause). Agents should not
  "launder" a gated quote into an unqualified public fact.

### ✱ EK-NEW-E · Soften EK-0091's superlative
- **tier:** STRONG SIGNAL · **status:** proposed edit
- **claim:** Keep the cascade/internal-consistency mechanism as a top-tier destroyer, but drop "**the**
  most-penalised failure mode" → "**a** most-penalised failure mode." Public MW commentary ranks plain
  **structural misreading** as the most basic killer; misread → cascade is one chain, and the misread is
  its trigger.

---

## 9 · One-screen summary

- **Confidence = inferred trust** that this person is a Master of Wine, read off a written trace, measured
  as the **minimum** across faculties, **slow to build and fast to break**.
- **Built by:** glass-first transparent reasoning, accurate structure, contextualised quality with the real
  tier, cross-referencing the flight, winemaking tied to the glass, four-part maturity, specific global
  commercial, and second-order insight — plus **correct calibration** (commit when sure, funnel when not).
- **Broken by:** theory howlers, the misread→cascade chain, shoehorning, quality mis-calibration (both
  ways), cut-and-paste, answering the wrong question, nose-over-structure, unprofessional language, and
  illegibility.
- **At the borderline,** confidence *is* the verdict: a clean glass-grounded script earns the benefit of the
  doubt; a howler or an empty faculty forfeits it.
- **The standard it's judged against is an AGGREGATE 65% with a per-paper floor** — not 65% per paper —
  which is exactly why a weak P3 is the classic borderline-decider.
- **Biggest EK corrections:** the pass-standard rule (HIGH), the funnelling-calibration nuance (MEDIUM),
  and a standing provenance note (so gated quotes aren't over-trusted, and public IMW facts win).

---

*Sources: `outputs/heuristics/examiner_report_synthesis.md`, `outputs/heuristics/grading_gap_analysis.md`,
`mw_exam_empirical_knowledge.md` §2–§3; IMW Student Guide & mastersofwine.org/mw-exam (public, authoritative);
winefriend.org (David Way MW; Gayán MW), wineanorak.com (Skelton MW; Goode), somm.us, decanterchina.com
(Docherty MW), fishgutswine.com, timgaiser.com. Adversarial web verification performed June 2026; IMW
examiner reports remain member-gated and were not independently web-verified.*
