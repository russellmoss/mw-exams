---
paper: 1
tree_name: P1 Whites Master Decision Tree
generated: 2026-05-25
last_resynthesized: 2026-08-05
questions_analyzed: [2015_p1_q1, 2015_p1_q2, 2015_p1_q3, 2016_p1_q1, 2016_p1_q2, 2016_p1_q3, 2016_p1_q4, 2016_p1_q5, 2017_p1_q1, 2017_p1_q2, 2017_p1_q3, 2017_p1_q4, 2017_p1_q5, 2018_p1_q1, 2018_p1_q2, 2018_p1_q3, 2019_p1_q1, 2019_p1_q2, 2019_p1_q3, 2021_p1_q1, 2021_p1_q2, 2021_p1_q3, 2021_p1_q4, 2022_p1_q1, 2022_p1_q2, 2022_p1_q3, 2022_p1_q4, 2023_p1_q1, 2023_p1_q2, 2023_p1_q3, 2024_p1_q1, 2024_p1_q2, 2024_p1_q3, 2025_p1_q1, 2025_p1_q2, 2025_p1_q3, 2025_p1_q4, 2026_p1_q1, 2026_p1_q2, 2026_p1_q3]
accuracy_target: variety + region (not exact wine)
---

# P1 Whites - Master Decision Tree

## Accuracy target
This tree targets **variety + region** accuracy. Producer, vintage, and vineyard identification are bonus, not the target. A correct prediction = right variety AND right country/region.

## Layer A - Pre-tasting decision tree (question stem only)

### Branch 1: "Same single grape variety" questions
**Historical frequency:** 13 of 40 P1 questions use this structure (2015 P1 Q2, 2016 P1 Q2, 2016 P1 Q3, 2017 P1 Q2, 2017 P1 Q5, 2018 P1 Q1, 2018 P1 Q3, 2021 P1 Q2, 2021 P1 Q3, 2024 P1 Q1, 2025 P1 Q2, 2026 P1 Q1, 2026 P1 Q2). 2026 is the first year the paper has run *two* same-single-variety flights back to back (Q1 = Chardonnay, 6 wines; Q2 = Riesling, 3 wines) — see the new sub-branch below and the "2026 breadth pattern" note.

#### Sub-branch: 3-4 wines, origin and maturity/quality heavily marked
- **Leaf (default):** STRONG SIGNAL: Chardonnay, Riesling. PLAUSIBLE: Chenin Blanc, Sauvignon Blanc. CURVEBALL: Pinot Gris.
- **Leaf (stem says "different countries" or "two countries"):** STRONG SIGNAL: Chardonnay, Riesling, Sauvignon Blanc. PLAUSIBLE: Chenin Blanc, Semillon. CURVEBALL: Pinot Gris. *Rationale: cross-country variety comparison is SB's strongest exam structure (Loire vs Marlborough, Bordeaux blend vs NZ varietal). See 2019 P1 Q1, 2023 P1 Q1, and now 2026 P1 Q2 (Riesling, 3 wines/3 countries: Wachau AT, Alsace FR, Eden Valley AU) — a Riesling hit rather than the SB the rationale predicts, confirming Riesling belongs at STRONG SIGNAL alongside SB in this leaf, not below it.*
- **Leaf (stem mentions "cool climate" or "climate" emphasis):** STRONG SIGNAL: Sauvignon Blanc, Riesling. PLAUSIBLE: Chardonnay, Chenin Blanc. CURVEBALL: Pinot Gris. *Rationale: cool-climate framing promotes SB (Sancerre, Marlborough) and Riesling (Mosel, Clare Valley).*
- **Evidence:** 2018 P1 Q1, 2025 P1 Q2, 2024 P1 Q1, 2018 P1 Q3, 2021 P1 Q2, 2021 P1 Q3, 2019 P1 Q1, 2023 P1 Q1, 2026 P1 Q2.
- **Region distribution:** STRONG SIGNAL: Burgundy/Chablis, California, Margaret River, New Zealand (Marlborough), South Africa for Chardonnay; Mosel, Rheingau/Franken, Alsace, Wachau (Austria), Clare Valley/Eden Valley for Riesling; Loire/Marlborough/Bordeaux for Sauvignon Blanc. PLAUSIBLE: Loire/South Africa for Chenin; Bordeaux/Hunter Valley/Chile for Semillon; Italy (IGT Dolomiti/Alto Adige) for Chardonnay — confirmed as a real (if minor-volume) Chardonnay origin by 2026 P1 Q1. CURVEBALL: Alsace/Oregon or Alto Adige for Pinot Gris.

#### Sub-branch: 2-wine same-variety questions with winemaking emphasis
- **Leaf (default):** STRONG SIGNAL: Chardonnay, Chenin Blanc. PLAUSIBLE: Pinot Gris, Sauvignon Blanc. CURVEBALL: Semillon.
- **Leaf (stem says "same country" with Old World framing):** STRONG SIGNAL: Chardonnay, Chenin Blanc. PLAUSIBLE: Sauvignon Blanc, Pinot Gris. CURVEBALL: Semillon. *Rationale: Old World same-country same-variety with winemaking focus is Chenin's strongest position (Loire quality ladder: Anjou vs Savennières). See 2015 P1 Q2, 2021 P1 Q2.*
- **Leaf (stem says "different countries"):** STRONG SIGNAL: Chardonnay, Sauvignon Blanc. PLAUSIBLE: Chenin Blanc, Pinot Gris. CURVEBALL: Semillon. *Rationale: cross-country 2-wine comparison is SB's natural pairing structure (Loire vs Marlborough).*
- **Evidence:** 2015 P1 Q2, 2016 P1 Q2, 2016 P1 Q3, 2017 P1 Q2, 2021 P1 Q2.
- **Region distribution:** STRONG SIGNAL: Burgundy vs New World Chardonnay; Loire vs South Africa Chenin; Loire vs Marlborough Sauvignon Blanc. PLAUSIBLE: Alsace vs Italy/New World Pinot Gris. CURVEBALL: Hunter Valley vs Bordeaux Blanc/Chile Semillon.

#### Sub-branch: 5-6 wines, multi-country flights with a doubled country (new pattern, confirmed 2026)
- **Leaf:** STRONG SIGNAL: Chardonnay. PLAUSIBLE: Riesling. CURVEBALL: Sauvignon Blanc, Pinot Gris. *Rationale: only Chardonnay and Riesling have genuine commercial-scale plantings across five-plus countries at examinable quality, and Chardonnay is the more winemaking-malleable of the two, which is what makes it fit a flight that weights "winemaking's influence on style" as heavily as origin.*
- **Evidence:** 2026 P1 Q1 (6 wines, "five different countries" — the first attested 6-wine, 5-country single-variety P1 flight; all six Chardonnay: Meursault/Burgundy FR, Chablis/Burgundy FR, Marlborough NZ, Margaret River AU, IGT Dolomiti IT, Central Coast USA).
- **Practical rule (2026):** when the stem states *N* wines from *N-1* countries — i.e. exactly one country is doubled — the doubled country is most likely **France**, split by contrasting Chardonnay style: an unoaked/lean expression (Chablis) against an oaked/malo-driven expression (Côte de Beaune, e.g. Meursault). The doubling exists specifically to test whether the candidate can articulate a winemaking-driven contrast between two wines from the same place and grape, rather than defaulting to "same country = same wine." Do not assume the doubled country is exotic (Chile, Argentina) — the exam favours doubling the country the candidate already expects, because the trick is in the contrast, not the discovery. See 2026 P1 Q1.
- **Region distribution:** STRONG SIGNAL: Burgundy (both Chablis and Côte de Beaune), California/Central Coast, Margaret River, Marlborough, South Africa. PLAUSIBLE: Italy (Alto Adige/Dolomiti) as the "breadth" fifth country. CURVEBALL: a doubled non-French country (e.g. USA doubled as California vs Oregon, or Australia doubled as cool Margaret River/Adelaide Hills vs warm inland) remains possible but is the less-favoured construction per the practical rule above.

### Branch 2: "Same country" questions
**Historical frequency:** 10 of 40 P1 questions use this structure (2016 P1 Q1, 2016 P1 Q2, 2016 P1 Q4, 2017 P1 Q1, 2017 P1 Q3, 2021 P1 Q1, 2021 P1 Q4, 2022 P1 Q2, 2022 P1 Q3, 2023 P1 Q3, 2024 P1 Q3, 2025 P1 Q3). The matrices repeatedly show France as the default answer, then Italy, USA, Australia, South Africa, Spain.

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
**Historical frequency:** 5 of 40 P1 questions are explicit same-region questions; pair logic also appears in 2023 P1 Q1, 2024 P1 Q1, and — as an *implicit* pair embedded inside a larger flight — in the doubled-France leg of 2026 P1 Q1 (Meursault vs Chablis).

#### Sub-branch: same region + quality/vintage differentiation
- **Leaf:** STRONG SIGNAL: Burgundy Chardonnay, German Riesling, Loire Chenin. PLAUSIBLE: Chablis vs Cote de Beaune, Alsace Riesling/Pinot Gris. CURVEBALL: Rioja Blanco.
- **Evidence:** 2015 P1 Q1, 2018 P1 Q3, 2019 P1 Q2, 2023 P1 Q1, 2024 P1 Q1.
- **Region distribution:** STRONG SIGNAL: Burgundy, Mosel/Franken/Rheingau, Vouvray/Savennieres. PLAUSIBLE: Alsace, Marlborough intra-region Sauvignon Blanc. CURVEBALL: mature Rioja Blanco or oxidative styles.

### Branch 4: mixed-bag / different countries, different varieties
**Historical frequency:** 7 of 40 P1 questions use open-field identification logic, especially the last question of the paper (2015 P1 Q3, 2016 P1 Q5, 2018 P1 Q2, 2019 P1 Q3, 2022 P1 Q4, 2023 P1 Q2, 2024 P1 Q2, 2025 P1 Q4). **2026 P1 Q3 does NOT belong in this branch** despite being the paper's closing flight — unlike a true mixed bag, it carries an explicit, tight geographic constraint ("regions influenced by the Mediterranean Sea") rather than an open field. It gets its own branch (Branch 5, below).

#### Sub-branch: identification marks high, no linking constraint
- **Leaf:** STRONG SIGNAL: aromatic or textural whites that are regionally signature but not impossible. PLAUSIBLE: Riesling, Chenin Blanc, Viognier, Semillon, Albarino, Gruner Veltliner, Garganega, Torrontes. CURVEBALL: Gewurztraminer, Chinuri/qvevri, orange/oxidative whites, Vin Santo-style dry/sweet crossover.
- **Evidence:** 2015 P1 Q3, 2016 P1 Q5, 2018 P1 Q2, 2019 P1 Q3, 2022 P1 Q4, 2023 P1 Q2, 2024 P1 Q2, 2025 P1 Q4.
- **Examiner pattern:** the final P1 question is the recurring curveball slot (see 2019 P1 Q3, 2022 P1 Q4, 2025 P1 Q4). As of 2026, note that the final slot has started carrying its *own* tight geographic constraint (Branch 5) rather than a pure open field — watch whether this becomes the new default for the closing P1 flight or whether 2026 was a one-off.

### Branch 5: geographic / climatic framing questions (new in 2026)
**Historical frequency:** 1 of 40 P1 questions (2026 P1 Q3, wines 10-12: "wines from regions influenced by the Mediterranean Sea"). This is a single data point — treat the branch below as a live hypothesis to monitor in future years, not yet a two-instance-confirmed pattern. It is distinct from Branch 4 because the stem gives a real, filterable constraint (a geography/climate descriptor) rather than an open field, and distinct from Branch 2 ("same country") because multiple countries remain in play by design.

#### Sub-branch: stem names a sea, ocean, or climate zone rather than a country or variety
- **Leaf:** STRONG SIGNAL: Vermentino/Rolle (Liguria, Sardinia, Corsica, Provence), Assyrtiko (Santorini and other Cyclades). PLAUSIBLE: Fiano/Falanghina/Greco (Campania), Grillo/Catarratto/Carricante-Etna Bianco (Sicily), southern French Mediterranean-coast blends (Bandol/Cassis/Provence Blanc, Picpoul de Pinet, southern Rhone white blend components — Clairette, Bourboulenc, Grenache Blanc, Roussanne, Marsanne). CURVEBALL: Istrian Malvazija (Croatia), Xynisteri (Cyprus), Château Musar White-style oxidative Lebanese field blend.
- **Evidence:** 2026 P1 Q3 (Vermentino di Sardegna, Sardegna, Italy; Assyrtiko Thalassitis, Santorini, Greece; Château de Pibarnon Blanc, Bandol, France — a Clairette/Bourboulenc-led blend). All three predicted correctly blind.
- **Practical rule (2026, white-from-a-red-appellation trap):** when a stem names, or points toward, an appellation famous chiefly for its reds — Bandol, Châteauneuf-du-Pape, Pessac-Léognan, Rioja, even Barolo country — a **white** from that same appellation is a live candidate, not a decoy. The grapes are usually completely unrelated to the red blend (Bandol Blanc is Clairette/Bourboulenc/Ugni Blanc, nothing to do with the Mourvèdre-led red; CdP Blanc is Grenache Blanc/Roussanne/Clairette/Bourboulenc, nothing to do with the Grenache-led red; Pessac-Léognan Blanc is Sauvignon Blanc/Semillon against a Cabernet/Merlot red). Do not let a red-famous appellation name talk you out of a white. See 2026 P1 Q3 (Bandol Blanc) and the pre-existing blend guidance in Branch 2's "same country, all blends or blend-led" sub-branch.
- **Practical rule (2026, literal sea vs. climate-analogue reading):** "regions influenced by the Mediterranean Sea" is a literal geographic filter, not the looser "Mediterranean climate" phrasing the IMW uses when it wants to sweep in California/Chile/South Africa. Read it literally: in-universe is the actual Mediterranean basin (southern France, Italy incl. islands, Spain's east coast, Greece, Croatia/Slovenia, Cyprus, Lebanon, North Africa, Turkey's Aegean coast); out-of-universe by this reading is Rías Baixas/Vinho Verde (Atlantic), Loire, Alsace, Germany/Austria, Marlborough/Central Otago, and — despite "Mediterranean climate" being a textbook descriptor for them — California/Chile/South Africa, which fail the literal "sea" test. A candidate who defaults to climate-type reasoning here falls into the trap the stem is built to set. See 2026 P1 Q3.
- **Region distribution:** STRONG SIGNAL: Sardinia/Liguria (Vermentino), Santorini/Cyclades (Assyrtiko), southern France (Bandol/Provence/Languedoc blends). PLAUSIBLE: Sicily/Etna, Campania. CURVEBALL: Croatia, Cyprus, Lebanon.

## Layer B - In-glass decision tree (sensory overlay)

### For Chardonnay-led leaves
- **Pale to medium lemon, apple/citrus core, oak or lees present**
  - **High acid + chalk/flint + restrained fruit** -> survive: Chablis/Burgundy Chardonnay. eliminate: California, warm Australia. Evidence base: 2015 P1 Q1, 2018 P1 Q1, 2022 P1 Q1.
  - **Riper stone/tropical fruit + lower acid + obvious vanilla/malo** -> survive: California, South Eastern Australia, Margaret River. eliminate: Chablis, Mosel Riesling. Evidence base: 2016 P1 Q2, 2024 P1 Q1, 2025 P1 Q2.
  - **Very long finish + integrated oak + mineral drive** -> promote to STRONG SIGNAL premium Burgundy. demote entry-level New World Chardonnay to PLAUSIBLE.

- **2026 P1 Q1 anchor spread (calibration set):** this flight is the widest Chardonnay quality/price spread attested in the corpus in a single question — Meursault (premium Côte de Beaune, malo+oak, saline mineral drive, 13.5%) vs Chablis (unoaked, flinty, high-acid, 12.5%) vs Greywacke Marlborough (ripe stone fruit, judicious oak, precise acid, 14%) vs Leeuwin Prelude Margaret River (structured, restrained oak, cool-subregion power, 14%) vs Alois Lageder IGT Dolomiti (alpine-cool, low alcohol ~12%, minimal oak, orchard-fruit purity) vs Josh Cellars Central Coast "Buttery Reserve" (commodity/supermarket tier, overt cheap oak/diacetyl, simple confected fruit, ~$16 retail). Use this six-wine set as the mental calibration ladder for placing any future Chardonnay flight along the quality/oak spectrum.
  - **Restrained oak integration + saline/mineral core + full malolactic read as texture rather than overt butter + ripe-but-balanced alcohol (~13.5%) + long, layered finish** -> survive: Meursault/premium Côte de Beaune. eliminate: commodity New World, over-oaked commercial styles. Evidence base: 2026 P1 Q1.
  - **Overt, blunt vanilla/coconut + pronounced diacetyl butter aroma (sometimes literally marketed as "buttery") + simple candied/confected stone or tropical fruit + short or coarse finish despite a rich mouthfeel** -> survive: entry-level/commercial New World Chardonnay (Central Coast and similar supermarket tiers), where oak alternatives (staves/chips/essence) simulate richness cheaply rather than barrel-aged nuance. eliminate: premium Burgundy, serious cool-climate New World. Evidence base: 2026 P1 Q1.
  - **Alpine-cool, orchard-fruit purity (apple/pear/white flower) + low-ish alcohol (~12%) + minimal oak + gentle, non-searing acid** -> survive: cool-subregion Italian Chardonnay (Alto Adige/IGT Dolomiti). eliminate: warm-climate New World, overtly oaked styles; distinguish from Chablis by softer, more floral fruit and gentler acid rather than Chablis's flintier, more linear drive. Evidence base: 2026 P1 Q1.

### For Riesling-led leaves
- **Lime/citrus, very high acid, no obvious oak**
  - **Low alcohol + RS present + slate/petrol** -> survive: Mosel Kabinett/Spatlese. eliminate: Alsace dry, Clare Valley, Chardonnay. Evidence base: 2018 P1 Q3, 2023 P1 Q2, 2024 P1 Q1.
  - **Bone dry + firmer extract + phenolic grip + mineral power** -> survive: GG/Franken/Rheingau or Alsace Grand Cru. eliminate: Mosel Kabinett, off-dry Vouvray. Evidence base: 2018 P1 Q3, 2024 P1 Q1.
  - **Bone dry + lime cordial + youth + less extract** -> survive: Clare Valley/Eden Valley. eliminate: botrytized or German sweeter styles. Evidence base: 2022 P1 Q2, 2025 P1 Q4.

- **2026 P1 Q2 anchor spread (Wachau vs Alsace vs Eden Valley, deliberate maturity spread of 9/6/2 years):**
  - **Moderate alcohol (~12-12.5%) + dry but softer stone-fruit/apricot character + saline minerality + not yet fully petrol-developed at mid-maturity (5-7 years)** -> survive: Wachau Federspiel, Austria (Vinea Wachau's mid-weight dry category, between light Steinfeder and powerful Smaragd). eliminate: Alsace Grand Cru-level power, youthful Eden Valley lime-citrus. Evidence base: 2026 P1 Q2.
  - **Higher alcohol (13-14%) + bone dry + structured and powerful + floral/stone fruit moving toward honeyed or toasty development at 8-10 years + firm mineral backbone** -> survive: Alsace (Trimbach-style Grand Cru/lieu-dit Riesling — famously bone-dry and age-worthy even at ripeness). eliminate: Mosel Kabinett sweetness, youthful New World lime-citrus. Evidence base: 2026 P1 Q2.
  - **Lower alcohol (11-12%) + youthful (0-3 years, no petrol or honeyed development) + pure, linear lime/citrus + high unresolved acid + no oak** -> survive: Eden Valley/Clare Valley, Australia. eliminate: aged Alsace, off-dry German styles. Evidence base: 2026 P1 Q2.

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

### For Mediterranean-Sea-framed leaves (new 2026, see Layer A Branch 5)
- **Salinity + pithy/lemon citrus + high natural acid retained despite ripeness + reductive, non-oaked stainless-steel handling**
  - survive: Vermentino/Rolle (Liguria, Sardinia, Corsica, Provence). eliminate: Atlantic whites (Albarino/Vinho Verde), continental Riesling/Gruner Veltliner. Evidence base: 2026 P1 Q3.
- **Searing, almost shocking acidity despite evident heat/ripeness on the nose + volcanic/saline minerality**
  - survive: Assyrtiko (Santorini), Etna Bianco (Carricante). eliminate: warm-climate New World "Mediterranean-climate" analogues, which should already be filtered out by the literal-sea reading of the stem. Evidence base: 2026 P1 Q3.
- **Herbal/garrigue, fennel, white pepper + broader phenolic texture + layered aromatics that do not resolve to one clean varietal marker (blend signature)**
  - survive: southern French Mediterranean-coast white blend — Bandol Blanc (Clairette/Bourboulenc/Ugni Blanc), Cassis, Provence Blanc, Chateauneuf-du-Pape Blanc, Picpoul de Pinet, southern Rhone/Languedoc blends. eliminate: single-block Loire/Bordeaux blends (Atlantic-facing, wrong sea). Remember the white-from-a-red-appellation trap: a white from Bandol or CdP is a live candidate even though both appellations are famous for reds, and the grapes are unrelated to the red blend. Evidence base: 2026 P1 Q3 (Château de Pibarnon Blanc, Bandol).
- **Oxidative, nutty/amber character, deliberately NOT fresh despite a stem question about freshness**
  - survive: Chateau Musar White-style indigenous Lebanese field blend (Obaideh/Merwah) or another intentionally oxidative Mediterranean outlier — recognize this as the trap a "how did winemaking preserve freshness" question can set: the candidate must be ready to argue that freshness was deliberately *not* the winemaking goal. eliminate: mainstream reductive Mediterranean whites. Evidence base: reasoning basis in the 2026 P1 Q3 decision matrix — this specific curveball wine was not the one actually drawn in 2026 (Assyrtiko and Vermentino were both fresh, reductive styles) but remains PLAUSIBLE for a future variant of this stem.

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
- **2026 P1 Q3 — graduated out of this bucket.** This looked, positionally, like it would be another final-slot curveball (see the "examiner pattern" note in Branch 4), but the stem in fact carries a tight, literal geographic constraint ("regions influenced by the Mediterranean Sea") rather than an open field, and the blind decision matrix named all three varieties and all three countries correctly by reading that constraint literally and applying the white-from-a-red-appellation trap logic. It now has its own home in Branch 5. Kept here only as a note: with one data point, don't yet assume every future closing P1 flight will carry a tidy geographic filter — treat Branch 5 as provisional until it recurs.

## Coverage note
This tree covers the dominant P1 structures cleanly across 40 questions and 11 sat years (2015-2026, excluding 2020): same-variety flights (including the newly-attested 5-6 wine, doubled-country scale in 2026 P1 Q1), same-country country tours, pair-comparisons (explicit and implicit), the mixed-bag final question, and — new as of 2026 — geographic/climatic framing stems (Branch 5). Weakest coverage remains the small subset of technique-first, origin-deemphasized outliers where the stem itself tells you the normal variety-region tree is secondary, plus the still-unconfirmed durability of Branch 5 (a single instance so far).
