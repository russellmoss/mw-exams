# Gap Analysis 07 — Adversarial Corpus Review

**Role.** Independent verification of the load-bearing claims in `exam_gap_analysis.md` (+ findings
01–06) against the raw structured corpus, using my own Python aggregations. The external model council
cannot see the data; this is the check they can't run.

**Scope.** `data/structured/{corpus_wines,corpus_questions,corpus_subquestions,corpus_summary}.json`
(360 wines / 112 Q / 337 sub-Q last-10) + `scripts/build_structured_corpus.py` (the classifier).
Every number below was recomputed from the JSON, not copied from the findings.

---

## Confirmed (recomputed, match exactly)

Every headline statistic I re-derived reproduced to the decimal. The analysis is **arithmetically
honest** — no inflated or cherry-picked figures.

| Claim (as stated) | Recomputed | Verdict |
|---|---|---|
| Per-paper OW share P1 65% / P2 63% / P3 82% | P1 78/120=**65.0%**, P2 76/120=**63.3%**, P3 98/120=**81.7%** | ✅ exact |
| Per-paper avg OW: P1 7.8, P2 7.6, P3 9.8 (OW range 4–11) | 7.8 / 7.6 / 9.8, ranges 4–11 / 5–11 / 6–11 | ✅ exact |
| Mark-share shift: ID-composite 59.7→53.8→**46.2%** | 59.7 / 53.8 / **46.2%** | ✅ exact |
| commercial 5.7→11.6→**17.9%**; style 10.1→14.6→**20.1%**; maturity 4.6→11.1→**13.1%** | all reproduce to the decimal | ✅ exact |
| Curveball med+high by size: 2→21.6%, 3→26.7%, 4→21.0%, 5→28.6%, 6→33.3% | identical | ✅ exact |
| **54% of flights all-anchor** (0 med+high); exactly-1 = 28% | 60/111=**54.1%**, 31/111=**27.9%** | ✅ exact |
| P1 hardest at q2/middle (15.4% high), NOT last (6.1%) | P1 middle high%=**15.4**, last=**6.1**; q2 overall high%=**14.0** | ✅ exact |
| P3 rises to end (last 58.8% med+high); P3≫P1>P2 | P3 last **58.8%**; P3 49.2 / P1 15.0 / P2 9.2 | ✅ exact |
| Family curveball: F5 61.1% / F6 38.5% / F1 8.1% | identical | ✅ exact |
| Quality questions: 51% compress high, 20% broad ≥3-band ladder | 53/103=**51%**, 21/103=**20%** | ✅ exact |
| Within-Q price bands: 31% homogeneous / 50% two / 18% three | 35/56/20/1 → 31/50/18/1% | ✅ exact |
| NV/undated: P3 26% (P1 1%, P2 0%) | P3 31/120=**26%** | ✅ exact |
| marks_ok 100% from 2014; 2012=300, 2013=396 marks | confirmed | ✅ exact |

**Commercial-tripled is robust, NOT a classifier/verbosity artifact** (this was the biggest risk). I
checked the obvious confound — that recent verbose stems just trip more keywords. Average sub-question
text length is **flat across eras** (pre-2014 69 chars → 2015-19 67 → 2020-25 67) and avg type-hits per
sub-q barely moves (1.62→1.57→1.77). The share of sub-questions actually *containing* a commercial
keyword rose 4.8%→11.6%→16.7%, and a manual read of the 2020-25 commercial hits shows genuine "market
position / commercial appeal / consumer appeal / which markets" stems — real, not false positives. The
shift is in the source, not the regex.

**Classifier accuracy on a 20-sub-question random sample: clean.** Every assignment was defensible
(e.g. "Comment on the style and commercial appeal" → hits `[commercial, style]`; "Compare and contrast
the quality, maturity, and capacity to age" → `[maturity, quality, comparative]`). No howlers.

---

## Fragile / needs a caveat it currently lacks

1. **Small-n flight/family rows quoted without a caveat.** Several load-bearing rows rest on tiny n:
   - **5-wine flights: n=7 questions** (35 wines). The "5-wine highest high-curveball 14.3%" and "5-wine
     mean 2.57 price bands" are 7-flight artifacts — one flight swings it ~14 pts.
   - **6-wine flights: n=6** (the curveball "33.3% / size-6 rises" and the per-12 P3≈5.9 budget lean on
     these). One 2018 P3 flight (5 medium of 6) dominates.
   - **F6: n=4 questions** (13 wines). "F6 38.5% med+high" is **5 harder wines out of 13** — a single
     wine moves it 7.7 pts. This number should never be quoted without "n=4."
   - **F3 (blend): n=6**, F7: n=8. Both are quoted as if stable.
   The findings DO sometimes flag this inline ("5/6-wine n is tiny"), but `exam_gap_analysis.md`'s
   correction-table rows 3 and 4 ("flat ~21–27%", "F5/F6 denser 61%/38%") and roadmap R10
   ("reject all-banker F5/F6/P3 flights") **propagate F6=38% and the 6-wine budget as firm targets with
   no n-flag.** Anyone building R10's "reject all-banker F6 flight" rule is calibrating on 4 questions.

2. **"commercial ~0→18%" (exec summary + corrections row 6) is loose.** The pre-2014 *era* commercial
   full-credit share is **5.7%**, not ~0. Only **2012** (the anomalous 300-mark year) is literally 0%;
   2011=3.3%, 2013=5.1%, 2014=9.6%. "~0→18" reads as a cleaner story than the data supports. The honest
   phrasing is **"5.7%→17.9% (full-credit) / 2.6%→7.8% (split-evenly)"** — which Finding 04 §1b states
   correctly; the summary rounded it down to "~0" and lost the qualifier. Minor but it's the one number
   a council reviewer would (rightly) poke.

3. **The full-credit-per-hit method can mislead a casual reader, and one summary table actively does.**
   The findings are explicit that columns exceed 100% (full credit to every label). That's fine *with
   the caveat*. BUT `corpus_summary.json`'s `subq_type_dist_last10` reports the **primary** type only
   (first match in TYPE_RULES priority order), and there **style appears as primary in just 1 of 337
   sub-questions** while the multilabel/full-credit count is 54. A reader who quotes the summary's
   primary-type table (the most prominent one in the JSON) would conclude style is negligible — the
   opposite of the §1b finding that style "roughly doubled to 20%." The `primary` field is an unstable
   artifact of rule ordering (commercial undercounted by 5, style by 53) and should be labeled
   "do-not-cite-in-isolation" or dropped from the summary.

4. **"P1 hardest slot is q2" — directionally right, but it's a per-position aggregate over 10 papers
   with uneven question counts.** P1 "middle" pools q2 (and q3 when a paper had 4 Qs) across 52 wines;
   the high% of 15.4 is **8 high-curveball wines**. Solid enough to *kill the wrong EK-0025 "last-Q"
   claim* (which it does cleanly), but I'd phrase the positive claim as "mid-paper, not back-loaded"
   rather than pinning it hard to "q2," since q2 vs q3 isn't cleanly separable at this n.

---

## Refuted

**Nothing was refuted.** I tried to break the four highest-leverage claims (OW:NW, ID-decline,
54%-all-anchor, P1-q2-curveball) and all four held to the decimal. The analysis does not overstate its
core numbers. The only corrections are the *framing* loosenesses in the section above (esp. "~0→18%"
and the primary-type summary artifact), not the underlying statistics.

---

## Missing (real patterns in the corpus the gap analysis does not surface)

1. **Blends are pervasive (29%) but treated as an F3-only, 6-question niche.** 106 of 360 last-10
   wines (29%) carry a multi-grape variety string (e.g. Tempranillo/Garnacha, Touriga
   Nacional/Touriga Franca, Sercial/Verdelho). The analysis discusses blends only via family F3 (n=6)
   and the soft R5 "single-variety-blend" rule. There is **no blend-frequency target** — a generator
   could emit 100% single-variety wines and pass everything, yet ~1 in 3 real wines is a blend. This is
   a genuine missing composition axis, arguably MED, and it's adjacent to (but distinct from) the
   variety-diversity axis the analysis does cover.

2. **France-dominance has no cap.** France = **123/360 (34%)** of last-10 wines; the next country
   (Italy) is 44. The whole-paper validator (Finding 01 R2) enforces a country *floor* (≥4–6 distinct)
   but **no ceiling on any single country.** A generated paper could be 8/12 French and pass "≥6
   countries" if the other 4 are singletons — yet that over-concentrates the single most-tested origin.
   A "no single country > ~⅓ of a paper" soft guard is a real, cheap, missing target.

3. **Sub-region specificity as a *tariff* signal is under-exploited.** Finding 04 notes origin_id 5–6
   marks = de-emphasized geography, 10–15 = precise geography wanted, and the corpus bears this out
   (origin_id `marks_each` modes: 10 (×30), 8 (×17), 7 (×12)). But neither the analysis nor the
   roadmap proposes *generating* the high-tariff "identify origin as closely as possible" precision
   demand vs the low-tariff "broad origin" version — the mark size IS the examiner's specificity dial,
   and it's currently only described, never targeted. Minor.

4. **Producer recurrence is real and unmodeled.** Henriques & Henriques and Dr. Loosen each appear 5×
   in the last 10 years; F.X. Pichler, Corte Sant'Alda, Moët, Ch. Coutet, Ducru-Beaucaillou 3× each.
   The exam genuinely re-uses a stable benchmark stable. Not a "gap" per se (the app generates, doesn't
   re-serve real wines), but worth one line in the guide: the benchmark anchors are a recurring, finite
   set — relevant to the "banker" concept the curveball finding leans on.

---

## Recommended edits to `exam_gap_analysis.md`

1. **Fix the "~0→18%" commercial figure** (exec summary line 52 + corrections row 6). Replace with the
   defensible era number: **"commercial 5.7%→17.9% full-credit (2.6%→7.8% split-evenly)."** Keep "~0"
   only if you add "(2012 anomaly)". This is the single number most exposed to a council nitpick because
   it's the only headline that rounds *past* what the data shows.

2. **Add an explicit small-n flag to the correction table and roadmap R10.** Wherever F6 (38%), the
   6-wine budget, or 5-wine rates appear, append the n: "F6 n=4 Q / 13 wines — directional only";
   "P3≈5.9 harder/12 rests on 6× 6-wine + 7× 5-wine flights." And soften R10's "reject all-banker
   F5/F6/P3 flights" to apply HARD only to **F5/P3** (n=12 / 120, robust) and SOFT to F6 (n=4).

3. **Add a blend-frequency + single-country-cap line to the whole-test validator (WT-6 / Finding 01
   R2).** Two cheap, currently-missing whole-paper guards backed by the data: **(a)** ~25–30% of wines
   should be blends (corpus 29%), so flag an all-single-variety paper; **(b)** no single country >
   ~⅓ of a paper (France is 34% corpus-wide — the realistic concentration ceiling). Both are first-order
   composition axes the current "≥6 countries / ≥7 varieties" floors don't catch.

*(Bonus, optional)*: drop or relabel `subq_type_dist_last10` (primary-type) in `corpus_summary.json` —
it shows style=1 and will mislead anyone who reads the summary instead of Finding 04's full-credit
table. Use the multilabel/`subq_multilabel_last10` block as the headline.

---

*All figures recomputed 2026-05-31 from `data/structured/` via independent Python aggregation. No
claim was accepted on the findings' word; every row in the Confirmed table was re-derived.*
