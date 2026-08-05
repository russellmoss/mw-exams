# Long-horizon analysis of the MW practical: 2000–2025

**What this is.** The first analysis of the MW practical across its full published history — 26 years,
**75 papers, 264 questions, 900 wines**. Until now every heuristic in this system was derived from the
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

| | Era 1 (2000–2010) | Era 2 (2011–2025) |
|---|---|---|
| papers | 33 | 42 |
| questions | 111 | 153 |
| wines | 396 | 504 |
| **wines per paper** | **12 in 33/33** | **12 in 42/42** |
| **marked papers totalling 300** | **9/9** | **38/41** |
| questions per paper | 3.36 | 3.64 |
| mean flight size | 3.57 | 3.29 |
| Old World share | 64.9% | 68.1% |
| France share | 33.1% | 33.7% |

Four constants hold across the whole 26 years: **12 wines per paper** (75/75 papers), **300 marks per
paper**, the **P1 white / P2 red / P3 mixed** structure, and an origin mix of roughly **two-thirds Old
World with France at a third of all wines**. The three 2013 papers are the only marked papers that do
not total 300, and that is a transcription artifact (see §5), not a real exception.

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
| 2008–2010 | **yes, per sub-part** | 300 (9/9 papers verified by summation) |
| 2011–2025 | yes, per sub-part | 300 (38/41 marked papers verified; 2013 excepted, §5) |

So the transition is **2007 → 2008**, and it is a change of *presentation*. The 300-mark convention runs
continuously from at least 2001 to 2025. Only **2000** stands outside it, making no reference to marks at all.

**Consequence:** EK-0001's "pre-2013 differed" caveat should be struck, and EK-0120 (the open question
blocking that flip, "Era-1 mark allocation is quantitatively uncharacterised") is resolved.

## 3. What genuinely changed: the assessed competencies

The skeleton held; the *questions asked about the wine* shifted substantially.

| sub-question type | Era 1 | Era 2 | change |
|---|---|---|---|
| origin ID | 90.1% | 91.5% | +1.4 pts |
| quality | 76.6% | 87.6% | +11.0 pts |
| winemaking | 43.2% | 65.4% | **+22.1 pts** |
| **commercial** | 12.6% | 34.0% | **+21.4 pts** |
| style | 23.4% | 37.3% | +13.8 pts |
| **variety ID** | 66.7% | 56.2% | **−10.5 pts** |
| maturity | 39.6% | 26.8% | −12.8 pts |
| numeric (RS / ABV) | 11.7% | 4.6% | −7.1 pts |

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
2011–2025 evidence. Era 1 shows the same gradients extending backwards, which raises confidence that they
are a real long-run trajectory rather than an artifact of the last decade's sample.

## 4. Flights got smaller and more numerous

| flight size | Era 1 | Era 2 | change |
|---|---|---|---|
| 2-wine | 18.0% | 32.7% | **+14.7 pts** |
| 3-wine | 28.8% | 27.5% | −1.4 pts |
| 4-wine | 37.8% | 28.8% | −9.1 pts |
| 5-wine | 8.1% | 4.6% | −3.5 pts |
| 8-wine | 1.8% | 0.0% | −1.8 pts |

The 4-wine flight was Era 1's default; the 2-wine pair is Era 2's growth format, nearly doubling in share.
Large flights have gone: **8-wine questions existed in Era 1 (2008 P3, 2009 P1) and are extinct in Era 2.**
Papers now carry slightly more questions (3.36 → 3.64) over slightly smaller flights (3.57 → 3.29 wines).

The practical effect for a candidate is more compare-and-contrast work: a 2-wine flight almost always asks
for direct comparison, which is exactly the sub-question type examiners repeatedly say is answered badly
(EK-0022).

## 5. Corpus defects found along the way

Two real data problems in `data/exams.json`, both worth fixing at the source:

1. **2011 Paper 3 has 12 wines but zero questions.** The question exists in
   `source/MW_Practical_Papers_Compilation V2.md` — a single 12-wine paired question ("Wines 1 to 12 are
   all presented in pairs… 8 marks per pair / 14 / 20, plus 12 x 2 and 12 x 2") which sums to exactly 300.
   It is absent from the corpus, so this paper is invisible to every downstream analysis and to any
   "112 historical questions" count.
2. **The three 2013 papers dropped their per-wine multipliers in transcription.** They print e.g.
   "(10 marks)" under a "For each wine" heading where other years print "(6 x 10 marks)". Restoring the
   implied multiplier makes 2013 P3 total exactly 300 (91 → 300), confirming the papers themselves were
   normal and only the transcription is lossy.

Also worth recording: there are **two source compilations** — `MW_Practical_Papers_Compilation.md` (2,585
lines, the file `scripts/parse_source.py` reads and the only one CLAUDE.md names as authoritative) and
`MW_Practical_Papers_Compilation V2.md` (574 lines). The 2011 P3 content exists **only in V2**, so the
authoritative file is not a superset. Any re-parse should reconcile the two first.

## 6. Origin mix: two shifts inside a stable total

The Old World share barely moved (64.9% → 68.1%) and France is immovable at a third of all wines. Underneath:

- **Australia roughly halved**, 13.1% → 8.1% — the largest single-country move in either direction. In Era 1
  Australia was the second most-shown country after France; in Era 2 it is third, behind Italy.
- **South Africa nearly tripled**, 1.3% → 3.6%, consistent with the syllabus explicitly naming Swartland as
  a fair-game modern reference.
- **Italy rose**, 10.1% → 11.5%, taking second place.
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
