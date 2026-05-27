# Mock v8 Rotation Blueprint

This is the blueprint the next full mock writer should start from. It is designed to break the v6/v7 repetition pattern.

## Hard Avoids

- Do not use Vouvray, Huet, Foreau, Savennières, or Loire Chenin in v8.
- Do not put a three-country sparkling question in Paper 3 Question 1.
- Do not repeat P1 Q1 as same-variety four-country Sauvignon/Riesling.
- Do not repeat P2 Q1 as same-variety four-country Cabernet Franc/Syrah.
- Do not repeat P3 Q3 as five-country residual-sugar survey unless the style mechanisms are materially different from v6/v7.

## Paper 1

### Q1: F3 Blend Logic

Two or three white blends, not Loire/Bordeaux Blanc if recently used. Good candidates:

- Rhône white blends across quality tiers
- Rioja Blanco / Priorat Blanco / Catalan white blends
- South African Cape white blend vs southern French blend

Expected axes: blend composition, texture, oak/lees, quality tier.

### Q2: F4 Mixed Breadth

Independent white identification flight. Use non-overlapping countries and varieties. Avoid Riesling, Sauvignon Blanc and Chenin as anchors.

Expected axes: variety and origin independence, structural spread, price-quality spread.

### Q3: F7 Quality Calibration

Same producer or same appellation hierarchy, but not Burgundy Chardonnay and not Vouvray. Good candidates:

- German Riesling estate hierarchy outside Mosel default
- Austrian Grüner Veltliner Federspiel/Smaragd or village/single vineyard
- Alsace Grand Cru vs lieu-dit vs generic, but avoid Trimbach if v7 used it

Expected axes: hierarchy, quality tier, maturity or commercial position.

### Q4: F5 Human/Natural Or Method Axis

A two- or three-wine method contrast in whites. Avoid the Loire Chenin natural/human setup.

Expected axes: skin contact vs reductive white vs oxidative/biological ageing, or oak/malo vs stainless/no malo.

## Paper 2

### Q1: F2 Same Country, Different Regions/Varieties

Not France/Bordeaux and not Italy/Piedmont. Good candidates:

- Spain: Rioja / Priorat / Ribera / Gredos
- Portugal: Douro / Dão / Bairrada / Alentejo
- South Africa: Stellenbosch / Swartland / Hemel-en-Aarde / Paarl

Expected axes: variety, origin, tannin/body, oak, maturity.

### Q2: F3 Blend / Varietal Role

Build around blend logic rather than another same-variety ladder.

- Bordeaux varieties outside Bordeaux
- GSM blend vs single-variety Grenache/Syrah/Mourvèdre references
- Portuguese field blends vs varietal examples

Expected axes: component roles, structure, oak, quality.

### Q3: F6 Style Mechanism

A structural axis not already overused:

- tannin/extraction axis
- alcohol/ripeness axis
- maturity/development axis

Expected axes: structure and maturity, not just origin.

## Paper 3

### Q1: F1d Same Variety Across Styles

Do not use generic sparkling countries. Use one grape in multiple categories:

- Muscat: dry still / sparkling or frizzante / fortified or sweet
- Malvasia: dry / orange / sweet or fortified
- Riesling is allowed only if not Mosel-heavy and not a v6/v7 repeat

Expected axes: style, method, sweetness/alcohol, origin.

### Q2: F5c Fortification / Oxidative Method

Not a full Jerez sequence if v7 used Sherry. Alternatives:

- Madeira grape/style ladder without repeating v6's exact Madeira-heavy set
- Port ruby/tawny/LBV/colheita ladder
- Marsala / Rivesaltes / Banyuls / Madeira mixed method set

Expected axes: fortification timing, oxidative/reductive ageing, quality/commercial position.

### Q3: F4/F7 Mixed Category Commercial

Commercial-position question across categories, not another RS survey:

- premium rosé Champagne alternative / fine cider-like wine / orange wine / sake-adjacent boundary is too far unless sourced
- safer: premium non-Champagne sparkling, fine rosé, orange/skin-contact white, oxidative Jura, premium fortified

Expected axes: commercial channel, price tier, category literacy, quality.

## Required Preflight

Before writing answers:

1. Run `python scripts/analyze_mock_rotation.py`.
2. Run `python scripts/analyze_wine_selection_logic.py`.
3. Run `python scripts/build_mock_design_review.py --exam <new_mock.md> --answers <new_answers.md>`.
4. Run `python scripts/validate_mock_wine_facts.py --exam <new_mock.md> --answers <new_answers.md> --strict-research`.

The mock is not final unless the design review is at least PASS WITH WARNINGS and strict research validation passes.
