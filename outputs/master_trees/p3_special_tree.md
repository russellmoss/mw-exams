---
paper: 3
tree_name: P3 Special Master Decision Tree
generated: 2026-05-25
questions_analyzed: [2015_p3_q1, 2015_p3_q2, 2015_p3_q3, 2016_p3_q1, 2016_p3_q2, 2016_p3_q3, 2016_p3_q4, 2017_p3_q1, 2017_p3_q2, 2017_p3_q3, 2017_p3_q4, 2017_p3_q5, 2017_p3_q6, 2018_p3_q1, 2018_p3_q2, 2018_p3_q3, 2019_p3_q1, 2019_p3_q2, 2019_p3_q3, 2019_p3_q4, 2019_p3_q5, 2021_p3_q1, 2021_p3_q2, 2021_p3_q3, 2022_p3_q1, 2022_p3_q2, 2022_p3_q3, 2023_p3_q1, 2023_p3_q2, 2023_p3_q3, 2023_p3_q4, 2024_p3_q1, 2024_p3_q2, 2024_p3_q3, 2024_p3_q4, 2025_p3_q1, 2025_p3_q2, 2025_p3_q3]
accuracy_target: variety + region (not exact wine)
---

# P3 Special - Master Decision Tree

## Accuracy target
This tree targets **variety + region** accuracy. Producer, vintage, and vineyard identification are bonus, not the target. A correct prediction = right variety AND right country/region, with method/style category often equally important on Paper 3.

## Layer A - Pre-tasting decision tree (question stem only)

### Branch 1: P3 Q1 / sparkling-led opening flights
**Historical frequency:** sparkling or sparkling-adjacent opening flight in 7 of 10 years (2019 P3 Q1, 2021 P3 Q1, 2022 P3 Q1, 2023 P3 Q1, 2024 P3 Q1, plus 2018 P3 Q1 and 2025 P3 Q1 as style-spanning openings).

#### Sub-branch: explicit sparkling, often non-Champagne
- **Leaf (default):** STRONG SIGNAL: traditional-method non-Champagne sparkling. PLAUSIBLE: Champagne, tank-method Prosecco/Cava-adjacent, Franciacorta, Sekt. CURVEBALL: one still or sweet wine from the same grape if the stem says "same single grape variety."
- **Leaf (stem says "not from Champagne" or names multiple traditional-method countries):** STRONG SIGNAL: Xarel-lo/Macabeo/Parellada (Cava/Spain), Chenin Blanc (Crémant de Loire), Pinot Blanc/Auxerrois (Crémant d'Alsace), Chardonnay (Crémant de Bourgogne/English sparkling), Riesling (German Sekt). PLAUSIBLE: Chardonnay/Pinot Noir (English sparkling, Franciacorta, Cap Classique), Glera (Prosecco if tank-method diversity wanted). *Rationale: non-Champagne traditional method tests breadth beyond Chardonnay/Pinot Noir — Cava's native grapes, Crémant's regional variants, and English sparkling's cool-climate Champagne-analogues are the core alternatives. See 2023 P3 Q1.*
- **Leaf (two wines, non-Champagne, commercial framing heavy):** STRONG SIGNAL: California traditional-method Chardonnay/Pinot Noir, Cava native grapes (Xarel-lo/Macabeo/Parellada). PLAUSIBLE: English sparkling, Crémant. CURVEBALL: Prosecco. *Rationale: this structure is usually a prestige-vs-scale commercial comparison rather than a broad geography quiz. See 2024 P3 Q1.*
- **Evidence:** 2021 P3 Q1, 2022 P3 Q1, 2023 P3 Q1, 2024 P3 Q1, 2025 P3 Q1.
- **Region distribution:** STRONG SIGNAL: Penedès/Cava, English sparkling (West Sussex/Hampshire), Crémant d'Alsace, Crémant de Bourgogne, California/Anderson Valley, German Sekt/Rheingau. PLAUSIBLE: Champagne if not explicitly excluded; Prosecco Superiore DOCG if style/commercial position is the main discussion; Franciacorta. CURVEBALL: Riesling Sekt plus still Riesling plus sweet Riesling in one set (2025 P3 Q1).

### Branch 2: residual sugar / sweet wine mechanism questions
**Historical frequency:** one of the strongest recurring P3 structures (2015 P3 Q3, 2017 P3 Q3, 2019 P3 Q5, 2021 P3 Q2, 2022 P3 Q2, 2024 P3 Q4; sweet wines also recur elsewhere in 2023 P3 Q3 and 2025 P3 Q3).

#### Sub-branch: explicit RS and alcohol asked
- **Leaf:** STRONG SIGNAL: one wine each from the five main sweetness mechanisms. PLAUSIBLE: Sauternes/Tokaji/German sweet overlap, Vouvray demi-sec/moelleux, VDN Muscat. CURVEBALL: sweeter oxidative or fortified styles crossing categories.
- **Evidence:** 2015 P3 Q3, 2019 P3 Q5, 2021 P3 Q2, 2022 P3 Q2, 2024 P3 Q4.
- **Region distribution:** STRONG SIGNAL: Canada Icewine (Vidal or Riesling), Austria/Germany BA or TBA, Tokaji, Vin Santo/Recioto (Trebbiano/Malvasia), Muscat de Beaumes-de-Venise/Rutherglen, Port, Madeira, Vouvray/Chenin Blanc. PLAUSIBLE: Sauternes, Monbazillac, Alsace VT/SGN. CURVEBALL: Australian tawny or dry-furmint-to-Aszu mixed sets.
- **Practical rule:** in the five-mechanism sweet-wine flight, preserve one candidate for each mechanism before ranking within a mechanism. Do not let one grape family crowd out Vidal, Muscat, Chenin, or Vin Santo grapes when RS and alcohol clearly point to different production routes.

### Branch 3: fortified / oxidative / biologically aged questions
**Historical frequency:** recurring throughout the middle and back half of P3.

#### Sub-branch: origin + winemaking heavily marked
- **Leaf:** STRONG SIGNAL: Sherry, Madeira, Port. PLAUSIBLE: Vin Jaune/Jura oxidative, Marsala, VDN, oxidative Tokaji/Szamorodni. CURVEBALL: amber/orange wines when the stem suppresses origin and emphasizes style.
- **Evidence:** 2015 P3 Q1, 2016 P3 Q2, 2016 P3 Q4, 2017 P3 Q2, 2017 P3 Q6, 2019 P3 Q4, 2021 P3 Q2, 2021 P3 Q3, 2024 P3 Q2.
- **Practical rule:** if yeast, flor, oxidation, or same-producer different styles are central, jump straight to fortified/oxidative families before chasing still-table-wine answers.

### Branch 4: same region producing multiple styles
**Historical frequency:** a recurrent P3 trick because one region can generate dry, sweet, sparkling, or oxidative variants.

#### Sub-branch: compare styles from one region
- **Leaf:** STRONG SIGNAL: Champagne, Prosecco, Jura, Sauternes/Barsac, Jerez, Madeira. PLAUSIBLE: Tokaj, Rioja, Vouvray, Cava/Penedes. CURVEBALL: regions where one wine is dry and another sweet but the candidate overcommits to different origins.
- **Evidence:** 2018 P3 Q1, 2019 P3 Q1, 2019 P3 Q2, 2019 P3 Q4, 2024 P3 Q2, 2024 P3 Q3.

### Branch 5: rose / unusual still / mixed-bag P3 questions
**Historical frequency:** small in number but disproportionately dangerous.

#### Sub-branch: mixed bag with classification/commercial emphasis
- **Leaf:** STRONG SIGNAL: classification-heavy categories where style is inseparable from appellation or age statement. PLAUSIBLE: rose by provenance, Grenache across dry/fortified contexts, dry Furmint/Tokaji, southern French oxidative categories. CURVEBALL: orange wine, amber wine, odd grape/region combinations.
- **Evidence:** 2017 P3 Q1, 2017 P3 Q2, 2018 P3 Q3, 2023 P3 Q4, 2025 P3 Q2, 2025 P3 Q3.
- **Leaf (same country, three-category spread):** STRONG SIGNAL: Spain with Cava/Penedès + Garnacha still wine (Gredos or similar) + Sherry/Jerez (Palomino). PLAUSIBLE: France with Crémant + still + VDN, Portugal with espumante + still + fortified. CURVEBALL: single-category country flights.
- **Anti-collapse rule:** if a P3 mixed-bag or same-country question clearly spans sparkling, still, and fortified/sweet categories, never collapse the prediction to one grape family. Keep at least one candidate alive for each category represented.

## Layer A.5 - Visual Triage (what you see before you smell)

Paper 3 is the only paper where visual appearance is itself a major diagnostic tool. Before picking up any glass, scan the flight and sort wines by what you see. This step collapses the P3 universe from "could be anything" to a specific production category.

### Step 1: Bubbles
- **Persistent fine mousse visible in glass** → SPARKLING. Route to Branch 1 / sparkling leaves.
- **No bubbles** → continue to Step 2.
- **Very slight spritz / pétillant** → keep semi-sparkling (Lambrusco, pét-nat) alive but do not commit.

### Step 2: Color family
- **Pale lemon to straw, no bubbles** → likely sweet white (botrytis, late harvest) or dry still white appearing in P3 (rare). If multiple wines share this color, consider a same-variety cross-style set.
- **Deep gold to amber** → STRONG SIGNAL: oxidative or aged sweet. Vin Santo, old Sauternes, aged Tokaji, old Vouvray, oxidative Jura. If spirit warmth confirmed on palate → Amontillado, Oloroso, Madeira, old Tawny Port.
- **Mahogany to dark brown** → STRONG SIGNAL: very old fortified. Old Tawny Port (20/30/40yr), Madeira (Malmsey/Bual), Rutherglen Muscat, aged PX.
- **Pale tawny / amber-orange** → could be young tawny, Amontillado, Palo Cortado, dry Madeira (Sercial/Verdelho).
- **Deep ruby to purple, opaque** → STRONG SIGNAL: young fortified red. Ruby/LBV/Vintage Port, Banyuls Rimage, Recioto della Valpolicella. If no spirit heat on palate → passito or concentrated still red in P3.
- **Garnet to brick red, some development** → aged Port (Tawny-leaning), Banyuls traditional, Maury.
- **Pale salmon to pink** → ROSÉ. Route to rosé leaves. If also sparkling → sparkling rosé.
- **Pale copper to orange/amber with no brown** → CURVEBALL: orange/amber wine (skin-contact white). Evidence base: 2017 P3 Q2.

### Step 3: Viscosity and tears
- **Very slow, thick tears** → high sugar (sweet) and/or high alcohol (fortified). Cross-reference with color: amber + thick tears = old sweet fortified; pale gold + thick tears = concentrated botrytis or Icewine.
- **Fast, thin tears** → lower sugar and alcohol. Less likely to be fortified or very sweet.
- **Legs staining the glass with color** → heavily extracted and/or aged fortified.

### How visual triage connects to Layer B
After categorizing each wine visually, apply the relevant Layer B sub-tree: sparkling wines go to the sparkling sensory overlay, amber/fortified wines go to the fortified overlay, etc. The visual triage prevents the most common P3 error: spending nose and palate time chasing the wrong production family.

## Layer B - In-glass decision tree (sensory overlay)

### For sparkling-led leaves
- **Persistent fine mousse + autolysis**
  - survive: traditional method sparkling. eliminate still, tank-only aromatic sparkling. Evidence base: 2021 P3 Q1, 2023 P3 Q1, 2024 P3 Q1.
  - **Higher acid, chalk, subtle dosage, long lees character** -> promote Champagne/English sparkling/Crémant. eliminate Prosecco.
  - **Very high acid + lean fruit + autolytic but cool-climate signature** -> promote English sparkling (Nyetimber, Ridgeview). English sparklers show Champagne-like autolysis but with slightly less ripeness and more green-apple acidity. Evidence base: 2023 P3 Q1.
  - **Apple/yeast/almond + slightly broader texture + lower acid than Champagne** -> promote Cava (Xarel-lo/Macabeo/Parellada). Cava shows traditional-method autolysis but with warmer-climate Mediterranean fruit and less mineral tension. Evidence base: 2023 P3 Q1, 2024 P3 Q1.
  - **Riper fruit than Champagne + slightly less austerity + floral or stone-fruit notes** -> promote Crémant (d'Alsace: Pinot Blanc/Auxerrois with subtle spice; de Bourgogne: Chardonnay with more fruit than Champagne but less chalk; de Loire: Chenin-driven with quince/honey). Evidence base: 2023 P3 Q1.
  - **Pear, simpler fruit, lower autolysis, softer mousse** -> promote Prosecco or tank-method styles. eliminate Champagne-like branches.
  - **If same grape across styles and one wine is still or sweet** -> keep Riesling/Chardonnay cross-style branch alive rather than forcing all wines into sparkling.

### For sweet-wine mechanism leaves
- **Very high sweetness + low alcohol + piercing acid**
  - survive: Icewine/Eiswein branch. eliminate fortified sweet and passito. Evidence base: 2015 P3 Q3, 2024 P3 Q4.
- **Honey/apricot/saffron + noble-rot signature + medium alcohol**
  - survive: botrytis branch such as Tokaji, BA/TBA, Sauternes. eliminate Icewine if fruit profile is more marmalade than pure frozen-fruit concentration. Evidence base: 2019 P3 Q5, 2022 P3 Q2, 2023 P3 Q3, 2024 P3 Q4.
- **Raisin/fig/nut + oxidative edges + 14-16% without spirit heat**
  - survive: passito/Vin Santo/Recioto. eliminate Icewine and classical botrytis. Evidence base: 2015 P3 Q3, 2024 P3 Q4.
- **Spirit warmth + sweet grapey or nutty profile**
  - survive: fortified sweet or fortified oxidative. eliminate non-fortified sweet wines. Evidence base: 2017 P3 Q6, 2021 P3 Q2, 2025 P3 Q3.

### For fortified / oxidative leaves
- **Flor-derived saline/almond/bruised-apple notes with dry finish**
  - survive: Fino/Manzanilla/Amontillado/Palo Cortado family. eliminate Port and Madeira. Evidence base: 2015 P3 Q1, 2016 P3 Q2, 2019 P3 Q4, 2021 P3 Q2.
- **Volatile lift, curry, nuts, very high acidity, caramelized depth**
  - survive: Madeira. eliminate Sherry and Port. Evidence base: 2016 P3 Q2, 2021 P3 Q3, 2025 P3 Q3.
- **Red/black fruit plus spirit, sweetness and tannin**
  - survive: Port family. eliminate Sherry and Vin Santo. Evidence base: 2018 P3 Q1, 2022 P3 Q2, 2025 P3 Q3.
- **Oxidative but unfortified with walnut/curry and no spirit heat**
  - survive: Jura oxidative / Vin Jaune / old Vin Santo-dry branch. eliminate classical fortified categories. Evidence base: 2019 P3 Q4, 2024 P3 Q2.

### For same-region multi-style leaves
- **Dry vs sweet from same region**
  - if one wine is oxidative and another fresh from the same place, survive regions with deliberate dual traditions: Jura, Tokaj, Sauternes/Bordeaux sweet-dry crossover.
  - eliminate regions that cannot credibly produce both styles. Evidence base: 2024 P3 Q2, 2024 P3 Q3, 2023 P3 Q3.
- **Same producer, different style**
  - keep vintage, lees age, fortification timing, oxidation regime, and dosage/RS as the decision levers rather than changing country. Evidence base: 2016 P3 Q4, 2018 P3 Q1.

### For rose / mixed-bag / curveball leaves
- **Pale copper or amber with tannic grip**
  - survive: orange/amber wine. eliminate orthodox rose and oxidative fortified if no spirit heat. Evidence base: 2017 P3 Q2.
- **Dry red-fruited but structurally P3, not classic P2**
  - survive: rose or light red categories, Grenache/Mourvedre/Cinsault/Bandol family. eliminate fortified and sweet assumptions. Evidence base: 2017 P3 Q1, 2018 P3 Q3, 2023 P3 Q4.
- **Classification or age statement drives the question more than sensory family**
  - prioritize category logic first: reserve tiers, tawny age statements, grand cru/classe, VORS, Aszu puttonyos, appellation hierarchy. Evidence base: 2025 P3 Q3.

## Curveball cases
- **2017 P3 Q2**: explicit instruction to treat origin as secondary; style/technique dominates.
- **2018 P3 Q3**: Rhone-associated varieties in Paper 3 rather than Paper 2.
- **2023 P3 Q4**: Grenache across three countries and categories is broad enough to break a rigid "P3 equals sweet/sparkling/fortified" assumption.
- **2025 P3 Q3**: mixed-bag classification question is the modern P3 ambush; category literacy matters more than clean varietal logic.

## Coverage note
This tree covers the main P3 engines: sparkling openers, sweet-wine mechanism sets, fortified/oxidative families, and same-region multi-style comparisons. Weakest coverage is the small but high-risk group of amber/orange and hybrid mixed-bag questions where the examiner is deliberately trying to break normal paper-type expectations.
