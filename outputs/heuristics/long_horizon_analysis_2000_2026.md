# Long-horizon analysis of the MW practical: 2000–2026

**What this is.** The first analysis of the MW practical across its full published history — 26 years,
**78 papers, 273 questions, 936 wines**. Until now every heuristic in this system was derived from the
2011+ window. This tests those heuristics against the 11 years that came before, which the trees were
never built on.

**Method.** `data/past_exams_2000_2010.json` (Era 1, structured from `docs/past_papers_2000s/`) and
`data/exams.json` (Era 2) are read by `scripts/analyze_long_horizon.py`. Every figure below is
reproducible:

```bash
python scripts/analyze_long_horizon.py --compare
```

**Confidence note.** Structural counts (papers, wines, flights, mark totals) are exact. The
sub-question *type* shares come from a transparent keyword classifier in the script, counting each
question once per type it touches; they are directional, good to a few points, not precise. Era 1
question text was transcribed by agents from the published PDFs and spot-checked, not double-keyed.

---

## 1. Headline: the exam's skeleton has not moved in 26 years

| | Era 1 (2000–2010) | Era 2 (2011–2026) |
|---|---|---|
| papers | 33 | 45 |
| questions | 111 | 162 |
| wines | 396 | 540 |
| **wines per paper** | **12 in 33/33** | **12 in 45/45** |
| **marked papers totalling 300** | **9/9** | **45/45** |
| questions per paper | 3.36 | 3.60 |
| mean flight size | 3.57 | 3.33 |
| Old World share | 64.9% | 69.1% |
| France share | 33.1% | 34.1% |

Four constants hold across the whole 26 years: **12 wines per paper** (78/78 papers), **300 marks per
paper**, the **P1 white / P2 red / P3 mixed** structure, and an origin mix of roughly **two-thirds Old
World with France at a third of all wines**. **Every** marks-printing paper in both eras totals exactly 300 once scope notation is honoured
(see §5) — there are no exceptions at all.

## 2. The 25-marks-per-wine rule is 12 years older than we thought

This is the finding that overturns an existing entry. **EK-0001 currently says the exact-25-marks-per-wine
scheme is "a hallmark of the modern exam (~2013 onward)" and that "pre-2013 papers did not use a uniform
25-marks-per-wine allocation."** Both halves are wrong.

The general instructions printed on the practical paper state it outright, verbatim, from 2001:

> "The total number of MARKS for each Paper is 300 and the total number of MARKS per QUESTION is shown
> on the appropriate proforma"

That sentence appears in **2001, 2002, 2003, 2004, 2005, 2006, 2007 and 2008** (in 2002/2003 the PDF text
layer splits it as "Paper i s 300", which is why a naive grep misses it). 300 marks over 12 wines is
25 marks per wine.

What actually changed in this period is **where the marks were printed, not what they were**:

| years | marks on the question paper? | per-paper total |
|---|---|---|
| 2000 | no — no reference to marks at all | not stated |
| 2001–2007 | no — "shown on the appropriate proforma" (i.e. on the answer sheet) | **stated as 300** |
| 2008–2010 | **yes, per sub-part** | 300 (9/9 papers verified) |
| 2011–2026 | yes, per sub-part | 300 (45/45 marked papers verified) |

So the transition is **2007 → 2008**, and it is a change of *presentation*. The 300-mark convention runs
continuously from at least 2001 to 2025. Only **2000** stands outside it, making no reference to marks at all.

**Consequence:** EK-0001's "pre-2013 differed" caveat should be struck, and EK-0120 (the open question
blocking that flip, "Era-1 mark allocation is quantitatively uncharacterised") is resolved.

## 3. What genuinely changed: the assessed competencies

The skeleton held; the *questions asked about the wine* shifted substantially.

| sub-question type | Era 1 | Era 2 | change |
|---|---|---|---|
| origin ID | 90.1% | 91.4% | +1.3 pts |
| quality | 76.6% | 86.4% | +9.8 pts |
| winemaking | 43.2% | 66.0% | **+22.8 pts** |
| **commercial** | 12.6% | 34.6% | **+22.0 pts** |
| style | 23.4% | 37.7% | +14.2 pts |
| **variety ID** | 66.7% | 55.6% | **−11.1 pts** |
| maturity | 39.6% | 26.5% | −13.1 pts |
| numeric (RS / ABV) | 11.7% | 5.6% | −6.2 pts |

Three things stand out:

**Commercial assessment is the great addition.** It appears in roughly one question in eight in Era 1 and
one in three in Era 2 — nearly tripling. In 2000–2003 it is close to absent. This is now the clearest
structural difference between the two eras.

**Variety identification declined while origin identification did not.** Origin ID is near-universal in
both eras (~90%); variety ID fell more than ten points. The exam did not stop asking candidates to
identify wines — it shifted the identification burden from *what grape* toward *where from*, and loaded
the freed marks onto winemaking, style and commercial.

**This independently corroborates two existing EK entries from a corpus they were never built on.** The
ID-suppression arc (EK-0104) and the rise of dual-pole commercial questioning were both derived from
2011–2026 evidence. Era 1 shows the same gradients extending backwards, which raises confidence that they
are a real long-run trajectory rather than an artifact of the last decade's sample.

## 4. Flights got smaller and more numerous

| flight size | Era 1 | Era 2 | change |
|---|---|---|---|
| 2-wine | 18.0% | 30.9% | **+12.8 pts** |
| 3-wine | 28.8% | 28.4% | −0.4 pts |
| 4-wine | 37.8% | 27.8% | −10.1 pts |
| 5-wine | 8.1% | 4.3% | −3.8 pts |
| 8-wine | 1.8% | 0.6% | −1.2 pts |

The 4-wine flight was Era 1's default; the 2-wine pair is Era 2's growth format, nearly doubling in share.
Large flights have gone: **8-wine questions existed in Era 1 (2008 P3, 2009 P1) and are extinct in Era 2.**
Papers now carry slightly more questions (3.36 → 3.60) over slightly smaller flights (3.57 → 3.33 wines).

The practical effect for a candidate is more compare-and-contrast work: a 2-wine flight almost always asks
for direct comparison, which is exactly the sub-question type examiners repeatedly say is answered badly
(EK-0022).

## 5. Corpus defects found along the way — and one that wasn't

**Fixed: 2011 Paper 3 had 12 wines but zero questions.** The question existed only in the second
compilation (`MW_Practical_Papers_Compilation V2.md`) and was lost because its heading omitted the
question *number*, which the parser's `QUESTION_RE` requires. The two compilations have since been
reconciled into one file covering 2011-2026 (`scripts/reconcile_sources.py`) and re-parsed; the
recovered question is a single 12-wine paired question that totals exactly 300.

**Not a defect after all: the 2013 "missing multipliers."** This was initially recorded as a
transcription fault because the three 2013 papers appeared to total 195/135/91 instead of 300.
Checking our text against the original IMW paper
(`docs/past_papers_2000s/MW-Exam-2013.pdf`, downloaded from mastersofwine.org) showed our source is
**faithful word for word** — including the sub-part lettering skip in P3 Q1 (a, c, d with no b),
which is a typo in the IMW original.

What 2013 actually does is state tariffs by **scope** rather than by multiplier. Where 2022 writes
`(3 x 15 marks)`, 2013 writes a standalone `For each wine:` header and then `(15 marks)` — or, in
P1 Q5, the explicit `(15 marks per wine)`. Both notations are equivalent; only a scope-aware reader
sees it. The analyzer now honours scope headers, and the result is unambiguous:

> **All 54 marks-printing papers (2008-2026) total exactly 300 — 25 marks per wine, zero exceptions.**

Two parsing subtleties were needed to get there, both worth knowing for any future tooling:
scope headers must be anchored to the start of a line (2013 P2 Q1 c) ends "…stating the vintage
*for each wine*. (10 marks)" *inside* a sub-part that sits under `For both wines:` — matching that
mid-sentence phrase inflates the paper), and a header naming a single wine (`For wine 4:`, 2022 P2 Q1)
scopes its sub-parts back down to one.

**Structural cause of the original split, now removed:** there were two source compilations, and the
file CLAUDE.md named authoritative was *not* a superset — 2011-2014 lived only in the other one.
There is now a single compilation.

## 6. Origin mix: two shifts inside a stable total

The Old World share barely moved (64.9% → 69.1%) and France is immovable at a third of all wines. Underneath:

- **Australia roughly halved**, 13.1% → 8.1% — the largest single-country move in either direction. In Era 1
  Australia was the second most-shown country after France; in Era 2 it is third, behind Italy.
- **South Africa more than doubled**, 1.3% → 3.3%, consistent with the syllabus explicitly naming Swartland as
  a fair-game modern reference.
- **Italy rose**, 10.1% → 11.9%, taking second place.
- Chile, Argentina, New Zealand, USA, Germany and Austria all moved by less than a point — stable.

## 7. What this means for the study system

- **Correct EK-0001.** Strike the "pre-2013 papers differed" caveat; the 25-marks-per-wine convention is
  continuous from 2001. The validator rule that enforces it (EK-0041) is on even firmer ground than the
  entry claimed.
- **Close EK-0120.** Era-1 mark allocation is now quantitatively characterised, by script, over a
  structured corpus.
- **Trust the ID-suppression and commercial-rise trends more.** They now hold over 26 years, not 15.
- **The trees' targets remain right.** Variety + region is still what ~90% of questions ask for, in both
  eras. Nothing here argues for re-pointing the master trees.
- **Do not train on Era-1 question *shapes*.** The 4-wine default, the 8-wine flight, and the near-absence
  of commercial questions are all obsolete. Era 1 is valuable as evidence about invariants and long-run
  trends, and as a wine-selection precedent — not as a template for generated questions.

## Sources

- `data/past_exams_2000_2010.json` — Era-1 corpus (this analysis), built by `scripts/build_era1_corpus.py`
- `data/exams.json` — Era-2 corpus
- `docs/past_papers_2000s/` — the source PDFs + extracted text (see `outputs/imw_website_crawl_2026-08-05.md`)
- `scripts/analyze_long_horizon.py` — every figure in this document
