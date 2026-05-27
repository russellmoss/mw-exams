---
paper: 2
tree_name: P2 Reds Master Decision Tree
generated: 2026-05-25
questions_analyzed: [2015_p2_q1, 2015_p2_q2, 2015_p2_q3, 2015_p2_q4, 2016_p2_q1, 2016_p2_q2, 2016_p2_q3, 2016_p2_q4, 2016_p2_q5, 2017_p2_q1, 2017_p2_q2, 2017_p2_q3, 2018_p2_q1, 2018_p2_q2, 2018_p2_q3, 2018_p2_q4, 2019_p2_q1, 2019_p2_q2, 2019_p2_q3, 2021_p2_q1, 2021_p2_q2, 2021_p2_q3, 2021_p2_q4, 2022_p2_q1, 2022_p2_q2, 2022_p2_q3, 2022_p2_q4, 2022_p2_q5, 2023_p2_q1, 2023_p2_q2, 2023_p2_q3, 2024_p2_q1, 2024_p2_q2, 2024_p2_q3, 2025_p2_q1, 2025_p2_q2, 2025_p2_q3]
accuracy_target: variety + region (not exact wine)
---

# P2 Reds - Master Decision Tree

## Accuracy target
This tree targets **variety + region** accuracy. Producer, vintage, and vineyard identification are bonus, not the target. A correct prediction = right variety AND right country/region.

## Layer A - Pre-tasting decision tree (question stem only)

### Branch 1: "Same single grape variety" questions
**Historical frequency:** 8 of 37 P2 questions (2016 P2 Q1, 2016 P2 Q2, 2018 P2 Q2, 2018 P2 Q3, 2022 P2 Q4, 2022 P2 Q5, 2024 P2 Q1, 2024 P2 Q3; 2025 P2 Q1 also uses single-or-predominant logic).

#### Sub-branch: same variety across multiple countries
- **Leaf:** STRONG SIGNAL: Pinot Noir, Syrah/Shiraz. PLAUSIBLE: Cabernet Sauvignon/Cabernet Franc. CURVEBALL: Merlot, Grenache.
- **Evidence:** 2016 P2 Q2, 2024 P2 Q3, 2024 P2 Q1, 2025 P2 Q1.
- **Region distribution:** STRONG SIGNAL Pinot Noir: Burgundy, Germany, New Zealand, Sonoma/Oregon, Canada. STRONG SIGNAL Syrah/Shiraz: Northern Rhone, Barossa/McLaren Vale, Chile, South Africa. PLAUSIBLE Cabernet family: Bordeaux/Loire, Napa, Chile, Stellenbosch. CURVEBALL Grenache: Spain, southern France, Australia, California.

#### Sub-branch: same variety, same region, compare quality or winemaking
- **Leaf:** STRONG SIGNAL: Gamay/Beaujolais, Malbec/Mendoza, Zinfandel/Dry Creek. PLAUSIBLE: Pinot Noir in one New World region. CURVEBALL: Nebbiolo outside Piedmont.
- **Evidence:** 2016 P2 Q1, 2022 P2 Q4, 2022 P2 Q5.
- **Examiner logic:** if the stem tightens to one region, expect intra-regional quality hierarchy or stylistic split rather than pure variety ID.

### Branch 2: "Same country" questions
**Historical frequency:** 8 of 37 P2 questions, dominated by France and Italy.

#### Sub-branch: same country, different regions, region-first
- **Leaf:** STRONG SIGNAL: Italy, France. PLAUSIBLE: USA. CURVEBALL: broader "Americas" or ex-big-three Europe.
- **Evidence:** 2015 P2 Q3, 2017 P2 Q2, 2023 P2 Q1, 2025 P2 Q2, 2018 P2 Q1, 2024 P2 Q2.
- **Variety distribution:** STRONG SIGNAL Italy: Nebbiolo, Sangiovese, Aglianico, Nerello Mascalese, Corvina-led blends. STRONG SIGNAL France: Syrah, Grenache blends, Cabernet/Merlot, Pinot Noir. PLAUSIBLE USA: Cabernet, Zinfandel, Pinot Noir, Petite Sirah.

#### Sub-branch: same country/region plus blend language ("predominant grape variety")
- **Leaf:** STRONG SIGNAL: Bordeaux family, Rioja/Tempranillo-led, Rhone GSM/Syrah-led. PLAUSIBLE: Chianti Classico and Tuscan blends. CURVEBALL: Cape blends or Douro reds if country is hidden.
- **Evidence:** 2015 P2 Q4, 2017 P2 Q1, 2019 P2 Q1, 2022 P2 Q1, 2025 P2 Q2.
- **Practical rule:** if the stem says same country and same region and uses "variety/ies" in the plural, promote Rhone Valley above Rioja. That wording is the cleanest signal in the corpus for a Northern-Southern Rhone mix of Syrah plus Grenache-led blends.

### Branch 3: same region / terroir deep-dive questions
**Historical frequency:** at least 11 of 37 P2 questions.

#### Sub-branch: same region, same vintage or same producer
- **Leaf:** STRONG SIGNAL: Bordeaux, Burgundy, Tuscany, Beaujolais. PLAUSIBLE: Rioja, Northern Rhone. CURVEBALL: Etna or other emerging fine-wine regions.
- **Evidence:** 2016 P2 Q3, 2021 P2 Q1, 2022 P2 Q2, 2022 P2 Q3, 2016 P2 Q4.
- **Region distribution:** STRONG SIGNAL Bordeaux communes or chateaux, Burgundy village vs cru, Chianti Classico vs Brunello, Morgon vs Moulin-a-Vent. PLAUSIBLE Rioja Gran Reserva/Reserva or Northern Rhone appellations. CURVEBALL Etna Rosso or Villanyi Franc-type cases.
- **Leaf (same region + blend/single-variety mix implied):** STRONG SIGNAL: Rhone Valley. PLAUSIBLE: Bordeaux, Tuscany. CURVEBALL: Rioja. *Rationale: Rhone is the one benchmark European region that most naturally fields both Syrah appellations and Grenache-led blends in the same question. See 2025 P2 Q2.*

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
- **Evidence:** 2015 P2 Q2, 2016 P2 Q5, 2017 P2 Q3, 2019 P2 Q2, 2019 P2 Q3, 2023 P2 Q2, 2025 P2 Q3.

#### Sub-branch: varieties closely associated with their origin
- **Leaf:** STRONG SIGNAL: Touriga Nacional/Douro, Barbera/Piedmont, Gamay/Beaujolais, Xinomavro/Greece. PLAUSIBLE: Zweigelt/Austria, Blaufrankisch, Agiorgitiko. CURVEBALL: Lagrein, Villanyi Franc, rare Iberian or Balkan reds. *If the stem is Europe-only and asks for five different origins, preserve one candidate each from Portugal, Austria, Italy, France, and Greece before adding a second grape from any one country.*
- **Evidence:** 2016 P2 Q5, 2019 P2 Q3, 2025 P2 Q3.

## Layer B - In-glass decision tree (sensory overlay)

### For Pinot Noir / Syrah-Shiraz / Cabernet family leaves
- **Translucent color, red fruit, earth, high acid, fine tannin**
  - survive: Pinot Noir. eliminate: Syrah/Shiraz, Cabernet Sauvignon. Evidence base: 2016 P2 Q2, 2018 P2 Q2, 2024 P2 Q3.
  - **Mushroom/forest floor + restraint** -> promote Burgundy/Germany. eliminate Sonoma/Central Otago riper expressions.
  - **Riper cherry/plum + sweeter oak + broader palate** -> survive Sonoma/Oregon/NZ. eliminate Burgundy village or Ahr/Baden cooler examples.
- **Deeper color, black fruit, pepper, violets, smoked meat**
  - survive: Syrah/Shiraz. eliminate Pinot Noir and Cabernet. Evidence base: 2018 P2 Q3, 2024 P2 Q1.
  - **Pepper, olive, higher acid, savory frame** -> promote Northern Rhone or cool-climate Syrah. eliminate Barossa and plush New World Shiraz.
  - **Jammy black fruit, higher alcohol, sweet oak** -> promote Barossa/McLaren Vale. eliminate Northern Rhone.
- **Cassis, cedar, graphite, firmer tannin**
  - survive: Cabernet family / Bordeaux blends. eliminate Pinot Noir, Gamay. Evidence base: 2017 P2 Q1, 2019 P2 Q1, 2022 P2 Q1.
  - **Leafy/pyrazine + medium body** -> promote Cabernet Franc/Loire or cooler-climate Bordeaux family. eliminate Napa-style Cab.
  - **Riper cassis, plush oak, denser palate** -> promote Napa, Australia, Chile, Stellenbosch. eliminate Loire Cab Franc.

### For Nebbiolo / Sangiovese / Italian same-country leaves
- **Pale garnet, high acid, high tannin, rose/tar**
  - survive: Nebbiolo. eliminate Sangiovese, Corvina, Aglianico if aromas are too lifted and tannins too severe. Evidence base: 2015 P2 Q3, 2017 P2 Q2, 2023 P2 Q1, 2024 P2 Q2.
  - **More new oak and darker fruit** -> promote Barolo/Barbaresco modern school or non-classic locale. note curveball if outside Piedmont.
- **Sour cherry, dried herbs, medium body, high acid**
  - survive: Sangiovese. eliminate Nebbiolo and Syrah. Evidence base: 2015 P2 Q3, 2022 P2 Q2, 2024 P2 Q2.
  - **More oak/polish and richer fruit** -> promote Brunello or super-Tuscan-adjacent expression. eliminate lighter Chianti Classico tiers.
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

## Coverage note
This tree covers the core P2 exam engines: international-variety comparison, same-country benchmark tours, same-region deep dives, and indigenous-variety curveballs. Weakest coverage remains the small set of non-big-three European reds and hybrid commercial/benchmark mixed bags where style and market positioning can outweigh classic variety-first logic.
