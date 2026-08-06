---
paper: 3
tree_name: P3 Special Master Decision Tree
generated: 2026-05-25
last_refactored: 2026-05-30  # Layer B rerooted on visual appearance (visual triage promoted from Layer A.5 to the trunk of the in-glass tree)
last_resynthesized: 2026-08-06  # routing-sweep fix pass (D4-D7, see coverage note): leaf back-fill vs own evidence, Branch 7.8 same-single-variety, Branch 4 vs 7.3 gate, 7.1 guard, rosé leaf, Branch 6 frequency + 7.4/7.5 factual corrections. Prior resynthesis 2026-08-05 incorporated 2026_p3_q1 (4-country sparkling opener, zero Champagne) and 2026_p3_q2 (8-wine, 4-pair same-region flight)
last_patched: 2026-08-06  # blind-redo audit found 2018_p3_q2 (all-still-white same-country France trio) in questions_analyzed but cited by NO branch; added Branch 5 still-white prestige tour leaf (PLAUSIBLE), broadened Branch 7.3, made anti-collapse rule two-sided
questions_analyzed: [2015_p3_q1, 2015_p3_q2, 2015_p3_q3, 2016_p3_q1, 2016_p3_q2, 2016_p3_q3, 2016_p3_q4, 2017_p3_q1, 2017_p3_q2, 2017_p3_q3, 2017_p3_q4, 2017_p3_q5, 2017_p3_q6, 2018_p3_q1, 2018_p3_q2, 2018_p3_q3, 2019_p3_q1, 2019_p3_q2, 2019_p3_q3, 2019_p3_q4, 2019_p3_q5, 2021_p3_q1, 2021_p3_q2, 2021_p3_q3, 2022_p3_q1, 2022_p3_q2, 2022_p3_q3, 2023_p3_q1, 2023_p3_q2, 2023_p3_q3, 2023_p3_q4, 2024_p3_q1, 2024_p3_q2, 2024_p3_q3, 2024_p3_q4, 2025_p3_q1, 2025_p3_q2, 2025_p3_q3, 2026_p3_q1, 2026_p3_q2]
accuracy_target: variety + region (not exact wine)
---

# P3 Special - Master Decision Tree

## Accuracy target
This tree targets **variety + region** accuracy. Producer, vintage, and vineyard identification are bonus, not the target. A correct prediction = right variety AND right country/region, with method/style category often equally important on Paper 3.

## P3 order of operations (how to use this tree)

Paper 3 is the **only** paper where you should let your eyes lead. The production family — sparkling, sweet, rosé, orange, fortified, oxidative — is usually obvious at a glance, and the family is what carries the marks on P3. So the operational sequence is:

1. **LOOK first (Layer B, Step 1 — the trunk).** Before lifting a glass, scan the whole flight and visually sort every wine into a production family: bubbles? pink? deep gold/amber and thick? mahogany/brown? deep opaque red? copper/orange? This single step collapses "could be anything" into a specific family.
2. **Confirm with one sniff + one sip (Layer B, Step 2 — the confirmation gate).** Resolve the few visual ambiguities — chiefly spirit heat, sweetness vs acid, mousse persistence, flor vs oxidative markers.
3. **Drop into the matching family sub-tree (Layer B, Step 3).** Each visual gate routes to one sensory sub-tree below.
4. **Layer in the stem (Layer A) to narrow region/variety.** On P3 the stem mostly tells you the *structure of the flight* and the commercial framing; use it to pin country/variety once the family is fixed.

Read Layer A first if you have the question paper in hand — it is genuine pre-tasting context — but the **in-glass workflow begins with the visual trunk in Layer B**, not with variety guessing.

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

**Known unroutable constructions** (from the Era-1 blind test): vintage verticals, price ranking,
open-vs-blind or Old-World-vs-New-World paired grids, and single-wine isolation questions.

**Paper 3 fallback prior** (2015-2026, 132 wines): Chardonnay/Pinot Noir 10%, Chardonnay 8%,
Touriga Nacional/Touriga Franca 8%, Riesling 8%, Sémillon/Sauvignon Blanc 7%, Palomino 6%.
Countries: France 36%, Spain 12%, Portugal 12%, Italy 10%, Germany 5%, USA 5%. **P3 is the weakest
tree and ties for worst coverage** (variety top-1 20%, in-set 51% on the Era-1 blind test), so the
fallback fires most often here — and the visual trunk in Layer B matters most when it does.

**Then let the glass lead.** With no branch to narrow on, sensory evidence carries more weight than
usual — go to Layer B early and rank on what is actually in front of you.

## Layer A - Pre-tasting decision tree (question stem only)

### Branch 1: P3 Q1 / sparkling-led opening flights
**Historical frequency:** sparkling or sparkling-adjacent opening flight in 8 of 11 sat years (2019 P3 Q1, 2021 P3 Q1, 2022 P3 Q1, 2023 P3 Q1, 2024 P3 Q1, 2026 P3 Q1, plus 2018 P3 Q1 and 2025 P3 Q1 as style-spanning openings).

#### Sub-branch: explicit sparkling, often non-Champagne
- **Leaf (default) — REVISED 2026:** STRONG SIGNAL: non-Champagne sparkling fills most or all of the country slots, spanning BOTH traditional method and tank/ancestral method within the same flight — treat method diversity as co-equal with country diversity, not a secondary detail. PLAUSIBLE: Champagne (see "often absent" below — do not assume it as the anchor wine). CURVEBALL: one still or sweet wine from the same grape if the stem says "same single grape variety."
- **Leaf (stem says "not from Champagne" or names multiple traditional-method countries):** STRONG SIGNAL: Xarel-lo/Macabeo/Parellada (Cava/Spain), Chenin Blanc (Crémant de Loire/Vouvray traditional method), Pinot Blanc/Auxerrois (Crémant d'Alsace), Chardonnay (Crémant de Bourgogne/English sparkling), Riesling (German Sekt), Lambrusco (Emilia-Romagna ancestral method). PLAUSIBLE: Chardonnay/Pinot Noir (English sparkling, Franciacorta, Cap Classique), Glera (Prosecco if tank-method diversity wanted). *Rationale: non-Champagne traditional method tests breadth beyond Chardonnay/Pinot Noir — Cava's native grapes, Crémant's regional variants, English sparkling's cool-climate Champagne-analogues, and ancestral-method Lambrusco are the core alternatives. See 2023 P3 Q1, 2026 P3 Q1.*
- **Leaf (two wines, non-Champagne, commercial framing heavy):** STRONG SIGNAL: California traditional-method Chardonnay/Pinot Noir, Cava native grapes (Xarel-lo/Macabeo/Parellada). PLAUSIBLE: English sparkling, Crémant. CURVEBALL: Prosecco. *Rationale: this structure is usually a prestige-vs-scale commercial comparison rather than a broad geography quiz. See 2024 P3 Q1.*
- **Leaf (stem says "N different countries," no explicit exclusion of Champagne) — NEW, CONFIRMED 2026:** STRONG SIGNAL: expect 3-4 of the country slots to go to non-Champagne origins, and expect the flight to deliberately mix production methods (traditional + tank/ancestral) so that part (c) "key winemaking decisions" has real contrast to reward. PLAUSIBLE: Champagne occupies one slot. CONFIRMED LIVE POSSIBILITY: Champagne is absent entirely. *2026 P3 Q1 ("four different countries," 100 marks, no stem exclusion of Champagne) ran Italy (Lambrusco del Fondatore, Emilia-Romagna, ancestral method/metodo ancestrale, RS 3.15 g/L, 11.5%), Spain (Cava Reserva, Dominio de la Vega, Utiel-Requena — a Cava zone outside the Penedès core, traditional method, 100% Macabeo, 18 months lees), France-but-not-Champagne (Vouvray Brut, Château Moncontour, Loire, traditional method, Chenin Blanc, ~11 g/L dosage), and England (Blanc de Blancs, Harrow & Hope, Thames & Chilterns, traditional method, 8.1 g/L dosage, 50% oak-puncheon ferment, ~34-35 months lees) — zero Champagne. Do not treat "sparkling, four countries" as code for "Champagne is one of them"; the examiner can and did spend all four country slots on breadth instead. Champagne is not necessarily withheld from the paper altogether — in 2026 it surfaced instead as one wine in a same-region PAIR later in the paper (see Branch 6) — so its absence from the opener does not mean its absence from P3.*
- **Rosé qualifier + paired-country structure (2022 P3 Q1, noted 2026-08-06):** "all sparkling rosé wines" with a 2+2 country split ("wines 1 and 2 are from one country, and wines 3 and 4 are from another") ran Prosecco rosé + Lambrusco (Italy) against Champagne rosé + Crémant de Bourgogne rosé (France). The rosé qualifier does not change this leaf's country logic, but read it back deliberately: pick rosé-capable candidates per country (Lambrusco, Prosecco rosé, Champagne rosé, Crémant de Bourgogne rosé, English/NZ sparkling rosé) rather than silently reusing the white-sparkling list, and let the 2+2 wording pair the wines by country before tasting.
- **Method-diversity axis (NEW, 2026 P3 Q1):** when a sub-question explicitly rewards "key winemaking decisions" (here, 7 of 25 marks per wine), expect the flight to be built to contrast production METHOD, not just geography. 2026 ran ancestral (Lambrusco, unfiltered bottle-refermented, low dosage) / traditional-Cava (18 months lees) / traditional-Vouvray (~11 g/L dosage) / traditional-English (extended ~34-35 month lees, part oak-fermented) — i.e. one ancestral-method wine plus three traditional-method wines at meaningfully different lees ages and dosage levels. Name lees duration and dosage level explicitly wherever the mark scheme singles out "winemaking decisions" — a bare "traditional method" answer under-serves that sub-question.
- **Evidence:** 2021 P3 Q1, 2022 P3 Q1, 2023 P3 Q1, 2024 P3 Q1, 2025 P3 Q1, 2026 P3 Q1. Era-1 validation: 2014 P3 Q1 ("from four different countries. None of the wines are from Champagne") resolved to Cava/Vouvray Chenin/German Sekt Riesling/Carneros Chardonnay — the not-from-Champagne leaf retro-fits a pre-corpus year 4/4. 2015 P3 Q1's sparkling half (Champagne extra brut + Cornwall English sparkling rosé) also belongs here — its stem's yeast wording routes to Branch 3, whose corrected yeast fork now points the autolysis wines back to this branch.
- **Region distribution:** STRONG SIGNAL: Penedès/Cava (including value/high-altitude zones outside Penedès proper, e.g. Utiel-Requena — 2026 P3 Q1), English sparkling (West Sussex/Hampshire/Thames & Chilterns/Cornwall — 2015 P3 Q1), Crémant d'Alsace, Crémant de Bourgogne, Vouvray/Loire traditional method, Emilia-Romagna Lambrusco (ancestral method), California/Anderson Valley, German Sekt/Rheingau. PLAUSIBLE, DEMOTED FROM DEFAULT: Champagne — not to be assumed present just because the stem says "sparkling"; 2026 P3 Q1 shows a 4-country opener can exclude it entirely even without the stem explicitly excluding it (see leaf above). Also PLAUSIBLE: Prosecco Superiore DOCG if style/commercial position is the main discussion; Franciacorta; New Zealand traditional-method sparkling (Pinot Noir/Chardonnay, incl. sparkling rosé — 2017 P3 Q1; NZ was previously named in no P3 sparkling leaf at all). CURVEBALL: Riesling Sekt plus still Riesling plus sweet Riesling in one set (2025 P3 Q1).

### Branch 2: residual sugar / sweet wine mechanism questions
**Historical frequency:** one of the strongest recurring P3 structures (2015 P3 Q3, 2017 P3 Q3, 2019 P3 Q5, 2021 P3 Q2, 2022 P3 Q2, 2024 P3 Q4; sweet wines also recur elsewhere in 2023 P3 Q3 and 2025 P3 Q3).

#### Sub-branch: explicit RS and alcohol asked
- **Leaf:** STRONG SIGNAL: one wine each from the five main sweetness mechanisms. PLAUSIBLE: Sauternes/Tokaji/German sweet overlap, Vouvray demi-sec/moelleux, VDN Muscat. CURVEBALL: sweeter oxidative or fortified styles crossing categories.
- **Evidence:** 2015 P3 Q3, 2019 P3 Q5, 2021 P3 Q2 (primary home: Branch 7.6 — its stem says "different methods of production"; cited here for the RS reference only), 2022 P3 Q2, 2024 P3 Q4.
- **Region distribution:** STRONG SIGNAL: Canada Icewine (Vidal or Riesling), Austria/Germany BA or TBA (the Austrian BA slot is typically Welschriesling or a Welschriesling/Chardonnay cuvée, Burgenland — 2013 P3 Q3, 2024 P3 Q4; the variety was previously named nowhere), German Prädikat ladder (Mosel, **Nahe** — see 2026 P3 Q2, Rheingau), Tokaji, Vin Santo/Recioto (Trebbiano/Malvasia), Muscat de Beaumes-de-Venise/Rutherglen, Port, Madeira, Vouvray/Chenin Blanc. PLAUSIBLE: Sauternes/Barsac (confirmed again as a live RS-heavy pairing in 2026 P3 Q2 — Barsac 1er Cru 158 g/L vs unclassified Sauternes ~125 g/L), Monbazillac, Alsace VT/SGN; Pantelleria passito (Zibibbo/Muscat of Alexandria — 2019 P3 Q5, 2012 P3 Q4: the mechanism was contained but the appellation was never named). CURVEBALL: Australian tawny or dry-furmint-to-Aszu mixed sets; and — each attested once, flags to widen, not predictors — Jurançon Petit Manseng passerillage (2013 P3 Q3), Tasmania botrytis Riesling (2012 P3 Q3), Anderson Valley late-harvest Gewürztraminer (2017 P3 Q3), Stellenbosch Noble Late Harvest Chenin (2022 P3 Q2).
- **Practical rule:** in the five-mechanism sweet-wine flight, preserve one candidate for each mechanism before ranking within a mechanism. Do not let one grape family crowd out Vidal, Muscat, Chenin, or Vin Santo grapes when RS and alcohol clearly point to different production routes.
- **Dry-anchor rule (New World — added 2026-08-06 after three independent misses):** when a sweet/RS flight includes a dry or off-dry anchor wine, the examiner has repeatedly drawn it from NEW WORLD aromatics — Marlborough Riesling (2017 P3 Q3, 2025 P3 Q1) and Marlborough Gewürztraminer (2022 P3 Q2). STRONG SIGNAL for the anchor slot: New Zealand (Marlborough) aromatic white. The previously Euro-only candidate lists conceded the region on this exact slot all three times.
- **German origin note (2026):** do not default every German Riesling to Mosel or Rheingau. 2026 P3 Q2's driest and sweetest wines in the same pair (Trocken GG-tier vs Spätlese) both came from **Nahe** (Jakob Schneider, Niederhäuser Hermannshöhle vs Norheimer Kirschheck) — treat Nahe as a live, examinable German region alongside Mosel and Rheingau, not a curveball.

### Branch 3: fortified / oxidative / biologically aged questions
**Historical frequency:** recurring throughout the middle and back half of P3.

#### Sub-branch: origin + winemaking heavily marked
- **Leaf:** STRONG SIGNAL: Sherry, Madeira (noble Sercial/Verdelho/Bual/Malmsey AND workhorse Tinta Negra — the grape behind 3-5yo blends and many Colheitas, 2015 P3 Q2, 2021 P3 Q3; previously only the noble four were named anywhere), Port. PLAUSIBLE: Vin Jaune/Jura oxidative, Marsala, VDN, oxidative Tokaji/Szamorodni. CURVEBALL: amber/orange wines when the stem suppresses origin and emphasizes style.
- **Evidence:** 2015 P3 Q1 (see the corrected yeast fork below — only half this flight is fortified/oxidative), 2016 P3 Q2, 2016 P3 Q4 (post-hoc citation — no fortified/oxidative trigger word in that stem; primary home: Branch 4 same-producer row), 2017 P3 Q2, 2017 P3 Q6, 2019 P3 Q4, 2021 P3 Q2 (primary home: Branch 7.6 — cited here because its fortified trio resolves via this branch's lists), 2021 P3 Q3 (primary home: Branch 6 — the pairs were fortified, so this branch's Jerez/Madeira knowledge applies), 2024 P3 Q2, 2026 P3 Q2 (Douro pair — Tawny vs LBV Port).
- **Practical rule (yeast fork — corrected 2026-08-06):** yeast has three exam modes, not one: autolysis (traditional-method sparkling — Branch 1), flor/voile (Sherry, Vin Jaune — this branch), and both in one flight. A "role of yeast" stem must keep sparkling candidates alive: 2015 P3 Q1 — this branch's own founding evidence — spanned Champagne extra brut + Cornwall English sparkling rosé + Fino + Vin Jaune, and the old flor-only reading of the trigger missed half its own flight. If oxidation, fortification, or same-producer different styles are central, jump straight to fortified/oxidative families; if the word is "yeast" alone, split candidates between autolysis and flor/voile before committing.
- **Oxidative-vs-reductive Port confirmed (2026):** 2026 P3 Q2 ran a 20-Year-Old Tawny (Kopke, 20%, RS 121 g/L, long oxidative cask ageing) against a Late Bottled Vintage (Taylor's, 19%, 4-6 years in wood then filtered and bottled — much less oxidative exposure and no further bottle development expected). Within a same-region Port pair, "cask-oxidative, high RS, tawny colour, nutty/caramel" vs "reductive-leaning after filtration, deep ruby-garnet, more primary fruit" is the default fork to name.

### Branch 4: same region producing multiple styles
**Historical frequency:** a recurrent P3 trick because one region can generate dry, sweet, sparkling, or oxidative variants. See also Branch 6, the paired/lettering-restart variant of this same test confirmed at scale in 2026 P3 Q2.

#### Sub-branch: compare styles from one region
- **Leaf:** STRONG SIGNAL: Champagne, Prosecco, Jura (Chardonnay/Savagnin — the 2024 P3 Q2 ouillé-vs-sous-voile pair was Chardonnay, and no variety was previously attached to Jura anywhere in the tree), Sauternes/Barsac, Jerez, Madeira, Douro (Port), German Prädikat estates (Mosel, Nahe, Rheingau). PLAUSIBLE: Tokaj (dry Furmint vs Aszú — 2023 P3 Q3), Rioja, Vouvray, Cava/Penedes, Valpolicella (Ripasso vs Recioto vs Amarone, Corvina-led — the one region actually fielded for the same-region-AND-producer form, 2016 P3 Q4, yet previously absent from this leaf despite Layer B citing that question). CURVEBALL: regions where one wine is dry and another sweet but the candidate overcommits to different origins.
- **Evidence:** 2018 P3 Q1, 2019 P3 Q1, 2019 P3 Q2, 2019 P3 Q4, 2024 P3 Q2, 2024 P3 Q3, 2026 P3 Q2 (four pairs, all same-country-and-region: Champagne, Douro, Sauternes/Barsac, Nahe), 2016 P3 Q4 (Valpolicella, same region AND producer: Ripasso vs Recioto), 2023 P3 Q3 (Tokaj: dry Furmint vs Aszú), 2012 P3 Q1 (era-1 — Champagne, same producer: vintage vs NV).
- **Routing gate vs Branch 7.3 (added 2026-08-06 — both triggers literally match any two-wine same-region P3 stem, with no gate between them):** decide by the sub-questions and the wine count. Enter **Branch 4** when any of: (a) compare/contrast language on style, winemaking, or production method appears ("Compare the production methods…" — 2019 P3 Q1, 2019 P3 Q2, 2023 P3 Q3, 2024 P3 Q2); (b) the stem says "same producer" (2012 P3 Q1, 2016 P3 Q4 — then use the same-producer row in Layer B); (c) the flight is three or more wines (2024 P3 Q3 — the two-wine 7.3 trigger cannot fire). Enter **Branch 7.3** only for a bare two-wine pair with per-wine identify/quality asks and no compare language (2017 P3 Q5). This gate is what keeps 7.3's still-red prior away from flights like the 2024 P3 Q2 Jura whites and the 2023 P3 Q3 Tokaj pair, where it would have misled.

### Branch 5: rose / unusual still / mixed-bag P3 questions
**Historical frequency:** small in number but disproportionately dangerous.

#### Sub-branch: mixed bag with classification/commercial emphasis
- **Leaf:** STRONG SIGNAL: classification-heavy categories where style is inseparable from appellation or age statement. PLAUSIBLE: rose by provenance (see the dedicated rosé leaf below), Grenache across dry/fortified contexts, dry Furmint/Tokaji, southern French oxidative categories; also PLAUSIBLE as a family — commercial/mass-market California styles: White Zinfandel blush (2017 P3 Q1), Moscato (2012 P3 Q4), off-dry red blend (2014 P3 Q4), sparkling Zinfandel rosé (2012 P3 Q2) — a "to whom will this wine most likely appeal" sub-question is the tell that the examiner has gone mass-market, not classical. CURVEBALL: orange wine, amber wine, odd grape/region combinations — attested orange candidates: Georgian Rkatsiteli (qvevri, Kakheti — 2014 P3 Q3) and Margaret River Sauvignon Blanc skin-contact (2017 P3 Q2).
- **Evidence:** 2017 P3 Q1, 2017 P3 Q2, 2018 P3 Q2 (still-white prestige tour leaf), 2018 P3 Q3, 2023 P3 Q4, 2025 P3 Q2, 2025 P3 Q3; era-1: 2013 P3 Q1 (same-country all-sparkling trio), 2014 P3 Q3 (rosé + qvevri orange, no origin asked); 2019 P3 Q3 and 2023 P3 Q2 (hidden all-rosé flights — see the rosé leaf).
- **Leaf (rosé — named in the stem OR revealed in the glasses) — BUILT 2026-08-06 (the rosé lane previously routed cleanly but contained almost no candidates; two of 2017 P3 Q1's three answers were absent from the entire tree):** STRONG SIGNAL: Côtes de Provence blends (Grenache/Cinsault ± Syrah/Mourvèdre/Rolle/Vermentino, from commercial dry rosé to oak-influenced prestige and Cru Classé) — five corpus appearances (2014 P3 Q3, 2017 P3 Q1, 2019 P3 Q3, 2023 P3 Q2, 2025 P3 Q3). PLAUSIBLE: California Zinfandel rosé — White Zinfandel blush and even sparkling Zinfandel rosé (2017 P3 Q1, 2012 P3 Q2); New Zealand Pinot Noir-led rosé — still and traditional-method sparkling (2019 P3 Q3, 2017 P3 Q1). CURVEBALL (one attestation each — flags to widen, not predictors): Rioja rosado (Tempranillo/Garnacha — 2019 P3 Q3), Russian River/Sonoma Pinot Noir rosé (2019 P3 Q3), Portuguese off-dry lightly carbonated rosé (Baga/Rufete — 2023 P3 Q2).
- **Practical rule (hidden rosé):** an all-rosé flight can hide behind a bare "N different countries" stem (2019 P3 Q3 — four rosés, no style keyword, which the old 7.1 fortified default missed 4/4) or behind a "different methods of production" stem (2023 P3 Q2 — three methods expressed entirely in rosé). Rosé is a category the examiner conceals; the visual trunk (Gate 2 pink, Gate 1 pink+bubbles) is what catches it, so never let a stem-side default survive contact with a pink flight.
- **Practical rule (no-origin stem = unusual-style tell):** a P3 stem that asks for method + quality + commercial potential and NEVER asks origin or variety (2014 P3 Q3) is signalling an unusual-style flight (rosé, orange/skin-contact) whose precise identity the examiner does not expect — route here, not to Branch 7.1's fortified default. Single antecedent: a flag to widen, not a predictor.
- **Leaf (same country, three-category spread):** STRONG SIGNAL: Spain with Cava/Penedès + Garnacha still wine (Gredos or similar) + Sherry/Jerez (Palomino). PLAUSIBLE: France with Crémant + still + VDN, Portugal with espumante + still + fortified, Italy with Prosecco/Franciacorta + still + Vin Santo/Marsala — and note 2013 P3 Q1 (era-1) ran Italy as a same-country ALL-SPARKLING trio (Prosecco Superiore DOCG + Lambrusco Grasparossa di Castelvetro + Franciacorta): the single-category inverse trap in sparkling form, from a country this leaf previously listed at no tier.
- **Leaf (same country, single-category still-white prestige tour) — PROMOTED FROM CURVEBALL 2026-08-06:** PLAUSIBLE: a same-country P3 flight with no style keyword can resolve to **all still dry whites** — France fielding prestige whites from regions famous for something else. CURVEBALL: the same move from another country (Spain white Rioja/Rías Baixas/sherry-country table whites; Italy still whites from red-famous regions). *Founding evidence: 2018 P3 Q2 — Domaine de Chevalier Blanc 2010 (Pessac-Léognan: white from red-dominant Graves), Châteauneuf-du-Pape Blanc, Bousquet des Papes 2014 (~5% of the appellation's production), Saint-Romain, Olivier Leflaive 2015 (value-village white Burgundy). The examiner logic is "unusual styles from famous places," squarely inside P3's remit — the unusualness IS the still-wine status on this paper, not a production mechanism. This question sat in `questions_analyzed` but was cited by no branch until 2026-08-06; the stem-only read defaulted to a multi-category spread and missed the family entirely.*
- **Practical rule (single-category tell, weak but real):** a same-country P3 stem whose sub-questions ask only origin/variety + quality-in-regional-context + maturity — with **no** RS/alcohol numbers, no "methods of production," no vintage-identification ask — is compatible with an all-still flight; the mechanism-heavy sub-questions that usually accompany sparkling/fortified/sweet flights are absent. Do not predict still-only from the stem alone, but hold the still-white tour at PLAUSIBLE until the glasses rule: the visual trunk (three pale-lemon dry whites at a glance) settles it in seconds.
- **Anti-collapse rule (two-sided):** if a P3 mixed-bag or same-country question clearly spans sparkling, still, and fortified/sweet categories, never collapse the prediction to one grape family — keep at least one candidate alive for each category represented. The inverse trap also exists: never force a multi-category spread onto a flight the glasses show to be single-category (see the still-white prestige tour leaf above; 2018 P3 Q2 is the corpus proof — and 2013 P3 Q1 is the same trap in all-sparkling form, 2019 P3 Q3 in all-rosé form).

### Branch 6: multi-pair same-region flight (paired production-method contrast)
**Historical frequency — CORRECTED 2026-08-06:** not a 2026 novelty and not "1 of 40". Three corpus instances: 2011 P3 Q1 (era-1 — six pairs / 12 wines, near-identical mark grammar: 8/14/20 marks per pair plus a per-wine ABV/RS block), 2021 P3 Q3 (two pairs / 4 wines), and 2026 P3 Q2 (four pairs / 8 wines, 200 of ~300 marks — the largest flight yet recorded in the corpus). The multi-pair same-region form is a recurring IMW structure distinct from Branch 4; treat it as a live pattern to expect.

#### Sub-branch: stem says "wines X-Y are pairs; within each pair, same country and region"
- **Leaf:** STRONG SIGNAL: draw pairs from the classic "one appellation, two production philosophies" set — Jerez (flor vs full oxidation), Douro (cask-aged Tawny vs bottle-then-filtered LBV/Vintage), Sauternes-Barsac (classified/1er Cru vs unclassified/second label, or two botrytis-severity vintages), German Prädikat ladder from one region, usually a single grower (Trocken GG-tier vs Spätlese/Auslese — not necessarily Mosel; see Nahe note in Branch 2; 2011 P3 Q1's Mosel Kabinett/Spätlese pair ran TWO growers, Prüm vs Haag, so do not eliminate a Prädikat pair on a grower mismatch). PLAUSIBLE: **Madeira pair** — two noble-variety age statements (15yo Verdelho vs 10yo Sercial, 2011 P3 Q1) or workhorse-vs-noble (3yo Tinta Negra blend vs single-harvest Boal, 2021 P3 Q3); both prior Madeira pair-flights missed here because this leaf omitted a region the rest of the tree lists everywhere (back-filled 2026-08-06). Also PLAUSIBLE: Tokaj (5 vs 6 puttonyos Aszú), Jura (Vin Jaune vs Vin de Paille). CURVEBALL: Rutherglen (Muscat vs Topaque fractional-solera pair); a **still dry red pair** — 2011 P3 Q1 fielded Martinborough Pinot Noir x2 (New Zealand) as one of its six pairs (single antecedent: a flag to widen, not a predictor — cf. Branch 7.3's reminder that P3 admits still pairs).
- **Contrast axis to name explicitly for each pair (the examiner builds each pair around ONE production-method fork within a shared origin — identify the fork, not just the appellation):**
  - **dosage/style level within the same base wine and appellation** — Champagne: Brut Nature (0 g/L dosage) vs standard Brut (~9-12 g/L). *2026 P3 Q2 pair 1: Chavost Blanc de Chardonnay Brut Nature (0 g/L, 12.5%) vs Delacourt Brut, an M&S own-label (~12.5%).*
  - **oxidative cask ageing vs reductive/bottle-then-filtered ageing** — Port: extended-cask Tawny vs LBV. *2026 P3 Q2 pair 2: Kopke 20-Year-Old Tawny (20%, RS 121 g/L, long oxidative cask ageing) vs Taylor's LBV 2020 (19%, 4-6 years wood then filtered).*
  - **classified/1er cru vs unclassified/second-label within the same botrytis appellation** — Sauternes-Barsac. *2026 P3 Q2 pair 3: Château Coutet 2022 (Barsac, 1855 1er Cru, RS 158 g/L, 13.5%) vs Château Delmond 2023 (Sauternes, unclassified second label, unoaked, ~125 g/L).*
  - **dry (Trocken, top vineyard) vs Prädikat-sweet (Spätlese), one grower, two vineyards, same region** — Nahe. *2026 P3 Q2 pair 4: Jakob Schneider Niederhäuser Hermannshöhle Trocken 2023 (VDP.GROSSE LAGE, ~2.6-3.8 g/L RS, 12.5%) vs Norheimer Kirschheck Spätlese 2022 (non-Grosse-Lage, ~73 g/L RS, 8.0%).*
  - **prestige-vintage vs NV within Champagne** — *2011 P3 Q1 pair 1: prestige vintage blanc de blancs vs NV brut* (a vintage/lees-age fork rather than a dosage fork — both Champagne forks are live).
  - **satellite AOC vs classified estate within the Sauternes orbit** — *2011 P3 Q1 pair 6: Loupiac (across the Garonne) vs Sauternes 1er Cru* (the classified-vs-unclassified axis stretched across an appellation boundary).
  - **age-statement ladder within Madeira** — *2011 P3 Q1 pair 2: 15yo Verdelho vs 10yo Sercial; 2021 P3 Q3 pair 2: 3yo Tinta Negra blend vs single-harvest Boal.*
- **Evidence:** 2026 P3 Q2 (largest instance; founding evidence for this leaf), 2011 P3 Q1 (six-pair era-1 antecedent), 2021 P3 Q3 (two-pair antecedent — its Madeira pair missed under the old leaf while Branch 3 knew the answer; acknowledged 2026-08-06).
- **Practical rule:** when the stem restarts sub-question lettering mid-question — pair-level (a, b, c) followed by a fresh wine-level (a, b) — read that as a deliberate scope change, not a numbering error: the examiner is switching from "compare the pair" to "state a bare number per wine." That second block is almost always ABV and/or RS — see the ABV/RS calibration aid in Layer B, since 2026 P3 Q2 devoted 48 of 200 marks (24%) to exactly this.
- **Relationship to Branch 4:** Branch 4 covers single wines from one region shown to be capable of multiple styles; Branch 6 is the paired, lettering-restart variant of the same underlying test, scaled up to 8 wines / 4 pairs, with a much heavier (14 marks/pair) "methods of production" component. Where Branch 4 says "keep vintage, lees age, fortification timing... as decision levers," Branch 6 sharpens that into one explicit, nameable production fork per pair.
- **Practical rule (mark allocation):** with 24% of a question's marks riding on bare ABV/RS numbers, do not spend so long on origin/style prose that numeric estimates get rushed or skipped — they are free marks if you have anchor numbers memorized (see Layer B calibration table).

## Layer B - In-glass deductive tree (visual-first)

On P3 the in-glass tree is **rooted in what you see**. Work Step 1 → Step 2 → Step 3 in order. Do not start with variety.

### Step 1: Visual triage (the trunk — do this before lifting a glass)

Scan the whole flight and run each wine through these gates in order. The first gate it trips assigns its production family.

**Gate 1 — Bubbles?**
- **Persistent fine mousse / sustained bead** → SPARKLING. → *Sparkling family sub-tree.*
- **Light spritz / pétillant, bead fading** → semi-sparkling: pét-nat, Lambrusco, frizzante Moscato/Asti, Brachetto d'Acqui (sweet aromatic red spritz, ~5.5% — 2021 P3 Q2), lightly sparkling Vinho Verde, off-dry carbonated rosé (Baga/Rufete, Portugal — 2023 P3 Q2). Keep alive; confirm on palate.
- **Red + bubbles** → sparkling red is live in P3: Lambrusco (incl. Grasparossa di Castelvetro — 2013 P3 Q1), Brachetto d'Acqui (2021 P3 Q2), and as a novelty curveball Australian sparkling Shiraz (2012 P3 Q2 — one attestation, a flag to widen).
- **Pink + bubbles** → sparkling rosé (catch it here, at Gate 1).
- **No bubbles** → Gate 2.

**Gate 2 — Pink?**
- **Pale salmon → deep pink, still** → ROSÉ (or light red). → *Rosé / mixed-bag sub-tree.*
- **Not pink** → Gate 3.

**Gate 3 — Hue, intensity and viscosity.** Split white/amber spectrum from red spectrum.

*White / amber spectrum:*
- **Pale lemon–straw, thin-to-normal tears** → likely DRY STILL WHITE (rare in P3) or light off-dry; low priority. Often the dry "anchor" wine in a same-variety cross-style set (e.g. the dry Riesling/Chenin in a single-grape flight). Confirm RS on palate.
- **Pale lemon–straw but THICK, slow tears (glycerol)** → concentrated sweet at *low* alcohol: ICEWINE / EISWEIN, or young botrytis. → *Sweet-wine sub-tree (Icewine/botrytis lane).*
- **Deep gold → amber, thick tears, NO bubbles** → the central P3 ambiguity — three families share this look: (a) SWEET (botrytis BA/TBA/Sauternes/Tokaji, late-harvest, passito/Vin Santo); (b) OXIDATIVE unfortified (Jura/Vin Jaune, old Vouvray, dry oxidative Tokaji/Szamorodni); (c) lighter FORTIFIED (Amontillado, dry Madeira Sercial/Verdelho). **Do not commit — resolve at Step 2 by spirit heat + sweetness.**
- **Pale tawny / amber-orange** → young Tawny, Amontillado, Palo Cortado, dry Madeira. → confirm spirit heat → *Fortified / oxidative sub-tree.*
- **Copper / orange / amber, no brown, sometimes hazy, possible light tannin** → ORANGE / skin-contact white. → *Rosé / mixed-bag sub-tree (orange lane).* Evidence base: 2017 P3 Q2 (Margaret River Sauvignon Blanc skin-contact), 2014 P3 Q3 (Georgian Rkatsiteli, qvevri, Kakheti). Named candidates live in the Branch 5 mixed-bag leaf.

*Red spectrum:*
- **Deep ruby–purple, opaque, staining tears** → young FORTIFIED RED (Ruby/LBV/Vintage Port, Banyuls Rimage, Recioto della Valpolicella) OR concentrated passito/still red. → confirm spirit heat → *Fortified sub-tree* (heat present) vs *Sweet-wine sub-tree* (no heat = passito). If no heat but DRY at 15-16% with dried-fruit richness → name **Amarone della Valpolicella** (the dry appassimento sibling of Recioto, Corvina-led — 2014 P3 Q4, 2021 P3 Q2; previously absent from the entire tree while sweet Recioto was named).
- **Garnet → brick, some development** → aged Port (Tawny-leaning), traditional Banyuls/Maury. → *Fortified sub-tree.*
- **Mahogany → dark brown, viscous, colour-staining legs** → very old FORTIFIED: old Tawny (20/30/40yr), Madeira Bual/Malmsey, PX, Rutherglen Muscat. → *Fortified sub-tree.*

### Step 2: Confirmation gate (one sniff + one sip resolves the ambiguities)

For any wine the visual gate left split, these four cues lock the family:

- **Spirit warmth at the back palate (heat above ~16%)?**
  - **Yes + sweet** → fortified sweet (Port, VDN/Banyuls, PX, Rutherglen Muscat, sweet Madeira Bual/Malmsey).
  - **Yes + dry/off-dry** → fortified dry / oxidative (Fino/Manzanilla/Amontillado/Oloroso, dry Madeira Sercial/Verdelho, Marsala).
  - **No** → non-fortified: sweet (botrytis / Icewine / passito / late-harvest) **or** unfortified oxidative (Jura / Vin Jaune) **or** dry still.
- **Sweetness vs acid** → places the non-fortified sweet wines on the mechanism ladder (electric acid + ~10% = Icewine; honey/saffron + noble rot = botrytis; raisin/fig + 14–16% no heat = passito).
- **Mousse persistence + autolysis** → confirms traditional-method vs tank/ancestral sparkling.
- **Flor markers (saline/almond/bruised apple) vs oxidative markers (walnut/caramel/rancio) vs volatile + curry (Madeira)** → splits the fortified/oxidative families.

### Step 3: Family sub-trees (the destinations)

Once Steps 1–2 have fixed the family, work the matching sub-tree below, then layer in the Layer A stem signals to narrow region/variety.

#### → Sparkling family sub-tree
- **Persistent fine mousse + autolysis**
  - survive: traditional method sparkling. eliminate still, tank-only aromatic sparkling. Evidence base: 2021 P3 Q1, 2023 P3 Q1, 2024 P3 Q1.
  - **Higher acid, chalk, subtle dosage, long lees character** -> promote Champagne/English sparkling/Crémant. eliminate Prosecco.
  - **Very high acid + lean fruit + autolytic but cool-climate signature** -> promote English sparkling (Nyetimber, Ridgeview). English sparklers show Champagne-like autolysis but with slightly less ripeness and more green-apple acidity. Evidence base: 2023 P3 Q1.
  - **Apple/yeast/almond + slightly broader texture + lower acid than Champagne** -> promote Cava (Xarel-lo/Macabeo/Parellada). Cava shows traditional-method autolysis but with warmer-climate Mediterranean fruit and less mineral tension. Evidence base: 2023 P3 Q1, 2024 P3 Q1.
  - **Riper fruit than Champagne + slightly less austerity + floral or stone-fruit notes** -> promote Crémant (d'Alsace: Pinot Blanc/Auxerrois with subtle spice; de Bourgogne: Chardonnay with more fruit than Champagne but less chalk; de Loire: Chenin-driven with quince/honey). Evidence base: 2023 P3 Q1.
  - **Pear, simpler fruit, lower autolysis, softer mousse** -> promote Prosecco or tank-method styles. eliminate Champagne-like branches.
  - **If same grape across styles and one wine is still or sweet** -> keep Riesling/Chardonnay cross-style branch alive rather than forcing all wines into sparkling.

#### → Sweet-wine family sub-tree
- **Very high sweetness + low alcohol + piercing acid**
  - survive: Icewine/Eiswein branch. eliminate fortified sweet and passito. Evidence base: 2015 P3 Q3, 2024 P3 Q4.
- **Honey/apricot/saffron + noble-rot signature + medium alcohol**
  - survive: botrytis branch such as Tokaji, BA/TBA, Sauternes. eliminate Icewine if fruit profile is more marmalade than pure frozen-fruit concentration. Evidence base: 2019 P3 Q5, 2022 P3 Q2, 2023 P3 Q3, 2024 P3 Q4.
- **Raisin/fig/nut + oxidative edges + 14-16% without spirit heat**
  - survive: passito/Vin Santo/Recioto. eliminate Icewine and classical botrytis. Evidence base: 2015 P3 Q3, 2024 P3 Q4.
- **Spirit warmth + sweet grapey or nutty profile**
  - survive: fortified sweet or fortified oxidative. eliminate non-fortified sweet wines. Evidence base: 2017 P3 Q6, 2021 P3 Q2, 2025 P3 Q3.

#### → Fortified / oxidative family sub-tree
- **Flor-derived saline/almond/bruised-apple notes with dry finish**
  - survive: Fino/Manzanilla/Amontillado/Palo Cortado family. eliminate Port and Madeira. Evidence base: 2015 P3 Q1, 2016 P3 Q2, 2019 P3 Q4, 2021 P3 Q2.
- **Volatile lift, curry, nuts, very high acidity, caramelized depth**
  - survive: Madeira. eliminate Sherry and Port. Evidence base: 2016 P3 Q2, 2021 P3 Q3, 2025 P3 Q3.
- **Red/black fruit plus spirit, sweetness and tannin**
  - survive: Port family. eliminate Sherry and Vin Santo. Evidence base: 2018 P3 Q1, 2022 P3 Q2, 2025 P3 Q3.
- **Oxidative but unfortified with walnut/curry and no spirit heat**
  - survive: Jura oxidative / Vin Jaune / old Vin Santo-dry branch. eliminate classical fortified categories. Evidence base: 2019 P3 Q4, 2024 P3 Q2.

#### → Same-region multi-style sub-tree
- **Dry vs sweet from same region**
  - if one wine is oxidative and another fresh from the same place, survive regions with deliberate dual traditions: Jura, Tokaj, Sauternes/Bordeaux sweet-dry crossover, German Prädikat estates (Nahe confirmed 2026 P3 Q2).
  - eliminate regions that cannot credibly produce both styles. Evidence base: 2024 P3 Q2, 2024 P3 Q3, 2023 P3 Q3, 2026 P3 Q2.
- **Same producer, different style**
  - keep vintage, lees age, fortification timing, oxidation regime, and dosage/RS as the decision levers rather than changing country. Evidence base: 2016 P3 Q4, 2018 P3 Q1.
- **Same country and region, paired structure (4 pairs / 8 wines)** — see Branch 6 for the full leaf.
  - eliminate "different region per pair" and "different producer, same everything else" readings the moment the stem says "same country and region" for each pair — the fork is a production DECISION (dosage, cask vs bottle ageing, classified vs unclassified, dry vs Prädikat), not a geography guess. Evidence base: 2026 P3 Q2.

#### → Rosé / mixed-bag / curveball sub-tree (incl. orange/skin-contact lane)
- **Pale copper or amber with tannic grip**
  - survive: orange/amber wine. eliminate orthodox rose and oxidative fortified if no spirit heat. Evidence base: 2017 P3 Q2.
- **Dry red-fruited but structurally P3, not classic P2**
  - survive: rose or light red categories, Grenache/Mourvedre/Cinsault/Bandol family. eliminate fortified and sweet assumptions. For candidate rosés by origin use the Branch 5 rosé leaf (Provence STRONG; California Zinfandel and NZ Pinot Noir rosé PLAUSIBLE; Rioja rosado / Russian River Pinot rosé / Baga-Rufete carbonated rosé CURVEBALL — built 2026-08-06). Evidence base: 2017 P3 Q1, 2018 P3 Q3, 2023 P3 Q4, 2019 P3 Q3, 2014 P3 Q3.
- **Classification or age statement drives the question more than sensory family**
  - prioritize category logic first: reserve tiers, tawny age statements, grand cru/classe, VORS, Aszu puttonyos, appellation hierarchy. Evidence base: 2025 P3 Q3.

### ABV / RS calibration aid (NEW — reference anchors for numeric sub-questions)

P3 increasingly awards marks for stating bare numbers — alcohol % and residual sugar g/L — as their own scoreable facts, separate from origin/style prose (2026 P3 Q2 put **48 of 200 marks, 24% of the question, on exactly this**: 8 wines x 3 marks for ABV + 8 wines x 3 marks for RS). Memorize anchor points per style family so a number can be committed to quickly rather than guessed cold. Anchors marked "2026 P3" are confirmed corpus figures; other ranges are general style knowledge, not question-specific citations.

| Style family | Typical ABV | Typical RS (g/L) | Anchor |
| --- | --- | --- | --- |
| Brut Nature / zero-dosage sparkling | 12-12.5% | 0-3 | Chavost Blanc de Chardonnay Brut Nature, 0 g/L, 12.5% (2026 P3 Q2 w5) |
| Standard Brut sparkling | 11.5-12.5% | 6-12 | Delacourt Brut, 12.5% (2026 P3 Q2 w6); Harrow & Hope Blanc de Blancs, 8.1 g/L dosage, 12% (2026 P3 Q1 w4) |
| Traditional-method still-base dry sparkling, warmer climate | 11.5-12.5% | 3-11 | Cava Reserva (Dominio de la Vega), 12% (2026 P3 Q1 w2); Vouvray Brut (Moncontour), ~11 g/L dosage, 12.5% (2026 P3 Q1 w3) |
| Ancestral-method sparkling (metodo ancestrale/pét-nat) | 11-12% | 0-5 (can run drier than expected) | Lambrusco del Fondatore, RS 3.15 g/L, 11.5% (2026 P3 Q1 w1) |
| Dry still Riesling, top vineyard/Trocken-GG | 12-13.5% | 0-9 (dry threshold) | Jakob Schneider Niederhäuser Hermannshöhle Trocken, ~2.6-3.8 g/L, 12.5% (2026 P3 Q2 w11) |
| Spätlese-level German Prädikat | 7.5-9.5% | 40-90 | Jakob Schneider Norheimer Kirschheck Spätlese, ~73 g/L, 8.0% (2026 P3 Q2 w12) |
| Auslese/BA/TBA German Prädikat | 6-8.5% | 90-200+ | general style range — Source needed for a 2026-confirmed anchor |
| Botrytis sweet, Sauternes/Barsac tier | 13-14.5% | 100-160 | Château Coutet (Barsac, 1er Cru), 158 g/L, 13.5%; Château Delmond (Sauternes, unclassified), ~125 g/L, 13.5% (2026 P3 Q2 w9-10) |
| Tokaji Aszú 5-6 puttonyos | 9-11.5% | 120-180 | general style range — Source needed for a 2026-confirmed anchor |
| Canada Icewine / Eiswein | 8-11% | 150-220 | general style range — Source needed for a 2026-confirmed anchor |
| Tawny Port (10-20+ yr, oxidative cask) | 19-20% | 90-130 | Kopke 20-Year-Old Tawny, 121 g/L, 20% (2026 P3 Q2 w7) |
| LBV Port (4-6 yr wood, filtered) | 19-20% | typically slightly lower RS and less oxidative character than an age-stated Tawny at the same ABV | Taylor's LBV 2020, 19% (2026 P3 Q2 w8; RS not stated in source — do not invent a figure, describe the RS range qualitatively if asked) |
| Fino/Manzanilla Sherry | ~15% | <5 (bone dry) | general style range — Source needed for a 2026-confirmed anchor |
| Oloroso/PX Sherry | 17-20% (Oloroso dry-to-off-dry; PX much sweeter) | Oloroso <5 unless sweetened; PX 300-400+ | general style range — Source needed for a 2026-confirmed anchor |

**Practical rule:** if a sub-question asks for ABV/RS as bare numbers, do not hedge with a wide range you haven't earned from the glass — commit to a specific figure near your best anchor and adjust from perceived heat/sweetness on the palate. A number close to the anchor scores; "somewhere between 10 and 20%" does not.

### Branch 7: stem shapes that had NO route before 2026-08-05 (added from the frozen-tree LOYO gaps)

Each of these was flagged by a backtester agent as unroutable in the pre-fix tree. Each is now given
the leaf its actual wines support. All are low-n — treat as orientation, not certainty.

#### 7.1 — "N different countries" with **no style keyword at all**
- **Leaf:** STRONG SIGNAL: **fortified / oxidative sweep** — but only when the guard below passes. PLAUSIBLE: sweet. CURVEBALL: a still wine hiding in the set — now with named candidates (back-filled 2026-08-06): Amarone (dry appassimento Corvina, Valpolicella — 2014 P3 Q4, 2021 P3 Q2) and a mass-market California red blend (2014 P3 Q4).
- **Evidence (for the default):** 2015 P3 Q2 ("Wines 5-8 are from three different countries") resolved to **Port (Portugal), Australian fortified Shiraz, Sherry/Palomino (Spain), Madeira (Sercial/Verdelho)** — a four-wine, all-fortified sweep. Validated on two further bare-count flights: 2014 P3 Q2 (era-1: East India Sherry, Malmsey Madeira, Reserve Port, Banyuls) and 2022 P3 Q3 (Tawny Port, Australian tawny, Recioto at the sweet tier). When P3 gives you a bare country count and nothing else — and the guard passes — the fortified family is the default, not a random mixed bag.
- **GUARD (added 2026-08-06 — the default misfired badly without it):** the fortified default holds ONLY absent contrary signals. Downgrade it to one candidate among equals when: (a) the stem announces **variety diversity** ("four different predominant varieties" — 2019 P3 Q3 was an ALL-ROSÉ flight, 4/4 missed under the old STRONG default; "a different, single grape variety" — 2012 P3 Q2 was an all-sparkling novelty set, 0/4); (b) the flight is only **two wines** — the default's evidence base is 3-4-wine sweeps, and on pairs it underperformed three times (2014 P3 Q3 rosé + orange, 2014 P3 Q4 two stills, 2016 P3 Q3 two botrytis sweets where the PLAUSIBLE tier contained both and the STRONG tier neither); (c) **no sub-question asks origin at all** (method + quality + commercial only — an unusual-style tell; see Branch 5's practical rule; 2014 P3 Q3).
- **Reconciliation with pack F4a (the two stances used to conflict with no tiebreak):** the pack says "treat a bare-count stem as an independent category sampler"; this branch says fortified-first. Both are right in their lane: fortified-first for 3-4-wine bare-count sweeps with NO variety/method language (2015 P3 Q2, 2014 P3 Q2, 2022 P3 Q3); the pack's category-sampler stance the moment variety-diversity wording, a two-wine count, or a missing origin ask appears (2019 P3 Q3, 2012 P3 Q2, 2014 P3 Q3/Q4). The stem's exact wording decides, per 7.7's stem-wins rule.
- **Practical rule:** a P3 stem with no style word is not "anything goes" — but nor is it automatically fortified. Run the guard, then spend your first sniff confirming or killing spirit heat; the visual trunk (pink? bubbles?) overrules any stem-side default in seconds.

#### 7.2 — "made predominantly from the same grape variety" / shared-lead-grape (P3, small flight) — WIDENED 2026-08-06
- **Leaf:** the construction is **blends/wines sharing a lead grape across styles or countries** — identify the lead grape from the glasses, then run that grape's cross-style ladder (mirror: pack F1 Branch 1.3). Attested lead grapes: STRONG SIGNAL: **Grenache-led southern-Rhône family across two countries** (2017 P3 Q4); **Sémillon-led dry/sweet cross-style trio** (2013 P3 Q2, era-1 — aged Hunter Semillon + Graves Sémillon/Sauvignon + Sauternes second wine; the old Grenache-locked leaf contained 0/3 while the tree knew all three wines in other branches). PLAUSIBLE: Syrah/Shiraz-led. CURVEBALL: Touriga or Tempranillo family.
- **Evidence:** 2017 P3 Q4 — Grenache/Shiraz (Australia) vs Grenache/Syrah (France); 2013 P3 Q2 — "One grape variety is common to all three wines, but in varying proportions" (the era-1 wording of the same tell). "Predominantly"/"in varying proportions" is the tell that these are **blends sharing a lead grape**, not varietal wines; do not single-lock the wines (EK-0083), and do not lock the LEAF to one grape either — that is how 2013 P3 Q2 went 0/3.

#### 7.3 — "same country and region", two wines, in Paper 3
- **Routing gate first (added 2026-08-06):** this trigger literally overlaps Branch 4's — see the deciding gate under Branch 4. Enter 7.3 only for a bare two-wine pair with per-wine identify/quality asks, no compare-styles/method language, and no "same producer" clause; otherwise Branch 4 owns the stem (2023 P3 Q3 Tokaj and 2024 P3 Q2 Jura both wear this stem shape and belong to Branch 4 — this leaf's still-red prior would have misled on both).
- **Leaf:** no STRONG default — the pair's category must come from the glasses. PLAUSIBLE (demoted from STRONG 2026-08-06; single founding instance, a flag to widen, not a predictor): a **still red pair from one fine-wine region**. PLAUSIBLE: two styles from one fortified region. CURVEBALL: two vintages of one wine.
- **Evidence:** 2017 P3 Q5 — **Pinot Noir x2, Burgundy, France**. A reminder that P3 admits still dry wines; it simply cannot be *only* them. Do not assume a same-region P3 pair must be fortified or sweet. **Broadened 2026-08-06:** 2018 P3 Q2 extends this from a same-region pair to a same-country **trio** of still dry whites (Pessac-Léognan Blanc / Châteauneuf-du-Pape Blanc / Saint-Romain — see the Branch 5 still-white prestige tour leaf). Still dry wine is a live P3 outcome at up to three consecutive slots, not just as a lone anchor wine.

#### 7.4 — pairs each made by a **different producer**, no style family named
- **Leaf:** STRONG SIGNAL: each pair is a **different style AND usually a different country**; keep one candidate per production family alive across the three pairs.
- **Evidence:** 2018 P3 Q1 — three pairs: Champagne (Chardonnay/Pinot Noir, France), **Barsac botrytis SWEET** (Château Coutet, 1855 1er Cru — Sémillon/Sauvignon Blanc, France; corrected 2026-08-06: the old evidence line mislabelled this pair "Bordeaux Blanc", a dry style, which would have misdirected a candidate on the sweet-wine pair even with variety and region right), Port (Touriga, Portugal). The organising principle is *producer*, so the styles are free to diverge; the anti-collapse rule applies with full force.

#### 7.5 — Rhône varieties appearing as **single varietals across countries** in Paper 3
- **Leaf:** STRONG SIGNAL: Cinsault, Grenache, Mourvèdre as standalone varietal wines. PLAUSIBLE: Syrah. Countries: France + Spain + USA.
- **Evidence:** 2018 P3 Q3 ("different countries and different single grape varieties, minimum 90%") — **Cinsault (Lodi, USA), Garnacha (Spain), Mourvèdre-dominant (Bandol, France)**. *(Country-variety pairings corrected 2026-08-06 — the old line read "Cinsault (France) … Mourvèdre/Grenache (USA)", scrambled against the answer key; set-level containment was unaffected but a candidate memorizing the pairings would have been misled.)* The tree's own Curveball Cases already named this question; it now has a leaf. A "minimum 90% single variety" qualifier in P3 is a strong signal for the Rhône grape set expressed varietally rather than blended.
- **Trigger loosened 2026-08-06:** the "minimum 90%" qualifier is NOT required — 2012 P3 Q2's "each from a different country. Each is made predominantly from a different, single grape variety" (era-1) is the same different-countries / different-single-varieties construction without the 90% wording, and previously fell between this trigger and 7.1's. But that question is also the warning label on this leaf: its answers were an all-sparkling novelty set (Vouvray pétillant Chenin, Australian sparkling Shiraz, NZ sparkling Sauvignon Blanc, California sparkling Zinfandel rosé — 0/4 contained pre-fix), not the Rhône varietal set. A "to whom will this wine most likely appeal" sub-question is the tell for mass-market/novelty styles over the classical canon (single antecedent — a flag to widen, not a predictor). Hold the Rhône-varietal read and the novelty-sparkling read side by side until the glasses decide.

#### 7.6 — "all made using different methods of production"
- **Leaf:** STRONG SIGNAL: one wine per **production method**, spanning styles and countries — not one region's range. Method candidates to keep pre-loaded beyond the fortified set (back-filled 2026-08-06): dry appassimento red (Amarone, Corvina-led — 2021 P3 Q2), aromatic sweet sparkling red (Brachetto d'Acqui, ~5.5% — 2021 P3 Q2), and an all-rosé method spread — macerated sparkling vs oak-influenced still vs carbonated off-dry (2023 P3 Q2 expressed three methods entirely in one colour).
- **Evidence:** 2023 P3 Q2 — Champagne (traditional method, France), a Grenache/Cinsault rosé (Côtes de Provence), and a Baga/Rufete wine (Portugal). Also 2021 P3 Q2 ("all made using different methods of production… with reference to residual sugar and alcohol levels") — Amarone + Brachetto d'Acqui + Vintage Port + Maury VDN + Rutherglen Muscat; its two Italian mechanism wines missed under the old leaf while the fortified trio was contained via Branch 3's lists. That question was previously cited as evidence under Branches 2 AND 3 as well — its stem phrase belongs here; the multi-home citation is now consolidated. Route on **method contrast** first; family-pack tags that call this a sweetness question are misleading (see the routing note below).

#### 7.7 — routing conflicts between this tree and the family pack
- **2023 P3 Q2** — the master tree reads it as a method-contrast flight (7.6 above); the family pack tags it F5d (sweet-wine mechanism). **The stem wording wins**: it says "different methods of production" and never mentions sugar. Route on the literal stem.
- **General rule:** where this tree and `p3_family_tree_pack.md` disagree, prefer the branch whose trigger words actually appear in the stem. A taxonomy tag is a post-hoc classification; the stem is the examiner speaking.

#### 7.8 — "made from the same, single grape variety" (P3) — PROMOTED FROM PACK-ONLY ROUTING 2026-08-06
- **Why this exists:** five P3 questions carry this exact stem (2012 P3 Q3, 2012 P3 Q4, 2016 P3 Q1, 2023 P3 Q4, 2025 P3 Q1) and until this fix NONE could be routed by this tree's Layer A — only the family pack's F1d trigger caught them. 7.2 requires "predominantly" (the blend tell), which is a different construction; do not confuse the two. This branch is the master-tree mirror of pack F1 (Branches 1.1-1.3); defer to the pack for the full candidate universe.
- **Leaf:** STRONG SIGNAL: Riesling cross-category run (Sekt / dry / Prädikat-sweet / Eiswein — 2012 P3 Q3, 2025 P3 Q1); Chardonnay cross-style run (Champagne / still Burgundy / New World, especially with an oak-emphasis sub-question — 2016 P3 Q1); Muscat cross-style run (sparkling Asti / VDN / sweet still / passito — 2012 P3 Q4); Grenache still/VDN run across countries (2023 P3 Q4 — Maury VDN + Montsant + Napa; the tree's Grenache knowledge also sits in 7.2 and 7.5, so cross-check all three). PLAUSIBLE: Chenin Blanc cross-category run (the pack's third dominant grape — not yet attested as a P3 single-variety flight).
- **Dry-anchor rule (New World):** in a cross-style single-grape flight the dry anchor wine is repeatedly NEW WORLD — Marlborough dry Riesling (2025 P3 Q1), Hawke's Bay Chardonnay (2016 P3 Q1). Do not assume the whole run is European just because the sweet/sparkling ends are.
- **CURVEBALL:** the sweet or commercial slot going New World too — Tasmania botrytis Riesling (2012 P3 Q3), California commercial Moscato (2012 P3 Q4), Pantelleria Zibibbo passito in the same Muscat run (2012 P3 Q4) — each attested once: flags to widen, not predictors.

## Curveball cases
- **2017 P3 Q2**: explicit instruction to treat origin as secondary; style/technique dominates.
- **2018 P3 Q3**: Rhone-associated varieties in Paper 3 rather than Paper 2.
- **2023 P3 Q4**: Grenache across three countries and categories is broad enough to break a rigid "P3 equals sweet/sparkling/fortified" assumption.
- **2025 P3 Q3**: mixed-bag classification question is the modern P3 ambush; category literacy matters more than clean varietal logic.
- **2012 P3 Q2** (era-1): all-sparkling varietal-breadth novelty set — sparkling Shiraz, sparkling Sauvignon Blanc, sparkling Zinfandel rosé alongside Vouvray pétillant. The "to whom will this wine most likely appeal" sub-question was the tell; see 7.5's loosened trigger.
- **2014 P3 Q3** (era-1): no-origin-question stem (method + quality + commercial only) hiding a Provence rosé + Georgian qvevri orange pair — the unusual-style tell; see Branch 5's practical rule.

## Coverage note
This tree is built from all 40 P3 decision matrices across 11 sat years (2015-2026; no papers sat 2020). It covers the main P3 engines: sparkling openers (Branch 1), sweet-wine mechanism sets (Branch 2), fortified/oxidative families (Branch 3), same-region multi-style comparisons (Branch 4), rosé/unusual/mixed-bag questions (Branch 5), and — new as of the 2026-08-05 resynthesis — the large multi-pair same-region flight with paired production-method contrasts and heavy ABV/RS numeric weighting (Branch 6). Every question in `questions_analyzed` routes through one of Branches 1-6 or is listed under Curveball cases; none fall outside the tree. (This claim was found to be FALSE on 2026-08-06 for 2018_p3_q2, which sat in the frontmatter but was cited by no branch — the gap that let a blind stem-only redo of that question confidently predict a multi-category spread against an all-still-white flight. Fixed by the Branch 5 still-white prestige tour leaf. When resynthesizing, verify every `questions_analyzed` entry appears in at least one evidence row — an analyzed-but-uncited question is a silent hole exactly where the tree looks strongest.) Weakest coverage remains the small but high-risk group of amber/orange and hybrid mixed-bag questions where the examiner is deliberately trying to break normal paper-type expectations, and — now that Branch 6 has only one confirmed instance (2026 P3 Q2) — the multi-pair same-region structure itself should be watched for whether it recurs or was a one-off scaling of the paper — a question answered on 2026-08-06: the routing sweep surfaced 2011 P3 Q1 and 2021 P3 Q3 as verbatim antecedents, so Branch 6 is a recurring form. Routing-sweep fix pass (2026-08-06): a 52-question stem-only routing audit (`outputs/backtest_reports/routing_sweep_2026-08-06.md`) drove a defect-class fix pass — leaves were back-filled with their own evidence questions' answers (Branch 6 Madeira and still-red pairs, Branch 4 Valpolicella, 7.4's Coutet style error, 7.5's scrambled country-variety pairings, Branch 3's flor-only yeast trigger), same-single-variety stems got a Layer A home (Branch 7.8, mirroring pack F1), the Branch 4 vs 7.3 two-wine same-region overlap got a deciding gate, 7.1's fortified default got a guard after firing on an all-rosé flight (2019 P3 Q3, 4/4 missed), a rosé leaf was built in Branch 5 from five corpus attestations, and concentrated knowledge gaps (NZ dry anchors and sparkling, Corvina/Amarone, Madeira Tinta Negra, novelty sparkling varietals) were back-filled at corpus-frequency tiers (≥3 attested = STRONG-eligible, 2 = PLAUSIBLE, 1 = CURVEBALL flag). Era-1 (2011-2014) questions are cited inline as evidence where used but remain outside `questions_analyzed`, which continues to mean the 2015-2026 matrix corpus.
