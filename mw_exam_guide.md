# The MW Practical Exam — How It Is Built, Graded, and Answered

**Purpose.** This is the high-level, statistically-grounded guide to how the Institute of Masters of
Wine builds a practical (blind tasting) paper, how examiners distribute marks and grade, and how a
candidate should structure a model answer. It is the companion to `exam_gap_analysis.md` (where our
study system falls short of this picture) and sits above the detailed evidence in
`outputs/gap_analysis/findings/01–06`.

**Evidence basis.** Every number here is computed from the structured corpus we built —
`data/structured/{corpus_wines,corpus_questions,corpus_subquestions}.json` (504 wines / 153 questions /
462 sub-questions, 2011–2025; mirrored to the Neon `corpus` schema) — **filtered to the last 10 sat
years (2015–2025; 2020 was not held): 360 wines / 112 questions / 337 sub-questions.** Grading and
wording claims are cited to the 13 IMW examiner reports synthesized in
`outputs/heuristics/examiner_report_synthesis.md` + `grading_gap_analysis.md`, and cross-referenced to
`mw_exam_empirical_knowledge.md` (EK).

> **Read the last 10 years, not the 15.** The exam standardized after 2013 (see §1). Pre-2014 papers
> are a *different marking universe* and must not seed targets. Several long-standing EK claims that
> quoted all-15-year figures are corrected in §10 of this guide / `exam_gap_analysis.md`.

---

## 1. Structure — the fixed skeleton (post-2014)

- **Three papers, 12 wines each.** Paper 1 = white still; Paper 2 = red still; Paper 3 = mixed
  (sparkling / fortified / sweet / rosé / oxidative / occasional orange).
- **Exactly 25 marks per wine.** Verified: `marks_ok = 100%` for every paper 2014→2025; it fails for
  2012 (300/paper) and 2013 (396/paper). **From 2014 the per-paper denominator locks at 900** (12 wines
  × 25 × ... summed across the suite) and never varies. This is the single cleanest structural fact and
  it is *hard-enforced* in our generator (R6).
- **3–4 questions per paper, ~3 sub-questions each.** Question count spiked to 5–6/paper in 2016–2017,
  then settled: 2018→2025 runs **10–12 total questions across the suite**, landing on **10** in
  2023/2024/2025. Sub-questions per question is **flat at ~3.0** (range 2.6–3.4). There is **no**
  "fewer-but-larger questions" trend — the modern paper is 3–4 questions/paper, ~3 sub-parts each.
- **~12 minutes per wine; ~8 minutes of writing per response.** Time pressure is the binding constraint
  on answer length.

---

## 2. How marks are distributed — the post-2014 redistribution (centerpiece)

The biggest thing that changed after 2014 is **not** the skeleton — it's *what the marks are for*. ID
shrank; "is it any good, where does it sit commercially, and how is it ageing" grew.

**Mark-share by era** (share of each era's marks; multi-label, so columns exceed 100% — a sub-question
that asks "identify and assess quality" credits both):

| Mark type | pre-2014 | 2015–2019 | 2020–2025 | Direction |
|---|---:|---:|---:|---|
| **ID composite** (variety ∪ origin ∪ vintage) | 59.7% | 53.8% | **46.2%** | ↓ falling |
| origin_id | 45.1% | 42.6% | 39.3% | ↓ |
| variety_id | 29.1% | 22.6% | 26.8% | ~ |
| quality | 32.7% | 33.8% | **36.3%** | ↑ slight |
| **commercial** | 5.7% | 11.6% | **17.9%** | ↑↑↑ ~tripled |
| **style** | 10.1% | 14.6% | **20.1%** | ↑↑ ~doubled |
| **maturity** | 4.6% | 11.1% | **13.1%** | ↑↑ ~tripled |
| winemaking | 18.3% | 23.5% | 20.6% | ~ high |

**The headline:** marks freed up by shrinking identification flow into the **commercial + style +
maturity** cluster. By 2025, ID is ~40% of marks, quality ~40%, commercial ~18%. Commercial positioning
went from *essentially absent* (≈0–6% pre-2016) to a **stable 16–23% of every recent paper.**

**Each paper has its own shape** (2018–2025, share of that paper's marks — a single global target is wrong):

- **P1 (whites):** origin ~38, quality ~39, variety ~30, winemaking ~22, **maturity ~20**, style ~15,
  **commercial only ~13** (lowest). *P1 leans hardest on ageing/maturity.*
- **P2 (reds):** **origin ~50** (highest), quality ~38, variety ~29, **style ~23**, winemaking ~16,
  commercial ~16, maturity ~9. *P2 is the most origin- and style-driven; low maturity.*
- **P3 (special):** quality ~37, origin ~36, **winemaking ~27** (highest), **commercial ~21** (highest),
  style ~18, variety ~19; sweetness/structure "state" marks appear *only here*.

**Tariff sizing (rules examiners follow, all corpus-confirmed):**
- **2–3 marks = numeric "state" answers only** (residual sugar g/L, alcohol %). Of every last-10
  sub-question worth 2–3 marks, *all* are "State the RS / State the alcohol." Never a written answer.
- **Commercial is never < 5 marks.** Confirmed (corpus min = 5).
- **Style standalone ≈ 5 marks**, but style is usually *bundled* ("style, quality and commercial — 15
  marks"), which is why its true share (~20%) dwarfs its standalone tariff.
- **Compare/contrast = 20–36 marks**, carrying up to 57–60% of a question's marks. It is the heaviest
  single instrument on the paper.
- **Variety-ID mark size signals difficulty:** 10–15 marks = mainstream single variety; 16–25 = harder /
  diverse flight (a Pinot-from-5-countries question pays 25; a benchmark Syrah pays 15).

> **For building a paper:** the *printed allocation must look like 2018–2025*, not 2011. Commercial
> present on most questions (~18% of marks, never 0); style on essentially every question (~20% via
> bundling); ID capped around ~46% of paper marks; at least one heavy (20–36 mark) compare/contrast item
> where the flight invites it.

---

## 3. Wine composition & diversity — what goes in the glass

Diversity is **driven by the stem family and the flight size**, not by chance. The families (EK-0052):
F1 same-variety, F2 same-origin, F3 blend, F4 mixed-breadth, F5 method-dominant, F6 style-mechanism,
F7 hierarchy.

**Variety spread (within a flight):** F1/F7 are deliberately single-variety (72% / 62% of flights);
F4/F5/F6 are deliberately maximally varied (F4 averages 3.4 distinct varieties, 3% single). Spread
scales with size: 2-wine = 1.5 varieties, 6-wine = 4.8. **Across a whole paper:** P1 ~8.6, P2 ~8.8,
P3 ~9.7 distinct varieties — a paper is never a one-grape tour.

**Region/country spread:** F2 is 96% same-country (it splits ONE country into sub-regions); F4 is only
3% same-country (≈3 countries/flight). **A whole paper is a ~6-country world tour** (P1 5.9, P2 6.7,
P3 6.2 distinct countries).

**Old World vs New World** (a first-order contrast axis):
- **Within a flight:** outside the same-origin families, **mixing OW + NW is the norm** — F4 61%, F1 64%,
  F6 75% of flights are mixed; mixing scales with size (19% at 2-wine → 71% at 5-wine). Pure-New-World
  flights are rare (12%). F2/F7 are structurally single-world.
- **Across a paper:** stable target band — **P1 ≈ 7.8 OW : 4.2 NW (65%), P2 ≈ 7.6 : 4.4 (63%),
  P3 ≈ 9.8 : 2.2 (82%)**. Corpus-wide 70% OW. **No paper is ever majority New World** (P3 least, because
  its signatures — Port, Sherry, Madeira, Sauternes, Tokaji, Champagne, Jura — are overwhelmingly European).

**Vintage / age:**
- **Within a flight:** 85% of dated flights mix ≥2 ages; **~20% deliberately pair a young (≤3y) wine
  with an aged (≥8y) one** — a real but *selective* device (~1 flight in 5), not a blanket rule. Average
  in-flight age spread 4.4 years.
- **Across a paper:** P1 skews **young** (avg 3.4y, mostly ≤7y); P2 is the most **mid-aged** (avg 4.7y);
  **P3 carries the oldest wines and ~26% non-vintage** (Champagne NV, Tawny, Sherry, Madeira).
- **Vintage is rarely *asked*** (only 7 vintage-ID sub-questions in 10 years). Age is a *composition and
  maturity-assessment* axis far more than an ID target.

---

## 4. Price & commercial-tier distribution

Price band (coarse 5-bucket proxy: value ≤$15 / mainstream $16–30 / premium $31–60 / super-premium
$61–120 / luxury $120+) is, in practice, **a proxy for the wine's role**: iconic anchors are
super-premium/luxury (73%), classic bankers are premium (78%), regional bankers and curveballs are
value/premium.

**Within a question** — the exam is **NOT broadly laddered by default**: 31% of flights are
price-homogeneous (1 band), 50% are 2-band, only **19% span ≥3 bands**. Spread scales with size
(2-wine 1.5 → 6-wine 2.7 mean distinct bands) and is widest in **F4 mixed-breadth (2.2)**.

**Per-paper ratio** (projected per 12 wines):

| Band | P1 | P2 | P3 |
|---|---|---|---|
| value + mainstream | ~3.2 (27%) | ~2.2 (18%) | ~2.3 (19%) |
| premium | ~6.2 | ~5.3 | ~6.1 |
| super-premium | ~2.1 | **~4.0** | ~1.5 |
| luxury | ~0.5 | ~0.5 | **~2.1** |
| → HIGH (sp+lux) share | ~22% | **~38%** | ~30% |

**P1 value-tilted; P2 super-premium-heavy (classed reds); P3 luxury-heavy (fortified/sweet icons).**
Year-to-year HIGH-share swings are real (P2 8–50%), so treat per-paper price as a *target band with
tolerance*, not a fixed point.

**Quality questions** mostly **compress high** (51%) rather than ladder broadly (20%). Compression is
legitimate **only when a legal classification scaffold carries the hierarchy** (AOC/DOCG/Prädikat/1855
tiers) — 14 of 18 historical quality ladders rest on legal tiers. Compressed-high with *no* legal ladder
is the EK-0028 failure mode (ranking turns on reputation, not the glass).

**Operational ceilings (from `mock-exam-writer.md`):** no wine above ~$300–400/bottle (IMW must buy ~25
of each); sweet-flight intra-question price ratio ≤ ~20:1; curveballs sit cheap-to-mid ($10–60), almost
never luxury.

---

## 5. Flight composition & curveballs

**Curveball = a `medium` or `high` difficulty wine** (rare variety, rare style, unexpected origin, or
hidden identity). Difficulty distribution corpus-wide: ~76% low / ~18% medium / ~6% high.

**The reality (last-10), which corrects several intuitions:**

- **Curveball rate is roughly FLAT across flight size (~21–27% of wines), not banker-heavy at scale.**
  Large flights do *not* "stick to classics." If anything, per-wine difficulty rises slightly (5-wine
  28.6%, 6-wine 33.3%). A 2-wine pair has the *lowest* high-curveball rate (2.7%) but a comparable
  medium+high rate (21.6%) to a 4-wine flight.
- **Benchmark density is high and stable (~75–86%) at every size** — the anchor scaffold is real and
  uniform. A 4-wine flight averages ~3.2 benchmark wines + ~0.8 nonbenchmark.
- **The "1 in 4" rule, precisely stated:** it holds **per wine** (curveball rate ~21–27% ≈ 1 in 4–5), but
  the **per-flight** shape is anchor-heavy — 54% of multi-wine flights have **zero** medium/high wines,
  28% exactly one, 9% three+. So difficulty is *concentrated*: most flights are all-anchor, a minority
  carry the curveballs. Cleanest "one curveball + rest anchors" shape is **3-wine flights (43% have
  exactly one)**; 4-wine flights are bimodal (58% all-anchor, but 3/31 are full 4-curveball grab-bags).
- **Per-paper curveball budget:** **P1 ≈ 1.8 harder wines / 12, P2 ≈ 1.1 (the bankers' paper), P3 ≈ 5.9
  (half the flight is "unusual" — that is P3's identity).** A 36-wine mock suite should carry ~9
  medium+high wines, heavily weighted to P3.
- **By family:** **F5 method (61%) and F6 style (38%) are the curveball hotspots** — far denser per wine
  than F4 breadth (24%). **F1 same-variety is the safest (8%)** — variety is stated, so curveballs are rare.
- **By position:** **P1's hardest slot is the *middle* (q2, 15.4% high), not the last** (this corrects
  EK-0025). P2 is mildly back-loaded. **P3 rises monotonically toward the end** (last question 58.8%
  medium+high — the unusual oxidative/orange/rosé slot). q2 overall is the single hardest position.

**Typical-flight portraits:**
- **2-wine:** contrast pair, ~81% benchmark, usually 0 harder; when hard, a curveball+anchor pair
  (Manzanilla + Jura sous-voile shape).
- **3-wine:** the cleanest "1 harder + 2 anchors" shape.
- **4-wine (the workhorse, F4-dominant):** ~3.2 benchmark + ~0.8 nonbench; bimodal (usually all-anchor,
  occasionally a full mid-tier grab-bag).
- **5/6-wine (rare):** P3 method ladders (5-wine, highest high-curveball rate) or breadth/hierarchy (6-wine).

---

## 6. How examiners grade and reward reasoning

> The MW practical is **a theory exam with tasting attached**. Identification is the smaller part;
> reasoning and judgement carry the paper.

The cardinal rules (all cited 2017–2025; encoded in our grader, see `exam_gap_analysis.md`):

1. **Reasoning > identification.** A sound argument to a wrong-but-plausible call earns most of the
   marks ("5–6/8 if reasoning was sound" even with a wrong origin, 2025). A bare right answer with no
   argument earns little. **Most ID marks live in the argument, not the conclusion** (2022).
2. **Funnelling is the endorsed method** (named 2017): read **hard structural evidence first** (alcohol,
   acid, tannin, RS — more reliable than flavour) → put **2–3 plausible options** on the table with
   for/against → commit to a **broad anchor early** → narrow → **land a decisive call.** Two failure
   modes: the **snap-call** (one wine, no alternatives weighed) and **shoehorning** (decide identity
   first, bend the structure to fit — "led to the failure of many candidates," 2025).
3. **Plausibility-gradient credit.** Wrong IDs are scored on a sliding scale: an adjacent/plausible miss
   (USA→Australia) earns real partial credit; an implausible one (→Italy) earns little.
4. **Cascade / internal-consistency errors are the most-penalized modern failure.** Mis-identify, then
   "write the answer for what you guessed rather than the wine in the glass," or invent figures to match
   — these zero the conclusion. A self-contradiction ("Champagne at 14% ABV", "VDN at 20%") is a logical
   impossibility → no conclusion mark.
5. **Howlers sink borderline papers.** Production-method/legal-fact errors ("Tawny in a solera",
   "Amontillado at 14.5%", "Douro, Spain", "Meursault Grand Cru") destroy confidence; at the pass
   boundary, a clear howler resolves a BORDERLINE script to **FAIL**.
6. **Quality must be contextualized AND calibrated both ways.** Bare "good" earns ~0; name the official
   tier (Grand Cru Classé / DOCG / Prädikat / VORS). Penalize **over-calling** (CdR called Châteauneuf)
   as well as under-calling from origin bias; don't mistake **maturity for quality**.
7. **Maturity needs four concrete parts:** current age, drink-now vs needs-age, how long it improves,
   how long it holds — with real timeframes, not "matured for many years."
8. **Commercial needs channel + geography + price + competitive set.** Steakhouse/food-pairing
   boilerplate is "rarely rewarded."
9. **Answer every sub-part, and the EXACT question.** Both halves of "opportunities AND challenges";
   true compare/contrast, not two separate notes; quality *in the context of origin*.
10. **No cut-and-paste across wines.** Identical wording / the same technique on every wine "creates
    considerable doubt."

**Verdict mechanics:** the pass standard is an **aggregate ~65% across the three papers with a ~50%
per-paper floor** (criterion-referenced, not a curve) — **not** 65% on every paper; a strong paper can
carry a weaker one provided the weak paper clears the floor. FAIL < 50, BORDERLINE ~55–64 as a
single-paper proxy only. A pass needs breadth across the IMW's **three named abilities** — accurately
assess the wine, draw sound judgements (quality / origin / variety / maturity / winemaking / commercial),
and communicate concisely under time pressure (theory accuracy is an internal fourth lens) — a spike in
one cannot rescue a hole in another. Top band is reserved for **"under the
skin of the wine"** second-order insight and genuine, earned enthusiasm.

---

## 7. Examiner wording — preferred vs penalized

How you *say* it is graded. (Full inventory in `outputs/gap_analysis/findings/06_lexicon.md`.)

**Preferred:**
- **Deductive verbs graded to evidence strength:** "suggests / points to / indicative of / consistent
  with" for likely-but-unproven; "confirms / reveals / underlines" *only* when conclusive.
- **Funnel connectives:** "what it might have been, but was not"; "this rules out X because…"; "I would
  expect to see…"; "narrows to."
- **Cross-referencing:** "unlike wine 2…", "in contrast to the flight."
- **Named legal tiers** as the quality vocabulary; **concrete maturity windows** ("drink now to 2030").
- **Structural-first phrasing**; decisive conviction; earned enthusiasm.

**Penalized:**
- **Unprofessional slang:** "stonking", "icon", "Goldilocks".
- **Empty caps labels:** "PREMIUM" with no context. **Bare quality:** "good / very good" with no tier.
- **Over-claim:** confirmation verbs / "definitely" / "obviously" on suggestive evidence.
- **Rote commercial boilerplate** (steakhouse, generic food pairings); **vague maturity** ("matured for
  many years"); **stem-restatement**; **bullet-point arguments**; **phantom oak**; **cut-and-paste
  sameness**; misspelled wine words; theory-howler phrasings.

---

## 8. How to assemble a WHOLE test (the assembly spec)

A correct mock paper is not 12 individually-valid questions — it must hit the *collective* targets
below. (Today our generator builds single questions only; this spec is the target for whole-test
generation — see `exam_gap_analysis.md`.)

**Per 12-wine paper, target:**

| Axis | P1 (white) | P2 (red) | P3 (special) |
|---|---|---|---|
| Questions / sub-qs | 3–4 Q, ~3 sub-each, 25 marks/wine | same | same |
| Distinct varieties | 7–10 | 7–10 | 7–11 |
| Distinct countries | ≥5 (avg ~6) | ≥5 (avg ~6.7) | ≥4 (avg ~6.2) |
| **OW : NW** | ~8 : 4 (⅔ OW; never NW-majority) | ~8 : 4 | **~10 : 2 (≥9 OW)** |
| Age signature | young-skewed (mostly ≤7y) | mid-aged | oldest + ~20–30% NV |
| Price HIGH share | ~22% (≤~33%) | **~38% (30–50%)** | ~30% |
| **Curveball budget** | **~2 harder / 12** | **~1 / 12 (bankers' paper)** | **~6 / 12** |
| Mark type-mix | maturity ~20%, commercial ~13% | origin ~50%, style ~23% | commercial ~21%, winemaking ~27% |
| Cross-paper musts | commercial present (~18% marks, never 0); style on ~every Q (~20%); ID ≤ ~46%; ≥1 compare/contrast item @ 20–36 marks | | |

**Per-flight composition:** pick a family (F1–F7); let family + flight size set variety/origin spread
(§3) and price spread (§4); seed ≥1 banker (always) and the family-appropriate curveball count (§5:
F1 ~none, F4 0–4, F5/F6/P3 ≥1); respect the legal-ladder rule for quality flights (§4); build a
deliberate OW/NW and (sometimes) young-vs-mature contrast into non-same-origin flights.

**Hard guards:** 25 marks/wine; paper scope (P1 white, P2 red, P3 special); no wine > ~$300–400; sweet
ratio ≤ 20:1; P3 still-white only via flor/sous-voile or paired with a fortified anchor.

---

## 9. How to write a model answer (8-minute discipline)

1. **Open with hard structure**, not a guess: "High acid, low alcohol (~11%), bone dry, pronounced
   primary citrus/green-apple…" — alcohol and sugar are more reliable than flavour.
2. **Funnel:** name the 2–3 plausible candidates with a line of evidence for/against each; commit to a
   broad anchor (variety + major region) early; narrow to the most specific defensible call.
3. **Land a decisive conclusion** — a reasoned wrong call beats a hedge or a snap-call.
4. **Match verbs to evidence strength** ("suggests" vs "confirms"); never over-claim.
5. **Differentiate every wine** in a flight (no cut-and-paste); cross-reference ("unlike wine 2…").
6. **Contextualize quality** with a named legal tier; calibrate both ways; never mistake maturity for
   quality. Give **concrete maturity windows.**
7. **Answer the exact question and every sub-part**; grade your depth to the printed marks.
8. **For the curveball wine**, lean into describe-what-you-taste + style/method/quality rather than
   forcing a name — that is where the marks are when ID is hard.
9. **Reach for one "under the skin" insight** on the strongest wine; write with earned conviction.

---

## 10. Knowledge corrections this analysis produced

The structured last-10 corpus overturned or qualified several previously-held claims (details +
EK-update actions in `exam_gap_analysis.md`):

- **EK-0025 (curveball position):** the "cluster in the *last* question of P1/P2" claim does **not** hold
  on last-10 data, and **P3 end-loads** (last Q 58.8% med+high) — both robust. P1's hardest slot *looks*
  like the *middle* (q2), but that rests on ~4–5 wines over 10 sittings — treat as directional.
- **EK-0024 (the "1 in 4" rule) — sharpened, not overturned:** at the **flight** level 54% are all-anchor
  (zero curveballs), so difficulty is concentrated in a minority of flights; but at the **wine** level the
  curveball rate is ~21–27% ≈ **1 in 4–5**, which *confirms* the rule's spirit per wine.
- **Curveball × flight size:** rate is **flat (~21–27%)** across 2/3/4-wine (robust); large flights don't
  stick to classics. (5-wine 28.6% / 6-wine 33.3% are **directional only** — n=7 and n=6 flights.)
- **Curveball hotspots:** **F5 method (61%) is densest, F1 same-variety safest (8%)** — robust; F6 (38%)
  is directional (n=4 questions). The EK "F4 breadth hosts the most" framing is half-right (F4 is high
  *volume*, not high *density*).
- **Quality questions:** the **majority compress high** (51%) rather than ladder broadly (20%) — valid
  only with a legal scaffold. (Directional — `price_band` is a coarse proxy.)
- **Post-2014 mark shift quantified for the first time:** commercial **5.7%→17.9%** (full-credit; 2.6→7.8%
  split-evenly — robust under both, not a verbose-stem artifact), style ~10→20%, maturity ~5→13%,
  ID ~60→46% (this guide §2).

---

*Generated 2026-05-31 from `data/structured/` (Neon `corpus` schema) + `outputs/gap_analysis/findings/`
+ the 13 examiner reports. Rebuild the corpus with `python scripts/build_structured_corpus.py`.*
