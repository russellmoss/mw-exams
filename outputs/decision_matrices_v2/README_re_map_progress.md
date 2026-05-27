---
generated: 2026-05-26
purpose: track which historical decision matrices have been re-mapped into the family-aware Phase 5B template
companion_docs:
  - outputs/master_trees/p3_family_tree_pack.md
  - outputs/master_trees/p2_family_tree_pack.md
  - outputs/master_trees/p1_family_tree_pack.md
  - outputs/heuristics/family_matrix_templates.md
  - outputs/heuristics/question_taxonomy_index.md
---

# Decision Matrices v2 — Re-Map Progress

## What this tracks

`outputs/decision_matrices_v2/` was first generated in a tree-aware pass on 2026-05-25 (Phase 5B). On 2026-05-26 the family tree packs and per-family matrix templates were built. Every v2 matrix should be re-mapped to follow the new family-aware template structure (universal header → F{n} pre-taste matrix → in-taste matrix per wine → reality check), and to link to:

- the relevant **family tree pack** section
- the relevant **matrix template** in `family_matrix_templates.md`

The re-map preserves source material (candidates, rationale, evidence) but reorganises it under the per-family skeleton so that all 112 matrices share one vocabulary.

## Re-map convention

Each re-mapped file has YAML frontmatter:

```
family: F{n}{subcategory}
family_tree_pack_section: "outputs/master_trees/p{N}_family_tree_pack.md#... — Branch X.Y ..."
matrix_template: "outputs/heuristics/family_matrix_templates.md#..."
phase: "5B (family-aware re-map)"
generated: 2026-05-26
```

And uses the per-family matrix template, with the in-taste matrix split into one block per wine.

## Bucket-by-bucket progress

### Phase 5B-FA (family-aware) batch 1 — P3 F5 (10/10 complete)

The highest-priority bucket per `decision_tree_remaining_work.md`. The P3 F5 tree pack section is the most opinionated and the LOYO impact of family-aware re-mapping should be most visible here.

| Question | Sub-form | Re-mapped | Notes |
| --- | --- | --- | --- |
| `2015_p3_q1` | F5b yeast-role | ✅ 2026-05-26 | Two-and-two yeast structure: autolysis + flor/voile. |
| `2016_p3_q2` | F5c fortified | ✅ 2026-05-26 | Sherry + Port + Madeira canonical trio. |
| `2017_p3_q2` | F5f origin-suppressed | ✅ 2026-05-26 | Skin-contact / orange wine archetype. |
| `2017_p3_q6` | F5c fortified | ✅ 2026-05-26 | Dry Sherry + sweet red fortified commercial-archetype pair. |
| `2019_p3_q4` | F5c fortified | ✅ 2026-05-26 | Sherry + Jura voile two-country biological-aging pair. |
| `2021_p3_q2` | F5d sweetness | ✅ 2026-05-26 | Five-mechanism sweep (Amarone / Brachetto / Vintage Port / Maury / Rutherglen). |
| `2022_p3_q2` | F5d sweetness | ✅ 2026-05-26 | Five-country, five-variety sweet-white mechanism sweep. |
| `2023_p3_q1` | F5a sparkling | ✅ 2026-05-26 | Cava + Crémant + English + Sekt big-four template. |
| `2023_p3_q2` | F5d sweetness | ✅ 2026-05-26 | Three-rosé-method reading (Champagne saignée + Provence direct press + Mateus pétillant). |
| `2024_p3_q1` | F5a sparkling | ✅ 2026-05-26 | Two-wine non-Champagne sparkling commercial contrast (California + Cava). |

### Phase 5B-FA (family-aware) batch 2 — P3 F4 (9/9 complete)

The mixed-identification breadth bucket for P3, where the family discipline (anti-overlink, per-slot independence, theme-as-filter) gets its most active test. The 9 questions cover the full F4 sub-form spread: pure breadth (F4a), partly-linked country-doubled or two-pair (F4b), and hidden-theme (F4c).

| Question | Sub-form | Re-mapped | Notes |
| --- | --- | --- | --- |
| `2015_p3_q2` | F4b partly-linked | ✅ 2026-05-26 | Four wines / three countries; Portugal doubled (Port + Madeira) + Spain (Oloroso) + Australia (fortified Shiraz). |
| `2016_p3_q3` | F4a (botrytis variant) | ✅ 2026-05-26 | Two-wine cross-country botrytis pair: Tokaji Aszú + Sauternes. |
| `2017_p3_q1` | F4a (rosé commercial-spectrum) | ✅ 2026-05-26 | Three-rosé cross-country mass-market / premium / sparkling spread. |
| `2018_p3_q3` | F4c hidden-theme | ✅ 2026-05-26 | Rhône-variety diaspora: Cinsault (Lodi) + Garnacha (Spain) + Mourvèdre (Bandol). |
| `2019_p3_q3` | F4a (rosé four-wine variant) | ✅ 2026-05-26 | Four-rosé 2 OW + 2 NW commercial-spectrum: France + Spain + USA + NZ. |
| `2021_p3_q1` | F4a (sparkling-led) | ✅ 2026-05-26 | Three-traditional-method sparkling spread; method de-emphasised so within-method discrimination is the test. |
| `2021_p3_q3` | F4b two-pair | ✅ 2026-05-26 | Jerez pair (dry / sweet Oloroso) + Madeira pair (Full Rich / Single Harvest Boal). |
| `2022_p3_q1` | F4b two-country pair | ✅ 2026-05-26 | Italy (Prosecco Rosé + Lambrusco) + France (Champagne Rosé + Crémant) sparkling-rosé spectrum. |
| `2022_p3_q3` | F4a (oxidative-sweet family) | ✅ 2026-05-26 | Italy (Recioto passito) + Portugal (Tawny Port) + Australia (Grand Tawny). |

**Cross-bucket patterns surfaced:**
- "Three wines / three countries" with no variety asked + commercial-position emphasis = rosé commercial spread (F4a). Recurs in 2017, 2019.
- "Four wines / three countries" with heavy method-and-maturity marks = fortified breadth with doubled-country structure (F4b). Recurs in 2015, 2021 (different structure but same fortified-rich logic).
- De-emphasised method marks (5) in a sparkling stem = within-method discrimination is the test (all-traditional or all-Charmat), not method spread. Confirmed in 2021 Q1.
- "Two-pair, two regions" with heavy production marks = Jerez + Madeira default (F4b). Confirmed in 2021 Q3.
- Hidden-theme F4c is most opinionated against the obvious choice (Syrah, Champagne, classic European fortifieds); the IMW prefers curveball-leaning picks (Cinsault, Lambrusco rosato) when the stem softens its language.

### Phase 5B-FA (family-aware) batch 3 — P2 F3 (2/2 complete)

The smallest bucket but the highest-leverage tree-pack section (Bordeaux-variety blend logic spills into half of P2 F2 same-origin questions too). Both questions are Bordeaux-family-led; the two sub-forms (F3c and F3d) test the two extremes of blend pedagogy.

| Question | Sub-form | Re-mapped | Notes |
| --- | --- | --- | --- |
| `2019_p2_q1` | F3c single-blend-family across origins | ✅ 2026-05-26 | Bordeaux variety global spread: Bordeaux + Tuscany + Loire Cab Franc + Stellenbosch. |
| `2022_p2_q1` | F3d blend-vs-varietal contrast | ✅ 2026-05-26 | Three singles (Cab Franc Loire / Cab Sauv Napa / Merlot Chile) + Bordeaux blend (Pessac-Léognan). |

**Cross-bucket patterns surfaced:**
- "Bordeaux varieties" stems are the universal P2 F3 trigger; the corpus has no Rhône-family F3 single-blend-family question yet.
- The home-blend slot is always Bordeaux itself when the structure is F3d (singles + blend); New World Meritage blends are corpus-untested in this slot.
- The non-French / non-Bordeaux origin (Stellenbosch / Tuscany / Napa) is the anti-collapse anchor in every F3 question; the candidate who collapses all four wines into Bordeaux-and-Bordeaux-variants loses the breadth marks.

### LOYO checkpoint (batches 1–3)

Batches 1–3 = 21 / 112 matrices (P3 F5 + P3 F4 + P2 F3). LOYO rerun completed 2026-05-26. Results:
- Naive delta: +38.1pp (PASS, threshold +20pp)
- Top-3 variety: 74.9% (PASS, threshold 70%)
- Candidate-set hit: 91.0% (PASS, threshold 85%)

Scorer bugs diagnosed and fixed during LOYO rerun:
- Parser CS cleaning: style names ("Port", "Sherry", "Cava") now resolve to grape varieties
- Scorer style-to-grape fallback added to `run_loyo.py`
- Substring variety matching added to `score_predictions.py` ("Chenin" ↔ "Chenin Blanc", "Muscat" ↔ "Muscat of Alexandria")

### Phase 5B-FA batch 4 — P1 F4 (9/9 complete)

The P1 anti-overlink breadth bucket. Nine questions covering the full F4 sub-form spread in the whites paper: 8× F4a pure breadth + 1× F4b partly linked.

| Question | Sub-form | Re-mapped | Notes |
| --- | --- | --- | --- |
| `2015_p1_q3` | F4a pure breadth | ✅ 2026-05-26 | Six wines / six varieties / grab-bag. Earlier-question elimination (Chardonnay + Chenin removed) is central pre-taste move. |
| `2016_p1_q5` | F4a pure breadth | ✅ 2026-05-26 | Four countries / four varieties. Torrontés / Gewürztraminer rose-lychee confusion is the key in-taste discrimination. |
| `2017_p1_q3` | F4a pure breadth | ✅ 2026-05-26 | Two Italian varieties — F4a applied within single country; anti-overlink still relevant for varietal independence. |
| `2017_p1_q4` | F4a pure breadth | ✅ 2026-05-26 | Three wines. Context-elimination from Q1–Q3 preserved in default rule-outs. |
| `2018_p1_q2` | F4a pure breadth | ✅ 2026-05-26 | Maximum-breadth case: six wines / six countries / six varieties. Hunter Sémillon and White Rioja flagged as perennial IMW favourites. |
| `2019_p1_q2` | F4b partly linked | ✅ 2026-05-26 | Country-pair structure. Three pairs, end-of-pair reset discipline. Moscato d'Asti 5.5% ABV curveball flagged. |
| `2022_p1_q4` | F4a pure breadth | ✅ 2026-05-26 | Identification-led variant (variety + origin = 15 marks each). Layer A top-down entry point. |
| `2023_p1_q2` | F4a pure breadth | ✅ 2026-05-26 | Structure-led variant (acidity/texture + ageing dominate marks). Layer B structural analysis entry point. |
| `2024_p1_q2` | F4a pure breadth | ✅ 2026-05-26 | Method-led variant with inverted marks (method 7 + style/commercial 12 > variety 6). Method-first entry point. |

**Cross-bucket patterns surfaced:**
- Earlier-question elimination is the most powerful P1 F4 pre-taste move: varieties already used in Q1–Q3 are removed from the candidate universe for the final question.
- Same-family, three different analytical entry points: identification-led (2022), structure-led (2023), method-led (2024) — the F4a template adapts by changing which layer is the primary navigation tool.
- Torrontés / Gewürztraminer discrimination (rose-lychee aromatic pair) recurs as the key in-taste trap across multiple P1 F4 questions.
- The partly-linked F4b variant (2019) uses country-pair structure requiring explicit end-of-pair resets.

### Next priority buckets (pending)

| Priority | Bucket | Count | Tree pack section |
| --- | --- | --- | --- |
| 5 | P3 F7 classification | 3 | `p3_family_tree_pack.md#f7-hierarchy--quality-calibration-set-p3` |
| 6 | P3 F6 sweetness axis | 4 | `p3_family_tree_pack.md#f6-style-mechanism-comparative-set-p3` |
| 7 | P3 F2 same-origin | 8 | `p3_family_tree_pack.md#f2-same-origin-comparative-set-p3` |
| 8 | P3 F1 cross-style | 4 | `p3_family_tree_pack.md#f1-same-variety-comparative-set-p3` |
| 9 | P2 F1 same-variety | 10 | `p2_family_tree_pack.md#f1-same-variety-comparative-set-p2` |
| 10 | P2 F2 same-origin | 8 | `p2_family_tree_pack.md#f2-same-origin-comparative-set-p2` |
| 11 | P2 F4 anti-overlink | 15 | `p2_family_tree_pack.md#f4-mixed-identification-breadth-set-p2` |
| 12 | P2 F7 classification | 2 | `p2_family_tree_pack.md#f7-hierarchy--quality-calibration-set-p2` |
| 13 | P1 F1 same-variety | 11 | `p1_family_tree_pack.md#f1-same-variety-comparative-set-p1` |
| 14 | P1 F2 same-country | 8 | `p1_family_tree_pack.md#f2-same-origin-comparative-set-p1` |
| 15 | P1 F3 blend | 4 | `p1_family_tree_pack.md#f3-blend--composition-logic-set-p1` |
| 16 | P1 F5 method | 2 | `p1_family_tree_pack.md#f5-method--production-dominant-set-p1` |
| 17 | P1 F7 classification | 3 | `p1_family_tree_pack.md#f7-hierarchy--quality-calibration-set-p1` |

Total remaining after batch 4: 82 of 112 matrices.

## After each bucket

1. Update this README with the new bucket marked complete.
2. LOYO checkpoint at batches 1–3 = 21 / 112 matrices (now reached). Rerun LOYO before starting batch 4.
3. If a re-mapped matrix surfaces an anti-collapse rule or branch logic that the tree pack does not cover, propose a tree-pack patch *only if* the same pattern shows up in at least two questions in the bucket.

## How to read a re-mapped matrix

The re-mapped file has six sections:

1. **YAML frontmatter** — family tag, links to the relevant family tree pack section and matrix template.
2. **Question verbatim** — unchanged.
3. **Pre-taste matrix** — Universal header + per-family pre-taste block from the matrix templates.
4. **In-taste matrix** — one per-wine block, all following the per-family in-taste template (snapshot, style/acid/body/sugar/alcohol, oak/lees/oxidation, method family, key production lever, style consequence, origin, variety, quality, branch-B alternative).
5. **Anti-collapse / family-specific discipline note** — short paragraph reinforcing the family's main trap.
6. **Reality check** — actual wines + pre-taste accuracy + in-taste accuracy + one lesson.

## Provenance

All re-mapped matrices preserve the candidate reasoning and evidence from the Phase 5B (tree-aware) versions, reorganised under the family-aware skeleton. No new factual claims have been added — the re-map is a structural and vocabulary alignment, not a research re-do.
