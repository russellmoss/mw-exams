---
paper: 3
pack_name: P3 Family Tree Pack
generated: 2026-05-26
families_covered: [F1, F2, F4, F5, F6, F7]
accuracy_target: variety + region + style/method category
source_index: outputs/heuristics/question_taxonomy_index.md
companion_tree: outputs/master_trees/p3_special_tree.md
---

# P3 Special – Family Tree Pack

## What this document is

This is the family-by-family layer for Paper 3, built on top of `p3_special_tree.md`. The master tree gives the broad paper-level engines. This pack gives one structured tree per active taxonomy family — pre-taste and tasting — so the candidate can switch into the correct mode the moment the family is identified from the stem.

Each family section uses the same internal structure:

- `Pre-taste objective`
- `Stem triggers`
- `Default candidate universe`
- `Default rule-outs`
- `Main traps`
- `Pre-taste decision branches`
- `Tasting branch order`
- `Branch-specific candidate narrowing`
- `When to stay broad vs commit`
- `Matrix-writing template guidance`

Confidence is expressed as **STRONG SIGNAL**, **PLAUSIBLE**, or **CURVEBALL**.

## Active families in P3

| Family | Count | Status in this pack |
| --- | --- | --- |
| F1 Same Variety (mostly F1d cross-style) | 4 | Built |
| F2 Same Origin (mostly F2a, F2d) | 8 | Built |
| F4 Mixed Identification Breadth | 9 | Built (anti-overlink) |
| F5 Method / Production Dominant | 10 | **Built (highest-priority)** |
| F6 Style Mechanism Comparative | 4 | Built |
| F7 Hierarchy / Quality Calibration | 3 | Built (classification/commercial position) |

P3 has no `F3 Blend / Composition Logic Set` and no `F8 Curveball / Boundary Set` as primary families in the corpus.

---

## F5 Method / Production Dominant Set (P3)

This is the single biggest engine of P3 and the most under-built area before this pack. Ten of the 38 P3 questions sit here, plus F5 logic bleeds into half of F2 and F6.

Tagged questions: `2015_p3_q1 (F5b)`, `2016_p3_q2 (F5c)`, `2017_p3_q2 (F5f)`, `2017_p3_q6 (F5c)`, `2019_p3_q4 (F5c)`, `2021_p3_q2 (F5d)`, `2022_p3_q2 (F5d)`, `2023_p3_q1 (F5a)`, `2023_p3_q2 (F5d)`, `2024_p3_q1 (F5a)`.

### Pre-taste objective

Decide which production family is being tested *before* worrying about origin or variety. P3 F5 questions reward the candidate who can name the mechanism and explain its consequences first, then pin a country.

### Stem triggers

- "method of production" appears as a discrete mark band
- "key winemaking techniques" with high marks
- "all made using different methods of production"
- "with reference to residual sugar and alcohol" alongside method
- "fortified" stated as the linking attribute
- "sparkling" stated as the linking attribute
- explicit instruction to comment on quality/commercial position **without** asking for grape variety
- pair questions where origin is only worth a few marks and method dominates

### Default candidate universe

P3 F5 nearly always pulls from one of these six production families. Always carry at least one candidate from each that the stem does not explicitly exclude.

1. Traditional-method sparkling (Champagne; non-Champagne Crémant, Cava, English sparkling, Franciacorta, Cap Classique, California prestige cuvées, German Sekt)
2. Tank/charmat or ancestral sparkling (Prosecco, Lambrusco, pet-nat)
3. Botrytis sweet (Sauternes, Tokaji Aszú, German BA/TBA, Alsace SGN)
4. Non-botrytis sweet by mechanism (Icewine/Eiswein, passito/Vin Santo/Recioto, late-harvest non-botrytis, Vouvray demi-sec/moelleux)
5. Fortified by pathway (Port spirit-stopped sweet red, VDN spirit-stopped sweet, Sherry biologically aged dry, Sherry oxidatively aged, Madeira estufa/canteiro)
6. Oxidative / flor / unusual elevage non-fortified (Vin Jaune, Jura oxidative, oxidative Rioja Blanco, qvevri/skin contact, Sherry-style table whites)

### Default rule-outs

- Pure varietal-recognition framing (that is F1, not F5)
- Pure regional-literacy framing (that is F2)
- A flight where every wine plausibly shares one mechanism — the examiner would not use F5 phrasing for that

### Main traps

- Defaulting to Champagne when the stem says "not from Champagne" or names multiple countries
- Collapsing all sweet wines into "botrytis" — five sweet wines almost always span at least three mechanisms
- Treating fortified as a single bucket when stem asks for method ⇒ Port vs Sherry vs Madeira vs VDN each demand a different process answer
- Spending marks on origin precision when the question only awards origin 5/30 and method 20/30
- Forgetting that "commercial position" is a method-and-classification question, not a sales-channel essay

### Pre-taste decision branches

#### Branch 5.1 — Sparkling-led F5 (F5a)

Triggers: "sparkling wines, neither from Champagne" / "traditional method sparkling wines from four different countries" / "all sparkling wines."

Default universe:
- **STRONG SIGNAL:** Cava (Xarel-lo / Macabeo / Parellada), English sparkling (Chardonnay / Pinot Noir / Pinot Meunier — West Sussex, Hampshire, Kent), Crémant d'Alsace (Pinot Blanc / Auxerrois / Pinot Gris), Crémant de Bourgogne (Chardonnay / Pinot Noir), Crémant de Loire (Chenin Blanc).
- **PLAUSIBLE:** Franciacorta (Chardonnay / Pinot Nero), Cap Classique (Chardonnay / Pinot Noir, sometimes Pinotage), California prestige (Schramsberg, Roederer Estate), German Sekt (Riesling, Pinot Noir), Trento DOC.
- **CURVEBALL:** Champagne when not explicitly excluded; Prosecco DOCG if "method" framing allows tank; Lambrusco if rosé/red sparkling is in the flight.

When commercial framing is heavy (e.g. 2024 P3 Q1: two non-Champagne sparkling wines, commercial position weighted): collapse to California prestige + Cava, or English + Cava, as a working prior.

#### Branch 5.2 — Sweet-wine mechanism F5 (F5d)

Triggers: "all have residual sugar" / "different methods of production… reference to residual sugar and alcohol" / four-to-five sweet wines.

Mandatory candidate set — one slot reserved per mechanism:
- Botrytis low-to-mid alcohol (Sauternes, Tokaji Aszú 5–6 puttonyos, German BA/TBA, Alsace SGN, Hungarian Aszú, Loire Quarts de Chaume)
- Cryoextraction / frozen fruit (Canadian Vidal Icewine, German/Austrian Eiswein, BC Riesling Icewine)
- Drying / passito (Vin Santo, Recioto di Soave, Recioto della Valpolicella, Tokaji Eszencia-adjacent, Pedro Ximenez sun-dried if non-fortified scope opens)
- Fortified sweet (Port LBV/Vintage/Tawny, VDN Beaumes-de-Venise / Banyuls, Pedro Ximenez Sherry, Maury, Australian Rutherglen Muscat)
- Late-harvest non-botrytis (Vouvray moelleux, Alsace VT, Mosel Auslese, German Riesling Auslese off-dry)

Anti-collapse rule: even if two wines smell of honey and apricot, keep at least one in the non-botrytis lane until acid/alcohol/RS profile says otherwise.

#### Branch 5.3 — Fortified / oxidative mechanism F5 (F5c)

Triggers: "all fortified" / paired fortified wines / method-heavy stem with high-alcohol wines.

Default universe — split by pathway:
- Spirit-stopped sweet (Port across Tawny / Ruby / Vintage / LBV, VDN Banyuls / Maury / Rivesaltes, Mavrodaphne)
- Biologically aged dry (Fino, Manzanilla)
- Biologically then oxidatively aged (Amontillado, Palo Cortado)
- Pure oxidatively aged (Oloroso, Madeira Sercial / Verdelho / Bual / Malmsey, Marsala Vergine, Vin Santo Reserva)
- Unfortified oxidative / flor (Vin Jaune, Château-Chalon, Jura ouillé vs sous voile, Szamorodni száraz, qvevri whites)

Practical rule: if the stem explicitly names "fortified" twice or asks for method on each wine, the trap is to over-cluster within one country. Spread predictions across at least three of {Spain, Portugal-Douro, Portugal-Madeira, France-Roussillon, Italy, Australia-Rutherglen}.

#### Branch 5.4 — Hybrid F5 (style-commercial / "different methods")

Triggers: "Wines X–Y are all made using different methods of production" (very common phrasing) without specifying sparkling/sweet/fortified.

This is the broadest F5 stem and behaves as a category sampler. Assume every wine is a different production logic. Build the flight as a shopping list: one sparkling, one sweet, one fortified, one oxidative, one unusual elevage, one classic still where the method is the discussion point (e.g. extended skin contact, lees, MLF in white, etc.).

### Tasting branch order (F5)

Order is hard: do not start with grape variety on F5 wines.

1. Effervescence — full sparkling? Pétillant? Still?
2. Spirit warmth at the back palate — fortified vs not? Above ~16% with sweetness ⇒ fortified bucket.
3. Sugar / acid / alcohol triangle — dry / off-dry / medium-sweet / very sweet, and how does it sit against acid?
4. Oxidation profile — flor (saline/almond/bruised apple), oxidative (walnut/caramel/rancio), reductive (pure fruit, no aldehyde), volatile lift (Madeira), brown nut + sweet (PX, old Tawny).
5. Production family lock — once 1–4 are placed, the production family is usually fixed even without grape identity.
6. Origin family — only now place country/region.
7. Grape family — last, as confirmation rather than driver.

### Branch-specific candidate narrowing (F5)

- **Pétillant mousse + low autolysis + pear fruit ⇒** Prosecco/tank-method, not Champagne or Cava.
- **Persistent fine mousse + biscuit autolysis + chalk ⇒** Champagne / English / Crémant de Bourgogne. English shows greener apple and higher acid, Crémant shows softer mid-palate, Champagne shows the longest finish and tightest mousse.
- **Persistent mousse + apple + almond + slightly broader mid-palate + lower acid than Champagne ⇒** Cava.
- **Yeast + brioche + warm orchard fruit + lower acid ⇒** Franciacorta or Cap Classique. Franciacorta tends finer; Cap Classique often shows riper fruit.
- **Pungent saline + bruised apple + manzanilla almond + bone dry ⇒** Fino/Manzanilla. Manzanilla is more saline and lighter; Fino broader and yeastier.
- **Almond + walnut + dried orange peel + dry-ish but not bone dry ⇒** Amontillado or Palo Cortado. Palo Cortado keeps more aromatic delicacy at higher textural weight.
- **Walnut + caramel + raisin + dry to off-dry + 18–22% ⇒** Oloroso dry, or VORS Oloroso if extreme concentration.
- **Volatile lift + curry + nuts + crystalline acid + heat ⇒** Madeira. Sercial driest, Verdelho off-dry, Bual mid-sweet, Malmsey richest.
- **Sweet red fruit + grippy tannin + spirit + RS ⇒** Port. Ruby/LBV brighter and grippier; Tawny brown-nutty with cooked-fruit and rancio at older age statements.
- **Honey/apricot/saffron + low alcohol + piercing acid + glycerol weight ⇒** botrytis sweet. Tokaji shows orange peel and ginger; Sauternes shows beeswax and pineapple; BA/TBA shows lime petrol structure.
- **Pure frozen-fruit concentration + zero botrytis funk + electric acid + ~10% ABV ⇒** Icewine/Eiswein. Vidal more tropical; Riesling more lime-citrus and petrol.
- **Raisin + fig + nut + sweet + ~14–16% without spirit heat ⇒** passito / Vin Santo / Recioto. Vin Santo nuttier and amber; Recioto della Valpolicella more dried red fruit.
- **Skin tannin + amber colour + dried orange + reductive nut on white grape ⇒** orange / qvevri.

### When to stay broad vs commit (F5)

- Stay broad until you have placed the production family. Origin guess without that is high-risk.
- Commit early on Champagne lookalikes only if mousse, autolysis, acid, and finish all agree.
- Stay broad on sweet wines until alcohol vs RS vs acid triangulation is confident.

### Matrix-writing template (F5)

For each F5 wine, the matrix should hit:

1. Method family in one phrase (e.g. "traditional-method sparkling, autolytic", "biologically aged sherry", "spirit-stopped sweet red fortified").
2. Key technical lever named (e.g. "tirage and lees ageing", "fortification before fermentation completion", "extended estufa heating").
3. Style consequence in palate language tied to the method.
4. Origin family, narrowed only as far as the sensory evidence allows.
5. Quality / commercial position framed in classification terms (NV vs vintage; reserva vs gran reserva; ruby vs tawny; SAQR vs basic Madeira) rather than vague "good quality".

---

## F4 Mixed Identification Breadth Set (P3)

Nine P3 questions. The trap is over-linking. The stem deliberately removes the variety or origin anchor, and the candidate must treat each wine almost independently.

Tagged questions: `2015_p3_q2`, `2016_p3_q3`, `2017_p3_q1`, `2018_p3_q3 (F4c)`, `2019_p3_q3`, `2021_p3_q1`, `2021_p3_q3`, `2022_p3_q1`, `2022_p3_q3`.

### Pre-taste objective

Resist the urge to find a hidden theme. On P3 F4, the only safe theme is "this is a category sampler." Each wine is a separate problem; the connective tissue is usually paper context (mix of style / fortified / sweet / sparkling) rather than variety or country.

### Stem triggers

- "Wines X–Y are from four/five different countries"
- "are all made using different methods of production"
- no shared-variety or shared-origin language
- explicit independent mark allocation per wine
- final question of the paper

### Default candidate universe

Treat each slot as drawing from a different category. P3 F4 flights typically include:
- at least one rosé or unusual style
- at least one fortified or oxidative wine
- at least one sweet wine
- at least one classic still wine with a recognisable signature (Riesling, Chardonnay, Pinot Noir, Sangiovese)

### Default rule-outs

- "Same variety throughout" predictions
- "Same country throughout" predictions
- Any tree branch that funnels all five wines into one regional family

### Main traps

- Letting wine 1's identity bias wine 2 by mental contagion
- Hidden organising theme (F4c): there is usually a single subtle thread (e.g. "all share oxidative handling"), but it does not collapse the candidate set — it widens it
- Final-question fatigue: the worst time to over-commit
- "European but not France/Italy/Spain" style instructions that are intended to remove the easy candidates rather than identify a country

### Pre-taste decision branches

#### Branch 4.1 — Pure breadth (F4a)

Triggers: "different countries", "different methods", no shared anchor.

Default universe: build a five-or-six-slot working ballot where each slot is a distinct category bucket. Do not write a country down for two slots until at least three slots have been pencilled.

#### Branch 4.2 — Hidden organising theme (F4c)

Triggers: subtle linking phrase ("all share X"), or a flight that on rereading is loosely defined by a stylistic axis.

Treat the theme as a *filter*, not a *narrower*. The theme should be used to rule out impossible candidates ("not unfortified" / "not still"), not to drive the answer toward one country.

#### Branch 4.3 — Final-question P3 ambush

Triggers: position late in the paper, high mark weight, mixed-bag wording.

Default mindset: this is the curveball slot. Allocate time first to method/style rather than chasing precise origin.

### Tasting branch order (F4)

Per wine, in order:

1. Style category (still / sparkling / fortified / sweet)
2. Colour and intensity
3. Dominant aroma family (fruit weight, aromatic intensity, oxidative markers)
4. Structure (acid, tannin, sugar, alcohol)
5. Likely production lever (oak, lees, skin contact, fortification, residual sugar source)
6. Best candidate country/region for that sensory profile
7. Best candidate variety / blend family for that country

Critically: between wine 1 and wine 2, reset. Do not let earlier wines bias later assessments.

### Branch-specific candidate narrowing (F4)

- Treat each wine as a single-wine problem with a stem that just says "Identify the wine."
- Build each candidate from sensory profile up, not from "which country hasn't appeared yet."
- Allow yourself to repeat a country across slots if the sensory profile genuinely points there.

### When to stay broad vs commit (F4)

- Stay broad on origin until at least one sensory marker is decisive.
- Commit firmly on grape only when the sensory signature is iconic (Riesling lime/petrol, Sauvignon Blanc pyrazine, Pinot Noir translucency + red fruit).
- For curveball wines, name two plausible candidates and explain the choice, rather than locking one wrong answer.

### Matrix-writing template (F4)

For F4, the matrix should be slot-by-slot, not flight-level. For each wine:
- One-sentence sensory snapshot
- Best-guess country + region
- Best-guess variety / blend family
- One alternative if the first guess is wrong (the "branch B" candidate)
- One short method comment if marks demand it

The matrix should explicitly state: "do not infer wine N from wine N−1."

---

## F7 Hierarchy / Quality Calibration Set (P3)

Only three P3 questions, but disproportionately high-stakes: `2016_p3_q4 (F7b)`, `2018_p3_q1 (F7b)`, `2025_p3_q3 (F7a)`. The 2025 example (mixed-bag classification) is the modern template and the reason this branch needs explicit treatment.

### Pre-taste objective

Convert the *classification language* in the stem into a working ladder. On P3 F7, the candidate is not being asked "what is this?" but "where does this sit on a recognised quality hierarchy, and how do you justify it from the glass?"

### Stem triggers

- "Comment on quality and commercial position with specific reference to its classification"
- "Identify the producer and the classification"
- Wines arranged in an obvious ladder (cuvée vs prestige cuvée; reserve vs grand reserve; vintage vs NV)
- Mark allocation that puts more on quality/commercial than on identification
- Explicit reference to age statement, classification ladder, cuvée hierarchy

### Default candidate universe

The wines almost always come from categories whose labels carry a regulated or industry-recognised hierarchy:
- **STRONG SIGNAL:** Champagne (NV / vintage / prestige cuvée), Port (Ruby / LBV / Vintage / Tawny / Aged Tawny), Sherry (Fino / Amontillado / Oloroso / VOS / VORS), Madeira (3 / 5 / 10 / 20 / 40 / Frasqueira), Tokaji (Szamorodni / Aszú 5–6 puttonyos / Eszencia), German Riesling (Kabinett → Auslese → BA/TBA / VDP Grosses Gewächs), Alsace (Lieu-dit → Grand Cru → VT → SGN), Sauternes/Barsac (1er Grand Cru Classé), Provence rosé (Cru Classé)
- **PLAUSIBLE:** Rioja (Crianza / Reserva / Gran Reserva), Vintage Port houses, Provence Cru Classé rosé, Tokaji classifications, Hungarian sweet hierarchy
- **CURVEBALL:** wines whose hierarchy is implicit rather than legal (single-vineyard cuvée from a Cap Classique or Franciacorta house; "premium" Cava de Paraje Calificado)

### Default rule-outs

- Wines with no meaningful label hierarchy (entry-level commodity bottlings without classification language)
- Wines from systems where the classification is too obscure to write 15 marks on

### Main traps

- Describing quality in adjectives instead of classification language
- Forgetting that "commercial position" is partly about *channel* (on-trade prestige, gift, supermarket) and partly about *price ladder within the category*
- Mis-pairing the classification with the wine in the glass (e.g. calling a tawny "vintage character")
- Treating the question as identification when only 10/40 marks are on origin

### Pre-taste decision branches

#### Branch 7.1 — Classification ladder within one category (F7a)

Triggers: flight of fortified wines / sweet wines spanning multiple legal tiers.

Build a tier-by-tier candidate list. For each wine, identify which tier of which system is most plausible given the position in the flight (oldest/most premium often last).

#### Branch 7.2 — Producer / cuvée hierarchy (F7b)

Triggers: same producer or same house, different cuvées; "the producer and the classification."

The frame is vertical within one house. Mentally map the famous producer ladders: Krug Grande Cuvée → Clos du Mesnil; Sandeman Ruby → Sandeman Vintage; Symington range; Royal Tokaji range; Henschke range; etc.

#### Branch 7.3 — Mixed-bag classification spread (F7a, modern style)

Triggers: 2025 P3 Q3 template — six wines drawn from different categories, each chosen because their classification is the point.

Allocate one classification system per wine. Do not let two wines come from the same hierarchy. Reserve a slot for Port (Ruby/Tawny/Vintage), one for Madeira (age-statement), one for Sherry, one for Tokaji or Sauternes, one for a classed dry wine (Grand Cru, Cru Classé), one for a prestige rosé or sparkling.

### Tasting branch order (F7)

1. Category lock (fortified / sweet / dry / sparkling / rosé)
2. Family lock within category (Port-style vs Madeira-style; botrytis vs late-harvest; village vs cru)
3. Quality calibration via concentration, length, complexity, integration
4. Classification slot — which named tier of the family this wine most plausibly is
5. Commercial-position framing — premium gift / collector / on-premise / supermarket / fortified hospitality / dessert pairing
6. Quick varietal / origin confirmation as final support

### Branch-specific candidate narrowing (F7)

- Use concentration and length to discriminate between tiers within a system.
- Use age-derived complexity (tertiary aromatics, oxidative depth, integration) to support older-tier predictions.
- When in doubt between two tiers, choose the lower tier — examiners punish over-claiming more than under-claiming.

### When to stay broad vs commit (F7)

- Commit on category and family early.
- Stay broad on classification tier until concentration, complexity, and length all support a single tier.
- Be willing to say "this is one of the higher tiers within X" without specifying the single named cuvée.

### Matrix-writing template (F7)

Per wine:
- Category and family
- Most plausible classification tier (with one alternative)
- Quality justified in classification language (e.g. "the concentration, length, and integration place it at Aged Tawny rather than Ruby Reserve")
- Commercial position in channel terms
- Producer guess optional and last

---

## F1 Same Variety Comparative Set (P3)

Four P3 questions, all `F1d` (same variety across radically different styles): `2016_p3_q1`, `2017_p3_q4`, `2023_p3_q4`, `2025_p3_q1`. This is a small but rich branch.

### Pre-taste objective

Identify the *grape family* first, then work outward into the radically different style expressions that one grape can produce.

### Stem triggers

- "from the same single grape variety" inside Paper 3
- multiple wines that the stem says share a grape but are obviously different categories (sparkling / still / sweet / fortified)
- "Comment on the style, quality, and maturity" alongside a single-grape claim

### Default candidate universe

Grapes that can plausibly appear across P3 categories:
- **STRONG SIGNAL:** Riesling (dry / off-dry / sweet / Sekt), Chenin Blanc (dry / off-dry / sweet / Crémant), Chardonnay (still / sparkling / Vin Jaune-adjacent), Pinot Noir (still / sparkling / Sekt rosé), Grenache (still red / VDN / rosé), Muscat (dry / sweet still / VDN / sparkling Asti), Furmint (dry Tokaji / Szamorodni / Aszú), Sémillon (dry Hunter / Sauternes), Cabernet Franc (still Loire / Cabernet d'Anjou rosé / Saumur sparkling)
- **PLAUSIBLE:** Tempranillo across red / rosado / fortified; Glera across still / sparkling; Sangiovese across dry / Vin Santo
- **CURVEBALL:** Pinotage (still / fortified Cape "Coffee" / Cap Classique blend component); Aglianico (still / fortified rare)

### Default rule-outs

- Grapes with very narrow stylistic range (e.g. Marsanne, Grüner Veltliner) unless an obvious one-category match
- Grapes that almost never appear in P3 (Cabernet Sauvignon is rare in P3 F1d)

### Pre-taste decision branches

#### Branch 1.1 — One grape across sparkling / still / sweet

Triggers: explicit categories spread; mention of residual sugar or sparkling alongside a grape claim.

Working answers: Riesling, Chenin Blanc, Chardonnay are the dominant 3.

#### Branch 1.2 — One grape across still / fortified

Triggers: fortified language alongside same-grape claim.

Working answers: Grenache (still / VDN / Banyuls), Muscat (dry / VDN / fortified Asti), Tempranillo (still / fortified blend), Pinot Noir (still / Ruby/Tawny Port-style is implausible but Burgundy + Sekt rosé is plausible).

#### Branch 1.3 — One grape across radical regional styles

Triggers: same grape, different countries, but in P3 context.

Working answers: Pinot Noir (Burgundy still / English sparkling / NZ still / German Sekt); Sémillon (Hunter dry old / Sauternes sweet); Furmint (dry Tokaji / Aszú sweet).

### Tasting branch order (F1 in P3)

1. Confirm grape signature on the cleanest, driest wine first
2. Lock the grape family with that anchor wine
3. For each remaining wine, accept the grape and work *only* on what production did to it
4. Resist the urge to flip the grape just because the sweet/sparkling/fortified wine smells different — the stem has bound them

### Branch-specific candidate narrowing (F1 in P3)

- Riesling: lime + petrol + electric acid persists across dry → Auslese → Eiswein → Sekt.
- Chenin Blanc: quince + wax + wool + lanolin persists across dry Vouvray → Coteaux du Layon → Crémant de Loire → South African dry Chenin.
- Chardonnay: apple + lees + chalk persists across Chablis → Champagne → Franciacorta → English sparkling base.
- Grenache: strawberry + white pepper + warm fruit persists across Châteauneuf → Tavel → Banyuls.

### Matrix-writing template (F1 in P3)

Per wine:
- Confirm the bound grape and one signature that justifies the lock
- Identify the category (dry / off-dry / sweet / sparkling / fortified)
- Identify the most plausible origin given grape + category
- Comment on the production lever that took the grape to this style
- Place quality and maturity

---

## F2 Same Origin Comparative Set (P3)

Eight P3 questions, evenly split between `F2a` (same country, different varieties), `F2b` (same region), and `F2d` (same origin, different sweetness/age/elevage expressions). Tagged: `2017_p3_q5`, `2018_p3_q2`, `2019_p3_q1 (F2d)`, `2019_p3_q2 (F2d)`, `2023_p3_q3 (F2d)`, `2024_p3_q2 (F2b)`, `2024_p3_q3 (F2d)`, `2025_p3_q2 (F2a)`.

### Pre-taste objective

Identify the *origin family* and then explain internal stylistic diversity using either varietal substitution (`F2a`), regional sub-style (`F2b`), or production-mechanism divergence (`F2d`).

### Stem triggers

- "from the same country"
- "from the same region"
- pair questions where method or style differs but origin is bound
- "Identify the producer" alongside multiple cuvées (often points to F2d)

### Default candidate universe

P3 same-origin questions tend to draw from regions with multi-style traditions:

- **STRONG SIGNAL same-country:** Spain (Cava + Garnacha still + Sherry), France (Crémant + still + VDN), Portugal (Vinho Espumante + still + Port/Madeira), Hungary (dry Furmint + Aszú + Tokaji Szamorodni), Italy (Prosecco + still + Vin Santo).
- **STRONG SIGNAL same-region:** Champagne (NV / vintage / blanc de blancs / rosé / prestige), Tokaj (dry + Szamorodni + Aszú), Madeira (Sercial → Malmsey ladder), Jerez (Fino → Amontillado → Oloroso → PX), Vouvray (sec / demi-sec / moelleux / pétillant).
- **PLAUSIBLE:** Sauternes/Barsac, Banyuls/Maury, Rioja (red / blanco / fortified historically), Alsace (dry / VT / SGN / Crémant).

### Default rule-outs

- Cross-country predictions when stem clearly says "same country"
- Cross-region predictions when stem says "same region"

### Pre-taste decision branches

#### Branch 2.1 — Same country, different categories (F2a)

Triggers: country named or implied; spread of categories.

Working priors:
- Spain ⇒ Cava + Garnacha or Tempranillo still + Sherry / VDN-style
- France ⇒ Crémant + still + VDN / Sauternes
- Portugal ⇒ espumante / Vinho Verde + Douro still + Port or Madeira
- Italy ⇒ Prosecco / Franciacorta + Tuscan or Piedmont still + Vin Santo / Marsala
- Hungary ⇒ dry Furmint + Aszú + Szamorodni

#### Branch 2.2 — Same region, internal sub-style (F2b)

Triggers: named region; spread of style within that region.

Working priors: Champagne tier ladder, Madeira ladder, Sherry ladder, Tokaji ladder, Alsace dry-to-sweet ladder.

#### Branch 2.3 — Same origin, different elevage / sweetness / age (F2d)

Triggers: same origin language + reference to maturity, RS, age, or elevage.

Working priors: vintage vs NV Champagne; Sercial vs Malmsey Madeira; Fino vs Oloroso vs PX Sherry; sec vs demi-sec vs moelleux Vouvray; Ruby vs Tawny vs Vintage Port.

### Tasting branch order (F2 in P3)

1. Confirm regional signature on the most typical wine first
2. Lock the origin family
3. For each remaining wine, treat the origin as bound and only diagnose the style/method/age divergence
4. If a wine seems to break the origin frame, treat it as a curveball candidate but keep the regional anchor

### Matrix-writing template (F2 in P3)

Per wine:
- Confirm bound origin and one signature that justifies the lock
- Identify the internal divergence axis (variety / sub-region / method / age / sweetness)
- Place the wine on that internal axis
- Quality / commercial position within the regional context

---

## F6 Style Mechanism Comparative Set (P3)

Four P3 questions, all `F6a` (sweetness / residual sugar axis): `2015_p3_q3`, `2017_p3_q3`, `2019_p3_q5`, `2024_p3_q4`. The dividing line vs F5d is subtle: F6 is about *placing wines on a structural axis*; F5d is about *explaining the production mechanism behind each wine*. The same flight can be tagged either way depending on stem emphasis.

### Pre-taste objective

Place each wine on the dominant structural axis (almost always RS × alcohol on P3) and explain the production mechanism that drives its position.

### Stem triggers

- "State the level of residual sugar"
- "State the level of alcohol"
- explicit ladder language ("from driest to sweetest")
- structure-led mark allocation

### Default candidate universe

For RS × alcohol axis (the dominant P3 F6 form):
- Low-RS / low-alcohol corner: Mosel Kabinett, very light demi-sec
- Low-RS / high-alcohol corner: dry table wine outliers
- Mid-RS / mid-alcohol: Auslese, Vouvray demi-sec/moelleux
- High-RS / low-alcohol: Icewine/Eiswein, TBA
- High-RS / high-alcohol: Sauternes / Tokaji Aszú
- Very-high-RS / fortified: PX Sherry, Vintage Port, Rutherglen Muscat

### Pre-taste decision branches

#### Branch 6.1 — Sweetness ladder (F6a)

Triggers: "all have residual sugar," ladder language.

The flight is almost always five wines spanning the matrix above. Reserve one prediction per corner.

#### Branch 6.2 — Fortification axis (rare in P3 F6, more common in F5c)

Triggers: explicit comparison between fortified and unfortified, or between fortified styles by spirit timing.

#### Branch 6.3 — Maturity / development axis

Triggers: pair questions comparing youthful and developed expressions of similar wines.

### Tasting branch order (F6)

1. Estimate alcohol from warmth and weight
2. Estimate RS from sweetness × acid balance
3. Plot the wine on the RS × alcohol matrix
4. Choose the candidate that fits the plotted point
5. Explain the production mechanism that produced the point

### Matrix-writing template (F6)

Per wine:
- Estimated RS (g/L band) and alcohol (% band)
- Position on the structural axis
- Most plausible production mechanism for that position
- Origin and variety as confirmation
- Quality / commercial position

---

## Highest-priority unfinished work for P3

The remaining work doc named these as top priorities. With this pack:

| Priority | Item | Status |
| --- | --- | --- |
| 1 | P3 F5 pre-taste tree | Built (Branch 5.1–5.4) |
| 2 | P3 F5 tasting tree | Built (six-step branch order + sensory narrowing) |
| 3 | P3 F4 mixed-category tasting tree | Built (slot-by-slot, anti-overlink) |
| 6 | P3 F7 classification/commercial-position tree | Built (Branch 7.1–7.3) |

Remaining for P3 (deferred or lower priority):

- Cross-checking against the LOYO weakest folds and inserting targeted patches *only where the failure recurs across at least two questions*
- Building a small `F8 P3 curveball appendix` if the corpus accumulates more amber/orange/qvevri sets in future years

## How this pack interacts with the master tree

- The master tree (`p3_special_tree.md`) is still the entry point. Read it first when an unseen P3 paper is in front of you. **Start at its Layer B visual trunk** (Step 1 Visual triage → Step 2 confirmation gate): sort every wine by appearance into a production family *before* working any family section here.
- The moment the stem reveals a family, switch into the matching family section here.
- The two layers do not contradict — this pack expands the family layer that the master tree references but cannot fully unfold.

## Provenance

All evidence citations are taxonomy-index questions (see `outputs/heuristics/question_taxonomy_index.md`). Where the pack lists a working prior or anti-collapse rule, it is generalised from at least two corpus questions in that family; single-question patches have been avoided in line with the "do not overfit" guidance.
