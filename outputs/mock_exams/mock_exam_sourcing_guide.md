# Mock Exam Sourcing Guide

*Generated from the historical corpus on 2026-05-26.*

## Why this exists

This guide makes the mock-exam writer more human and more exam-realistic. It should not blindly reuse the same producers or exact sourcing patterns from the past papers, but it should stay inside the historical sourcing envelope: benchmark regions, representative producers, realistic quality ladders, and plausible vintage freshness for a 2026 exam.

## Hard sourcing rules for 2026 mocks

- Use the historical corpus as a sourcing envelope, not a cloning list.
- Default to real, currently plausible market vintages for 2026.
- For young whites on Paper 1, prefer 2024-2025 vintages unless the question needs bottle development.
- For young reds on Paper 2, prefer 2023-2024 vintages unless the question needs development, oak integration, or mature tertiary structure.
- For Paper 3, let category drive vintage: NV for many sparkling/fortified wines, recent vintages for fresh aromatic or demi-sec wines, older vintages where oxidative or mature sweet styles are intrinsic.
- Within each question, deliberately vary quality tier, region, and commercial position when the marks ask for those distinctions.
- For quality-ranking questions, use the price-tier analysis as a guardrail: broad discrimination needs at least three price bands; all-premium flights need an explicit hierarchy hook.
- For Paper 1 production-method or winemaking questions, require a method-hook ledger before finalizing the flight: each wine needs a distinct discussable production hook, or at least one wine must be a clear method outlier. Do not ask production-method marks on three similar clean aromatic whites from the same region and tier.
- Use `data/mock_wine_bank.json` as the first external-candidate pool when the historical corpus is too narrow or recent mocks have overused a motif. Filter by `useful_families`, `style_category`, `price_band`, `quality_tier`, and cooldown motifs before naming wines.
- Default mix for new full mocks: at least 30% of named wines should come from the historical corpus, with the remaining selections drawn from `data/mock_wine_bank.json` or other validated external research. For a 36-wine exam, that means at least 11 historical wines and up to 25 bank-backed wines.
- Before finalizing any named mock wine, create a source-backed entry in `data/mock_wine_research/{mock_exam_id}.json`; do not let the answer writer invent vineyard, soil, producer, oak, price, or classification facts from memory.
- If the mock wine bank lacks a wine for the needed role, run wine research first and add a validated bank entry rather than letting the writer improvise.
- Run `python scripts/validate_mock_wine_facts.py --exam <mock.md> --answers <answers.md> --strict-research` before accepting a mock answer key.
- If you leave the corpus for a wine, research it first and mark it as external only if necessary.

## Quality / price-tier guardrail

Use `outputs/heuristics/quality_price_tier_analysis.md` when building quality-led questions.

- Historical price-band proxy distribution: premium=236, value=122, super_premium=85, luxury=36, mainstream=25
- Quality-led questions analysed: `134`
- Quality-led questions with three or more price bands: `23`
- Compressed all-high-priced quality questions: `60`
- Top-heavy quality questions: `35`

Exam-writer rule: if a question asks candidates to rank or distinguish quality, either build a visible ladder from value/mainstream to premium/fine wine, or make the stem explicitly about classification, same producer, same appellation, or another legally meaningful hierarchy.

## Quality / winemaking-diversity guardrail

Use `outputs/heuristics/winemaking_diversity_quality_questions.md` when a quality question also cites winemaking, method, production, oak, maturation, or human factors.

- Historical quality + winemaking/method questions analysed: `91`
- High diversity: `75`
- Moderate or paired/limited diversity: `8`
- Homogeneous winemaking signatures: `8`
- Same-variety homogeneous rate: `2` / `20`
- Compare/rank homogeneous rate: `1` / `18`

Exam-writer rule: if the stem asks for quality with reference to winemaking, a 3-wine flight needs at least two distinct winemaking signatures and a 4-wine flight needs at least three, unless the stem explicitly says classification, terroir, or same producer is the point. If the wines share the same production logic, ask quality with reference to origin/classification instead of winemaking.

## Full wine-selection scorecard guardrail

Use `outputs/heuristics/wine_selection_logic_by_question_type.md` and `scripts/build_mock_design_review.py` before finalizing a mock.

- Historical questions scored: `153`
- Historical fit statuses: strong=113, acceptable=23, fail=11, weak=6
- Family coverage: F1=33, F2=38, F3=7, F4=43, F5=16, F6=5, F7=11

Exam-writer rule: each question family has required active contrast axes. F1 needs expression spread; F2 needs internal-origin diversity; F3 needs blend-role differences; F4 needs independence; F5 needs method diversity; F6 needs structural mechanism spread; F7 needs a hierarchy or quality ladder.

## Cross-mock rotation guardrail

Use `outputs/mock_exams/mock_rotation_analysis.md` before selecting a new full mock blueprint.

- Full mocks analysed: `7`
- Historical Vouvray frequency: `7` / `504` wines
- Historical P3 Q1 sparkling frequency: `4` / `13` P3 Q1 questions
- Current repeated mock motifs: riesling=27, bordeaux=16, vouvray=13, huet=12, mosel=8, madeira=8

Exam-writer rule: never repeat the same paper/question family-subtype position in consecutive full mocks unless explicitly drilling. Rotate opening families, especially P3 Q1. Do not default P3 Q1 to three-country sparkling. Put lower-frequency motifs such as Vouvray, Huet/Foreau, Savennières, Tokaji, Rutherglen, Vin Santo, Etna, and Madeira on a two-mock cooldown after use.

## Validated mock wine bank

Use `data/mock_wine_bank.json` as the controlled candidate pool for new or underused wines, and check `outputs/mock_exams/mock_wine_bank_report.md` for current coverage.

- Validated entries: `94`
- Style coverage: still_dry=63, sparkling=9, fortified=8, still_sweet=6, oxidative=4, still_off_dry=2, orange=1, rose=1
- Price-band coverage: premium=43, super_premium=20, mainstream=18, luxury=10, value=3
- Quality-tier coverage: benchmark=45, iconic=28, regional=11, commercial=6, premium=4
- Family coverage: F1=62, F2=46, F3=12, F4=32, F5=42, F6=37, F7=91
- Top country coverage: France=27, Italy=12, Spain=9, Australia=9, Portugal=8, South Africa=6, Germany=5, Argentina=3, Chile=3, United States=3

Exam-writer rule: select from the bank by role, not by habit. Each chosen wine must match the question family, add a live contrast axis, avoid current cooldown motifs, and have source-backed facts copied into the mock-specific research file before the answer key is written.

## Paper-specific vintage logic

- Paper 1: freshness matters, so youthful examples should usually be 2024-2025; top-tier Chardonnay/Riesling/Chenin can be older when ageability or maturity is part of the question.
- Paper 2: youthful commercial reds should usually be 2023-2024; serious Nebbiolo, Rioja, Bordeaux blends, and structured Syrah/Sangiovese can be older where development is educationally useful.
- Paper 3: NV is normal for many sparkling and fortified wines; sweet/oxidative wines can be much older if that is part of category identity.

## Paper 1 - Whites

- Historical wines in corpus: `168`

### Top countries

- `France`: 63
- `Australia`: 21
- `New Zealand`: 13
- `USA`: 12
- `Spain`: 12
- `Italy`: 12
- `South Africa`: 10
- `Austria`: 9

### Top regions

- `Burgundy`: 17
- `Alsace`: 15
- `Loire`: 10
- `California`: 8
- `Marlborough`: 8
- `Loire Valley`: 6
- `Wachau`: 5
- `Rioja`: 5

### Top style categories

- `still_dry`: 156
- `still_sweet`: 6
- `oxidative`: 4
- `sparkling`: 1
- `orange`: 1

### Quality-tier proxy buckets

- `unspecified`: 88
- `mid_tier`: 51
- `upper_tier`: 18
- `benchmark_premium`: 9
- `commercial`: 2

### Age / vintage buckets

- `mature_7y_plus`: 134
- `developing_3_6y`: 33
- `nv`: 1

### Sourcing guidance

- Build questions around benchmark white families first: Chardonnay, Riesling, Sauvignon Blanc, Chenin Blanc, Semillon, Pinot Gris, white blends.
- Make at least one question distinguish hierarchy or winemaking, not just raw grape ID.
- If a question asks for method of production or winemaking, give candidates real production hooks: oak/MLF/lees handling, sur lie, skin contact, oxidative handling, sweetness mechanism, wild ferment, age-release strategy, or a commercial-vs-premium cellar regime. A same-region aromatic trio such as Alsace Pinot Gris, Gewurztraminer, and Muscat is historically better as an ID/style/maturity question unless one wine has a clearly different method.
- Include a spread of tiers: at least one commercial or mid-tier foil, at least one benchmark premium wine, and at least one wine with genuine ageing or complexity value.
- Representative producers should feel exam-plausible: serious regional benchmarks, widely known estates, or credible premium commercial labels.

## Paper 2 - Reds

- Historical wines in corpus: `168`

### Top countries

- `France`: 50
- `Italy`: 27
- `USA`: 16
- `Spain`: 12
- `Australia`: 11
- `Chile`: 9
- `New Zealand`: 9
- `Argentina`: 8

### Top regions

- `Bordeaux`: 16
- `California`: 12
- `Tuscany`: 10
- `Burgundy`: 9
- `Rioja`: 8
- `Beaujolais`: 7
- `Piedmont`: 7
- `Rhône Valley`: 7

### Top style categories

- `still_dry`: 167
- `fortified`: 1

### Quality-tier proxy buckets

- `unspecified`: 94
- `mid_tier`: 57
- `upper_tier`: 10
- `benchmark_premium`: 7

### Age / vintage buckets

- `mature_9y_plus`: 126
- `developing_4_8y`: 40
- `young_0_3y`: 2

### Sourcing guidance

- Build around structurally distinct red families: Pinot Noir, Nebbiolo, Sangiovese, Tempranillo, Syrah/Shiraz, Bordeaux varieties and blends.
- Make the paper test tannin, oak, climate, and maturity, not just fruit profile.
- Include tier spread deliberately: one or two benchmark ageworthy wines, one value or entry-level contrast, and one mid-premium regional classic.
- Historical sourcing strongly favors classic red regions over novelty for novelty's sake.

## Paper 3 - Special

- Historical wines in corpus: `168`

### Top countries

- `France`: 55
- `Portugal`: 22
- `Italy`: 19
- `Spain`: 18
- `Germany`: 11
- `New Zealand`: 10
- `USA`: 10
- `Australia`: 9

### Top regions

- `Champagne`: 14
- `Bordeaux`: 12
- `Madeira`: 9
- `Mosel`: 9
- `Veneto`: 9
- `Douro`: 8
- `California`: 8
- `Burgundy`: 6

### Top style categories

- `fortified`: 41
- `sparkling`: 40
- `still_sweet`: 40
- `still_dry`: 31
- `rose`: 9
- `oxidative`: 4
- `orange`: 2
- `rosé`: 1

### Quality-tier proxy buckets

- `unspecified`: 107
- `mid_tier`: 39
- `upper_tier`: 14
- `benchmark_premium`: 8

### Age / vintage buckets

- `mature_9y_plus`: 85
- `nv`: 45
- `developing_4_8y`: 27
- `unknown`: 7
- `young_0_3y`: 4

### Sourcing guidance

- Category logic is primary: sparkling method, oxidative vs topped-up, sweetness mechanism, fortification route.
- Include at least one trap where sugar is present but not at dessert-wine scale, or where oxidation is category-defining rather than faulty.
- Make sure the wine mix spans commercial reality: benchmark category leaders plus at least one niche or sommelier-facing curveball.
- Be cautious with blend-family predictions here; category cues matter more than exact grape in many question structures.

## How the mock-exam writer should use this

- Start from the question structure you want to test.
- Choose the educational contrast needed: quality ladder, region contrast, winemaking contrast, maturity contrast, commercial contrast, or sweetness/fortification mechanism.
- Then choose wines that fit that contrast while staying inside the historical sourcing envelope.
- For full mocks, keep the selection mix roughly 30% historical corpus and 70% validated bank/external candidates unless a paper-specific pattern calls for a stronger historical tilt.
- Do not back-solve by copying historic producer choices. Instead, pick representative wines that a human exam setter could plausibly source in 2026.
- Use `data/wine_research/` first for historical wines and `data/mock_wine_bank.json` for validated external candidates. If a category gap appears, invoke wine research and add the result to the bank before finalizing the mock.
- Do not reuse Vouvray, Huet, Foreau, generic sparkling-openers, Madeira, or other cooldown motifs just because they are familiar; the bank exists to give the writer better options.

