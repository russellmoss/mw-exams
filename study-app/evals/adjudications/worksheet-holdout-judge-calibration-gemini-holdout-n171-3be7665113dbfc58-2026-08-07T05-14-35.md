# Adjudication worksheet — holdout run

**Judge:** gemini-3.6-flash (gemini, cross-family)
**Report:** `judge-calibration-gemini-holdout-n171-3be7665113dbfc58-2026-08-07T05-14-35.json` · **golden hash:** `3be7665113dbfc58`
**Scored:** 171

A *disputed* claim is one the **human kept** and the **judge binned** while scoring `factual_accuracy ≤ 2`. These are not judge errors until a person rules on them — counting them as errors would disqualify a judge for out-performing its own reference.

**28 to adjudicate.** For each: check the claim against an independent
source (producer sheet, importer, appellation body — never a model's recall), then write
**JUDGE RIGHT**, **JUDGE WRONG**, or **UNRESOLVED**. Do not guess; UNRESOLVED is a real answer.

---

## 1. `gen_p1_F1_1785951397786` — **VERDICT: ???**

**Judge:** Wine 2 names Clos Jordan for a Niagara Riesling, but Le Clos Jordanne produces exclusively Chardonnay and Pinot Noir, and the model answer headers contain arithmetic discrepancies with the stem mark scheme.

**Paper 1 · F1** · human verdict: `keep`

**Wines:**
- Emmerich Knoll, Loibner Riesling Smaragd, 2022. Wachau, Austria. (13.5%)
- Clos Jordan, Riesling, 2022. Niagara Peninsula, Canada. (12.5%)

<details><summary>Stem</summary>

```
Wines 1 and 2 are made from the same single grape variety.

With reference to both wines:
a) Identify the grape variety. (6 marks)

For each wine:
b) Identify the region of origin as closely as possible. (2 x 5 marks)
c) Comment on the style and key winemaking decisions. (2 x 9 marks)
d) Assess the quality, maturity, and commercial position. (2 x 8 marks)
```
</details>

**Scores:** exam_realism 5 · wine_plausibility 3 · obscurity_calibration 4 · stem_quality 4 · factual_accuracy 2 · answer_fidelity 3

**Sources checked:**

**Verdict:**

---

## 2. `gen_p1_F2_1785866744346` — **VERDICT: ???**

**Judge:** Jean-Louis Grippat retired and sold his estate to Guigal in 2001, making a 2022 vintage impossible, and the model answer mark scheme does not match the question stem.

**Paper 1 · F2** · human verdict: `keep`

**Wines:**
- Domaine Vacheron Les Romains Sancerre, 2023. Loire Valley, France. (13%)
- Jean-Louis Grippat Saint-Joseph Blanc, 2022. Northern Rhône, France. (13.5%)

<details><summary>Stem</summary>

```
Wines 1 and 2 are from the same country but from different regions and are made from different single grape varieties.

For each wine:
a) Identify the grape variety and the region of origin as closely as possible. (2 x 8 marks)
b) Comment on the style and key winemaking decisions that have shaped each wine. (2 x 9 marks)
c) Assess the quality, current state of maturity, and likely future development of each wine. (2 x 8 marks)
```
</details>

**Scores:** exam_realism 4 · wine_plausibility 1 · obscurity_calibration 3 · stem_quality 3 · factual_accuracy 1 · answer_fidelity 2

**Sources checked:**

**Verdict:**

---

## 3. `gen_p1_F2_1785949360532` — **VERDICT: ???**

**Judge:** The mark allocations in the model answer headers do not match the question stem, and the winemaking description incorrectly asserts oak aging for Domaine Leflaive Mâcon-Verzé, which is raised entirely in stainless steel.

**Paper 1 · F2** · human verdict: `keep`

**Wines:**
- Domaine Leflaive Mâcon-Verzé 2023. Mâconnais, Burgundy, France. (13.0%)
- Lucien Crochet Sancerre Blanc Le Chêne Marchand 2022. Loire Valley, France. (13.5%)

<details><summary>Stem</summary>

```
Wines 1 and 2 are from the same country but from different regions, each made from a different single grape variety.

a) Identify the country of origin and, for each wine, identify the region of origin as closely as possible and the grape variety. (2 x 8 marks)
b) Comment on the style and key winemaking decisions for each wine. (2 x 9 marks)
c) Assess the quality and discuss the commercial position of each wine. (2 x 8 marks)
```
</details>

**Scores:** exam_realism 4 · wine_plausibility 5 · obscurity_calibration 5 · stem_quality 4 · factual_accuracy 2 · answer_fidelity 3

**Sources checked:**

**Verdict:**

---

## 4. `gen_p1_F3_1785862935853` — **VERDICT: ???**

**Judge:** The question must be binned because Domaine de la Mordorée does not produce Condrieu, and the provided model answer cuts off mid-sentence during Wine 4.

**Paper 1 · F3** · human verdict: `keep`

**Wines:**
- Domaine de la Mordorée, Condrieu La Remarde, 2023. Condrieu, Northern Rhône, France. (14.0%)
- Shaws + Smith, M3 Chardonnay, 2022. Adelaide Hills, South Australia, Australia. (13.0%)
- Botani, Moscatel Seco, 2023. Sierras de Málaga, Spain. (12.5%)
- Château Ste. Michelle, Eroica Riesling, 2022. Columbia Valley, Washington State, USA. (11.5%)

<details><summary>Stem</summary>

```
Wines 1 to 4 are from four different countries and are each made predominantly from a different, single grape variety.

For each wine:
a) Identify the grape variety and the country and region of origin as closely as possible. (4 x 10 marks)
b) Comment on the style and key winemaking decisions, with particular reference to any oak or lees influence. (4 x 8 marks)
c) Assess the quality and maturity, and comment on the commercial position of each wine. (4 x 7 marks)
```
</details>

**Scores:** exam_realism 4 · wine_plausibility 3 · obscurity_calibration 4 · stem_quality 3 · factual_accuracy 2 · answer_fidelity 2

**Sources checked:**

**Verdict:**

---

## 5. `gen_p1_F3_1785857411633` — **VERDICT: ???**

**Judge:** Domaine Vatan Clos de la Néore is a microscopic cult wine (£200+ secondary market, virtually impossible to source in volume for an IMW exam), its commercial price in the model answer is wildly inaccurate, and the model answer text is truncated mid-sentence.

**Paper 1 · F3** · human verdict: `keep`

**Wines:**
- Domaine Vatan Sancerre Clos de la Néore, 2023. Sancerre AOC, Loire Valley, France. (13.0%)
- Prà Soave Classico Monte Grande, 2022. Soave Classico DOC, Veneto, Italy. (12.5%)
- Singlefile Wines Great Southern Chardonnay, 2022. Great Southern, Western Australia, Australia. (13.5%)
- Brundlmayer Zobinger Heiligenstein Riesling, 2022. Kamptal DAC, Austria. (13.0%)

<details><summary>Stem</summary>

```
Four wines are presented. Each comes from a different country of origin and is made predominantly from a different, single grape variety.

For each wine:
a) Identify the grape variety and the country and region of origin as closely as possible, giving your reasons. (4 x 8 marks)

b) Comment on the style of each wine with reference to the key winemaking decisions that have shaped it, including ageing vessel, lees contact, and the role of malolactic fermentation. (4 x 9 marks)

c) Assess the quality and maturity of each wine and discuss its commercial position within the context of wines of its type globally. (4 x 8 marks)
```
</details>

**Scores:** exam_realism 4 · wine_plausibility 2 · obscurity_calibration 1 · stem_quality 3 · factual_accuracy 2 · answer_fidelity 2

**Sources checked:**

**Verdict:**

---

## 6. `gen_p1_F4_1785863215881` — **VERDICT: ???**

**Judge:** The question stem explicitly states that each wine is made from a different single grape variety, yet both Wine 1 and Wine 3 are Chenin Blanc.

**Paper 1 · F4** · human verdict: `keep`

**Wines:**
- Domaine du Closel, Savennières Clos du Papillon, 2021. Savennières, Loire Valley, France. (13.5%)
- Rudi Pichler, Grüner Veltliner Smaragd Wösendorfer Hochrain, 2022. Wachau, Austria. (13.5%)
- Mullineux, Kloof Street Chenin Blanc, 2023. Swartland, South Africa. (13.0%)

<details><summary>Stem</summary>

```
Wines 1 to 3 are from three different countries. Each wine is made predominantly from a different, single grape variety.

For each wine:
a) Identify the grape variety and the country and region of origin as closely as possible. (3 x 10 marks)
b) Comment on the style of the wine and the key winemaking decisions that have shaped it. (3 x 8 marks)
c) Assess the quality and maturity of each wine, and comment on its commercial position. (3 x 7 marks)
```
</details>

**Scores:** exam_realism 4 · wine_plausibility 2 · obscurity_calibration 4 · stem_quality 1 · factual_accuracy 2 · answer_fidelity 4

**Sources checked:**

**Verdict:**

---

## 7. `gen_p1_F7_1785957210459` — **VERDICT: ???**

**Judge:** The question stem explicitly states the wines are made from different grape varieties, but both wines in the flight are Chardonnay, creating a direct factual contradiction.

**Paper 1 · F7** · human verdict: `keep`

**Wines:**
- Domaine Michel Niellon, Chevalier-Montrachet Grand Cru, 2021. Côte de Beaune, Burgundy, France. (13.5%)
- Eldridge Estate, Chardonnay, 2022. Mornington Peninsula, Victoria, Australia. (13%)

<details><summary>Stem</summary>

```
Wines 1 and 2 are from different countries and are each made from a different, single grape variety.

For each wine:
a) Identify the grape variety and region of origin as closely as possible. (2 x 10 marks)
b) Comment on the style, with reference to the influence of oak and lees handling. (2 x 4 marks)
c) Describe the key winemaking decisions that have shaped each wine's style. (2 x 4 marks)
d) Assess the quality and commercial position of each wine. (2 x 7 marks)
```
</details>

**Scores:** exam_realism 2 · wine_plausibility 1 · obscurity_calibration 2 · stem_quality 1 · factual_accuracy 1 · answer_fidelity 4

**Sources checked:**

**Verdict:**

---

## 8. `gen_p1_F7_1785883372636` — **VERDICT: ???**

**Judge:** Domaine Roulot Meursault 1er Cru Les Perrières is an impossibly scarce, £1,000+ iconic producer wine that an IMW exam panel could never source in exam quantities, and the model answer wildly misprices it at £80–120.

**Paper 1 · F7** · human verdict: `keep`

**Wines:**
- Domaine Roulot, Meursault 1er Cru Les Perrières 2021. Burgundy, France. (13%)
- Weingut Franz Hirtzberger, Hochrain Riesling Smaragd 2022. Wachau, Austria. (13.5%)

<details><summary>Stem</summary>

```
Wines 1 and 2 are from different countries and are made from different single grape varieties. Both wines come from a quality hierarchy within their respective regions of origin.

For each wine:
a) Identify the grape variety and the origin as closely as possible, including the specific quality level within the regional hierarchy. (2 x 8 marks)

b) Comment on the style and key winemaking decisions behind the wine, with reference to how production choices reflect its position in the quality hierarchy. (2 x 10 marks)

c) Assess the current state of maturity and comment on commercial position with reference to price bracket, channel and target market. (2 x 7 marks)
```
</details>

**Scores:** exam_realism 5 · wine_plausibility 1 · obscurity_calibration 2 · stem_quality 4 · factual_accuracy 2 · answer_fidelity 5

**Sources checked:**

**Verdict:**

---

## 9. `gen_p2_F1_1785875828818` — **VERDICT: ???**

**Judge:** The model answer cuts off mid-sentence during Wine 5 (omitting part d entirely) and factually misplaces Bernhard Huber's Malterdingen Bienenberg in Kaiserstuhl rather than Breisgau.

**Paper 2 · F1** · human verdict: `keep`

**Wines:**
- Domaine Dujac Morey-Saint-Denis, 2021. Côte de Nuits, Burgundy, France. (13.0%)
- Bannockburn Vineyards SRH Pinot Noir, 2022. Geelong, Victoria, Australia. (13.5%)
- Clos Henri Pinot Noir, 2022. Marlborough, New Zealand. (13.5%)
- Walter Scott La Combe Verte Pinot Noir, 2022. Eola-Amity Hills, Oregon, USA. (13.0%)
- Weingut Bernhard Huber Pinot Noir Malterdinger Bienenberg Grosses Gewächs, 2020. Baden, Germany. (13.5%)

<details><summary>Stem</summary>

```
Wines 1 to 5 are all made from the same single grape variety.

For all five wines:
a) Identify the grape variety. (25 marks)

For each wine:
b) Identify the region of origin as closely as possible. (5 x 5 marks)
c) Comment on the style and quality of the wine, with reference to the influence of climate and winemaking. (5 x 8 marks)
d) Comment on the commercial position of the wine. (5 x 7 marks)
```
</details>

**Scores:** exam_realism 5 · wine_plausibility 5 · obscurity_calibration 5 · stem_quality 4 · factual_accuracy 2 · answer_fidelity 1

**Sources checked:**

**Verdict:**

---

## 10. `gen_p2_F2_1785954957574` — **VERDICT: ???**

**Judge:** Clos Rougeard Le Bourg is a rare cult wine that is impossible to source for an IMW exam, and the model answer contains a major factual error stating it uses older medium-format barrels when Le Bourg is famously aged in 100% new oak barriques.

**Paper 2 · F2** · human verdict: `keep`

**Wines:**
- Clos Rougeard, Le Bourg, 2018. Saumur-Champigny, Loire Valley, France. (13.5%)
- Mullan Road Cellars, Cabernet Franc, 2021. Columbia Valley, Washington State, USA. (14.2%)

<details><summary>Stem</summary>

```
Wines 1 and 2 are from different countries.

For each wine:

a) Identify the grape variety and region of origin as closely as possible. (2 x 10 marks)

b) Comment on the style and the key winemaking decisions behind each wine. (2 x 8 marks)

c) Assess the quality, maturity and commercial position. (2 x 7 marks)
```
</details>

**Scores:** exam_realism 4 · wine_plausibility 1 · obscurity_calibration 2 · stem_quality 4 · factual_accuracy 1 · answer_fidelity 4

**Sources checked:**

**Verdict:**

---

## 11. `gen_p2_F3_1785877349372` — **VERDICT: ???**

**Judge:** The model answer uses completely different mark allocations than those set out in the question stem, incorrectly designates Montsant as a DOQ rather than a DO, and cuts off mid-sentence at the end.

**Paper 2 · F3** · human verdict: `keep`

**Wines:**
- Clos Roca, Celler de Capçanes, 2021. Montsant DOQ, Spain. (14.5%)
- Giacomo Grimaldi, Barolo Sotto Castello di Novello, 2019. Barolo DOCG, Piedmont, Italy. (14.5%)
- Domaine de Montcalmès, 2020. Terrasses du Larzac AOP, Languedoc, France. (14.0%)
- Craggy Range, Te Muna Road Vineyard Pinot Noir, 2022. Martinborough, New Zealand. (13.5%)

<details><summary>Stem</summary>

```
Wines 1 to 4 are from four different countries. Each is made predominantly from a different, single red grape variety.

For all four wines:
a) Identify the country of origin, giving your reasons. (4 x 4 marks)

For each wine:
b) Identify the grape variety or varieties as closely as possible, giving your reasons. (4 x 4 marks)
c) Comment on the style and the key winemaking decisions that have shaped each wine, with reference to oak and maturation. (4 x 10 marks)
d) Assess the commercial position of each wine within the context of its market. (4 x 7 marks)
```
</details>

**Scores:** exam_realism 3 · wine_plausibility 4 · obscurity_calibration 4 · stem_quality 2 · factual_accuracy 2 · answer_fidelity 1

**Sources checked:**

**Verdict:**

---

## 12. `gen_p2_F3_1785869981298` — **VERDICT: ???**

**Judge:** The model answer hallucinated Wine 2 (Château Rayas Châteauneuf-du-Pape) as a white wine made from Grenache Blanc, when it is famously one of the world's most iconic 100% Grenache red wines.

**Paper 2 · F3** · human verdict: `keep`

**Wines:**
- Clos des Papes Châteauneuf-du-Pape, 2021. Southern Rhône, France. (15.0%)
- Château Rayas Châteauneuf-du-Pape, 2018. Southern Rhône, France. (13.5%)
- Domaine de la Janasse Châteauneuf-du-Pape Chaupin, 2019. Southern Rhône, France. (15.5%)

<details><summary>Stem</summary>

```
Wines 1 to 3 are from the same region of origin.

For all three wines:
a) Identify the region of origin as closely as possible. (9 marks)

For each wine:
b) Identify the grape variety. (3 x 5 marks)
c) Comment on the style, winemaking and quality of each wine within the context of the region of origin. (3 x 17 marks)
```
</details>

**Scores:** exam_realism 4 · wine_plausibility 2 · obscurity_calibration 2 · stem_quality 3 · factual_accuracy 1 · answer_fidelity 2

**Sources checked:**

**Verdict:**

---

## 13. `gen_p2_F3_1785954069220` — **VERDICT: ???**

**Judge:** Wine 2 ('Sperino Uvaggio') is a multi-variety blend (Nebbiolo/Vespolina/Croatina) from Coste della Sesia DOC, contradicting the prompt's explicit premise of 'single grape varieties', and the model answer mark scheme does not match the question breakdown.

**Paper 2 · F3** · human verdict: `keep`

**Wines:**
- Domaine Jean-Louis Chave, Hermitage Rouge, 2019. Hermitage, Northern Rhône, France. (13.5%)
- Sperino, Uvaggio, 2020. Lessona DOC, Piedmont, Italy. (13%)

<details><summary>Stem</summary>

```
Wines 1 and 2 are from different countries and are made from different single grape varieties.

For each wine:

a) Identify the grape variety and the region of origin as closely as possible. (2 x 8 marks)

b) Comment on the winemaking, with particular reference to extraction and maturation. (2 x 9 marks)

c) Assess the style, quality and commercial position of each wine. (2 x 8 marks)
```
</details>

**Scores:** exam_realism 3 · wine_plausibility 2 · obscurity_calibration 2 · stem_quality 3 · factual_accuracy 1 · answer_fidelity 2

**Sources checked:**

**Verdict:**

---

## 14. `gen_p2_F4_1785822074988` — **VERDICT: ???**

**Judge:** Gramercy Cellars' 'Lagniappe' is their flagship 100% Syrah cuvée (their Grenache is 'Third Man'), making Wine 2 factually incorrect as specified.

**Paper 2 · F4** · human verdict: `keep`

**Wines:**
- Tinto Figuero, Tinta Fina Reserva, 2020. Ribera del Duero DO, Spain. (14.0%)
- Gramercy Cellars, Lagniappe Grenache, 2022. Columbia Valley, Washington, USA. (14.5%)

<details><summary>Stem</summary>

```
Wines 1 and 2 are from different countries and are each made from a different, single grape variety.

For each wine:

a) Identify the grape variety and the region and country of origin as closely as possible, giving your reasons. (2 x 8 marks)

b) Comment on the style and winemaking, with particular reference to the influence of climate and oak maturation. (2 x 10 marks)

c) Comment on the quality and commercial position of the wine within its region and internationally. (2 x 7 marks)
```
</details>

**Scores:** exam_realism 5 · wine_plausibility 2 · obscurity_calibration 4 · stem_quality 4 · factual_accuracy 1 · answer_fidelity 5

**Sources checked:**

**Verdict:**

---

## 15. `gen_p2_F4_1785822320159` — **VERDICT: ???**

**Judge:** The question stem explicitly states that the three wines are each made from a different grape variety, but Wine 2 (Cannonau) and Wine 3 (Garnacha) are the same grape variety (Grenache).

**Paper 2 · F4** · human verdict: `keep`

**Wines:**
- Domaine Weinbach, Clos des Capucins, Pinot Noir, 2022. Alsace AOC, France. (13.0%)
- Sella & Mosca, Cannonau di Sardegna Riserva, 2020. Sardinia DOC, Italy. (14.5%)
- Bodegas Alto Moncayo, Veraton, 2020. Campo de Borja DO, Spain. (15.0%)

<details><summary>Stem</summary>

```
Wines 1 to 3 are from three different countries and are each made from a different, single grape variety.

For each wine:

a) Identify the grape variety and the region and country of origin as closely as possible, giving your reasons. (3 x 10 marks)

b) Comment on the style and winemaking, with particular reference to how the grape variety and climate have shaped the character of the wine. (3 x 8 marks)

c) Comment on the quality and commercial position of the wine within its region and internationally. (3 x 7 marks)
```
</details>

**Scores:** exam_realism 4 · wine_plausibility 1 · obscurity_calibration 4 · stem_quality 1 · factual_accuracy 1 · answer_fidelity 4

**Sources checked:**

**Verdict:**

---

## 16. `gen_p2_F7_1785872270098` — **VERDICT: ???**

**Judge:** The question contains severe factual errors and contradictions: Mâcon-Villages Rouge does not legally exist, the model answer absurdly claims Wine 1 is a white Chardonnay despite the stem guaranteeing a single-variety flight, and the flight includes unobtainable cult wines like Rousseau Chambertin.

**Paper 2 · F7** · human verdict: `keep`

**Wines:**
- Louis Jadot Mâcon-Villages Rouge, 2022. Mâconnais, Burgundy, France. (12.5%)
- Domaine Rossignol-Trapet Gevrey-Chambertin, 2021. Côte de Nuits, Burgundy, France. (13.0%)
- Domaine Dujac Morey-Saint-Denis Premier Cru Monts Luisants, 2020. Côte de Nuits, Burgundy, France. (13.5%)
- Domaine Comte Georges de Vogüé Chambolle-Musigny Premier Cru Les Amoureuses, 2019. Côte de Nuits, Burgundy, France. (13.5%)
- Domaine Méo-Camuzet Clos de Vougeot Grand Cru, 2019. Côte de Nuits, Burgundy, France. (13.5%)
- Domaine Armand Rousseau Chambertin Grand Cru, 2018. Côte de Nuits, Burgundy, France. (13.0%)

<details><summary>Stem</summary>

```
Wines 1 to 6 are from the same country but from different regions. They are made from the same single grape variety.

For all six wines:
a) Identify the grape variety and country of origin. (20 marks)

For each wine:
b) Identify the region of origin as closely as possible. (6 x 13 marks)
c) Comment on the style and quality of each wine, with particular reference to how each wine's regional character and winemaking approach have shaped its commercial position. (6 x 7 marks)

For all six wines:
d) Place the wines in order of ascending quality, justifying your ranking with reference to appellation hierarchy, typicity, and structure. (10 marks)
```
</details>

**Scores:** exam_realism 1 · wine_plausibility 1 · obscurity_calibration 1 · stem_quality 1 · factual_accuracy 1 · answer_fidelity 2

**Sources checked:**

**Verdict:**

---

## 17. `gen_p2_F7_1785967849483` — **VERDICT: ???**

**Judge:** Wine 4 misnames Vasse Felix's flagship wine as 'Tom Cullam' instead of 'Tom Cullity', and the model answer alters the sub-part mark allocations set out in the question stem.

**Paper 2 · F7** · human verdict: `keep`

**Wines:**
- Château Léoville-Las Cases, Le Petit Lion du Marquis de Las Cases, 2019. Saint-Julien, Bordeaux, France. (13.5%)
- Viña Errázuriz, Don Maximiano Founder's Reserve, 2019. Aconcagua Valley, Chile. (14%)
- Weingut Weil, Kiedrich Gräfenberg Spätburgunder Erstes Gewächs, 2020. Rheingau, Germany. (13%)
- Vasse Felix, Tom Cullam Cabernet Sauvignon, 2019. Margaret River, Western Australia, Australia. (14%)

<details><summary>Stem</summary>

```
Wines 1 to 4 are red wines from four different countries.

For all four wines:
a) Identify the country of origin and grape variety for each wine. (4 x 8 marks)

For each wine:
b) Comment on the style and key winemaking decisions. (4 x 9 marks)
c) Assess the quality and commercial position. (4 x 8 marks)
```
</details>

**Scores:** exam_realism 4 · wine_plausibility 3 · obscurity_calibration 3 · stem_quality 3 · factual_accuracy 1 · answer_fidelity 2

**Sources checked:**

**Verdict:**

---

## 18. `gen_p3_F1_1785941649333` — **VERDICT: ???**

**Judge:** The model answer contains significant factual errors regarding Rutherglen Muscat, incorrectly claiming that 'Museum Reserve' is an official tier above Rare in the Rutherglen classification and attributing Yalumba to Rutherglen, alongside mark scheme discrepancies in the headers.

**Paper 3 · F1** · human verdict: `keep`

**Wines:**
- Domaine de Coyeux Muscat de Beaumes-de-Venise 2022. Rhône Valley, France. (15%)
- Samos Union of Cooperatives Samos Vin Doux 2021. Samos, Greece. (15%)
- Yalumba Museum Reserve Muscat NV. Rutherglen, Australia. (18%)

<details><summary>Stem</summary>

```
Wines 1, 2 and 3 are all made from the same, single grape variety.

a) Identify the grape variety, with reference to all three wines. (9 marks)

b) For each wine, identify the region of origin as closely as possible. (3 x 5 marks)

c) For each wine, comment on the style and method of production, with reference to the level of residual sugar and alcohol. (3 x 9 marks)

d) For each wine, assess the quality and commercial position. (3 x 8 marks)
```
</details>

**Scores:** exam_realism 5 · wine_plausibility 4 · obscurity_calibration 5 · stem_quality 4 · factual_accuracy 2 · answer_fidelity 3

**Sources checked:**

**Verdict:**

---

## 19. `gen_p3_F1_1785960888907` — **VERDICT: ???**

**Judge:** Henschke Croft is a well-known still Chardonnay, not a sparkling Blanc de Blancs, and the mark breakdown in the model answer headings contradicts the question stem.

**Paper 3 · F1** · human verdict: `keep`

**Wines:**
- Taittinger, Blanc de Blancs Brut NV. Champagne, France. (12%)
- Henschke, Lenswood Croft Blanc de Blancs Brut 2020. Adelaide Hills, South Australia, Australia. (12.5%)

<details><summary>Stem</summary>

```
Wines 1 and 2 are from different countries and are both made from the same single grape variety.

For each wine:
a) Identify the grape variety and the region of origin as closely as possible. (2 x 8 marks)
b) Comment on the method of production and the style of the wine, with reference to the sensory evidence in the glass. (2 x 10 marks)
c) Assess the quality and commercial position of the wine. (2 x 7 marks)
```
</details>

**Scores:** exam_realism 3 · wine_plausibility 1 · obscurity_calibration 2 · stem_quality 3 · factual_accuracy 1 · answer_fidelity 2

**Sources checked:**

**Verdict:**

---

## 20. `gen_p3_F2_1785961381927` — **VERDICT: ???**

**Judge:** Henkell Trocken NV is an EU-blend Sekt rather than a Rheinhessen single-region wine, and the mark breakdown in the model answer headers contradicts the mark allocation in the question stem.

**Paper 3 · F2** · human verdict: `keep`

**Wines:**
- Antech, Cuvée Eugénie Brut Nature, 2021. Crémant de Limoux, Languedoc, France. (12%)
- Henkell, Trocken Sekt, NV. Rheinhessen, Germany. (11.5%)

<details><summary>Stem</summary>

```
Wines 1 and 2 are both sparkling wines.

With reference to both wines:
a) Identify the region of origin as closely as possible, and the grape variety or varieties. (2 x 8 marks)

b) Compare the methods of production, commenting on how the style of each wine has been shaped by winemaking decisions. (2 x 9 marks)

c) Assess the quality, maturity and commercial position of each wine. (2 x 8 marks)
```
</details>

**Scores:** exam_realism 4 · wine_plausibility 3 · obscurity_calibration 3 · stem_quality 3 · factual_accuracy 2 · answer_fidelity 2

**Sources checked:**

**Verdict:**

---

## 21. `gen_p3_F4_1785966184238` — **VERDICT: ???**

**Judge:** Domaine Ott's Clos Mireille Blanc de Blancs is a white wine (and a blend predominantly of Sémillon, not single-varietal Rolle), making 'Clos Mireille Blanc de Blancs Rosé' a factually impossible and oxymoronic wine.

**Paper 3 · F4** · human verdict: `keep`

**Wines:**
- Domaine Ott, Clos Mireille Blanc de Blancs Rosé, 2022. Côtes de Provence, France. (13%)
- Maysara Winery, Jamsheed Pinot Noir Rosé, 2023. Willamette Valley, Oregon, USA. (13.5%)
- Marisco Vineyards, The King's Thorn Rosé, 2024. Marlborough, New Zealand. (12.5%)
- Bodegas Manzanos, Finca Las Margas Garnacha Rosado, 2023. Campo de Borja, Spain. (13.5%)

<details><summary>Stem</summary>

```
Wines 1-4 are each from a different country. Each is made predominantly from a different, single grape variety.

For each wine:
a) Identify the grape variety and the region of origin as closely as possible. (4 x 10 marks)
b) Comment on the style and the key winemaking decisions evident in the wine. (4 x 8 marks)
c) Assess the quality and commercial position of this wine. (4 x 7 marks)
```
</details>

**Scores:** exam_realism 3 · wine_plausibility 1 · obscurity_calibration 3 · stem_quality 2 · factual_accuracy 1 · answer_fidelity 4

**Sources checked:**

**Verdict:**

---

## 22. `gen_p3_F4_1785951740725` — **VERDICT: ???**

**Judge:** Clos Windsbuhl is a famous lieu-dit rather than an Alsace Grand Cru AOC, and the mark allocations in the model answer headers contradict the question stem.

**Paper 3 · F4** · human verdict: `keep`

**Wines:**
- Domaine Zind-Humbrecht, Gewurztraminer Clos Windsbuhl, 2020. Alsace, France. (14%)
- Koyle, Royale Gewurztraminer, 2023. Valle del Colchagua, Chile. (13.5%)

<details><summary>Stem</summary>

```
Wines 1 and 2 are from two different countries.

For each wine:
a) Identify the grape variety and region of origin as closely as possible. (2 x 8 marks)
b) Comment on the style and the key winemaking decisions evident in each wine. (2 x 9 marks)
c) Assess the quality and commercial position of each wine. (2 x 8 marks)
```
</details>

**Scores:** exam_realism 4 · wine_plausibility 3 · obscurity_calibration 2 · stem_quality 3 · factual_accuracy 2 · answer_fidelity 2

**Sources checked:**

**Verdict:**

---

## 23. `gen_p3_F4_1785960888874` — **VERDICT: ???**

**Judge:** The model answer is truncated mid-sentence in Wine 4, completely omitting Wines 5 and 6, and incorrectly describes pale pink Lambrusco di Sorbara as deep ruby-red.

**Paper 3 · F4** · human verdict: `keep`

**Wines:**
- Pierre Gimonnet & Fils, Cuis 1er Cru Blanc de Blancs Brut, NV. Champagne, France. (12%)
- Recaredo, Terrers Brut Nature Gran Reserva, 2018. Penedès, Spain. (12%)
- Cleto Chiarli, Vecchia Modena Premium Lambrusco di Sorbara, 2023. Emilia-Romagna, Italy. (11%)
- Reichsrat von Buhl, Riesling Sekt Brut, NV. Pfalz, Germany. (12%)
- Gusbourne, Brut Reserve, 2019. Kent, England. (12%)
- Best's Great Western, Sparkling Shiraz, NV. Victoria, Australia. (14%)

<details><summary>Stem</summary>

```
Wines 1-6 are sparkling wines from six different countries.

For each wine:

a) Identify the country of origin as closely as possible, and the grape variety or varieties. (6 x 10 marks)

b) Comment on the method of production, with reference to the evidence in the glass. (6 x 8 marks)

c) Assess the style, quality and commercial position. (6 x 7 marks)
```
</details>

**Scores:** exam_realism 4 · wine_plausibility 4 · obscurity_calibration 4 · stem_quality 3 · factual_accuracy 2 · answer_fidelity 1

**Sources checked:**

**Verdict:**

---

## 24. `gen_p3_F4_1785962857190` — **VERDICT: ???**

**Judge:** Le Clos Jordanne is a producer of premium dry Burgundian-style table wines and does not make Icewine (let alone a 'Grand Clos Chardonnay Icewine'), rendering Wine 4 factually incorrect, and the model answer text is truncated at the end.

**Paper 3 · F4** · human verdict: `keep`

**Wines:**
- Château Guiraud, Premier Cru Classé, 2015. Sauternes, France. (14%)
- Weingut Fritz Haag, Brauneberger Juffer Sonnenuhr Riesling Auslese, 2020. Mosel, Germany. (8%)
- Bodegas Lustau, Moscatel Emilín, NV. Jerez-Xérès-Sherry, Spain. (17%)
- Clos Jordanne, Grand Clos Chardonnay Icewine, 2018. Niagara Peninsula, Canada. (7%)

<details><summary>Stem</summary>

```
Wines 1 to 4 are from four different countries. Each wine has residual sugar.

For each wine:
a) Identify the grape variety and region of origin as closely as possible. (4 x 8 marks)
b) Comment on the method by which sweetness has been achieved, with reference to sensory evidence. (4 x 9 marks)
c) Assess the quality and commercial position. (4 x 8 marks)
```
</details>

**Scores:** exam_realism 4 · wine_plausibility 2 · obscurity_calibration 3 · stem_quality 3 · factual_accuracy 1 · answer_fidelity 3

**Sources checked:**

**Verdict:**

---

## 25. `gen_p3_F5_1785961788625` — **VERDICT: ???**

**Judge:** The model answer incorrectly classifies Domaine de la Taille aux Loups 'Triple Zéro' as traditional method rather than ancestral method, violating both factual accuracy and the stem's explicit premise that each wine uses a different method of production.

**Paper 3 · F5** · human verdict: `keep`

**Wines:**
- Pol Roger, Brut Réserve, NV. Champagne, France. (12.5%)
- Domaine de la Taille aux Loups, Triple Zéro, NV. Montlouis-sur-Loire, Loire, France. (12%)
- Fontanafredda, Asti DOCG, NV. Piedmont, Italy. (7%)
- Rumball, Sparkling Shiraz, NV. Coonawarra, South Australia, Australia. (13%)

<details><summary>Stem</summary>

```
Wines 1-4 are all sparkling wines, each made by a different method of production.

For each wine:

a) Identify the region of origin as closely as possible, and the grape variety or varieties. (4 x 8 marks)

b) Comment on the method of production. (4 x 10 marks)

c) State the level of residual sugar. (4 x 2 marks)

d) Comment on the style and commercial position of the wine. (4 x 5 marks)
```
</details>

**Scores:** exam_realism 4 · wine_plausibility 5 · obscurity_calibration 4 · stem_quality 4 · factual_accuracy 2 · answer_fidelity 2

**Sources checked:**

**Verdict:**

---

## 26. `gen_p3_F6_1785881221485` — **VERDICT: ???**

**Judge:** Rey Fernando de Castilla does not produce a 'Fino Antique' because their Antique range is strictly reserved for 20+ year old oxidative styles (Amontillado, Oloroso, Palo Cortado, PX), making Wine 2 factually impossible.

**Paper 3 · F6** · human verdict: `keep`

**Wines:**
- Bodegas Barbadillo, Castillo de San Diego, 2024. Cádiz, Spain. (12.5%)
- Rey Fernando de Castilla, Fino Antique, NV. Jerez, Spain. (15%)

<details><summary>Stem</summary>

```
Wines 1 and 2 come from the same region of the same country and are made from the same grape variety.

a) Identify the grape variety and the region of origin as closely as possible. (10 marks)

b) For each wine, comment on the method of production, explaining the key winemaking decisions that account for the differences between the two wines. (2 x 9 marks)

c) For each wine, comment on the style and the quality. (2 x 6 marks)

d) For each wine, discuss the commercial position, with reference to channel, market and target consumer. (2 x 5 marks)
```
</details>

**Scores:** exam_realism 4 · wine_plausibility 3 · obscurity_calibration 4 · stem_quality 4 · factual_accuracy 2 · answer_fidelity 4

**Sources checked:**

**Verdict:**

---

## 27. `gen_p3_F7_1785965682546` — **VERDICT: ???**

**Judge:** The stem explicitly states the wines are from different countries, yet both selected wines are from France, and the mark allocations in the answer headers contradict the stem.

**Paper 3 · F7** · human verdict: `keep`

**Wines:**
- Domaine Tempier, Bandol Rosé, 2023. Bandol, Provence, France. (13%)
- Clos des Goisses, Philipponnat, Rosé de Saignée, 2018. Champagne, France. (12.5%)

<details><summary>Stem</summary>

```
Wines 1 and 2 are both rosé wines from different countries.

For each wine:
a) Identify the region of origin and grape variety or varieties as closely as possible. (2 x 8 marks)
b) Comment on the style and key winemaking decisions that have shaped each wine. (2 x 9 marks)
c) Assess the quality and commercial position of each wine. (2 x 8 marks)
```
</details>

**Scores:** exam_realism 2 · wine_plausibility 2 · obscurity_calibration 2 · stem_quality 1 · factual_accuracy 1 · answer_fidelity 2

**Sources checked:**

**Verdict:**

---

## 28. `gen_p3_F7_1785963588166` — **VERDICT: ???**

**Judge:** The model answer contains major factual errors regarding winemaking and pricing (Hattingley's flagship 'Kings Cuvée' is 100% barrel-fermented and sells for ~£80-100, not £35-55, and Blanc des Millénaires sees no oak), while the mark allocations in the answer headers contradict the stem.

**Paper 3 · F7** · human verdict: `keep`

**Wines:**
- Charles Heidsieck, Blanc des Millénaires, 2006. Champagne, France. (12%)
- Hattingley Valley, Kings Cuvée, 2018. Hampshire, England. (12%)

<details><summary>Stem</summary>

```
Wines 1 and 2 are from different countries. Both are sparkling wines produced using the traditional method.

a) Identify the region of origin of each wine as closely as possible. (2 x 8 marks)
b) Compare the key winemaking decisions behind each wine, with particular reference to the role of ageing. (2 x 9 marks)
c) Comment on the style, quality, and commercial position of each wine. (2 x 8 marks)

Total: 50 marks
```
</details>

**Scores:** exam_realism 4 · wine_plausibility 5 · obscurity_calibration 4 · stem_quality 3 · factual_accuracy 2 · answer_fidelity 2

**Sources checked:**

**Verdict:**

---

## Tally

| | count |
|---|---|
| Disputed | 28 |
| Judge right | |
| Judge wrong | |
| Unresolved | |

