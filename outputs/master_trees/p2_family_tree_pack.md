---
paper: 2
pack_name: P2 Family Tree Pack
generated: 2026-05-26
last_resynthesized: 2026-08-05
families_covered: [F1, F2, F3, F4, F7]
accuracy_target: variety + region
source_index: outputs/heuristics/question_taxonomy_index.md
companion_tree: outputs/master_trees/p2_reds_tree.md
---

# P2 Reds – Family Tree Pack

## What this document is

The family-by-family layer for Paper 2, layered on top of `p2_reds_tree.md`. The master tree handles the broad paper-level engines. This pack splits those engines into per-family pre-taste and tasting trees.

Each family section uses the same structure as the P3 pack: pre-taste objective, stem triggers, candidate universe, rule-outs, traps, pre-taste branches, tasting branch order, narrowing rules, when-to-commit, and matrix-writing guidance. Confidence is **STRONG SIGNAL** / **PLAUSIBLE** / **CURVEBALL**.

## Active families in P2

| Family | Count | Status in this pack |
| --- | --- | --- |
| F1 Same Variety | 10 | Built (Pinot / Syrah / Cabernet / regional same-variety) |
| F2 Same Origin | 10 | Built (country / region / hierarchy splits); +2 from 2026 (`2026_p2_q1`, `2026_p2_q3`) |
| F3 Blend / Composition Logic | 2 | **Built (priority — Bordeaux-family + GSM logic)** |
| F4 Mixed Identification Breadth | 16 | Built (anti-overlink for the biggest P2 bucket); +1 from 2026 (`2026_p2_q2`) |
| F7 Hierarchy / Quality Calibration | 2 | Built |

There are no native P2 `F5` (production-dominant), `F6` (style-mechanism), or `F8` (curveball) primary tags in the corpus.

---

## F3 Blend / Composition Logic Set (P2)

Only two corpus questions (`2019_p2_q1 (F3c)` and `2022_p2_q1 (F3d)`) but this is the unbuilt high-leverage family flagged in the remaining-work doc, and the blend logic spreads into half of the F2 questions. Building a proper P2 F3 tree also helps `F2c` and `F2d` work in red.

### Pre-taste objective

Identify the *blend family* and then decide whether the question is testing composition recognition, varietal role discrimination, or blend-vs-varietal contrast.

### Stem triggers

- "all wines are blends"
- "made from Bordeaux varieties"
- "the same two grape varieties"
- "predominant grape variety" / "predominant varieties differ"
- one wine described as a blend of varieties also presented separately
- explicit instruction to discuss reasons for blending or not blending

### Default candidate universe

P2 blend families that recur in the corpus and the wider IMW canon:

- **STRONG SIGNAL Bordeaux family:** Cabernet Sauvignon + Merlot + Cabernet Franc (+ Petit Verdot / Malbec). Region candidates: Bordeaux itself (left bank Cab-dominant, right bank Merlot-dominant), Pessac-Léognan, Saint-Émilion, satellite communes; Tuscany (Super Tuscan); Stellenbosch; Margaret River; Napa; Coonawarra; Chile; Loire Cabernet Franc.
- **STRONG SIGNAL Rhône family:** Grenache + Syrah + Mourvèdre (+ Cinsault). Region candidates: Châteauneuf-du-Pape and Southern Rhône GSMs; Australian GSM (Barossa/McLaren Vale); Priorat (Garnacha + Cariñena); Spain (Garnacha-led); California GSM blends. Note that Northern Rhône Syrah-dominant + Viognier sits adjacent to this family.
- **STRONG SIGNAL Iberian family:** Tempranillo + Garnacha (+ Mazuelo / Graciano). Region candidates: Rioja, Ribera del Duero, Toro, Douro reds (Touriga Nacional / Touriga Franca / Tinta Roriz / Tinto Cão), Alentejo.
- **STRONG SIGNAL Tuscan family:** Sangiovese + international blend partners (Cabernet Sauvignon, Merlot, Syrah). Region candidates: Chianti Classico Riserva / Gran Selezione, IGT Toscana / Super Tuscan, Carmignano (DOC permits Cabernet), Bolgheri (international-dominant).
- **PLAUSIBLE Languedoc / Provence family:** Carignan + Grenache + Syrah + Mourvèdre (+ Cinsault). Region candidates: Bandol (Mourvèdre-led), Côtes du Roussillon, Faugères, Pic Saint-Loup.
- **PLAUSIBLE Cape blend:** Pinotage + Bordeaux varieties. Region: Stellenbosch / Cape.
- **CURVEBALL:** Douro field-blend reds with no varietal labelling, Greek Xinomavro-Mavrodaphne blends, indigenous Eastern European blends.

### Default rule-outs

- Pinot Noir blends (Pinot is rarely blended at fine-wine level)
- Nebbiolo blends (Barolo / Barbaresco are single-variety)
- Pure varietal-recognition framing without "blend" wording (that is F1, not F3)

### Main traps

- Assuming "Bordeaux varieties" means Bordeaux — the stem usually pulls Bordeaux varieties from at least one non-Bordeaux country (Loire Cabernet Franc, Tuscan Super Tuscan, Stellenbosch, Chile, Napa)
- Forgetting that "predominant" wording leaves room for a 60/40 split — the dominant grape sets the family but the minor grape can shift style noticeably
- Treating GSM and Bordeaux blends as interchangeable in tasting impressions (they share oak vocabulary but have very different fruit and tannin structures)
- Naming a single producer when the marks reward articulating *why* the blend works rather than *who* made it

### Pre-taste decision branches

#### Branch 3.1 — Single blend family across origins (F3a)

Triggers: stem fixes the blend family (e.g. "Bordeaux varieties") and asks for different origins.

Working priors (Bordeaux variety form, the dominant template in the corpus):
- Slot 1: Bordeaux itself (often Saint-Émilion satellite, Médoc cru, or Pessac-Léognan)
- Slot 2: Tuscany Super Tuscan (Cabernet-dominant)
- Slot 3: Loire Cabernet Franc (Chinon / Saumur-Champigny / Bourgueil)
- Slot 4: Stellenbosch or Margaret River Bordeaux blend
- Optional: Chile (Cabernet/Carmenère) or Napa

Working priors for GSM form (likely if 2026+ corpus expands here):
- Châteauneuf-du-Pape, Australian GSM, Priorat, Languedoc, California

Working priors for Tempranillo-led form:
- Rioja Reserva, Ribera del Duero, Toro, Douro reds

#### Branch 3.2 — Same origin, different blend composition (F3b)

Triggers: stem fixes origin (often Bordeaux or Rhône) and varies composition.

Working priors:
- Bordeaux left bank vs right bank vs Pessac
- Châteauneuf with high vs low Mourvèdre vs Syrah-dominant
- Rioja traditional vs modern Tempranillo + Garnacha proportions

#### Branch 3.3 — Compare varietal roles within blends (F3c)

Triggers: marks heavily weighted on blending discussion, balance, contribution of each grape.

The 2019 P2 Q1 template: four wines, all Bordeaux varieties, drawn from regions where the blend or single grape exposes the role of each variety. The candidate must explain what each grape contributes — structure (Cabernet Sauvignon), flesh (Merlot), aromatics + freshness (Cabernet Franc), colour + spice (Petit Verdot / Malbec).

#### Branch 3.4 — Blend vs varietal expression contrast (F3d)

Triggers: 2022 P2 Q1 template — three single varieties + one blend of those varieties.

Working priors: identify the blend family from the singles, then place the blend in the canonical origin for that blend (Bordeaux for Cab/Merlot/Cab Franc; Châteauneuf for GSM; Rioja for Tempranillo/Garnacha/Mazuelo).

### Tasting branch order (F3)

1. Family lock — Bordeaux vs Rhône vs Iberian vs Tuscan signature on the lead aroma
2. Composition reading — is one variety clearly dominant or is the wine a true blend?
3. Origin family — does the family signature place this in old-world classic or new-world expression?
4. Quality / classification — what tier within the blend family
5. Maturity overlay — primary / secondary / tertiary balance
6. Final varietal split — name the blend components only after the family is locked

### Branch-specific candidate narrowing (F3)

- **Cassis + cedar + graphite + firm fine tannin ⇒** Bordeaux-family Cabernet-dominant. Old-world if leaner, restrained; new-world if plusher and oakier.
- **Plum + chocolate + softer tannin + flesh ⇒** Bordeaux-family Merlot-dominant. Right-bank Bordeaux if old-world; Chilean / Stellenbosch Merlot if new-world.
- **Green pepper + violets + raspberry + medium body + higher acid ⇒** Cabernet Franc-led. Loire if cool; Bordeaux-blend component if integrated; Stellenbosch as new-world signature.
- **Strawberry + white pepper + warm fruit + Provençal herbs + alcohol weight ⇒** GSM-family Grenache-dominant.
- **Black olive + meat + dense tannin + dark spice ⇒** GSM-family Mourvèdre-dominant (Bandol prior).
- **Sour cherry + dried herbs + medium body + high acid + leather ⇒** Tuscan Sangiovese-led, possibly with international polish if more oak and richer fruit.
- **Black fruit + vanilla + American oak + sweet tannin + dust ⇒** Rioja Reserva/Gran Reserva Tempranillo + Garnacha.
- **Bramble + sweet spice + dense black fruit + grippy young tannin ⇒** Douro red blend (Touriga Nacional / Touriga Franca / Tinta Roriz).

### When to stay broad vs commit (F3)

- Commit on blend family early — Bordeaux vs Rhône vs Iberian vs Tuscan signatures are usually decisive.
- Stay broad on composition split until the dominant variety reveals itself in fruit weight and tannin shape.
- Stay broad on producer / classification until concentration and length support a tier.

### Matrix-writing template (F3)

Per wine:
- Blend family in one phrase ("Bordeaux blend, Merlot-dominant"; "GSM, Grenache-led with notable Mourvèdre")
- Likely composition (names of grapes with rough proportion if possible)
- Origin narrowed to the level the sensory evidence supports
- Quality tier in classification language (cru bourgeois / classed growth / IGT Super Tuscan / Reserva)
- Reason this blend works — what each grape contributes
- If F3d: explicit comment on why the blend differs from the sum of the single-variety expressions

---

## F1 Same Variety Comparative Set (P2)

Ten P2 questions. Subcategories are mostly `F1b` (different countries) and `F1c` (same region / producer context). Tagged: `2015_p2_q1`, `2016_p2_q1 (F1c)`, `2016_p2_q2`, `2018_p2_q2`, `2018_p2_q3 (F1c)`, `2022_p2_q4 (F1c)`, `2022_p2_q5 (F1c)`, `2024_p2_q1`, `2024_p2_q3`, `2025_p2_q1`.

### Pre-taste objective

Lock the grape family with confidence, then build a sub-tree for the comparative axis (origin / quality / maturity / winemaking).

### Stem triggers

- "from the same single grape variety"
- one named variety
- "predominantly the same single variety" (admits 85%+ blend wording)

### Default candidate universe by sub-form

**F1b (cross-country)** — the dominant P2 form:
- **STRONG SIGNAL:** Pinot Noir (Burgundy / Germany / New Zealand / Sonoma / Oregon / Canada), Syrah-Shiraz (Northern Rhône / Barossa / McLaren Vale / Chile / South Africa)
- **PLAUSIBLE:** Cabernet Sauvignon (Bordeaux blends as benchmark, Napa, Coonawarra, Stellenbosch, Chile), Cabernet Franc (Loire, Hungary, Stellenbosch), Merlot (Bordeaux right bank, Chile, Ticino, Hawke's Bay)
- **CURVEBALL:** Grenache cross-country (Spain / Southern Rhône / Australia / California), Malbec (Cahors vs Mendoza), Zinfandel/Primitivo (California vs Puglia)

**F1c (same region / producer)** — the second P2 form, especially recurrent in 2022:
- **STRONG SIGNAL:** Pinot Noir within one fine-wine region (Burgundy village vs cru vs grand cru); Sangiovese within Chianti Classico tiers; Cabernet within Napa AVAs; Nebbiolo across Barolo communes
- **PLAUSIBLE:** Beaujolais cru ladder; Côte-Rôtie vs Hermitage Syrah; Rioja village-tier
- **CURVEBALL:** Etna Rosso commune-level Nerello Mascalese

### Default rule-outs

- Blended single-variety wines that look like blends (Châteauneuf, classic Bordeaux) on a stem that says "single grape variety"
- Grapes that rarely sit at the centre of a 4-wine cross-country flight (Nebbiolo, Aglianico, Touriga Nacional) — they appear but are not the high-probability default

### Main traps

- Locking Pinot Noir too early because of pale colour — Gamay, Nerello Mascalese, lighter Tempranillo can fool on appearance
- **Pale-red trap:** do not auto-collapse a pale, high-acid, low-tannin red to Pinot Noir. Trousseau and Poulsard (Jura) share Pinot's colour and acid but show a rustic, slightly oxidative/reductive, red-berry-and-spice profile — keep them alive as candidates rather than eliminating them on colour alone, especially inside an all-France flight. `2026_p2_q1` is the corpus's clearest instance: the blind read nailed the country (France) on all three wines but missed the variety on the Trousseau slot specifically because it was read as Pinot Noir on sight.
- Defaulting to Northern Rhône for Syrah when the flight is cross-country and includes a Barossa-style ringer
- Treating "single variety" too literally on Bordeaux-style stems where the wording allows up to 15% other grapes
- Misreading a stylistic split as a varietal split (e.g. cool-climate vs warm-climate Pinot Noir within one country)

### Pre-taste decision branches

#### Branch 1.1 — Cross-country single variety (F1b)

Triggers: "different countries" + single-variety language.

Working priors: Pinot Noir is the most common; Syrah-Shiraz is second; Cabernet Sauvignon and Grenache are the main alternatives.

Decision aid: if marks heavily favour origin discrimination and quality, Pinot Noir / Syrah are favoured. If maturity is heavily marked, Cabernet Sauvignon / Cabernet Franc gain weight.

#### Branch 1.2 — Same region / producer (F1c)

Triggers: "same region", "same producer", paired or quad set with internal hierarchy.

Working priors: Burgundy (Pinot Noir), Barolo (Nebbiolo), Chianti / Brunello (Sangiovese), Beaujolais cru, Côte-Rôtie or Hermitage.

#### Branch 1.3 — Same country, different regions (F1a, rare in P2)

Triggers: country named, regions vary.

Working priors: France (Burgundy + Rhône + Loire single-variety reds), Italy (Tuscan + Piedmont + southern), Spain (Rioja + Toro + Bierzo Mencía), USA (Napa + Sonoma + Oregon).

### Tasting branch order (F1)

1. Confirm grape family on the most typical wine first
2. Lock the grape — do not flip later
3. Sub-tree on the comparative axis (climate, region, classification, maturity, winemaking)
4. Branch order varies by grape:
   - Pinot Noir: red-fruit weight → earth/forest vs cherry → oak handling → maturity
   - Syrah-Shiraz: pepper vs jam → savoury vs sweet oak → tannin shape → climate
   - Cabernet Sauvignon: cassis vs leaf → tannin grain → oak character → maturity
   - Sangiovese: sour cherry vs polished red fruit → herb signature → oak → tier

### Branch-specific candidate narrowing (F1)

- **Translucent ruby + red fruit + earth + high acid + fine tannin ⇒** Pinot Noir. Burgundy if restrained and earthy; Germany / Sonoma / Oregon / NZ on a sliding ripeness scale.
- **Mid-deep purple + pepper + violets + smoked meat + savoury frame ⇒** cool-climate Syrah (Northern Rhône, Yarra, Hawke's Bay).
- **Deep purple + jammy black fruit + sweet oak + alcohol ⇒** Barossa / McLaren Vale Shiraz.
- **Cassis + cedar + firm tannin + graphite + restraint ⇒** old-world Cabernet (Bordeaux family).
- **Cassis + plush oak + density ⇒** Napa / Stellenbosch / Coonawarra Cabernet.
- **Pale garnet + rose + tar + savage tannin ⇒** Nebbiolo (Barolo / Barbaresco).
- **Sour cherry + dried herb + savoury + high acid ⇒** Sangiovese (Chianti / Brunello).

### Matrix-writing template (F1)

Per wine:
- Grape lock with one signature
- Origin narrowed via climate + style signal
- Comparative axis (climate / classification / winemaking / maturity)
- Quality in context (entry, classic, premium, benchmark)
- Maturity / potential

---

## F2 Same Origin Comparative Set (P2)

Ten P2 questions, dominated by `F2a` (same country, different varieties) and `F2d` (same origin, different elevage/age). Tagged: `2015_p2_q3`, `2015_p2_q4`, `2016_p2_q4 (F2d)`, `2017_p2_q2`, `2022_p2_q2 (F2d)`, `2022_p2_q3 (F2d)`, `2023_p2_q1`, `2025_p2_q2`, `2026_p2_q1 (F2a)`, `2026_p2_q3 (F2a)`.

2026 confirms `F2a` as the workhorse subcategory but adds **two structurally distinct instantiations of it** that need separate handling — see the new stem triggers, candidate universe entries, and Branch 2.1b / 2.4 below.

### Pre-taste objective

Lock the origin family and then explain internal diversity via variety substitution (`F2a`), regional sub-style (`F2b`), or production / maturity divergence (`F2d`). 2026 adds a third internal-diversity axis that sits inside `F2a`/`F2b` rather than replacing it: once a pair (or set) is bound to one country, decide which of three **contrast axes** — traditional vs modern winemaking, quality tier / classification, or vintage — the examiner has built the comparison around (see Branch 2.4).

### Stem triggers

- "from the same country"
- "from the same region"
- "Identify the producer" alongside multiple cuvées
- Cross-vintage or cross-classification within one origin
- **"Wines 1-3 are from the same country and different single grape varieties"** paired with an **inverted mark order** — style-and-commercial-position marked heaviest and first, method next, variety-and-origin identification last and lightest (e.g. 11/6/8 marks per wine). Read this as a deliberate signal that the examiners want market fluency and stylistic breadth, not fine origin detective work, and that the flight is likely to skew lighter/more commercial than a standard same-variety or same-region question. `2026_p2_q1`.
- "Wines X-Y, X-Y, and X-Y form three pairs. Within each pair, the wines are from the same country and region. Each pair is from a different country" — a **multi-pair same-region flight**, effectively three parallel F2b-style deep dives run inside one giant question, usually worth a very large share of the paper's marks. `2026_p2_q3` (150 of 300 marks — half the paper).

### Default candidate universe

**Same country (F2a):**
- France: Pinot Noir + Cabernet + Syrah + Grenache spread across Burgundy, Bordeaux, Rhône, Loire
- Italy: Nebbiolo + Sangiovese + Aglianico + Nerello Mascalese + Corvina-led blends
- Spain: Tempranillo + Garnacha + Monastrell + Mencía across Rioja, Ribera, Priorat, Jumilla, Bierzo
- Portugal: Touriga Nacional / Tinta Roriz / Baga / Castelão across Douro, Dão, Bairrada, Alentejo
- **2026 addition — France, light-bodied/cool-climate single-varietal tour:** don't assume "same country, different varieties" always reaches for the big-name regional anchors above. `2026_p2_q1` fielded all-France, all light-bodied, cool-climate reds that a blind read would not reach for first: Saumur Les Plantagenêts (Loire Cabernet Franc, co-operative, entry tier ~£8.50–19), Régnié (Beaujolais cru Gamay, Domaine de la Margot), and Trousseau Singulier (Arbois Jura Trousseau, Bénédicte et Stéphane Tissot, biodynamic, ~£38–48). The country call was easy (France, confirmed by the blind check); the variety call was hard, missing entirely on the Jura wine — see the pale-red trap below.

**Same region (F2b):**
- Bordeaux communes, Burgundy village-vs-cru, Tuscany sub-zones, Rhône appellations, Rioja sub-zones, Priorat
- **2026 confirmation, multi-pair form:** `2026_p2_q3` ran three of these deep dives simultaneously, one per pair — Rioja (La Rioja Alta Viña Ardanza Reserva 2019 vs Artuke Paso Las Mañas 2021), Chianti Classico (Melini I Sassi 2021 vs Castello di Ama Gran Selezione San Lorenzo 2021), and Margaux (Château Giscours 2017 vs Château Rauzan-Ségla 2016). This is the corpus's strongest evidence yet that Rioja belongs alongside Bordeaux and Tuscany as a **STRONG SIGNAL** same-region pairing candidate, not merely plausible (consistent with the companion master tree's Branch 3 update).

**Same origin, different elevage/age (F2d):**
- Burgundy across vintages, Rioja across Crianza / Reserva / Gran Reserva, Bordeaux across vintages, Champagne tier ladder (P3-side but conceptually parallel)

### Default rule-outs

- Cross-country predictions when the stem clearly says "same country"
- Wines whose typical expression cannot exist in the named origin
- **Do not** assume a "same country, different varieties" stem implies grand/classified wines by default — `2026_p2_q1` shows the opposite can be true, especially when the mark order is inverted toward style/commercial reading (see stem triggers above).

### Main traps

- Defaulting to Italy or France when the stem allows multiple plausible countries — read maturity / blend cues for hints
- Forgetting that "same country" in P2 can pull from at least four classic regions per country
- Treating Rioja Crianza vs Gran Reserva like vintage variation when the marks reward classification-system articulation
- **Pale-red trap:** inside an all-France (or any all-one-country) `F2a` flight, do not auto-collapse a pale, high-acid, low-tannin wine to Pinot Noir or Gamay on colour alone. Trousseau and Poulsard (Jura) share that colour/acid profile but show a rustic, slightly oxidative/reductive, red-berry-and-spice signature. `2026_p2_q1` is the direct evidence — the Trousseau slot was the one variety miss in an otherwise correct-country flight.
- **Inverted-mark-order trap:** if identification is marked last and lightest while style/commercial is marked first and heaviest, do not spend disproportionate write-up time chasing precise sub-appellation ID — the marks reward market-fluency commentary (price band, distribution channel, who buys it) more than they reward narrowing origin further than the sensory evidence safely supports. `2026_p2_q1`.
- **Axis-misread trap (multi-pair flights):** once a pair's region is fixed, don't default to describing "just maturity" or "just quality" — first work out *which* of the three contrast axes (traditional/modern, tier, vintage) the pair is actually built on, because that determines where part (b)'s marks sit. `2026_p2_q3`.

### Pre-taste decision branches

#### Branch 2.1 — Same country, different varieties (F2a)

Working priors per country: France ⇒ Pinot/Cabernet/Syrah/Grenache; Italy ⇒ Nebbiolo/Sangiovese/Aglianico/Nerello; Spain ⇒ Tempranillo/Garnacha/Mencía/Monastrell.

#### Branch 2.1b — Same country, different varieties, market-fluency/showcase structure (2026 addition)

Triggers: inverted mark order (style/commercial heaviest and first, identification lightest and last).

Working priors: widen the France line-up beyond Burgundy/Bordeaux/Rhône anchors to include a genuinely light-bodied, cool-climate single-varietal tour — Loire Cabernet Franc, Beaujolais cru Gamay, Jura Trousseau/Poulsard, Northern Rhône Syrah — alongside the classic-region defaults. For Italy, expect a Nebbiolo/Sangiovese/southern-Italy (Primitivo, Nero d'Avola) spread rather than three DOCG flagships. Evidence: `2026_p2_q1`.

#### Branch 2.2 — Same region, internal variety / style spread (F2b)

Working priors: Bordeaux left bank vs right bank vs Côtes; Burgundy village vs premier cru vs grand cru; Chianti Classico vs Rufina vs Brunello; Côte-Rôtie vs Hermitage vs Cornas.

#### Branch 2.3 — Same origin, different age / elevage (F2d)

Working priors: Rioja classification ladder, Burgundy vintage stack, Brunello vs Riserva, Côte-Rôtie new vs old release.

#### Branch 2.4 — Multi-pair same-region flight, three contrast axes (2026 addition)

Triggers: several 2-wine pairs, each pair sharing a country + region, each pair drawn from a different country than the other pairs. Once the pair's region is locked, identify which of three contrast axes the examiner has built the pair around — this decides what to actually write in the style/quality comparison:

1. **Traditional vs modern winemaking within the same appellation** — same grapes, same region, deliberately different philosophy (extended ageing in old American oak and a classification-ladder wine, vs shorter time in large neutral French oak and a single-parcel "vin de terroir" bottling that ignores the ladder). Evidence: `2026_p2_q3` Rioja pair — La Rioja Alta Viña Ardanza Reserva 2019 (80/20 Tempranillo/Garnacha, American oak, 36/30 months, wears its Reserva classification) vs Artuke Paso Las Mañas 2021 (100% Tempranillo, single parcel El Chorro in Rioja Alavesa, large French foudre with ~15% new oak, deliberately unclassified).
2. **Quality tier / classification within the same appellation** — same style envelope, different rung on the region's own quality ladder (large-volume commercial-house entry wine vs single-vineyard top cuvée). Evidence: `2026_p2_q3` Chianti Classico pair — Melini I Sassi 2021 (GIV-owned, ~4 million bottles, annata, ~$12–15) vs Castello di Ama Gran Selezione San Lorenzo 2021 (single-vineyard, 80/13/7 Sangiovese/Merlot/Malvasia Nera, ~$70–75).
3. **Vintage** — same producer tier/style, different year, testing whether the candidate reads maturity/structure back to a specific vintage character rather than just calling "older vs younger." Evidence: `2026_p2_q3` Margaux pair — Château Giscours 2017 (3ème Cru, frost-hit lighter vintage, shorter ~6–8 year drinking window) vs Château Rauzan-Ségla 2016 (2ème Cru, structured classic vintage, peak 2028–2038). Cross-reference: this is the same examiner move as the older explicit-vintage F7 questions (`2016_p2_q3`, `2021_p2_q1`) — commit to which wine is earlier/later and justify from colour, tannin resolution, and fruit-vs-tertiary balance rather than describing development in isolation.

### Tasting branch order (F2)

1. Confirm regional signature on the most typical wine
2. Lock the origin
3. For each wine (or pair), treat origin as bound; diagnose only the internal divergence axis
4. **For multi-pair flights specifically, name the contrast axis (traditional/modern, tier, or vintage) before writing the comparison** — see Branch 2.4
5. Quality / classification calibration last

### Matrix-writing template (F2)

Per wine (or pair):
- Bound origin and signature
- Divergence axis (variety / sub-region / age / classification / **traditional-modern / tier / vintage for multi-pair flights**)
- Position on that axis
- Quality in classification language
- Maturity / potential

---

## F4 Mixed Identification Breadth Set (P2)

Sixteen P2 questions — the single biggest taxonomy bucket in P2. The anti-overlink discipline that the remaining-work doc asks for sits primarily here, including the indigenous-Europe and "different countries, different varieties" sub-forms. Tagged: `2015_p2_q2`, `2016_p2_q5 (F4c)`, `2017_p2_q1`, `2017_p2_q3`, `2018_p2_q1 (F4c)`, `2018_p2_q4`, `2019_p2_q2`, `2019_p2_q3 (F4c)`, `2021_p2_q2`, `2021_p2_q3`, `2021_p2_q4`, `2023_p2_q2`, `2023_p2_q3`, `2024_p2_q2 (F4c)`, `2025_p2_q3 (F4c)`, `2026_p2_q2 (F4a)`.

### Pre-taste objective

Treat each wine as an independent identification problem. The only safe linking assumption is paper context (all red) and broad theme cues.

### Stem triggers

- "different countries"
- "different varieties"
- "from across Europe" (or analogous regional framing)
- breadth-test secondary tag
- the final question of the paper (recurring curveball slot)

### Default candidate universe

P2 F4 flights almost always include:
- At least one benchmark international variety (Cabernet, Syrah, Pinot Noir)
- At least one indigenous variety (Cabernet Franc / Sangiovese / Tempranillo / Touriga Nacional / Nebbiolo / Xinomavro / Blaufränkisch / Pinotage)
- Often one curveball variety (Zweigelt, Lagrein, Carmenère, Mencía, Saperavi)

For "Europe, but not France/Italy/Spain" stems (e.g. 2019 P2 Q3 template):
- Portugal (Touriga Nacional), Austria (Blaufränkisch / Zweigelt), Greece (Xinomavro / Agiorgitiko), Hungary (Kékfrankos / Cabernet Franc), Germany (Spätburgunder), Croatia / Slovenia (Plavac Mali / Refošk)

**2026 addition — attested high-alcohol, powerful-style three-country breadth flight:** a "different countries" `F4a` stem can also be built around a shared *style* thread (power/concentration/high abv) rather than a shared theme of origin or indigenous status. `2026_p2_q2` ("Wines 4-6 are from three different countries") fielded Amarone della Valpolicella Riserva Vigna Garzon, Pieropan (Veneto, Italy — appassimento-concentrated); Shiraz The Factor, Torbreck (Barossa, Australia); and Cabernet Sauvignon TD-9, Shafer (Napa, USA) — all in the 15–16% abv range. This confirms the existing "one benchmark international variety plus one or two regional signatures" leaf (Shiraz as the benchmark, Amarone and Napa Cab as regional signatures) but adds concentration/power as a recognisable organising thread worth naming early in the tasting.

### Default rule-outs

- Predicting one country for the whole flight
- Predicting one grape for the whole flight
- Building the flight around a "hidden organising theme" that does not actually narrow the candidate set

### Main traps

- Mental contagion: wine 2's identity shifts to fit wine 1
- Over-locking on indigenous-Europe candidates that look famous on paper but rarely show up (Zweigelt is more likely than Lemberger; Xinomavro more likely than Limnio)
- Final-question fatigue: time pressure plus broad scope makes this the worst slot for over-commitment
- **Pale-red trap:** a pale, translucent, high-acid wine in a breadth flight is not automatically Pinot Noir or Gamay — Trousseau/Poulsard (Jura) and other pale indigenous reds share that profile. Confirmed on the F2a/F1 face of this trap by `2026_p2_q1`; carry the same caution into F4 breadth flights where a pale wine could as easily be a curveball indigenous variety as Pinot Noir.
- **Varietally-labelled-but-actually-a-blend trap (EK-0083, P2 face):** a New World wine labelled and sold as a single variety is not guaranteed to be that variety alone. `2026_p2_q2` wine 6, Shafer TD-9 (Napa), is labelled "Cabernet Sauvignon" but is actually 76% Cabernet Sauvignon / 11% Merlot / 10% Petit Verdot / 3% Malbec. EK-0083 measured near-zero top-1 credit across the corpus when a tree single-locks a blend to one grape instead of naming the dominant variety and flagging the blend possibility — the fix is the same here: name the dominant variety for the variety+region target, but widen to a Bordeaux-blend candidate set (mention the blend as a hedge) whenever structure or aromatics suggest more than one grape (extra tannic backbone, layered dark fruit, a softer mid-palate lift beyond what pure Cabernet typically shows), rather than single-locking the varietal label at face value.

### Pre-taste decision branches

#### Branch 4.1 — Pure breadth (F4a)

Triggers: "different countries", "different varieties", no shared anchor.

Build a slot-by-slot ballot. Reserve diversity across the flight (at least three continents or four countries unless stem narrows). `2026_p2_q2` is a clean corpus example of this branch: "Wines 4-6 are from three different countries" with no other shared-theme wording, resolving to Italy/Australia/USA.

#### Branch 4.2 — Loosely linked (F4b)

Triggers: one country contributes two wines or one local pair exists in a flight that is otherwise broad.

Resist the urge to over-link the pair. Treat them as a sub-question inside the broader breadth question.

#### Branch 4.3 — Hidden organising theme (F4c)

Triggers: subtle theme in the stem ("all share oak influence", "all are indigenous European varieties", "all are classic European origins").

Treat the theme as a filter, not a narrower. The theme should rule out impossible candidates, not drive a single answer.

#### Branch 4.4 — Final-question P2 ambush

Triggers: final P2 question position, broad mark allocation, mixed-bag wording.

Standard template (corpus-supported): one Loire Cab Franc + one German Spätburgunder + one Pinotage + one Italian indigenous variety (Lagrein / Aglianico / Sagrantino) is a recurring shape.

### Tasting branch order (F4)

Per wine:

1. Colour and intensity
2. Aroma family (red / black fruit weight, pyrazine, spice profile)
3. Structure (tannin grain, acid, alcohol)
4. Climate signal (cool / moderate / warm)
5. Best-match grape family for that climate × profile
6. Best-match origin for that grape family
7. Quality tier

Reset between wines.

### Branch-specific candidate narrowing (F4)

- **Translucent ruby + pure cherry / strawberry + delicate ⇒** Pinot Noir or Gamay. Burgundy / Germany / NZ Pinot; Beaujolais cru Gamay.
- **Cassis + cedar + firm tannin ⇒** Bordeaux family from any reasonable origin. If the wine is a dense, structured New World Cabernet with extra layers of dark fruit or a softer mid-palate lift beyond typical pure-Cab texture, keep a Bordeaux-blend hedge alive even if the front label reads as a single varietal — see the varietally-labelled-but-actually-a-blend trap above (`2026_p2_q2`, Shafer TD-9).
- **Pepper + meat + violets + savoury ⇒** Syrah, especially cool-climate.
- **Tomato leaf + savoury red fruit + firm acid ⇒** Cabernet Franc (Loire / Hungary / Stellenbosch).
- **Blue-black fruit + alpine spice + structured tannin + freshness ⇒** Blaufränkisch / Zweigelt / Lagrein.
- **Dried herb + meaty + dense + smoky ⇒** Xinomavro / Agiorgitiko / southern-Italian indigenous.
- **Sour cherry + dust + savoury + medium body ⇒** Sangiovese / Tempranillo (climate cue separates).
- **Sweet plum + soft tannin + chocolate ⇒** Merlot-dominant from warmer climate.
- **Dense smoky + tarry + cocoa + ferrous ⇒** Pinotage / Cape Bordeaux blend.

### When to stay broad vs commit (F4)

- Commit early only when the sensory signature is iconic.
- Stay broad on origin when grape is ambiguous (give two plausible candidates with reasoning).
- Allow yourself to repeat a country across slots if sensory evidence justifies it.
- Stay broad on composition when a New World single-varietal label sits on top of a structurally denser-than-typical wine — name the dominant variety for the variety+region target but hedge with a blend candidate rather than single-locking (EK-0083; `2026_p2_q2`).

### Matrix-writing template (F4)

Slot-by-slot, not flight-level. Per wine:
- One-sentence sensory snapshot
- Best-guess variety
- Best-guess origin
- Branch-B alternative
- One method comment if marks demand it
- Quality tier

Explicit reminder at the top: "do not infer wine N from wine N−1."

---

## F7 Hierarchy / Quality Calibration Set (P2)

Two P2 questions in the corpus: `2016_p2_q3 (F7d)`, `2021_p2_q1 (F7d)`. Small but high-value family, usually built around a benchmark European region with vintage / age / classification spread.

### Pre-taste objective

Convert classification / age / hierarchy language in the stem into a working ladder and explain each wine's position on it.

### Stem triggers

- "Identify the producer and the classification"
- Multiple cuvées from the same region in a quality ladder
- "the maturity and the potential for development" as a heavy mark band
- Wines obviously of related provenance with different age statements or tier indicators

### Default candidate universe

- **STRONG SIGNAL:** Burgundy village → premier cru → grand cru; Bordeaux cru bourgeois → classified growth; Rioja Crianza → Reserva → Gran Reserva; Brunello → Brunello Riserva; Côte-Rôtie standard → single-vineyard; Barolo communal → MGA.
- **PLAUSIBLE:** Cape Bordeaux blend tiers; Napa AVA tiers; Australian icon-wine ladders.
- **CURVEBALL:** modern producer hierarchies that do not match the legal classification (e.g. premium IGT outside the DOCG tier).

### Default rule-outs

- Predicting any non-European tier system on stems heavy with "classification" language unless the marks allow it

### Main traps

- Locking the classification before the tasting evidence supports it
- Over-claiming tier — examiners reward conservative calibration

### Pre-taste decision branches

#### Branch 7.1 — Same producer, multiple cuvées (F7b)

Working priors: top-Bordeaux estate range, top-Burgundy domaine range, top-Brunello producer range.

#### Branch 7.2 — Same region, classification ladder (F7a)

Working priors: Burgundy classification, Médoc 1855, Saint-Émilion classification, Rioja age-classification, Chianti / Brunello tier.

#### Branch 7.3 — Age / maturity ladder (F7d)

Working priors: vintage stack of a single cuvée; Crianza / Reserva / Gran Reserva ladder.

### Tasting branch order (F7)

1. Confirm region
2. Place each wine on the ladder by concentration, length, complexity, integration
3. Translate tier into classification language
4. Maturity / potential overlay

### Matrix-writing template (F7)

Per wine:
- Region lock
- Classification tier (with one alternative)
- Quality justified in classification language
- Maturity / potential
- Producer / cuvée guess optional and last

---

## Highest-priority unfinished work for P2

The remaining-work doc named these as top priorities:

| Priority | Item | Status |
| --- | --- | --- |
| 4 | P2 F3 blend tree | **Built (Bordeaux + GSM + Iberian + Tuscan + Cape branches)** |
| — | P2 F4 anti-overlink rules | Built (Branch 4.1–4.4) |
| — | P2 F1 Pinot / Syrah / Cabernet / regional same-variety | Built |
| — | P2 F2 country / region / hierarchy splits | Built |
| — | P2 F7 classification ladders | Built |

Remaining (lower priority):
- Targeted patches against weak LOYO folds only when failures recur across at least two questions
- Future expansion if the corpus accumulates more `F3a` (single blend family, multi-origin) cross-country sets

## How this pack interacts with the master tree

- `p2_reds_tree.md` remains the entry point. Read it first.
- Switch into the family section here as soon as the stem reveals the family.
- The two layers are consistent; this pack expands the family layer that the master tree references but does not unfold fully.

## Provenance

All evidence citations are taxonomy-index questions (see `outputs/heuristics/question_taxonomy_index.md`). Working priors and anti-collapse rules are generalised from at least two corpus questions per family.
