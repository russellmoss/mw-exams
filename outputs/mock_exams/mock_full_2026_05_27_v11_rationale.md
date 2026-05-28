# Design Rationale - Mock Exam v11
*Generated 2026-05-27*

This rationale contains the design reasoning, source status, and validity checks for `mock_full_2026_05_27_v11.md`. It does not contain answers.

---

## 1. Structural Intent

v10 deliberately broke the old mock pattern by opening P1 with Loire same-region breadth, P2 with Italy same-country breadth, and P3 with sweet wines first. v11 keeps the anti-pattern-lock pressure but does not repeat that exact architecture.

| Paper | v10 structure | v11 structure | Rotation point |
|---|---|---|---|
| P1 Q1 | Same region, different varieties | Same country, different regions/styles | Keeps origin-led Q1 but moves from intra-region to national breadth |
| P2 Q1 | Same country, four regions | Same dominant variety, four countries | Restores the forecasted F1 family without using Syrah or v10's Italy opening |
| P3 order | Sweet -> sparkling -> fortified hierarchy | Oxidative/method -> Champagne hierarchy -> sweet mechanism | Breaks the default sparkling-first sequence and avoids v10's sweet-first order |

The 2026 forecast still guides the suite: P1 includes F7 quality, F2/F3 origin and blend comparison, and a same-variety dry Riesling flight; P2 includes F1, F7, and a broad mixed comparative question; P3 includes F5 method, F7 hierarchy, and an F6 sweetness-mechanism flight.

---

## 2. Paper 1 Reasoning

### Q1 - Spain, Four Dry White Styles

Purpose: same-country breadth without naming the country in the stem. The wines make Spain visible through Atlantic Albarino, inland Verdejo, modern/traditional Rioja white, and mature oxidative Rioja.

Method hook ledger:
- W1 Do Ferreiro Cepas Vellas: old-vine Albarino, stainless/lees, saline Atlantic profile.
- W2 Jose Pariente Verdejo: aromatic Rueda, clean reductive handling, commercial premium style.
- W3 CVNE Monopole Clasico: Rioja white with traditional white-wine handling and subtle oxidative/savoury inflection.
- W4 Lopez de Heredia Tondonia Blanco Reserva: long old-oak ageing, delayed release, mature oxidative signature.

Source status:
- W1 is in `data/mock_wine_bank.json` with Do Ferreiro producer source.
- W3 and W4 are supported by bank or prior local mock-answer research references.
- W2 is external and should be researched separately before any answer key is written.

Variety ledger - P1 Q1:
- W1: Albarino.
- W2: Verdejo.
- W3: Viura-led Rioja white blend.
- W4: Viura/Malvasia blend.
- Distinct varieties/blends: 4 wine identities; stem does not promise four different single varieties. Pass.

### Q2 - Kamptal Gruner Veltliner Quality Pair

Purpose: compact F7 quality calibration after a four-wine opener. Brundlmayer Terrassen gives regional/mainstream-premium Kamptal; Gobelsburg Ried Lamm gives single-site Erste Lage quality.

Source status: both wines are in `data/mock_wine_bank.json` with producer sources from Brundlmayer and Schloss Gobelsburg.

Variety ledger - P1 Q2:
- W5: Gruner Veltliner.
- W6: Gruner Veltliner.
- Distinct varieties: 1. Stem requires same single grape variety. Pass.

### Q3 - Dry White Blend Logic

Purpose: tests blend recognition and production choices rather than simple varietal ID. The three wines contrast Mediterranean/Rhone-family blending in South Africa, California, and France.

Method and blend-role ledger:
- W7 Mullineux Old Vines White: Chenin-led Swartland old-vine blend; old oak/foudre texture.
- W8 Tablas Creek Esprit de Tablas Blanc: Roussanne-led Paso Robles Rhone-style white blend; estate-grown Mediterranean varieties.
- W9 Guigal Cotes du Rhone Blanc: Viognier/Marsanne/Roussanne/Grenache Blanc family; broader commercial Rhone benchmark.

Source status:
- W7 is in `data/mock_wine_bank.json` with Mullineux source.
- W8 and W9 are external and should be researched separately before any answer key is written.

Variety ledger - P1 Q3:
- W7: Chenin Blanc, Clairette Blanche, Semillon Gris, Grenache Blanc, Viognier, Verdelho.
- W8: Roussanne, Grenache Blanc, Picpoul Blanc, Picardan, Clairette Blanche and other Rhone-family white varieties.
- W9: Viognier, Roussanne, Marsanne, Clairette, Bourboulenc, Grenache Blanc family.
- Distinct blend identities: 3. Stem says dry white blends, not single varieties. Pass.

### Q4 - Premium Dry Riesling, Three Countries

Purpose: same-variety dry Riesling flight without repeating v10's Mosel Pradikat ladder or v7's Trimbach hierarchy. This is a quality/maturity/global-commercial question, not a sweetness-mechanism question.

Source status:
- W10 Robert Weil GG is in `data/mock_wine_bank.json`.
- W11 Domaine Weinbach and W12 Frankland Estate are external and should be researched separately before any answer key is written.

Variety ledger - P1 Q4:
- W10: Riesling.
- W11: Riesling.
- W12: Riesling.
- Distinct varieties: 1. Stem requires same single grape variety. Pass.

Country concentration - P1:
- Spain 4, Austria 2, France 2, South Africa 1, USA 1, Germany 1, Australia 1.
- Distinct countries: 7. Max single country: Spain 4. Within cap.

---

## 3. Paper 2 Reasoning

### Q1 - Cabernet Sauvignon Family Across Four Countries

Purpose: forecast-aligned F1 opening, but not a repeat of v10's P2 Italy breadth or v10's Syrah cross-origin question. The stem says "wholly or principally" to allow Bordeaux and Australian Cabernet-Shiraz blends without falsely promising four monovarietal wines.

Wine roles:
- W1 Lynch-Bages: classified-growth Left Bank anchor.
- W2 Heitz Napa Cabernet: Californian benchmark with mature-release potential.
- W3 Don Melchor: Chilean fine-wine Cabernet benchmark.
- W4 Penfolds Bin 389 Cabernet Shiraz: Australian Cabernet-led blend and commercial/fine-wine bridge.

Source status: all four have entries in `data/mock_wine_bank.json`.

Variety ledger - P2 Q1:
- W1: Cabernet Sauvignon-led Bordeaux blend.
- W2: Cabernet Sauvignon.
- W3: Cabernet Sauvignon.
- W4: Cabernet Sauvignon/Shiraz blend.
- Distinct varieties/blends: 3 blend identities; stem requires same dominant grape, not same single variety. Pass.

### Q2 - Rioja Ageing Designation Ladder

Purpose: legally defensible F7 quality/maturity calibration. Crianza, Reserva, and Gran Reserva create an objective hierarchy based on formal ageing designations, avoiding subjective producer-only ranking.

Source status:
- Rioja age-designation logic is established in the historical corpus and local heuristic files.
- W5, W6, and W7 are external selections and should be researched separately before an answer key is written.

Variety ledger - P2 Q2:
- W5: Tempranillo-led Rioja.
- W6: Tempranillo-led Rioja.
- W7: Tempranillo-led Rioja.
- Dominant grape variety: Tempranillo. Stem requires wholly or principally the same grape variety, not monovarietal wines. Pass.

Quality-ladder compliance:
- W5 Crianza, W6 Reserva, W7 Gran Reserva.
- Three formal ageing designations. Ranking is legally defensible. Pass.

### Q3 - Five-Country Red Breadth

Purpose: broad red calibration after two more constrained questions. The flight tests structure-first reasoning: Douro blend, Swartland Syrah/Grenache-family blend, Argentine Malbec, Greek Xinomavro, and Beaujolais Gamay.

Curveball: W11 Ramnista Xinomavro is the deliberate high-knowledge probe, paired with four stronger global anchors.

Source status: all five wines are in `data/mock_wine_bank.json`.

Variety ledger - P2 Q3:
- W8: Portuguese red field blend dominated by Touriga Nacional/Touriga Franca and related Douro varieties.
- W9: Syrah/Mourvedre/Grenache/Cinsault/Tinta Barocca and related Mediterranean blend.
- W10: Malbec.
- W11: Xinomavro.
- W12: Gamay.
- Distinct varieties/blends: 5. Stem requires five different grape variety or blend identities. Pass.

Country concentration - P2:
- France 2, Spain 3, USA 1, Chile 1, Australia 1, Portugal 1, South Africa 1, Argentina 1, Greece 1.
- Distinct countries: 9. Max single country: Spain 3. Within strict P2 cap.

---

## 4. Paper 3 Reasoning

### Q1 - Oxidative and Biological Ageing

Purpose: method-first Paper 3 opener that is neither sparkling-first nor sweet-first. It tests whether candidates can separate biological ageing, oxidative fortified ageing, Madeira estufagem/canteiro logic, and unfortified sous-voile Jura.

Method ledger:
- W1 Barbadillo Solear Manzanilla: flor-aged, fortified, biologically aged, coastal Jerez style.
- W2 Lustau Don Nuno Oloroso: fortified, fully oxidative Sherry style.
- W3 Henriques & Henriques Sercial 10 Year Old: Madeira, oxidative heated/cask ageing, dry to medium-dry style.
- W4 Berthet-Bondet Chateau-Chalon: unfortified Savagnin aged sous voile.

Source status:
- W2 and W4 have `data/mock_wine_bank.json` entries.
- W1 and W3 are external and should be researched separately before an answer key is written.

Variety ledger - P3 Q1:
- W1: Palomino.
- W2: Palomino.
- W3: Sercial.
- W4: Savagnin.
- Distinct varieties: 3. Stem does not promise different varieties; the method contrast is the testing point. Pass.

### Q2 - Pol Roger Champagne Hierarchy

Purpose: a same-producer Champagne ladder using a defensible NV -> Vintage -> Prestige Cuvee hierarchy. This differs from v10's four-country sparkling-method flight and v10's Port hierarchy.

Quality-ladder compliance:
- W5 Brut Reserve NV: non-vintage house cuvee.
- W6 Vintage Brut 2015: declared vintage wine.
- W7 Cuvee Sir Winston Churchill 2015: prestige cuvee.
- Three recognized quality levels within one producer. Pass.

Source status:
- W5 Pol Roger Brut Reserve is in `data/mock_wine_bank.json`.
- W6 and W7 are external and should be researched separately before an answer key is written.

Variety ledger - P3 Q2:
- W5: Chardonnay, Pinot Noir, Meunier.
- W6: Chardonnay, Pinot Noir, Meunier.
- W7: Pinot Noir and Chardonnay-led prestige blend.
- Distinct blend family: 1 Champagne blend family. Stem requires same country/producer/quality levels, not different varieties. Pass.

### Q3 - Sweetness Mechanism Flight

Purpose: a five-wine sweet-mechanism flight placed last, with five countries and no same-variety/same-mechanism duplication. This follows the composition guidance more closely than older v6-style sweet flights.

Mechanism ledger:
- W8 Elio Perrone Moscato d'Asti: stopped fermentation / low alcohol aromatic sparkling sweet.
- W9 Henry of Pelham Vidal Icewine: ice wine / cryo-concentration.
- W10 Disznoko Tokaji Aszu 5 Puttonyos: botrytis/aszu method.
- W11 Toro Albala Don PX Gran Reserva: sun-dried Pedro Ximenez with long oxidative fortified ageing.
- W12 La Tour Vieille Banyuls Rimage: Grenache-based VDN mutage.

Mechanism count: 5 wines, 5 distinct production traditions. Pass.

Source status:
- W8, W11, and W12 have entries in `data/mock_wine_bank.json`.
- W9 and W10 are external and should be researched separately before an answer key is written.

Variety ledger - P3 Q3:
- W8: Muscat Blanc a Petits Grains.
- W9: Vidal.
- W10: Furmint/Harslevelu-led Tokaji blend.
- W11: Pedro Ximenez.
- W12: Grenache.
- Distinct varieties/blend identities: 5. Stem requires different countries and methods, and the variety diversity also passes.

Country concentration - P3:
- Spain 3, France 5, Portugal 1, Italy 1, Canada 1, Hungary 1.
- Distinct countries: 6. Max single country: France 5. Within cap.

---

## 5. Repeat Count Verification

The selected producer/cuvee combinations were scanned against existing `outputs/mock_exams/mock_full_*.md` files using `rg`. Prior appearances of related producers or categories were avoided where possible; same producer with a different cuvee is not counted as a repeat under the local rule.

Confirmed repeat count: 0 of 36.

Notable avoided repeats:
- Replaced v10/v3 Tokaji producers with Disznoko.
- Replaced prior Inniskillin/Peller icewine choices with Henry of Pelham.
- Avoided v10's Port hierarchy entirely.
- Avoided v10's Chardonnay, Syrah, Loire, Hunter Semillon, Burgundy Pinot, and sparkling-red/Col Fondo motifs.
- Avoided v7's Trimbach ladder and v10's Willi Schaefer Pradikat pair.

---

## 6. Mark Allocation Check

| Paper | Question | Total | Identification marks | Approx. ID % | Main non-ID marks |
|---|---:|---:|---:|---:|---|
| P1 | Q1 | 90 | 40 | 44% | Method/style, commercial |
| P1 | Q2 | 50 | 12-22 | 24-44% | Quality ranking, style, commercial |
| P1 | Q3 | 75 | 27 | 36% | Style/quality, natural vs human inputs |
| P1 | Q4 | 80 | 34 | 43% | Quality, maturity, commercial |
| P2 | Q1 | 92 | 42 | 46% | Style, quality, maturity, commercial |
| P2 | Q2 | 80 | 33 | 41% | Style, quality, maturity, maturation choices |
| P2 | Q3 | 100 | 40 | 40% | Quality, development, commercial drivers |
| P3 | Q1 | 100 | 32 | 32% | Method, quality, commercial |
| P3 | Q2 | 72 | 16-30 | 22-42% | Ranking, method, quality, maturity, commercial |
| P3 | Q3 | 100 | 50 | 50% | Sweetness method, quality, maturity |

The suite follows the updated Moss/Stubbs guidance: direct prompts, marks available when identity fails, and sub-questions that reward method, quality, maturity, and commercial reasoning rather than pure naming.

---

## 7. Curveball Budget

| Paper | Wine | Curveball type | Control |
|---|---|---|---|
| P1 | W4 Lopez de Heredia Tondonia Blanco Reserva | Rare/oxidative dry white style | Anchored by three more recognisable Spanish whites |
| P1 | W7 Mullineux Old Vines White | Blend-logic and Swartland texture | Q3 is explicitly blend-led |
| P2 | W11 Kir-Yianni Ramnista Xinomavro | Rare variety | Four stronger global red anchors in Q3 |
| P3 | W4 Chateau-Chalon | Sous-voile unfortified oxidative wine | Paired with Sherry and Madeira method anchors |
| P3 | W11 Toro Albala Don PX | Very sweet oxidative fortified PX | Sweet mechanism question gives method marks |

High curveballs are controlled and tied to method or commercial reasoning. No paper depends on a curveball for most of its identification marks.

---

## 8. Final Validity Checklist

- Exactly 36 wines: 12 per paper. Pass.
- Exactly two output files written: exam and rationale only. Pass.
- No answers included. Pass.
- P1 Q1 and P2 Q1 use different structure types. Pass.
- P1 Q1 is not same-variety cross-origin. Pass.
- P3 does not follow sparkling -> fortified -> sweet. Pass.
- Country caps respected. Pass.
- Variety ledgers checked against every stem. Pass.
- Sweet flight has 5 methods, 5 countries, and no same-mechanism/same-variety pairing. Pass.
- Quality ladders use formal or recognised hierarchy: Kamptal regional/single-site, Rioja Crianza/Reserva/Gran Reserva, Champagne NV/Vintage/Prestige. Pass.
- External wines are flagged in this rationale for later research before any answer key is written. Pass.
