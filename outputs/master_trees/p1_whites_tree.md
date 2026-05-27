---
paper: 1
tree_name: P1 Whites Master Decision Tree
generated: 2026-05-25
questions_analyzed: [2015_p1_q1, 2015_p1_q2, 2015_p1_q3, 2016_p1_q1, 2016_p1_q2, 2016_p1_q3, 2016_p1_q4, 2016_p1_q5, 2017_p1_q1, 2017_p1_q2, 2017_p1_q3, 2017_p1_q4, 2017_p1_q5, 2018_p1_q1, 2018_p1_q2, 2018_p1_q3, 2019_p1_q1, 2019_p1_q2, 2019_p1_q3, 2021_p1_q1, 2021_p1_q2, 2021_p1_q3, 2021_p1_q4, 2022_p1_q1, 2022_p1_q2, 2022_p1_q3, 2022_p1_q4, 2023_p1_q1, 2023_p1_q2, 2023_p1_q3, 2024_p1_q1, 2024_p1_q2, 2024_p1_q3, 2025_p1_q1, 2025_p1_q2, 2025_p1_q3, 2025_p1_q4]
accuracy_target: variety + region (not exact wine)
---

# P1 Whites - Master Decision Tree

## Accuracy target
This tree targets **variety + region** accuracy. Producer, vintage, and vineyard identification are bonus, not the target. A correct prediction = right variety AND right country/region.

## Layer A - Pre-tasting decision tree (question stem only)

### Branch 1: "Same single grape variety" questions
**Historical frequency:** 11 of 37 P1 questions use this structure (2015 P1 Q2, 2016 P1 Q2, 2016 P1 Q3, 2017 P1 Q2, 2017 P1 Q5, 2018 P1 Q1, 2018 P1 Q3, 2021 P1 Q2, 2021 P1 Q3, 2024 P1 Q1, 2025 P1 Q2).

#### Sub-branch: 3-4 wines, origin and maturity/quality heavily marked
- **Leaf (default):** STRONG SIGNAL: Chardonnay, Riesling. PLAUSIBLE: Chenin Blanc, Sauvignon Blanc. CURVEBALL: Pinot Gris.
- **Leaf (stem says "different countries" or "two countries"):** STRONG SIGNAL: Chardonnay, Riesling, Sauvignon Blanc. PLAUSIBLE: Chenin Blanc, Semillon. CURVEBALL: Pinot Gris. *Rationale: cross-country variety comparison is SB's strongest exam structure (Loire vs Marlborough, Bordeaux blend vs NZ varietal). See 2019 P1 Q1, 2023 P1 Q1.*
- **Leaf (stem mentions "cool climate" or "climate" emphasis):** STRONG SIGNAL: Sauvignon Blanc, Riesling. PLAUSIBLE: Chardonnay, Chenin Blanc. CURVEBALL: Pinot Gris. *Rationale: cool-climate framing promotes SB (Sancerre, Marlborough) and Riesling (Mosel, Clare Valley).*
- **Evidence:** 2018 P1 Q1, 2025 P1 Q2, 2024 P1 Q1, 2018 P1 Q3, 2021 P1 Q2, 2021 P1 Q3, 2019 P1 Q1, 2023 P1 Q1.
- **Region distribution:** STRONG SIGNAL: Burgundy/Chablis, California, Margaret River, South Africa for Chardonnay; Mosel, Rheingau/Franken, Alsace, Clare Valley for Riesling; Loire/Marlborough/Bordeaux for Sauvignon Blanc. PLAUSIBLE: Loire/South Africa for Chenin; Bordeaux/Hunter Valley/Chile for Semillon. CURVEBALL: Alsace/Oregon or Alto Adige for Pinot Gris.

#### Sub-branch: 2-wine same-variety questions with winemaking emphasis
- **Leaf (default):** STRONG SIGNAL: Chardonnay, Chenin Blanc. PLAUSIBLE: Pinot Gris, Sauvignon Blanc. CURVEBALL: Semillon.
- **Leaf (stem says "same country" with Old World framing):** STRONG SIGNAL: Chardonnay, Chenin Blanc. PLAUSIBLE: Sauvignon Blanc, Pinot Gris. CURVEBALL: Semillon. *Rationale: Old World same-country same-variety with winemaking focus is Chenin's strongest position (Loire quality ladder: Anjou vs Savennières). See 2015 P1 Q2, 2021 P1 Q2.*
- **Leaf (stem says "different countries"):** STRONG SIGNAL: Chardonnay, Sauvignon Blanc. PLAUSIBLE: Chenin Blanc, Pinot Gris. CURVEBALL: Semillon. *Rationale: cross-country 2-wine comparison is SB's natural pairing structure (Loire vs Marlborough).*
- **Evidence:** 2015 P1 Q2, 2016 P1 Q2, 2016 P1 Q3, 2017 P1 Q2, 2021 P1 Q2.
- **Region distribution:** STRONG SIGNAL: Burgundy vs New World Chardonnay; Loire vs South Africa Chenin; Loire vs Marlborough Sauvignon Blanc. PLAUSIBLE: Alsace vs Italy/New World Pinot Gris. CURVEBALL: Hunter Valley vs Bordeaux Blanc/Chile Semillon.

### Branch 2: "Same country" questions
**Historical frequency:** 10 of 37 P1 questions use this structure (2016 P1 Q1, 2016 P1 Q2, 2016 P1 Q4, 2017 P1 Q1, 2017 P1 Q3, 2021 P1 Q1, 2021 P1 Q4, 2022 P1 Q2, 2022 P1 Q3, 2023 P1 Q3, 2024 P1 Q3, 2025 P1 Q3). The matrices repeatedly show France as the default answer, then Italy, USA, Australia, South Africa, Spain.

#### Sub-branch: same country, different single varieties, origin-heavy
- **Leaf:** STRONG SIGNAL: France, Italy. PLAUSIBLE: South Africa, Australia, USA. CURVEBALL: Spain.
- **Evidence:** 2021 P1 Q1, 2025 P1 Q3, 2022 P1 Q3, 2023 P1 Q3, 2022 P1 Q2, 2021 P1 Q4, 2016 P1 Q4.
- **Variety distribution:** STRONG SIGNAL in France: Riesling (Alsace), Chenin Blanc (Loire), Sauvignon Blanc (Loire), Melon de Bourgogne/Muscadet, Chardonnay, Savagnin, Marsanne/Roussanne-adjacent blends. STRONG SIGNAL in Italy: Pinot Grigio, Gewurztraminer Alto Adige, Carricante/Etna Bianco. PLAUSIBLE in South Africa: Chenin Blanc, Chardonnay, Sauvignon Blanc. PLAUSIBLE in Australia/USA: Riesling, Chardonnay, Marsanne, Pinot Gris, Moscato. CURVEBALL in Spain: Viura, Albarino, Godello, Sherry-adjacent whites.
- **Practical rule:** if the stem gives three French whites from the same country with modest winemaking marks and no blend cue, keep a Loire/Alsace/Loire triangle alive rather than defaulting to Sauvignon Blanc as the third grape. Muscadet/Melon de Bourgogne is the key survivor in this structure.

#### Sub-branch: same country, all blends or blend-led
- **Leaf:** STRONG SIGNAL: Bordeaux Blanc family, Rhone Blanc family. PLAUSIBLE: Jurancon, Rioja Blanco. CURVEBALL: oxidative/skin-contact outliers.
- **Evidence:** 2016 P1 Q1, 2019 P1 Q1, 2024 P1 Q3, 2025 P1 Q1.
- **Region distribution:** STRONG SIGNAL: Pessac-Leognan, Graves, Margaret River SB/Sem, northern/southern Rhone white blends, Chateauneuf-du-Pape Blanc. PLAUSIBLE: Jurancon, Rioja Blanco, Chile (Maule Valley) for Semillon-led blends. CURVEBALL: Georgian qvevri-like or biologically aged whites if the stem downweights exact origin.

### Branch 3: same region / pair-comparison questions
**Historical frequency:** 5 of 37 P1 questions are explicit same-region questions; pair logic also appears in 2023 P1 Q1 and 2024 P1 Q1.

#### Sub-branch: same region + quality/vintage differentiation
- **Leaf:** STRONG SIGNAL: Burgundy Chardonnay, German Riesling, Loire Chenin. PLAUSIBLE: Chablis vs Cote de Beaune, Alsace Riesling/Pinot Gris. CURVEBALL: Rioja Blanco.
- **Evidence:** 2015 P1 Q1, 2018 P1 Q3, 2019 P1 Q2, 2023 P1 Q1, 2024 P1 Q1.
- **Region distribution:** STRONG SIGNAL: Burgundy, Mosel/Franken/Rheingau, Vouvray/Savennieres. PLAUSIBLE: Alsace, Marlborough intra-region Sauvignon Blanc. CURVEBALL: mature Rioja Blanco or oxidative styles.

### Branch 4: mixed-bag / different countries, different varieties
**Historical frequency:** 7 of 37 P1 questions use open-field identification logic, especially the last question of the paper (2015 P1 Q3, 2016 P1 Q5, 2018 P1 Q2, 2019 P1 Q3, 2022 P1 Q4, 2023 P1 Q2, 2024 P1 Q2, 2025 P1 Q4).

#### Sub-branch: identification marks high, no linking constraint
- **Leaf:** STRONG SIGNAL: aromatic or textural whites that are regionally signature but not impossible. PLAUSIBLE: Riesling, Chenin Blanc, Viognier, Semillon, Albarino, Gruner Veltliner, Garganega, Torrontes. CURVEBALL: Gewurztraminer, Chinuri/qvevri, orange/oxidative whites, Vin Santo-style dry/sweet crossover.
- **Evidence:** 2015 P1 Q3, 2016 P1 Q5, 2018 P1 Q2, 2019 P1 Q3, 2022 P1 Q4, 2023 P1 Q2, 2024 P1 Q2, 2025 P1 Q4.
- **Examiner pattern:** the final P1 question is the recurring curveball slot (see 2019 P1 Q3, 2022 P1 Q4, 2025 P1 Q4).

## Layer B - In-glass decision tree (sensory overlay)

### For Chardonnay-led leaves
- **Pale to medium lemon, apple/citrus core, oak or lees present**
  - **High acid + chalk/flint + restrained fruit** -> survive: Chablis/Burgundy Chardonnay. eliminate: California, warm Australia. Evidence base: 2015 P1 Q1, 2018 P1 Q1, 2022 P1 Q1.
  - **Riper stone/tropical fruit + lower acid + obvious vanilla/malo** -> survive: California, South Eastern Australia, Margaret River. eliminate: Chablis, Mosel Riesling. Evidence base: 2016 P1 Q2, 2024 P1 Q1, 2025 P1 Q2.
  - **Very long finish + integrated oak + mineral drive** -> promote to STRONG SIGNAL premium Burgundy. demote entry-level New World Chardonnay to PLAUSIBLE.

### For Riesling-led leaves
- **Lime/citrus, very high acid, no obvious oak**
  - **Low alcohol + RS present + slate/petrol** -> survive: Mosel Kabinett/Spatlese. eliminate: Alsace dry, Clare Valley, Chardonnay. Evidence base: 2018 P1 Q3, 2023 P1 Q2, 2024 P1 Q1.
  - **Bone dry + firmer extract + phenolic grip + mineral power** -> survive: GG/Franken/Rheingau or Alsace Grand Cru. eliminate: Mosel Kabinett, off-dry Vouvray. Evidence base: 2018 P1 Q3, 2024 P1 Q1.
  - **Bone dry + lime cordial + youth + less extract** -> survive: Clare Valley/Eden Valley. eliminate: botrytized or German sweeter styles. Evidence base: 2022 P1 Q2, 2025 P1 Q4.

### For Sauvignon Blanc / Chenin Blanc / aromatic mixed-bag leaves
- **Capsicum/gooseberry/passion fruit**
  - **Pure, pungent, high acid, no oak** -> survive: Marlborough or Loire Sauvignon Blanc. eliminate: Chardonnay, Chenin Blanc, Gewurztraminer. Evidence base: 2024 P1 Q1, 2023 P1 Q3.
  - **Smoke/flint/less tropical** -> promote Loire. eliminate commodity Marlborough. Evidence base: 2024 P1 Q1.
- **Wax, lanolin, quince, high acid**
  - **Dry with phenolic texture** -> survive: Loire Chenin, South Africa old-vine Chenin. eliminate: Sauvignon Blanc, Riesling. Evidence base: 2015 P1 Q2, 2021 P1 Q2, 2023 P1 Q3.
  - **Botrytis/RS or woolly maturity** -> survive: Vouvray moelleux/off-dry spectrum. eliminate dry Sauvignon or Chardonnay.
- **Lychee/rose, overt perfume, low-acid broad palate**
  - survive: Gewurztraminer. eliminate Chardonnay, Riesling, Sauvignon Blanc. Evidence base: 2016 P1 Q5, 2022 P1 Q3.

### For blend-led leaves
- **Grass/citrus + wax + oak**
  - survive: Bordeaux Blanc / Margaret River SB-Sem. eliminate Rhone Blanc. Evidence base: 2019 P1 Q1, 2025 P1 Q1.
- **Stone fruit + fennel + wax + higher alcohol**
  - survive: Rhone white blends / CdP Blanc. eliminate Loire Sauvignon/Chardonnay. Evidence base: 2024 P1 Q3.
- **Oxidative nutty handling or skin tannin**
  - survive: curveball oxidative/amber branch. eliminate mainstream reductive whites. Evidence base: 2019 P1 Q3, 2025 P1 Q4.

### For mixed-bag final-question leaves
- **If the wine is hard to place geographically and the stem explicitly downweights origin**
  - promote technique-first explanations: qvevri, oxidation, skin contact, drying, flor, or extreme lees/oak handling.
  - survive: Chinuri/qvevri, oxidative Rioja Blanco, Vin Santo-adjacent, orange wine. eliminate mainstream international whites.
  - Evidence base: 2019 P1 Q3, 2024 P1 Q2, 2025 P1 Q4.

## Curveball cases
- **2019 P1 Q3**: explicit instruction not to over-focus on exact origin; this is the clearest P1 outlier slot.
- **2022 P1 Q4**: broad six-country mixed bag with multiple non-mainstream whites.
- **2024 P1 Q2**: method/style/commercial position weighted above grape and origin; do not over-commit too early.
- **2025 P1 Q4**: human-input versus natural-factor framing favors technique-driven or stylistically manipulated wines.

## Coverage note
This tree covers the dominant P1 structures cleanly: same-variety flights, same-country country tours, pair-comparisons, and the mixed-bag final question. Weakest coverage is the small subset of technique-first, origin-deemphasized outliers where the stem itself tells you the normal variety-region tree is secondary.
