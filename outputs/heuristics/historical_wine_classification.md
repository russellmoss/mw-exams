# Historical Wine Classification

This file classifies the historical exam wine corpus into reusable sourcing roles for mock generation and predictive modeling.

- Wines classified: `540`

## Distribution

### benchmark_status

- `benchmark_classic`: `195`
- `nonbenchmark`: `153`
- `iconic_benchmark`: `144`
- `benchmark_regional`: `48`

### question_role

- `method_reference`: `326`
- `maturity_reference`: `78`
- `commercial_foil`: `43`
- `benchmark_anchor`: `39`
- `supporting_reference`: `23`
- `sweetness_reference`: `19`
- `comparative_peer`: `6`
- `curveball_probe`: `6`

### curveball_level

- `low`: `421`
- `medium`: `85`
- `high`: `34`

### commercial_tier

- `specialist_premium`: `310`
- `commercial`: `182`
- `fine_wine`: `48`

### maturity_role

- `developing`: `230`
- `young_primary`: `135`
- `mature_tertiary`: `98`
- `non_vintage_category`: `55`
- `oxidative_or_natively_aged`: `16`
- `unknown`: `6`

## Label meanings

- `benchmark_status`: whether the wine acts as an iconic benchmark, a classic benchmark, a regional benchmark, or a non-benchmark foil.
- `question_role`: the main job the wine appears to do inside the question.
- `curveball_level`: how likely the wine is to disrupt a straightforward exam-reading path.
- `commercial_tier`: rough commercial positioning, used for quality-tier balancing.
- `maturity_role`: how the wine is likely functioning on the maturity axis.

