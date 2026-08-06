# Routing-Mechanics Sweep — 2026-08-06

**What this is:** an in-sample audit of the master trees' ROUTING layer, not a prediction backtest.
Every stem in the corpus (162 questions, 2011–2026, 540 wine-slots) was routed through its paper's
master tree + family pack using **stem text only**, then the routed branch's candidate set was
checked against the real answer-key wines. Because the trees were synthesized from most of these
questions, containment numbers are NOT accuracy estimates (see Caveats) — the sweep exists to find
**structural bugs**: stems that route ambiguously or to the wrong branch even though the tree
contains the answer elsewhere.

**Method:** 9 parallel agents (3 per paper, ~18 questions each). Phase 1 routes blind to the wines
(CLEAN / AMBIGUOUS / UNROUTED, trigger words quoted). Phase 2 grades containment
(STRONG / PLAUSIBLE / CURVEBALL / MISS per wine) and classifies every MISS as `routing_bug`
(some other branch's leaf contains the answer) or `knowledge_gap` (no leaf anywhere contains it).
Raw per-question records: `routing_sweep_2026-08-06_results.json` (same folder).

## Headline numbers

| Metric | P1 | P2 | P3 | ALL |
|---|---|---|---|---|
| Questions | 55 | 55 | 52 | 162 |
| Routed CLEAN | 44 (80%) | 46 (84%) | 40 (77%) | 130 (80%) |
| AMBIGUOUS | 10 | 9 | 11 | 30 (19%) |
| UNROUTED | 1 | 0 | 1 | 2 (1%) |
| Wines swept | 180 | 180 | 180 | 540 |
| STRONG containment | 81 | 124 | 116 | 321 (59%) |
| PLAUSIBLE | 61 | 25 | 27 | 113 (21%) |
| CURVEBALL | 15 | 9 | 1 | 25 (5%) |
| **MISS** | **23 (13%)** | **22 (12%)** | **36 (20%)** | **81 (15%)** |
| … of which routing_bug | 15 | 18 | 19 | **52 (64% of misses)** |
| … of which knowledge_gap | 8 | 4 | 17 | 29 |
| Variety-hit rate | 91% | 90% | 78% | 86% |
| Region-hit rate | 90% | 87% | 77% | 85% |

**The single most important number: 52 of 81 misses are routing bugs, not knowledge gaps.** Two
thirds of the time a real wine fell outside the candidate set, the tree already knew that
variety+region — in a different branch that the stem's trigger words failed to reach. Fixing
routing (gates, evidence filing, leaf back-fill) is worth roughly twice as much as adding new wine
knowledge.

Both UNROUTED stems (2014_p1_q3 paired grid, 2017_p3_q2 single-wine isolation) fell to Branch 0
**correctly** — they are on its documented unroutable list. Branch 0 works as designed.

## Defect classes (cross-paper synthesis)

### D1 — "Same region, different varieties" has no home (P1 + P2, ≥5 questions)
The Branch 2 ("same country") vs Branch 3 ("same region deep-dive") boundary is undefined when the
stem's linking word is **region** rather than country and the wines are *different varieties*.
Branch 3's leaves model single-variety quality ladders; Branch 2's multi-variety logic never fires
on region-worded stems. Hit: 2011_p1_q1, 2012_p1_q1 (2 misses), 2013_p1_q3, 2011_p2_q3 (Piedmont
tour — Nebbiolo/Dolcetto/Barbera, 3 misses), plus the 2016_p2_q4 leaf fork. **Fix: add an explicit
"same region, different varieties" sub-branch to both trees** (regional multi-variety tours:
Loire triangle, Piedmont Nebbiolo/Barbera/Dolcetto, Rhône, Alsace).

### D2 — Gate-vs-leaf desync: the gate names countries its leaves don't contain (P1 + P2)
P2 Branch 2's routing-gate base rates correctly list South Africa, New Zealand, Spain — but **no
sub-branch leaf contains any of them**, so the gate's honesty never reaches the candidate set
(2011_p2_q1 SA ×2, 2013_p2_q2 NZ ×3, 2014_p2_q3 Spain — rescued only by the pack). P1's Branch 2
country tiers omit Austria while the pack includes it (2013_p1_q2). **Fix: back-fill every country
the gate admits into at least one leaf, at the gate's own tier.**

### D3 — Evidence mis-filing: questions cited under branches whose triggers they violate
The worst instances put multi-country flights under "same country" headers: 2017_p2_q1, 2018_p2_q1,
2019_p2_q1, 2022_p2_q1 are all cited as Branch 2 evidence yet none is a same-country stem. Same
class: 2019_p1_q2 (a 6-wine, 3-country paired grid dragged into Branch 3's single-region ladder by
its own evidence citation — contained 1/6 where the pack's F4b would have contained ~5/6), and
2025_p1_q1 (cross-country blend stem filed under the same-country blend sub-branch). **Fix: audit
every evidence list against its branch's own trigger requirements; move violators.**

### D4 — Leaves never back-filled with their own evidence questions' answers
Several leaves cite a question as founding evidence while their candidate set excludes that
question's actual wines: 2016_p2_q5 (Salta Malbec, Colchagua Carmenère absent from the
"closely associated with origin" leaf that cites it), 2015_p2_q4 (Rhône-promotion rule misfires on
its own evidence — answer was Napa), 2015_p3_q1 (Branch 3's yeast trigger misses the autolysis wines
in its founding question), P3 7.3's "never two wines from one hierarchy" contradicted by its own
founding question (Ruby + 40Y Tawny), and P2 Branch 6.2's evidence line **misrecords its source
answer key** (claims Pinot Noir ×2 France + Malbec ×2 Argentina; 2023_p2_q3 was actually crossed —
the leaf scores 2/4 on the question it was built from). **Fix: mechanical back-fill pass — every
leaf must contain the wines of every question it cites.**

### D5 — Master-tree Layer A branches that exist only in the family pack
Constructions the pack routes but the master tree cannot: **same-producer flights** (P1: 2021_p1_q3
Wachau Federspiel/Smaragd → 2 misses, 2022_p1_q1), **same-single-variety in P3** (2012_p3_q3/q4,
2016_p3_q1, 2023_p3_q4 route only via the pack's F1), **cross-country blend stems** (P1 2025_p1_q1,
P2 2012_p2_q1 — no Bordeaux-family Layer A branch in the P2 master), and the P3 **Branch 4 vs 7.3
overlap** for two-wine same-region stems (2023_p3_q3, 2024_p3_q2 — no gate separates them, and
7.3's still-red prior misleads on non-red pairs). **Fix: promote these four constructions into the
master trees' Layer A, or add explicit "defer to pack Fx" pointers.**

### D6 — P3 style-default heuristics that fire on the wrong flights
Branch 7.1's "no style keyword → fortified/oxidative sweep STRONG" fired on 2019_p3_q3's all-rosé
flight (4 misses) and conflicts with the pack F4a's "treat as independent category sampler" stance
(also 2022_p3_q3). Rosé generally: the qualifier has no gate anywhere (2022_p3_q1, 2017_p3_q1).
**Fix: rosé needs its own trigger + leaf; 7.1's default needs a "unless rosé/mixed-category signals
present" guard.**

### D7 — Concentrated knowledge gaps (the 29 true gaps cluster, they're not random)
- **New Zealand is the single most-missed country: 14 of 81 misses** (Marlborough Riesling,
  Gewürztraminer, Chardonnay; Hawke's Bay Syrah ×3 + Gimblett Gravels blend; Central Otago and
  Martinborough Pinot ×3; NZ sparkling ×2, rosé). NZ is absent from Riesling region lists, the P1
  Branch 0 fallback prior, and nearly every P3 leaf.
- **Dry Alsace Muscat: 3 independent misses** (2011_p1_q1, 2017_p1_q4, 2023_p1_q2) — the classic
  4-noble-varieties tour is unreachable because Muscat exists in no P1 leaf.
- **Valpolicella/Corvina family: 5 misses** across P2/P3 (Ripasso, Amarone pair, Recioto, sparkling
  adjacency 2021_p3_q2).
- **Madeira: 4 misses** — absent from P3 pair-structure leaves despite two pair-flight appearances
  (2011_p3_q1, 2021_p3_q3).
- **Australian secondary varieties: 10 misses** (Marsanne, Viognier, Margaret River SSB, Clare
  Riesling in grid contexts, Grenache ×2, Tasmania sparkling/botrytis, Hunter Semillon).
- **Piedmont beyond Nebbiolo:** Dolcetto, Barbera, Arneis, Cortese/Gavi, Moscato d'Asti — five
  distinct misses, all P1/P2 Italian secondary whites/reds.
- Singletons worth one line each: Moschofilero/Mantinia, Jurançon Petit Manseng, Montepulciano
  d'Abruzzo, Rio Negro Pinot Noir, Mendoza Cabernet Franc, California Syrah (region-list absence).

### D8 — Tree-vs-pack conflicts: 93 flagged, ~25 material
Most are cosmetic dual-filings. The material ones are covered by D1–D6 above; the pattern to note is
that **when tree and pack disagree, the pack's trigger wording is usually the more literal match**
(6.3's "stem wins" rule already points the right way — the master trees just haven't absorbed it).

## Recommended fix order

1. **D4 back-fill pass** (mechanical, zero overfit risk: leaves must contain their cited evidence
   answers; fix the 6.2 answer-key misrecord and the 7.4/7.5 factual errors).
2. **D3 evidence-list audit** (move mis-filed citations; also mechanical).
3. **D2 gate/leaf sync** (add SA/NZ/Spain/Austria to the leaves their gates already admit).
4. **D1 new sub-branch** "same region, different varieties" in P1+P2.
5. **D5 Layer A promotions** (same-producer, P3 same-variety, cross-country blends, Branch 4/7.3 gate).
6. **D6 rosé trigger + 7.1 guard.**
7. **D7 knowledge back-fill at the right tier** — NZ, Alsace Muscat, Corvina, Madeira first; add as
   PLAUSIBLE/CURVEBALL tiers, not STRONG, unless corpus frequency justifies more.

After applying any of these, **re-run the LOYO audit** (`loyo_postfix_audit.md` pattern) to confirm
the fixes help held-out years — D1–D6 are structural and should be safe; D7 additions are the ones
to watch for overfitting.

## Caveats

- **In-sample:** containment rates are inflated by construction — many leaves were built from these
  exact questions. All 2026 questions and several 2025 leaves are verbatim founding evidence
  ("15/15 STRONG" there is recall, not prediction). Treat the MISS/AMBIGUOUS lists as the signal,
  not the STRONG counts.
- **Ground truth** was inferred from wine names by the sweep agents (not externally verified);
  a handful of blend compositions are noted as uncertain in the JSON.
- 2011–2014 questions predate the trees' training corpus (2015–2026) but some appear in tree prose
  (e.g. the P2 routing gate); they are the closest thing to out-of-sample in this sweep, and they
  contribute disproportionately to the ambiguity list — consistent with the era-1 finding (EK-0148).
