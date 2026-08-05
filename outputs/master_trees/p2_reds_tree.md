---
paper: 2
tree_name: P2 Reds Master Decision Tree
generated: 2026-05-25
last_resynthesized: 2026-08-05
questions_analyzed: [2015_p2_q1, 2015_p2_q2, 2015_p2_q3, 2015_p2_q4, 2016_p2_q1, 2016_p2_q2, 2016_p2_q3, 2016_p2_q4, 2016_p2_q5, 2017_p2_q1, 2017_p2_q2, 2017_p2_q3, 2018_p2_q1, 2018_p2_q2, 2018_p2_q3, 2018_p2_q4, 2019_p2_q1, 2019_p2_q2, 2019_p2_q3, 2021_p2_q1, 2021_p2_q2, 2021_p2_q3, 2021_p2_q4, 2022_p2_q1, 2022_p2_q2, 2022_p2_q3, 2022_p2_q4, 2022_p2_q5, 2023_p2_q1, 2023_p2_q2, 2023_p2_q3, 2024_p2_q1, 2024_p2_q2, 2024_p2_q3, 2025_p2_q1, 2025_p2_q2, 2025_p2_q3, 2026_p2_q1, 2026_p2_q2, 2026_p2_q3]
accuracy_target: variety + region (not exact wine)
---

# P2 Reds - Master Decision Tree

## Accuracy target
This tree targets **variety + region** accuracy. Producer, vintage, and vineyard identification are bonus, not the target. A correct prediction = right variety AND right country/region.

## Layer A - Pre-tasting decision tree (question stem only)

### Branch 1: "Same single grape variety" questions
**Historical frequency:** 8 of 40 P2 questions (2016 P2 Q1, 2016 P2 Q2, 2018 P2 Q2, 2018 P2 Q3, 2022 P2 Q4, 2022 P2 Q5, 2024 P2 Q1, 2024 P2 Q3; 2025 P2 Q1 also uses single-or-predominant logic). 2026 did not add to this branch: 2026 P2 Q1 shares its "same country" spine with Branch 2 below but asks for three *different* single varieties rather than one shared variety.

#### Sub-branch: same variety across multiple countries
- **Leaf:** STRONG SIGNAL: Pinot Noir, Syrah/Shiraz. PLAUSIBLE: Cabernet Sauvignon/Cabernet Franc. CURVEBALL: Merlot, Grenache.
- **Evidence:** 2016 P2 Q2, 2024 P2 Q3, 2024 P2 Q1, 2025 P2 Q1.
- **Region distribution:** STRONG SIGNAL Pinot Noir: Burgundy, Germany, New Zealand, Sonoma/Oregon, Canada. STRONG SIGNAL Syrah/Shiraz: Northern Rhone, Barossa/McLaren Vale, Chile, South Africa. PLAUSIBLE Cabernet family: Bordeaux/Loire, Napa, Chile, Stellenbosch. CURVEBALL Grenache: Spain, southern France, Australia, California.

#### Sub-branch: same variety, same region, compare quality or winemaking
- **Leaf:** STRONG SIGNAL: Gamay/Beaujolais, Malbec/Mendoza, Zinfandel/Dry Creek. PLAUSIBLE: Pinot Noir in one New World region. CURVEBALL: Nebbiolo outside Piedmont.
- **Evidence:** 2016 P2 Q1, 2022 P2 Q4, 2022 P2 Q5.
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

**Country base rates for a single-country P2 stem** (all nine instances, so this is the honest prior
when no signal above fires): Italy 3, France 2, South Africa 1, New Zealand 1, Spain 1, USA 1.
Italy leads, but it is 3 of 9 — a plurality, not a default. Keep France, and at least one New World
country, alive in the candidate set at all times.

#### Sub-branch: same country, different regions, region-first
- **Leaf:** STRONG SIGNAL: Italy, France. PLAUSIBLE: USA. CURVEBALL: broader "Americas" or ex-big-three Europe.
- **Evidence:** 2015 P2 Q3, 2017 P2 Q2, 2023 P2 Q1, 2025 P2 Q2, 2018 P2 Q1, 2024 P2 Q2.
- **Variety distribution:** STRONG SIGNAL Italy: Nebbiolo, Sangiovese, Aglianico, Nerello Mascalese, Corvina-led blends. STRONG SIGNAL France: Syrah, Grenache blends, Cabernet/Merlot, Pinot Noir. PLAUSIBLE USA: Cabernet, Zinfandel, Pinot Noir, Petite Sirah.

#### Sub-branch: same country/region plus blend language ("predominant grape variety")
- **Leaf:** STRONG SIGNAL: Bordeaux family, Rioja/Tempranillo-led, Rhone GSM/Syrah-led. PLAUSIBLE: Chianti Classico and Tuscan blends. CURVEBALL: Cape blends or Douro reds if country is hidden.
- **Evidence:** 2015 P2 Q4, 2017 P2 Q1, 2019 P2 Q1, 2022 P2 Q1, 2025 P2 Q2.
- **Practical rule:** if the stem says same country and same region and uses "variety/ies" in the plural, promote Rhone Valley above Rioja. That wording is the cleanest signal in the corpus for a Northern-Southern Rhone mix of Syrah plus Grenache-led blends.

#### Sub-branch: same country, different single varieties, market-fluency/showcase structure (new for 2026)
- **Leaf:** STRONG SIGNAL: France (non-Bordeaux single-varietal tour — Loire Cabernet Franc, Beaujolais Gamay, Jura Trousseau/Poulsard, Northern Rhone Syrah, Burgundy Pinot Noir), Italy (Nebbiolo/Sangiovese/Primitivo-Nero d'Avola spread). PLAUSIBLE: USA (Cab Sauv/Pinot Noir/Zinfandel), Australia, Spain. CURVEBALL: Argentina, Chile, South Africa (thinner bench of three equally "famous" single varietals).
- **Evidence:** 2026 P2 Q1 (Saumur Les Plantagenets Cabernet Franc [Loire, co-op, entry tier], Regnie Domaine de la Margot Gamay [Beaujolais cru], Trousseau Singulier Tissot [Arbois, biodynamic, ~£40+] — all France, wine order confirmed the ascending-prestige/lightness-to-artisanal sequencing the tree already expected, but the actual varieties were all light-bodied cool-climate reds, not the Nebbiolo/Napa Cab/Barossa Shiraz-type "big three countries" cast a blind read would first reach for). Cross-paper analog: 2025 P1 Q3 (same "same country, different single varieties" engine applied to whites — France won on Muscadet/Alsace Riesling/Loire Chenin).
- **Practical rule (inverted mark order):** when this stem structure pairs with a mark order that puts style-and-commercial-position *first and heaviest* (e.g. 11 marks/wine) and identification-of-variety-and-origin *last and lightest* (e.g. 8 marks/wine), read that as a deliberate signal: the examiners want market fluency and stylistic range, not fine origin detective work, and the flight is likely to skew toward lighter, more commercial, less "trophy" bottlings than a standard same-variety or same-region question. See 2026 P2 Q1 (11/6/8 mark split, all three wines France, all cool-climate and light-bodied, none of them classified growths). Do not assume that "heaviest marks lead with style" implies premium wines — in the one instance seen, it correlated with *lighter, more everyday-to-mid-market* reds, because style/commercial breadth is easiest to assess and mark fairly across a spread that includes at least one accessible, recognisable style.
- **Practical rule (pale-red trap):** do not let "same country, red still wine" default your eye to deep-coloured reds. A pale, high-acid, low-tannin wine in this structure can be Trousseau/Poulsard (Jura) rather than Pinot Noir or Gamay — see the Layer B pale-red caution below.

### Branch 3: same region / terroir deep-dive questions
**Historical frequency:** at least 12 of 40 P2 questions (2026 P2 Q3 adds one question that alone spans three same-region pairs — 6 of the paper's 12 wines and 150 of 300 marks, the single largest concentration of "same region" testing in the corpus).

#### Sub-branch: same region, same vintage or same producer
- **Leaf:** STRONG SIGNAL: Bordeaux, Burgundy, Tuscany, Beaujolais, Rioja. PLAUSIBLE: Northern Rhone. CURVEBALL: Etna or other emerging fine-wine regions.
- **Evidence:** 2016 P2 Q3, 2021 P2 Q1, 2022 P2 Q2, 2022 P2 Q3, 2016 P2 Q4, 2026 P2 Q3 (Rioja, Chianti Classico, and Margaux/Bordeaux each fielded as one of three simultaneous same-region pairs — this is the strongest single confirmation in the corpus that Rioja belongs at STRONG SIGNAL alongside Bordeaux and Tuscany, not merely PLAUSIBLE; promoted accordingly).
- **Region distribution:** STRONG SIGNAL Bordeaux communes or chateaux, Burgundy village vs cru, Chianti Classico vs Brunello (or normale vs Gran Selezione), Morgon vs Moulin-a-Vent, Rioja Crianza/Reserva ladder or traditional-vs-modern producer style. PLAUSIBLE Northern Rhone appellations. CURVEBALL Etna Rosso or Villanyi Franc-type cases.
- **Leaf (same region + blend/single-variety mix implied):** STRONG SIGNAL: Rhone Valley. PLAUSIBLE: Bordeaux, Tuscany. CURVEBALL: Rioja (for the blend-emphasis reading specifically — Rioja is now STRONG SIGNAL for same-region pairing generally, see above). *Rationale: Rhone is the one benchmark European region that most naturally fields both Syrah appellations and Grenache-led blends in the same question. See 2025 P2 Q2.*
- **The three contrast axes (2026 P2 Q3 — use this once region is fixed to decide what to say about the pair):** when a question pairs two wines that share a country and region, the examiners have historically built the contrast along one of three axes. Identify which axis is in play early, because it dictates where the marks actually sit in part (b):
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
- **Leaf:** STRONG SIGNAL: one benchmark international variety plus one or two regional signatures. PLAUSIBLE: Cabernet Franc, Carmenere, Tannat, Pinotage, Blaufrankisch. CURVEBALL: Lagrein, Xinomavro, Zweigelt, Hungarian Franc.
- **Evidence:** 2015 P2 Q2, 2016 P2 Q5, 2017 P2 Q3, 2019 P2 Q2, 2019 P2 Q3, 2023 P2 Q2, 2025 P2 Q3, 2026 P2 Q2 (Amarone della Valpolicella Riserva/Italy, Shiraz Barossa/Australia, Cabernet Sauvignon Napa/USA — the "one benchmark international variety [Shiraz] plus one or two regional signatures [Amarone appassimento, Napa Cab]" pattern held exactly).
- **Practical rule (blend trap, P2 face of EK-0083):** a varietally-labelled New World red is not guaranteed to be 100% that variety. 2026 P2 Q2's wine 6 was labelled and sold as "Cabernet Sauvignon" (Shafer TD-9, Napa) but is actually a Bordeaux-style blend — 76% Cabernet Sauvignon, 11% Merlot, 10% Petit Verdot, 3% Malbec. Naming only "Cabernet Sauvignon" is not wrong for variety+region purposes (dominant variety), but do not be surprised by a blend-language stem ("variety/ies") pointing at a wine whose front label reads as a single varietal — the label and the blend reality can diverge in either direction. EK-0083 measured near-zero top-1 credit on multi-grape labels across both papers when the tree single-locks instead of naming the dominant variety and flagging the blend; keep naming the dominant variety as the answer, but mention the blend as a hedge when structure/aromatics suggest more than one grape (added tannic backbone/dark fruit beyond what pure Cab typically shows).

#### Sub-branch: varieties closely associated with their origin
- **Leaf:** STRONG SIGNAL: Touriga Nacional/Douro, Barbera/Piedmont, Gamay/Beaujolais, Xinomavro/Greece. PLAUSIBLE: Zweigelt/Austria, Blaufrankisch, Agiorgitiko. CURVEBALL: Lagrein, Villanyi Franc, rare Iberian or Balkan reds. *If the stem is Europe-only and asks for five different origins, preserve one candidate each from Portugal, Austria, Italy, France, and Greece before adding a second grape from any one country.*
- **Evidence:** 2016 P2 Q5, 2019 P2 Q3, 2025 P2 Q3.

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

## Curveball cases
- **2017 P2 Q3**: Chinon, German Pinot Noir, Pinotage, Lagrein is the template for the final-flight ambush.
- **2019 P2 Q3**: "Europe, but not France, Italy or Spain" is an explicit curveball instruction.
- **2023 P2 Q2**: mixed bag spanning commodity to benchmark red; classification and commercial framing matter as much as variety.
- **2025 P2 Q3**: indigenous-Europe flight is predictable in concept but broad in actual candidates.
- **2026 P2 Q1**: a "same country, different single varieties" stem resolved to all-France, all light-bodied, cool-climate reds (Loire Cabernet Franc, Beaujolais Gamay, Jura Trousseau) rather than the more obvious big-country/big-variety cast a blind read reaches for first (Italy, USA, or a France line-up anchored on Burgundy/Rhone). The Trousseau wine is a genuine pale-red trap — see the Layer B practical rule above. Country was easy (100% hit in the blind check); variety was hard (50% hit, missing on the Jura wine).
- **2026 P2 Q2**: the blend-label trap in concentrated form — Shafer TD-9 reads and is sold as "Cabernet Sauvignon" but is a four-way Bordeaux-style blend; the blind matrix's country read was 2/3 (missed USA entirely, having built its Wine 6 candidate list around France/Italy instead of a New World finish).

## Coverage note
This tree covers the core P2 exam engines: international-variety comparison, same-country benchmark tours, same-region deep dives, and indigenous-variety curveballs. Weakest coverage remains the small set of non-big-three European reds and hybrid commercial/benchmark mixed bags where style and market positioning can outweigh classic variety-first logic. The 2026 sit (40 questions, 11 sat years) added two new structural wrinkles that the tree now encodes explicitly: (1) a "same country, different single varieties" stem with an inverted, style/commercial-led mark order (Branch 2, new sub-branch), and (2) a triple same-region-pair mega-question worth half the paper's marks, which supplied the corpus's clearest evidence yet for the three axes — traditional-vs-modern, quality-tier, and vintage — used to contrast two wines sharing an origin (Branch 3, strengthened leaf).
