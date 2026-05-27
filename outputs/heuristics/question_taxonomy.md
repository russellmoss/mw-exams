# Question Taxonomy

This taxonomy is the canonical classification system for MW practical questions across Papers 1, 2, and 3.

It is designed for four downstream uses:

1. tag every historical question consistently
2. build paper-specific decision trees
3. generate pre-taste and in-taste matrices by question type
4. train the candidate to recognize "what kind of problem this is" before tasting

## Classification model

Each question should be tagged on four levels:

1. `paper`
2. `family`
3. `subcategory`
4. `secondary tags`

The `family` is the main strategic unit. It answers: "What kind of exam problem is this?"

The `subcategory` captures recurring structural variants within a family.

The `secondary tags` capture overlays that matter for training but do not define the core family on their own.

## Level 1: Paper

- `P1` = white still wines
- `P2` = red still wines
- `P3` = mixed styles: sparkling, fortified, sweet, rose, oxidative, unusual, occasional cross-category flights

## Level 2: Core families

Every question must be assigned to exactly one core family.

### F1. Same Variety Comparative Set

Definition: the stem explicitly or functionally constrains multiple wines to the same single grape variety or one dominant varietal family.

Use when the candidate's task is primarily to recognize one grape family and then separate expressions by origin, climate, winemaking, quality, or maturity.

Typical signals:

- "same single grape variety"
- one named variety given in the stem
- one grape clearly links all wines despite different countries or styles

Common exam purpose:

- variety recognition under changing terroir/style conditions
- origin discrimination within one varietal frame
- quality/maturity comparison inside one grape family

Subcategories:

- `F1a same variety, same country`
- `F1b same variety, different countries`
- `F1c same variety, same region or producer context`
- `F1d same variety across different styles/categories`

Notes:

- `F1d` matters especially in Paper 3, where one variety may appear as sparkling/still/sweet/fortified or in sharply different winemaking styles.

### F2. Same Origin Comparative Set

Definition: the stem explicitly or functionally anchors the wines to the same country, region, appellation, or narrower origin, while style or varietal differences within that origin do the work.

Use when origin is the frame and the candidate must explain internal diversity.

Typical signals:

- "from the same country"
- "from the same region"
- same origin paired with different varieties, styles, classifications, or methods

Common exam purpose:

- testing regional literacy
- showing stylistic range within one place
- comparing terroir, classification, winemaking, or maturity within an origin

Subcategories:

- `F2a same country, different varieties`
- `F2b same region, different varieties or styles`
- `F2c same producer / hierarchy / classification within one origin`
- `F2d same origin, different sweetness / age / elevage expressions`

### F3. Blend / Composition Logic Set

Definition: the stem centers the question on blended wines, shared blend composition, or comparison between wines where composition itself is a main lever.

Use when the candidate must think in terms of components and the stylistic effect of blending, not just single-variety recognition.

Typical signals:

- "blends"
- "same two grape varieties"
- "predominant varieties differ"
- a contrast driven by proportion or role of components

Common exam purpose:

- testing whether the candidate can identify blend families
- comparing how blend composition changes style and quality
- forcing discussion of grape roles rather than single-variety typicity

Subcategories:

- `F3a same blend family, different origins`
- `F3b same origin, different blend composition`
- `F3c compare varietal roles within blends`
- `F3d blend vs varietal-expression contrast`

### F4. Mixed Identification Breadth Set

Definition: the stem presents several wines with no single shared grape or origin anchor, and the candidate must identify each wine independently or near-independently.

Use when breadth is the central challenge.

Typical signals:

- several different countries
- several different varieties
- no obvious common thread beyond paper context
- each wine appears to be its own identification problem

Common exam purpose:

- testing broad practical coverage
- punishing over-linking between wines
- forcing disciplined independent assessment

Subcategories:

- `F4a all wines independent`
- `F4b partly linked set with one local pair`
- `F4c broad survey with one hidden organizing theme`

Notes:

- `F4b` covers stems where one country contributes two wines or one local relationship exists, but the dominant experience is still breadth.

### F5. Method / Production Dominant Set

Definition: the main intellectual burden is explaining how the wine was made, how production choices shape style, or how method distinguishes the wines more than varietal or origin precision alone.

Use when production knowledge is central to marks and strategy.

Typical signals:

- production methods explicitly asked
- human inputs versus natural factors
- style differences driven by fermentation, maturation, oxidation, fortification, sweetness creation, or sparkling method

Common exam purpose:

- testing technical understanding through tasting
- making candidates translate palate clues into process
- weighting method explanation heavily

Subcategories:

- `F5a sparkling-method comparison`
- `F5b oxidative vs reductive / elevage comparison`
- `F5c fortification / maturation mechanism comparison`
- `F5d sweetness-production mechanism comparison`
- `F5e human inputs vs natural factors`
- `F5f general winemaking / style-commercial analysis`

Notes:

- In many P3 questions, this family is more important than exact producer-level identification.

### F6. Style Mechanism Comparative Set

Definition: the wines are grouped to test one structural or stylistic axis such as sweetness, alcohol, tannin shape, climate expression, maturity, or commercial position.

Use when the question is effectively: "Can you explain the mechanism behind these style differences?"

Typical signals:

- explicit references to alcohol, residual sugar, maturity, quality, commercial position, or style
- wines chosen to illustrate a structural continuum rather than a simple origin set

Common exam purpose:

- translating palate structure into cause
- distinguishing similar outcomes produced by different mechanisms
- making the candidate rank or contrast wines along a technical axis

Subcategories:

- `F6a sweetness / residual sugar axis`
- `F6b alcohol / ripeness axis`
- `F6c tannin / extraction / body axis`
- `F6d maturity / development axis`
- `F6e quality / commercial position axis`
- `F6f climate / site expression axis`

Notes:

- `F6` differs from `F5` because `F6` is about the comparative axis being tested, while `F5` is about production-method explanation as the dominant knowledge task.

### F7. Hierarchy / Quality Calibration Set

Definition: the set is built to test whether the candidate can place wines within a quality ladder, classification ladder, producer hierarchy, or commercial tier.

Use when the main trap is not basic identification but calibration of level.

Typical signals:

- explicit requests on quality, maturity, commercial position, classification
- wines from related quality tiers
- premium vs commercial contrast

Common exam purpose:

- quality calibration
- hierarchy recognition inside an origin or style family
- explaining why one wine is more ambitious, ageworthy, or commercially positioned differently

Subcategories:

- `F7a classification ladder`
- `F7b producer / cuvee hierarchy`
- `F7c premium vs commercial tier`
- `F7d age / maturity hierarchy`

### F8. Examiner Curveball / Boundary Set

Definition: the stem or wine selection is designed to break default assumptions for that paper, usually by introducing borderline styles, unusual varieties, atypical regions, or deliberately confusing analogues.

Use when the set is fundamentally a trap against over-automation.

Typical signals:

- unusual style for the paper
- obscure or less-classic variety/origin
- atypical expression intended to mimic a more famous category
- final-question curveball behavior

Common exam purpose:

- testing adaptability
- punishing narrow stereotype-based tasting
- checking whether the candidate can keep paper context without becoming captive to it

Subcategories:

- `F8a atypical style within paper`
- `F8b obscure variety / origin`
- `F8c classic wine in non-classic expression`
- `F8d deceptive analogue / masquerader`

Notes:

- `F8` should be used only when the curveball nature is the main strategic feature. A merely unusual wine inside another clearly dominant family should stay in that other family and receive `curveball` as a secondary tag instead.
- `F8` should not be assigned from realized wine identity or post-hoc answer knowledge. The stem itself must signal the boundary/trap behavior.

## Level 3: Secondary tags

Secondary tags do not replace the core family. They add training-relevant metadata.

Apply any that fit:

- `variety-led`
- `origin-led`
- `method-led`
- `structure-led`
- `quality-led`
- `maturity-led`
- `commercial-position-led`
- `same-country`
- `same-region`
- `same-producer`
- `same-vintage`
- `single-variety`
- `blend`
- `mixed-styles`
- `sparkling`
- `sweet`
- `fortified`
- `oxidative`
- `aromatic`
- `oak-driven`
- `climate-comparison`
- `human-vs-natural`
- `curveball`
- `breadth-test`
- `trap-on-paper-context`

## Classification rules

Use these rules to keep tagging consistent.

### Rule 1: assign one core family only

Pick the family that best describes the main strategic problem the candidate must solve.

### Rule 2: use the stem first, then the actual wine logic

Primary classification should be based on what the question asks and how it frames the task, not only on what the wines later turn out to be.

### Rule 3: prefer the dominant comparative logic

If a question could fit two families, choose the one that drives the candidate's thinking most strongly.

Examples:

- same variety across countries with heavy style discussion = usually `F1`, not `F6`
- same region with quality ranking = usually `F2` or `F7` depending on whether origin-diversity or hierarchy-calibration is the main exam problem
- sweet-wine comparison focused on production mechanisms = usually `F5d`, not `F6a`

### Rule 4: do not overuse curveball

`F8` is reserved for questions where the unusual or boundary-testing character is the main strategic identity of the set.

### Rule 5: paper context matters

The same structural family behaves differently by paper:

- `F1` in `P1` often means white varietal benchmarking across climates or regions
- `F1` in `P2` often means red varietal benchmarking with tannin/oak/ripeness calibration
- `F1` in `P3` often means one grape expressed across radically different styles

## Recommended training build

Build the next layer of study outputs in this order:

1. paper-level tree
2. family-level tree within each paper
3. pre-taste matrix for each `paper x family`
4. in-taste matrix for each `paper x family`
5. examples from historical questions mapped into each family

## Minimum working taxonomy for immediate use

If a lighter version is needed for first-pass tagging, use these eight core labels:

- `same_variety`
- `same_origin`
- `blend_logic`
- `mixed_identification`
- `method_dominant`
- `style_mechanism`
- `hierarchy_quality`
- `curveball_boundary`

That compressed version is acceptable for first-pass corpus tagging, but the full family/subcategory model should be used for final matrices.
