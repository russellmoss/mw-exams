---
paper: 2
tree_name: P2 Reds Master Decision Tree
generated: 2026-05-25
last_resynthesized: 2026-08-06
questions_analyzed: [2015_p2_q1, 2015_p2_q2, 2015_p2_q3, 2015_p2_q4, 2016_p2_q1, 2016_p2_q2, 2016_p2_q3, 2016_p2_q4, 2016_p2_q5, 2017_p2_q1, 2017_p2_q2, 2017_p2_q3, 2018_p2_q1, 2018_p2_q2, 2018_p2_q3, 2018_p2_q4, 2019_p2_q1, 2019_p2_q2, 2019_p2_q3, 2021_p2_q1, 2021_p2_q2, 2021_p2_q3, 2021_p2_q4, 2022_p2_q1, 2022_p2_q2, 2022_p2_q3, 2022_p2_q4, 2022_p2_q5, 2023_p2_q1, 2023_p2_q2, 2023_p2_q3, 2024_p2_q1, 2024_p2_q2, 2024_p2_q3, 2025_p2_q1, 2025_p2_q2, 2025_p2_q3, 2026_p2_q1, 2026_p2_q2, 2026_p2_q3]
accuracy_target: variety + region (not exact wine)
---

# P2 Reds - Master Decision Tree

## Accuracy target
This tree targets **variety + region** accuracy. Producer, vintage, and vineyard identification are bonus, not the target. A correct prediction = right variety AND right country/region.

## Branch 0 — Unrecognised construction (fallback). READ THIS FIRST.

**Why this exists.** The blind 2000-2010 backtest (EK-0148) found **29% of stems matched no branch at
all** — P1 38%, P3 39%, P2 9% — and that unrouted stems score far worse than routed ones
(20/41/58 vs 33/56/74 on variety top-1/top-3/in-set). The damage was not ignorance of wine; it was
this tree **force-fitting an unfamiliar stem into the nearest-looking branch** and inheriting a prior
that did not apply. EK-0004 says new question types appear regularly, so this will keep happening.

**The rule.** If the stem does not clearly match a branch below, do **not** pick the closest one.
Say so, and fall back to the paper-level prior with a deliberately wide candidate set. An honest
"unrecognised construction, staying broad" outperforms a confident wrong branch — the tree's own
numbers say so.

**Known unroutable constructions** (from the Era-1 blind test): price ranking, open-vs-blind or
Old-World-vs-New-World paired grids, and single-wine isolation questions. (Vintage verticals were
originally on this list, but the corpus shows a vertical anchored to a region or producer routes
cleanly to Branch 3 — 2021 P2 Q1's Ducru vertical and 2014 P2 Q2's 2x2 estate-vintage grid both
contained fully there. Only a vertical with no region/producer anchor in the stem stays unroutable.)

**Paper 2 fallback prior** (2015-2026, 132 wines): Pinot Noir 17%, Cabernet Sauvignon/Merlot 9%,
Sangiovese 7%, Tempranillo/Garnacha 6%, Cabernet Franc 5%, Nebbiolo 5%. Countries: France 32%,
Italy 19%, USA 11%, Spain 6%, Australia 6%, Argentina 5%. Note P2 stem grammar is the most stable
of the three papers across 26 years (only 9% unroutable), so an unrecognised P2 stem is genuinely rare
— re-read it before falling back.

**Then let the glass lead.** With no branch to narrow on, sensory evidence carries more weight than
usual — go to Layer B early and rank on what is actually in front of you.

## Layer A - Pre-tasting decision tree (question stem only)

### Branch 1: "Same single grape variety" questions
**Historical frequency:** 8 of 40 P2 questions (2016 P2 Q1, 2016 P2 Q2, 2018 P2 Q2, 2018 P2 Q3, 2022 P2 Q4, 2022 P2 Q5, 2024 P2 Q1, 2024 P2 Q3; 2025 P2 Q1 also uses single-or-predominant logic). 2026 did not add to this branch: 2026 P2 Q1 shares its "same country" spine with Branch 2 below but asks for three *different* single varieties rather than one shared variety.

#### Sub-branch: same variety across multiple countries
- **Leaf:** STRONG SIGNAL: Pinot Noir, Syrah/Shiraz. PLAUSIBLE: Cabernet Sauvignon/Cabernet Franc. CURVEBALL: Merlot, Grenache.
- **Evidence:** 2016 P2 Q2, 2024 P2 Q3, 2024 P2 Q1, 2025 P2 Q1, 2017 P2 Q1 (relocated here from Branch 2's blend-language sub-branch, where it was mis-filed — its stem says "from different countries... share a common dominant grape variety", which is this sub-branch's trigger, not a same-country one).
- **Region distribution:** STRONG SIGNAL Pinot Noir: Burgundy, Germany, New Zealand, Sonoma/Oregon, Canada; PLAUSIBLE California (Santa Maria/Sonoma Coast — 2019 P2 Q2, 2021 P2 Q2); CURVEBALL Australia (2016 P2 Q2 fielded a Hunter Valley Pinot — a flag to widen, not a predictor). STRONG SIGNAL Syrah/Shiraz: Northern Rhone, Barossa/McLaren Vale, Chile, South Africa; PLAUSIBLE California Central Coast (attested twice: 2012 P2 Q3 Santa Barbara, 2014 P2 Q1 Central Coast). PLAUSIBLE Cabernet family: Bordeaux/Loire, Napa/Sonoma, Chile, Stellenbosch, Coonawarra/South Australia (2017 P2 Q1); for Cabernet Franc specifically also CURVEBALL Argentina (Mendoza — 2025 P2 Q1) and Tuscany (a Cabernet Franc-dominant Super Tuscan — 2025 P2 Q1; single question, so a flag to widen when the stem hedges "or predominant", which is exactly the wording that should pull the F3 blend-family universe into play). CURVEBALL Merlot: Bordeaux right bank, California (2011 P2 Q5), Chile, Hawke's Bay. CURVEBALL Grenache: Spain, southern France, Australia, California (2013 P2 Q3 fielded a full four-country Grenache flight — Priorat, California, Chateauneuf-du-Pape, Barossa — all four inside this region list).
- **Practical rule (countries may repeat):** "same variety, different countries/origins" does not mean one wine per country — 2015 P2 Q1 fielded two Burgundies plus one NZ Pinot, and 2018 P2 Q2 two US Pinots plus one NZ. Do not force a distinct country onto every slot.

#### Sub-branch: same variety, same region, compare quality or winemaking
- **Leaf:** STRONG SIGNAL: Gamay/Beaujolais, Malbec/Mendoza, Zinfandel/Dry Creek, Syrah in one region (Hawke's Bay — both wines of 2018 P2 Q3; Cote-Rotie/Hermitage as the classic-Europe form). PLAUSIBLE: Pinot Noir in one New World region. CURVEBALL: Nebbiolo outside Piedmont.
- **Evidence:** 2016 P2 Q1, 2022 P2 Q4, 2022 P2 Q5, 2018 P2 Q3 (this question was always counted in Branch 1's frequency line and cited in Layer B's Syrah section, but the leaf never inherited its answer — Hawke's Bay Syrah x2 — until the 2026-08-06 routing sweep).
- **Examiner logic:** if the stem tightens to one region, expect intra-regional quality hierarchy or stylistic split rather than pure variety ID.

### Branch 2: "Same country" questions
**Historical frequency:** 9 of 40 P2 questions, dominated by France and Italy.

#### ROUTING GATE — read this before any sub-branch below

This branch has three sub-branches and until 2026 it had no rule for choosing between them, so a
reader entered the first one by default and inherited its Italy-led prior. That is precisely how the
frozen tree failed 2026 P2 Q1: it routed to "different regions, region-first", led Italy, and the
answer was three light French reds — **0% top-1, 0% top-3, 33% candidate set**, the worst result of
any question in the 2026 holdout (EK-0148). The prior was not the bug; the missing routing was.

Check these in order:

1. **Where does identification sit, and what is it worth?** Across the nine single-country P2
   instances, identification is sub-question **(a), asked first, in eight of nine**. The single
   exception is 2026 P2 Q1, where ID is asked **last (c) and is not the heaviest** (11 style /
   6 method / 8 ID). If ID is demoted, go to the **market-fluency/showcase** sub-branch and treat the
   Italian benchmark prior as **weakened, not merely re-pointed** — widen, do not swap one country
   for another. n=1, so this is a flag to open up, not a predictor of France.
2. **How many wines?** Italy's three appearances (2015 Q3, 2017 Q2, 2023 Q1) are **all 4-wine
   flights**. All three **3-wine** instances were non-Italy — South Africa (2011 Q1), New Zealand
   (2013 Q2), France (2026 Q1). A 3-wine same-country flight has never been Italian in this corpus.
   Small n, but it points the same way as signal 1 and the two co-occurred in 2026.
3. **What does the stem link on?** "different **regions**" → region-first sub-branch. "different
   single **grape varieties**" → market-fluency/showcase sub-branch. "variety/ies" plural or
   "predominant" → the blend-language sub-branch.
   **Precedence rule (2026-08-06 routing sweep):** bare "variety/ies" wording fires BOTH the
   showcase and blend-language cues at once, and did so on 2011 P2 Q1, 2013 P2 Q2 and 2014 P2 Q3.
   Resolve it in this order: (a) the word "single" anywhere in the variety wording → showcase;
   (b) "predominant", or the stem fixing **both country and region** → blend-language; (c) bare
   "variety/ies" with only the country fixed → treat as a showcase/variety-tour first, but keep one
   blend-family candidate alive per wine (all three attested bare-"variety/ies" flights contained at
   least one blend). **Scope limit on (c) (2026-08-06 residual sweep):** rule (c) fires only when
   the variety wording sits in the flight **intro**. If the intro itself links on nothing (bare
   "Wines 9-12 are all from the same country") and "variety/ies" appears only inside a
   **sub-question** ask ("specific origin with reference to the grape variety(ies) used" —
   2014 P2 Q3), route as if the stem links on nothing: enter **region-first**, whose Spain line
   holds that question's full back-filled answer set (Ribera del Duero Tempranillo, Bierzo Mencía,
   Campo de Borja Garnacha, Rioja Reserva Tempranillo-Garnacha). Before this scope limit, rule (c)
   and the region-first Spain back-fill each claimed 2014 P2 Q3, and the showcase leaf it routed to
   named Spain only at PLAUSIBLE with no varieties — a 0/4 miss on a question the tree knew cold.
   If the stem links on **nothing at all** (bare "same country" — 2023 P2 Q1),
   enter region-first as the default, holding signals 1–2's country read.

**Country base rates for a single-country P2 stem** (all nine instances, so this is the honest prior
when no signal above fires): Italy 3, France 2, South Africa 1, New Zealand 1, Spain 1, USA 1.
Italy leads, but it is 3 of 9 — a plurality, not a default. Keep France, and at least one New World
country, alive in the candidate set at all times.

#### Sub-branch: same country, different regions, region-first
- **Leaf:** STRONG SIGNAL: Italy, France. PLAUSIBLE: USA, Spain. CURVEBALL: broader "Americas" or ex-big-three Europe.
- **Evidence:** 2015 P2 Q3, 2017 P2 Q2, 2023 P2 Q1, 2014 P2 Q3 (Spain). (Evidence audit 2026-08-06: 2018 P2 Q1 and 2024 P2 Q2 were removed — both are multi-country "classic European origins" flights and belong to Branch 4, where they were already cited; 2025 P2 Q2 was removed — its stem fixes country AND region, which is the blend-language/Branch 3 construction, not "different regions".)
- **Variety distribution:** STRONG SIGNAL Italy: Nebbiolo, Sangiovese, Aglianico, Nerello Mascalese, Corvina-led blends; CURVEBALL Montepulciano (Abruzzo — 2017 P2 Q2; the one mid-volume central-Italian workhorse the list previously stopped short of; single instance, a flag to widen). STRONG SIGNAL France: Syrah, Grenache blends, Cabernet/Merlot, Pinot Noir. PLAUSIBLE USA: Cabernet, Zinfandel, Pinot Noir, Petite Sirah. PLAUSIBLE Spain: Tempranillo (Rioja, Ribera del Duero), Mencia (Bierzo), Garnacha (Aragon value DOs — Campo de Borja/Calatayud/Carinena), Tempranillo-Garnacha Rioja blends (2014 P2 Q3 fielded exactly this four-region spread; the routing gate's base rate always admitted Spain 1/9, but no leaf carried it until the 2026-08-06 sweep).

#### Sub-branch: same country/region plus blend language ("predominant grape variety")
- **Leaf:** STRONG SIGNAL: Bordeaux family, Rioja/Tempranillo-led, Rhone GSM/Syrah-led. PLAUSIBLE: Chianti Classico and Tuscan blends; Napa (varietal Merlot alongside a Cabernet-led Bordeaux blend — 2015 P2 Q4, this sub-branch's own founding evidence). CURVEBALL: Cape blends or Douro reds if country is hidden.
- **Evidence:** 2015 P2 Q4, 2025 P2 Q2. (Evidence audit 2026-08-06: 2017 P2 Q1, 2019 P2 Q1 and 2022 P2 Q1 were removed — none is a same-country stem. 2017 P2 Q1 says "from different countries... common dominant grape variety" and now lives in Branch 1's cross-country sub-branch; 2019 P2 Q1 ("made from Bordeaux varieties", France/Italy/South Africa) and 2022 P2 Q1 ("from different countries... Wine 4 is a blend of all three") route via Branch 6.4 / the pack's F3. **Trap note:** blend-family wording alone does NOT put a stem in this branch — the country must be fixed first. Filing those three here is exactly the mistake this note guards against.)
- **Practical rule:** if the stem says same country and same region and uses "variety/ies" in the plural, promote Rhone Valley above Rioja — that wording produced a Northern-Southern Rhone mix of Syrah plus Grenache-led blends in 2025 P2 Q2. **But this is a promotion, not a lock:** the same wording on this sub-branch's own founding question (2015 P2 Q4) resolved to Napa — varietal Merlot plus a Cabernet-dominant Bordeaux blend. Keep a New World / Bordeaux-family candidate pair alive alongside the Rhone read; with one instance each way, plural-varieties wording narrows to "one region fielding both a varietal wine and a blend", not to Rhone itself.
- **Tiebreak with Branch 3 (2026-08-06):** a stem that fixes country AND region has two homes — this sub-branch and Branch 3's blend/single-variety-mix leaf, and 2025 P2 Q2 is cited by both. In practice both promote the same candidates (Rhone first), so enter either, but say which axis you are working: blend-vs-varietal composition (here) or intra-regional terroir/tier contrast (Branch 3).

#### Sub-branch: same country, different single varieties, market-fluency/showcase structure (new for 2026)
- **Leaf:** STRONG SIGNAL: France (non-Bordeaux single-varietal tour — Loire Cabernet Franc, Beaujolais Gamay, Jura Trousseau/Poulsard, Northern Rhone Syrah, Burgundy Pinot Noir), Italy (Nebbiolo/Sangiovese/Primitivo-Nero d'Avola spread). PLAUSIBLE: USA (Cab Sauv/Pinot Noir/Zinfandel), Australia, Spain. CURVEBALL: Argentina, Chile; South Africa — attested 2011 P2 Q1: Stellenbosch Bordeaux-family blend + Stellenbosch Syrah + varietal Pinotage (note **varietal** Pinotage, not only Cape blends); New Zealand — attested 2013 P2 Q2: Central Otago Pinot Noir + Hawke's Bay Syrah + Gimblett Gravels Merlot-led Bordeaux blend. (Both pre-2015 flights sit in the routing gate's base rate at 1/9 each; until the 2026-08-06 sweep no leaf carried their variety+region sets, so the gate's honesty never reached the candidate list. A same-country New World flight tends to mix varietals AND a Bordeaux-family blend — don't run a pure single-varietal ballot.)
- **Evidence:** 2026 P2 Q1 (Saumur Les Plantagenets Cabernet Franc [Loire, co-op, entry tier], Regnie Domaine de la Margot Gamay [Beaujolais cru], Trousseau Singulier Tissot [Arbois, biodynamic, ~£40+] — all France, wine order confirmed the ascending-prestige/lightness-to-artisanal sequencing the tree already expected, but the actual varieties were all light-bodied cool-climate reds, not the Nebbiolo/Napa Cab/Barossa Shiraz-type "big three countries" cast a blind read would first reach for). Cross-paper analog: 2025 P1 Q3 (same "same country, different single varieties" engine applied to whites — France won on Muscadet/Alsace Riesling/Loire Chenin).
- **Practical rule (inverted mark order):** when this stem structure pairs with a mark order that puts style-and-commercial-position *first and heaviest* (e.g. 11 marks/wine) and identification-of-variety-and-origin *last and lightest* (e.g. 8 marks/wine), read that as a deliberate signal: the examiners want market fluency and stylistic range, not fine origin detective work, and the flight is likely to skew toward lighter, more commercial, less "trophy" bottlings than a standard same-variety or same-region question. See 2026 P2 Q1 (11/6/8 mark split, all three wines France, all cool-climate and light-bodied, none of them classified growths). Do not assume that "heaviest marks lead with style" implies premium wines — in the one instance seen, it correlated with *lighter, more everyday-to-mid-market* reds, because style/commercial breadth is easiest to assess and mark fairly across a spread that includes at least one accessible, recognisable style.
- **Practical rule (pale-red trap):** do not let "same country, red still wine" default your eye to deep-coloured reds. A pale, high-acid, low-tannin wine in this structure can be Trousseau/Poulsard (Jura) rather than Pinot Noir or Gamay — see the Layer B pale-red caution below.

### Branch 3: same region / terroir deep-dive questions
**Historical frequency:** at least 12 of 40 P2 questions (2026 P2 Q3 adds one question that alone spans three same-region pairs — 6 of the paper's 12 wines and 150 of 300 marks, the single largest concentration of "same region" testing in the corpus).

#### Sub-branch: same region — vintage, producer, or sub-region/tier contrast
*(Retitled 2026-08-06: the old title "same vintage or same producer" did not describe its own evidence — 2022 P2 Q2/Q3 are sub-region-spread pairs with neither shared vintage nor shared producer.)*
- **Leaf:** STRONG SIGNAL: Bordeaux, Burgundy, Tuscany, Beaujolais, Rioja. PLAUSIBLE: Northern Rhone, Southern Rhone (Chateauneuf-du-Pape vs Cotes du Rhone — 2016 P2 Q4 paired Cote-Rotie with Chateauneuf-du-Pape, and 2021 P2 Q4's Rhone pair ran CNdP vs CdR; the leaf previously stopped at the Northern Rhone and could not contain its own evidence). CURVEBALL: Etna or other emerging fine-wine regions.
- **Evidence:** 2016 P2 Q3, 2021 P2 Q1, 2022 P2 Q2, 2022 P2 Q3, 2016 P2 Q4, 2014 P2 Q2 (pre-2015 era: a 2x2 estate-vintage grid — two Bordeaux chateaux x two vintages, "divide the wines into their respective pairs" — fully contained by this leaf's Bordeaux communes entry), 2026 P2 Q3 (Rioja, Chianti Classico, and Margaux/Bordeaux each fielded as one of three simultaneous same-region pairs — this is the strongest single confirmation in the corpus that Rioja belongs at STRONG SIGNAL alongside Bordeaux and Tuscany, not merely PLAUSIBLE; promoted accordingly).
- **Region distribution:** STRONG SIGNAL Bordeaux communes or chateaux, Burgundy village vs cru, Chianti Classico vs Brunello (or normale vs Gran Selezione), Morgon vs Moulin-a-Vent, Rioja Crianza/Reserva ladder or traditional-vs-modern producer style. PLAUSIBLE Northern Rhone appellations, Southern Rhone (CNdP vs CdR tier split). CURVEBALL Etna Rosso or Villanyi Franc-type cases.
- **Leaf-selection note (2026-08-06):** Branch 3 previously had no gate between this leaf and the blend-mix leaf below, and a bare "same region" 2-wine stem (2016 P2 Q4 — no vintage, producer, or blend wording at all) fell here by default and missed its CNdP wine. Rule: when a bare "same region" stem carries a winemaking/style sub-question and no vintage/producer/tier language, keep the blend/single-variety-mix leaf's Rhone candidates alive alongside this leaf — the pair may be a Syrah appellation against a Grenache-led blend rather than a rung contrast on one ladder.
- **Leaf (same region + blend/single-variety mix implied):** STRONG SIGNAL: Rhone Valley. PLAUSIBLE: Bordeaux, Tuscany. CURVEBALL: Rioja (for the blend-emphasis reading specifically — Rioja is now STRONG SIGNAL for same-region pairing generally, see above). *Rationale: Rhone is the one benchmark European region that most naturally fields both Syrah appellations and Grenache-led blends in the same question. See 2025 P2 Q2, 2016 P2 Q4.*

#### Sub-branch: same region, different varieties (regional multi-variety tour) — added 2026-08-06
- **Trigger:** "made from different single grape varieties and are from the same region of origin" — the linking word is **region**, not country, and the varieties differ. Before this sub-branch existed the construction had no home: the leaf above models producer/vintage/tier ladders, and Branch 2's variety-tour logic is gated on "same COUNTRY", so the 2011 Piedmont tour missed on all three wines despite every answer living elsewhere in the tree.
- **Leaf:** STRONG SIGNAL: Piedmont variety tour — Nebbiolo (Barolo/Barbaresco/Langhe) + Barbera (d'Alba/d'Asti) + Dolcetto (d'Alba) (2011 P2 Q3, the founding instance — all three from one region, three varieties). PLAUSIBLE: Rhone Valley (Syrah appellation + Grenache-led blend — the same regional mix the blend-mix leaf above holds; see 2025 P2 Q2), Tuscany (Sangiovese + Super Tuscan international variety). CURVEBALL: Veneto (Corvina family + others), Sicily.
- **Practical rule:** n=1 for the full tour form, so treat the trigger as a flag to widen toward a region's second and third grapes, not as a Piedmont predictor. The examiner logic is "how fluently do you know one region's whole portfolio" — for any candidate region, list its top three varieties before tasting, including the unglamorous workhorse (Dolcetto, Cinsault, Canaiolo class).
- **The three contrast axes (2026 P2 Q3 — use this once region is fixed to decide what to say about the pair; 2021 P2 Q4 is the earlier multi-pair instance — CNdP vs Cotes du Rhone on the tier axis, Rioja Garnacha-led vs Gran Reserva on tier/style — showing the multi-pair form predates 2026):** when a question pairs two wines that share a country and region, the examiners have historically built the contrast along one of three axes. Identify which axis is in play early, because it dictates where the marks actually sit in part (b):
  1. **Traditional vs modern winemaking within the same appellation** — same grapes, same region, deliberately different philosophy (extended barrel ageing in old American oak vs shorter time in large neutral French foudre; classification-ladder ageing vs single-parcel "vin de terroir" bottling that ignores the ladder). Evidence: 2026 P2 Q3 Rioja pair — La Rioja Alta Vina Ardanza Reserva 2019 (80/20 Tempranillo/Garnacha, American oak, 36/30 months, wears its Reserva classification) vs Artuke Paso Las Manas 2021 (100% Tempranillo, single parcel El Chorro in Rioja Alavesa, large French foudre with ~15% new oak, deliberately unclassified/no Crianza-Reserva label).
  2. **Quality tier / classification within the same appellation** — same style envelope, different rung on the region's own quality ladder (large-volume commercial-house annata vs single-vineyard top cuvee). Evidence: 2026 P2 Q3 Chianti Classico pair — Melini I Sassi 2021 (GIV-owned, ~4 million bottles, entry annata, ~$12-15) vs Castello di Ama Gran Selezione San Lorenzo 2021 (single-vineyard, ~$70-75).
  3. **Vintage** — same producer tier/style, different year, testing whether the candidate can read maturity/structure cues back to a specific vintage character rather than just calling "older vs younger." Evidence: 2026 P2 Q3 Margaux pair — Chateau Giscours 2017 (3eme Cru, frost-hit lighter vintage, shorter ~6-8 year drinking window) vs Chateau Rauzan-Segla 2016 (2eme Cru, structured classic vintage, peak 2028-2038). Also see 2021 P2 Q1 (three Ducru-Beaucaillou vintages, the corpus's other explicit vintage-driven same-producer/region question).
  - **Practical rule:** part (c) "compare maturity considering the likely vintage" (2026 P2 Q3) and the older explicit-vintage questions (2016 P2 Q3, 2021 P2 Q1) are the same examiner move — don't just describe development in isolation, commit to which wine is the earlier/later vintage and justify it from colour, tannin resolution, and fruit-vs-tertiary balance.

### Branch 4: classic-European / benchmark red questions
**Historical frequency:** small but important recurring exam move.

#### Sub-branch: classic Europe, quality and maturity in context
- **Leaf:** STRONG SIGNAL: Bordeaux, Burgundy, Barolo/Barbaresco, Brunello, Rioja Gran Reserva, Northern Rhone. PLAUSIBLE: Saint-Emilion, top Tuscany, Chateauneuf-du-Pape. CURVEBALL: less-obvious Iberian or Alpine fine wine.
- **Evidence:** 2018 P2 Q1, 2024 P2 Q2.
- **Practical rule:** when the stem says "classic European origins," default to benchmark appellations before hunting for oddballs.

### Branch 5: mixed-bag / different countries, different varieties / indigenous varieties
**Historical frequency:** this is the recurring P2 final-question curveball pattern.

#### Sub-branch: different countries, different varieties
- **Leaf:** STRONG SIGNAL: one benchmark international variety plus one or two regional signatures. **Named benchmark roster (back-filled 2026-08-06 residual sweep — this leaf gestured at the pattern without naming Europe's benchmark blends, so every classic wine inside a mixed bag missed; each entry is attested ≥2 times in breadth flights, so STRONG-or-PLAUSIBLE per the pattern above):** Rioja Reserva/Gran Reserva Tempranillo-led blends (2011 P2 Q4, 2015 P2 Q2, 2023 P2 Q2); Bordeaux Cabernet-led blends including mature examples (Margaux — 2011 P2 Q4, and 2023 P2 Q2's mature 2005); Shiraz across the commercial ladder — Barossa benchmark (2015 P2 Q2) down to commodity SE Australia (2023 P2 Q2's Yellow Tail-class wine 5); Beaujolais Gamay, cru or Villages (2013 P2 Q4 carbonic Villages — named in this leaf's own evidence line yet absent from its tiers until now — and 2015 P2 Q2 Fleurie cru). A "mixed bag" or "different countries" flight can run commodity-to-benchmark: do not assume breadth wording excludes the ordinary classics that live at STRONG in Branch 4. PLAUSIBLE: Cabernet Franc, Carmenere, Tannat, Pinotage, Blaufrankisch; varietal Grenache (Australia — Barossa/McLaren Vale first, then Spain/S. France/California: attested twice in breadth flights, 2021 P2 Q2 McLaren Vale and 2023 P2 Q2 Barossa — previously the only major international red absent from every breadth list despite living in Branch 1's Grenache leaf); Corvina-led Valpolicella (Ripasso or Amarone — 2013 P2 Q4 Ripasso, 2026 P2 Q2 Amarone; a natural pick when method-of-production marks lead); Malbec/Mendoza (2013 P2 Q4 — the workhorse method-story blend the indigenous-skewed list previously omitted). CURVEBALL: Lagrein, Xinomavro, Zweigelt, Hungarian Franc.
- **Evidence:** 2015 P2 Q2, 2016 P2 Q5, 2017 P2 Q3, 2019 P2 Q3, 2023 P2 Q2, 2025 P2 Q3, 2011 P2 Q4 (pre-2015 era: 2-wine "different countries" pair with oak emphasis — mature Margaux Cabernet-led blend + Rioja Tempranillo-led blend, the founding case for the named benchmark roster above), 2013 P2 Q4 (pre-2015 era: carbonic Gamay / Valpolicella Ripasso / Mendoza Malbec blend under method-of-production-led marks), 2026 P2 Q2 (Amarone della Valpolicella Riserva/Italy, Shiraz Barossa/Australia, Cabernet Sauvignon Napa/USA — the "one benchmark international variety [Shiraz] plus one or two regional signatures [Amarone appassimento, Napa Cab]" pattern held exactly). (Evidence audit 2026-08-06: 2019 P2 Q2 moved to Branch 6.1 — its stem names "North and South America", which is 6.1's specific trigger, not generic breadth.)
- **Practical rule (blend trap, P2 face of EK-0083):** a varietally-labelled New World red is not guaranteed to be 100% that variety. 2026 P2 Q2's wine 6 was labelled and sold as "Cabernet Sauvignon" (Shafer TD-9, Napa) but is actually a Bordeaux-style blend — 76% Cabernet Sauvignon, 11% Merlot, 10% Petit Verdot, 3% Malbec. Naming only "Cabernet Sauvignon" is not wrong for variety+region purposes (dominant variety), but do not be surprised by a blend-language stem ("variety/ies") pointing at a wine whose front label reads as a single varietal — the label and the blend reality can diverge in either direction. EK-0083 measured near-zero top-1 credit on multi-grape labels across both papers when the tree single-locks instead of naming the dominant variety and flagging the blend; keep naming the dominant variety as the answer, but mention the blend as a hedge when structure/aromatics suggest more than one grape (added tannic backbone/dark fruit beyond what pure Cab typically shows).

#### Sub-branch: varieties closely associated with their origin
- **Leaf:** STRONG SIGNAL: Touriga Nacional/Douro, Barbera/Piedmont, Gamay/Beaujolais, Xinomavro/Greece; and — when the stem does NOT say Europe — the New World signature pairs: Malbec/Argentina (Mendoza, or Salta at altitude) and Carmenere/Chile (Colchagua). PLAUSIBLE: Zweigelt/Austria, Blaufrankisch, Agiorgitiko; Tannat/Uruguay, Zinfandel/California (the remaining New World signatures, via Branch 6.1's attested set). CURVEBALL: Lagrein, Villanyi Franc, rare Iberian or Balkan reds. *If the stem is Europe-only and asks for five different origins, preserve one candidate each from Portugal, Austria, Italy, France, and Greece before adding a second grape from any one country. If the stem is NOT Europe-restricted, this leaf must not read as Europe-only: its own founding question, 2016 P2 Q5, was two-thirds New World (Salta Malbec + Colchagua Carmenere + Burgenland Blaufrankisch), and until the 2026-08-06 sweep the leaf could not contain 2 of that question's 3 wines.*
- **Evidence:** 2016 P2 Q5 (Salta Malbec, Blaufrankisch/Burgenland, Colchagua Carmenere), 2019 P2 Q3, 2025 P2 Q3.

## Layer B - In-glass decision tree (sensory overlay)

### For Pinot Noir / Syrah-Shiraz / Cabernet family leaves
- **Translucent color, red fruit, earth, high acid, fine tannin**
  - survive: Pinot Noir. eliminate: Syrah/Shiraz, Cabernet Sauvignon. Evidence base: 2016 P2 Q2, 2018 P2 Q2, 2024 P2 Q3.
  - **Mushroom/forest floor + restraint** -> promote Burgundy/Germany. eliminate Sonoma/Central Otago riper expressions.
  - **Riper cherry/plum + sweeter oak + broader palate** -> survive Sonoma/Oregon/NZ. eliminate Burgundy village or Ahr/Baden cooler examples.
  - **Practical rule — pale-red trap, do not auto-collapse to Pinot Noir:** if the paper context is "same country" France and one wine of the flight is unexpectedly pale/translucent with high acid but a slightly oxidative, nutty, or bruised-apple/walnut edge and a savoury, almost sherry-adjacent finish, keep Trousseau (and Poulsard) alive as a live candidate alongside Pinot Noir, not eliminated by it. Jura reds share Pinot Noir's colour and acid but often show a distinctive rustic, slightly reductive/oxidative, red-berry-and-spice profile that a candidate defaulting to "pale = Pinot Noir" will miss. Evidence: 2026 P2 Q1 (Trousseau Singulier, Tissot, Arbois — the blind matrix named the right country [France] but missed the variety entirely, a direct instance of this trap).
- **Deeper color, black fruit, pepper, violets, smoked meat**
  - survive: Syrah/Shiraz. eliminate Pinot Noir and Cabernet. Evidence base: 2018 P2 Q3, 2024 P2 Q1.
  - **Pepper, olive, higher acid, savory frame** -> promote Northern Rhone or cool-climate Syrah. eliminate Barossa and plush New World Shiraz.
  - **Jammy black fruit, higher alcohol, sweet oak** -> promote Barossa/McLaren Vale. eliminate Northern Rhone.
- **Cassis, cedar, graphite, firmer tannin**
  - survive: Cabernet family / Bordeaux blends. eliminate Pinot Noir, Gamay. Evidence base: 2017 P2 Q1, 2019 P2 Q1, 2022 P2 Q1.
  - **Leafy/pyrazine + medium body** -> promote Cabernet Franc/Loire or cooler-climate Bordeaux family. eliminate Napa-style Cab.
  - **Riper cassis, plush oak, denser palate** -> promote Napa, Australia, Chile, Stellenbosch. eliminate Loire Cab Franc.
  - **Practical rule — blend-label trap (P2 face of EK-0083):** a dense, structured Napa wine sold and labelled "Cabernet Sauvignon" can still be a Bordeaux-style blend (Merlot/Petit Verdot/Malbec topping up the Cab) — extra layers of dark fruit, a softer mid-palate lift, or a slightly different tannin texture than pure Cab can be the tell. Naming "Cabernet Sauvignon, Napa" still earns the variety+region target even if the wine is technically a blend, but do not be thrown if structural cues suggest more than one grape. Evidence: 2026 P2 Q2 (Shafer TD-9, Napa — 76% Cabernet Sauvignon/11% Merlot/10% Petit Verdot/3% Malbec despite "Cabernet Sauvignon" branding).

### For Nebbiolo / Sangiovese / Italian same-country leaves
- **Pale garnet, high acid, high tannin, rose/tar**
  - survive: Nebbiolo. eliminate Sangiovese, Corvina, Aglianico if aromas are too lifted and tannins too severe. Evidence base: 2015 P2 Q3, 2017 P2 Q2, 2023 P2 Q1, 2024 P2 Q2.
  - **More new oak and darker fruit** -> promote Barolo/Barbaresco modern school or non-classic locale. note curveball if outside Piedmont.
- **Sour cherry, dried herbs, medium body, high acid**
  - survive: Sangiovese. eliminate Nebbiolo and Syrah. Evidence base: 2015 P2 Q3, 2022 P2 Q2, 2024 P2 Q2.
  - **More oak/polish and richer fruit** -> promote Brunello or super-Tuscan-adjacent expression. eliminate lighter Chianti Classico tiers.
  - **Within Chianti Classico specifically, quality-tier axis (2026 P2 Q3):** simple, high-toned sour cherry, lighter body, minimal oak signature, shorter finish -> annata/entry tier from a large negociant house (e.g. GIV-owned, multi-million-bottle scale). Riper concentration, single-vineyard site character, more integrated (often larger-format or partly new) oak, greater density and length -> Gran Selezione. Evidence: 2026 P2 Q3 (Melini I Sassi 2021 vs Castello di Ama Gran Selezione San Lorenzo 2021).
- **Volcanic smoke, red fruit, lighter tannin**
  - survive: Nerello Mascalese/Etna Rosso. eliminate classic Nebbiolo and Sangiovese. Evidence base: 2017 P2 Q2, 2023 P2 Q1.

### For Gamay / Malbec / Zinfandel regional compare-and-contrast leaves
- **Purple fruit, low tannin, juicy acid, carbonic hints**
  - survive: Gamay/Beaujolais. eliminate Malbec, Zinfandel. Evidence base: 2016 P2 Q1, 2025 P2 Q3.
  - **More structure/mineral grip** -> promote Morgon/Moulin-a-Vent over simple Beaujolais-Villages.
- **Deep purple, plush black fruit, moderate-high tannin**
  - survive: Malbec/Mendoza or Cahors. eliminate Gamay, Pinot Noir. Evidence base: 2019 P2 Q2, 2022 P2 Q4.
  - **Floral, polished, sunny fruit** -> promote Mendoza. **firmer, more rustic, darker** -> promote Cahors or curveball old-world analogue.
- **Ripe blackberry, jam, higher alcohol, sweet spice**
  - survive: Zinfandel. eliminate Pinot Noir, Nebbiolo. Evidence base: 2018 P2 Q4, 2022 P2 Q5.

### For indigenous / curveball leaves
- **Blue-black fruit + pepper + alpine freshness**
  - survive: Blaufrankisch or Zweigelt branch. eliminate Cabernet Sauvignon, Syrah if fruit is lighter and spice more angular. Evidence base: 2016 P2 Q5, 2019 P2 Q3, 2025 P2 Q3.
- **Tomato leaf, savory red fruit, firm acid**
  - survive: Cabernet Franc, especially Loire/Hungary. eliminate Merlot and Syrah. Evidence base: 2017 P2 Q3, 2019 P2 Q3, 2025 P2 Q1.
- **Dried herbs, olive, black fruit but unfamiliar profile**
  - survive: Xinomavro, Lagrein, Pinotage, Carmenere depending tannin/pyrazine/smoke mix. treat as curveball if no classic benchmark lock appears.

### Branch 6: stem shapes that had NO route before 2026-08-05 (added from the frozen-tree LOYO gaps)

#### 6.1 — "from the Americas" / each wine from a different American country
- **Leaf:** STRONG SIGNAL: **USA + Chile**. PLAUSIBLE: Argentina. CURVEBALL: Uruguay, Canada, Brazil.
- **Variety leaf:** reach for each country's **signature** grape rather than the international set —
  STRONG SIGNAL: Zinfandel, Petite Sirah (USA); Carménère (Chile); Malbec (Argentina); Tannat (Uruguay).
  PLAUSIBLE: Cabernet Sauvignon (either), Pinot Noir (either).
- **Evidence (n=3):** 2018 P2 Q4 "come from the Americas" → **Zinfandel (USA) + Cabernet Sauvignon (Chile)**; 2021 P2 Q3 "different single grape varieties, each from a different country" → **Petite Sirah (USA) + Carménère (Chile)**; 2019 P2 Q2 "four different countries in North and South America" (relocated here from Branch 5 — this trigger is 6.1's, not generic breadth) → **Pinot Noir (Santa Maria, California) + Malbec (Mendoza) + Carménère (Colchagua) + Tannat (Maldonado, Uruguay)** — the 4-wine form forces the PLAUSIBLE/CURVEBALL country tail (Argentina, Uruguay) into play.
- **Practical rule:** an Americas stem is a **signature-variety** question, not a Cabernet question. The attested instances pair distinctive US grapes with distinctive South American ones (signature rule held 3/4 in 2019 P2 Q2 — the US slot was Pinot Noir, so keep Pinot alive for the USA even here); leading with Cabernet Sauvignon on every slot wastes the discrimination the examiners built in.

#### 6.2 — N wines, **two varieties**, paired by country
- **Leaf:** STRONG SIGNAL: one Old World benchmark variety + one New World signature variety, with **each country potentially fielding BOTH varieties** — the pairing key is the country, not a variety block. Countries: France + Argentina/Chile/USA. For the attested variety pair (Pinot Noir + Malbec), the full 2x2 candidate set is: Pinot Noir/Burgundy (France), Malbec/Cahors (France), Malbec/Mendoza (Argentina), and CURVEBALL Pinot Noir/Patagonia (Rio Negro, Argentina — single attestation, a flag to widen; Argentine Pinot appears nowhere else in this tree).
- **Evidence (corrected 2026-08-06):** 2023 P2 Q3 ("each made from a single grape variety; two different grape varieties are represented; wines 9 and 10 are from one country; wines 11 and 12 are from another") → the grid was **CROSSED, not blocked**: France fielded Pinot Noir (Nuits-Saint-Georges) + Malbec (Cahors); Argentina fielded Pinot Noir (Rio Negro, Patagonia) + Malbec (Mendoza). This evidence line previously misrecorded the answer as "Pinot Noir x2 (France) + Malbec x2 (Argentina)" and the leaf scored only 2/4 on the question it was built from.
- **Practical rule:** do NOT assume each country brings one variety twice. In the one attested instance the examiners crossed the grid so that each variety appears in its classic home AND its counterpart origin (Burgundy/Cahors vs Rio Negro/Mendoza). Build the candidate set as variety x country (4 cells), then let the glass assign cells.
- **Routing conflict note:** the family pack tags this F4c (hidden organising theme) while this tree's same-variety branch does not fit it cleanly. **The stem wins**: it states the grid explicitly ("two different grape varieties"), so treat it as a structured 2x2, not a breadth question.

#### 6.3 — where this tree and `p2_family_tree_pack.md` disagree
Prefer the branch whose trigger words actually appear in the stem. A taxonomy tag is a post-hoc
classification; the stem is the examiner speaking.

#### 6.4 — blend family fixed, origins open (cross-country blend stems) — added 2026-08-06
- **Trigger:** the stem fixes a blend FAMILY, not a country — "made from Bordeaux varieties" / "made
  from one or more of the red varieties permitted in Bordeaux" across different countries, or
  "different countries... each a different single grape variety; wine N is a blend of all of these".
- **Route:** **defer to the family pack's F3 section** (`p2_family_tree_pack.md`, Branch 3.1 for the
  multi-origin form, 3.4 for singles-plus-their-blend). This tree previously had no Layer A branch
  for the construction — the nearest fallback (Branch 5's abstract breadth leaf) is far vaguer, and
  the questions were mis-filed under Branch 2's same-country blend-language sub-branch. The pack's
  F3.1 slot priors contained 2019 P2 Q1 four-for-four and 2012 P2 Q1 (six countries) six-for-six.
- **Evidence:** 2012 P2 Q1 (pre-2015 era, "Bordeaux varieties... 6 different countries"),
  2019 P2 Q1 ("made from Bordeaux varieties" — France/Italy/South Africa),
  2022 P2 Q1 ("different countries... Wine 4 is a blend of all three of these varieties").

## Curveball cases
- **2017 P2 Q3**: Chinon, German Pinot Noir, Pinotage, Lagrein is the template for the final-flight ambush.
- **2019 P2 Q3**: "Europe, but not France, Italy or Spain" is an explicit curveball instruction.
- **2023 P2 Q2**: mixed bag spanning commodity to benchmark red; classification and commercial framing matter as much as variety.
- **2025 P2 Q3**: indigenous-Europe flight is predictable in concept but broad in actual candidates.
- **2026 P2 Q1**: a "same country, different single varieties" stem resolved to all-France, all light-bodied, cool-climate reds (Loire Cabernet Franc, Beaujolais Gamay, Jura Trousseau) rather than the more obvious big-country/big-variety cast a blind read reaches for first (Italy, USA, or a France line-up anchored on Burgundy/Rhone). The Trousseau wine is a genuine pale-red trap — see the Layer B practical rule above. Country was easy (100% hit in the blind check); variety was hard (50% hit, missing on the Jura wine).
- **2026 P2 Q2**: the blend-label trap in concentrated form — Shafer TD-9 reads and is sold as "Cabernet Sauvignon" but is a four-way Bordeaux-style blend; the blind matrix's country read was 2/3 (missed USA entirely, having built its Wine 6 candidate list around France/Italy instead of a New World finish).

## Coverage note
This tree covers the core P2 exam engines: international-variety comparison, same-country benchmark tours, same-region deep dives, and indigenous-variety curveballs. Weakest coverage remains the small set of non-big-three European reds and hybrid commercial/benchmark mixed bags where style and market positioning can outweigh classic variety-first logic. The 2026 sit (40 questions, 11 sat years) added two new structural wrinkles that the tree now encodes explicitly: (1) a "same country, different single varieties" stem with an inverted, style/commercial-led mark order (Branch 2, new sub-branch), and (2) a triple same-region-pair mega-question worth half the paper's marks, which supplied the corpus's clearest evidence yet for the three axes — traditional-vs-modern, quality-tier, and vintage — used to contrast two wines sharing an origin (Branch 3, strengthened leaf). The 2026-08-06 routing-sweep fix pass (162-question in-sample routing audit) re-plumbed rather than rewrote: leaves back-filled with their own cited evidence answers (6.2's crossed-grid correction, Salta/Colchagua, Hawke's Bay Syrah, CNdP, Australian Grenache), four mis-filed Branch 2 evidence citations relocated to their trigger-matching branches, the gate's SA/NZ/Spain base rates finally represented in leaves, a new "same region, different varieties" sub-branch (Branch 3), a Layer A pointer to the pack's F3 for cross-country blend stems (6.4), the vintage-vertical contradiction with Branch 0 resolved, and single-instance knowledge gaps (Montepulciano, Dolcetto, Patagonian Pinot, Mendoza Cab Franc, California Syrah) added at CURVEBALL/PLAUSIBLE tiers only.
