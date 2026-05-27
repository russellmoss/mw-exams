# Historical Wine Classification

This file classifies the historical exam wine corpus into reusable sourcing roles for mock generation and predictive modeling.

- Wines classified: `504`

## Distribution

### benchmark_status

- `nonbenchmark`: `181`
- `benchmark_classic`: `154`
- `iconic_benchmark`: `124`
- `benchmark_regional`: `45`

### question_role

- `method_reference`: `307`
- `maturity_reference`: `69`
- `commercial_foil`: `54`
- `benchmark_anchor`: `35`
- `supporting_reference`: `25`
- `sweetness_reference`: `6`
- `comparative_peer`: `4`
- `curveball_probe`: `4`

### curveball_level

- `low`: `383`
- `medium`: `90`
- `high`: `31`

### commercial_tier

- `specialist_premium`: `238`
- `commercial`: `221`
- `fine_wine`: `45`

### maturity_role

- `developing`: `216`
- `young_primary`: `126`
- `mature_tertiary`: `93`
- `non_vintage_category`: `49`
- `oxidative_or_natively_aged`: `13`
- `unknown`: `7`

## Label meanings

- `benchmark_status`: whether the wine acts as an iconic benchmark, a classic benchmark, a regional benchmark, or a non-benchmark foil.
- `question_role`: the main job the wine appears to do inside the question.
- `curveball_level`: how likely the wine is to disrupt a straightforward exam-reading path.
- `commercial_tier`: rough commercial positioning, used for quality-tier balancing.
- `maturity_role`: how the wine is likely functioning on the maturity axis.

