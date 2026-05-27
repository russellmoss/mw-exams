# Predicted 2026 Exam Profile

This forecast is intended to guide mock-exam generation with sequence-aware and balance-aware priors.
It uses recent exams (`2018+`) for structure and the full historical corpus for wine-family and role labels.

## Paper 1

- Predicted question count: `4`
- Predicted structure mix: `{'p1:F1:same_variety_cross_origin': 1, 'p1:F7:quality_calibration': 1, 'p1:F2:same_origin_comparative': 1, 'p1:F6:maturity_axis': 1}`
- Balance model: `{'repeated_families': [], 'family_recurrence_gaps': {'F1': 1, 'F7': 2, 'F2': 1, 'F6': 4}, 'diversity_warning': False}`

### Slot-by-slot guidance

- Q1: `p1:F1:same_variety_cross_origin`
  - likely varieties: `['chardonnay', 'sauvignon blanc', 'riesling']`
  - likely countries: `['France', 'Australia', 'USA']`
  - likely styles: `['still_dry', 'still_sweet', 'oxidative']`
  - likely wine roles: `['method_reference', 'maturity_reference', 'commercial_foil']`
  - likely benchmark status: `['benchmark_classic', 'iconic_benchmark', 'nonbenchmark']`
  - likely commercial tier: `['specialist_premium', 'commercial', 'fine_wine']`
  - likely maturity role: `['developing', 'young_primary', 'mature_tertiary']`
  - likely curveball level: `['low', 'high', 'medium']`
- Q2: `p1:F7:quality_calibration`
  - likely varieties: `['chardonnay', 'riesling', 'viognier']`
  - likely countries: `['France', 'Australia', 'Spain']`
  - likely styles: `['still_dry', 'still_sweet', 'oxidative']`
  - likely wine roles: `['method_reference', 'commercial_foil', 'benchmark_anchor']`
  - likely benchmark status: `['benchmark_classic', 'nonbenchmark', 'iconic_benchmark']`
  - likely commercial tier: `['specialist_premium', 'commercial', 'fine_wine']`
  - likely maturity role: `['developing', 'young_primary', 'mature_tertiary']`
  - likely curveball level: `['low', 'high', 'medium']`
- Q3: `p1:F2:same_origin_comparative`
  - likely varieties: `['chardonnay', 'riesling', 'chenin blanc']`
  - likely countries: `['France', 'Australia', 'Italy']`
  - likely styles: `['still_dry', 'still_sweet', 'oxidative']`
  - likely wine roles: `['method_reference', 'commercial_foil', 'maturity_reference']`
  - likely benchmark status: `['benchmark_classic', 'nonbenchmark', 'iconic_benchmark']`
  - likely commercial tier: `['specialist_premium', 'commercial', 'fine_wine']`
  - likely maturity role: `['developing', 'young_primary', 'mature_tertiary']`
  - likely curveball level: `['low', 'high', 'medium']`
- Q4: `p1:F6:maturity_axis`
  - likely varieties: `['chardonnay', 'riesling', 'chenin blanc']`
  - likely countries: `['France', 'Australia', 'USA']`
  - likely styles: `['still_dry', 'still_sweet', 'oxidative']`
  - likely wine roles: `['method_reference', 'maturity_reference', 'commercial_foil']`
  - likely benchmark status: `['benchmark_classic', 'iconic_benchmark', 'nonbenchmark']`
  - likely commercial tier: `['specialist_premium', 'commercial', 'fine_wine']`
  - likely maturity role: `['developing', 'young_primary', 'mature_tertiary']`
  - likely curveball level: `['low', 'high', 'medium']`

## Paper 2

- Predicted question count: `3`
- Predicted structure mix: `{'p2:F1:same_variety_cross_origin': 1, 'p2:F7:quality_calibration': 1, 'p2:F2:same_origin_comparative': 1}`
- Balance model: `{'repeated_families': [], 'family_recurrence_gaps': {'F1': 1, 'F7': 2, 'F2': 1}, 'diversity_warning': False}`

### Slot-by-slot guidance

- Q1: `p2:F1:same_variety_cross_origin`
  - likely varieties: `['bordeaux_red_family', 'syrah', 'cabernet franc']`
  - likely countries: `['France', 'Italy', 'Argentina']`
  - likely styles: `['still_dry', 'fortified']`
  - likely wine roles: `['method_reference', 'benchmark_anchor', 'supporting_reference']`
  - likely benchmark status: `['nonbenchmark', 'benchmark_classic', 'iconic_benchmark']`
  - likely commercial tier: `['specialist_premium', 'commercial', 'fine_wine']`
  - likely maturity role: `['developing', 'young_primary', 'mature_tertiary']`
  - likely curveball level: `['low', 'high', 'medium']`
- Q2: `p2:F7:quality_calibration`
  - likely varieties: `['pinot noir', 'bordeaux_red_family', 'tempranillo']`
  - likely countries: `['France', 'Italy', 'USA']`
  - likely styles: `['still_dry', 'fortified']`
  - likely wine roles: `['method_reference', 'benchmark_anchor', 'maturity_reference']`
  - likely benchmark status: `['nonbenchmark', 'benchmark_classic', 'iconic_benchmark']`
  - likely commercial tier: `['specialist_premium', 'commercial', 'fine_wine']`
  - likely maturity role: `['developing', 'mature_tertiary', 'young_primary']`
  - likely curveball level: `['low', 'high', 'medium']`
- Q3: `p2:F2:same_origin_comparative`
  - likely varieties: `['pinot noir', 'bordeaux_red_family', 'syrah']`
  - likely countries: `['France', 'Italy', 'Austria']`
  - likely styles: `['still_dry', 'fortified']`
  - likely wine roles: `['method_reference', 'maturity_reference', 'commercial_foil']`
  - likely benchmark status: `['nonbenchmark', 'benchmark_classic', 'iconic_benchmark']`
  - likely commercial tier: `['specialist_premium', 'commercial', 'fine_wine']`
  - likely maturity role: `['developing', 'young_primary', 'mature_tertiary']`
  - likely curveball level: `['low', 'medium', 'high']`

## Paper 3

- Predicted question count: `3`
- Predicted structure mix: `{'p3:F5:sparkling_method': 1, 'p3:F2:same_origin_comparative': 1, 'p3:F7:quality_calibration': 1}`
- Balance model: `{'repeated_families': [], 'family_recurrence_gaps': {'F5': 2, 'F2': 1, 'F7': 3}, 'diversity_warning': False}`

### Slot-by-slot guidance

- Q1: `p3:F5:sparkling_method`
  - likely varieties: `['sparkling_classic_blend', 'riesling', 'macabeo/parellada/xarel-lo']`
  - likely countries: `['France', 'Spain', 'USA']`
  - likely styles: `['sparkling', 'still_dry', 'still_sweet']`
  - likely wine roles: `['method_reference', 'maturity_reference', 'supporting_reference']`
  - likely benchmark status: `['iconic_benchmark', 'nonbenchmark', 'benchmark_classic']`
  - likely commercial tier: `['specialist_premium', 'commercial', 'fine_wine']`
  - likely maturity role: `['non_vintage_category', 'developing', 'mature_tertiary']`
  - likely curveball level: `['medium', 'low', 'high']`
- Q2: `p3:F2:same_origin_comparative`
  - likely varieties: `['palomino', 'sauvignon blanc', 'chardonnay']`
  - likely countries: `['France', 'Spain', 'Italy']`
  - likely styles: `['still_dry', 'sparkling', 'fortified']`
  - likely wine roles: `['method_reference', 'maturity_reference', 'commercial_foil']`
  - likely benchmark status: `['iconic_benchmark', 'nonbenchmark', 'benchmark_classic']`
  - likely commercial tier: `['specialist_premium', 'commercial', 'fine_wine']`
  - likely maturity role: `['developing', 'non_vintage_category', 'mature_tertiary']`
  - likely curveball level: `['medium', 'low', 'high']`
- Q3: `p3:F7:quality_calibration`
  - likely varieties: `['gsm_rhone_red_blend', 'palomino', 'riesling']`
  - likely countries: `['France', 'Spain', 'Portugal']`
  - likely styles: `['fortified', 'still_sweet', 'still_dry']`
  - likely wine roles: `['method_reference', 'commercial_foil', 'supporting_reference']`
  - likely benchmark status: `['benchmark_classic', 'iconic_benchmark', 'nonbenchmark']`
  - likely commercial tier: `['specialist_premium', 'commercial', 'fine_wine']`
  - likely maturity role: `['non_vintage_category', 'developing', 'young_primary']`
  - likely curveball level: `['medium', 'low', 'high']`

## How to use this

- Use the slot-level sequence as a prior for what each question is trying to do.
- Use the wine-role outputs to choose wines by exam function, not just by region or grape.
- Preserve one defensible surprise per paper, but do not build a paper that repeats the same family too often.
