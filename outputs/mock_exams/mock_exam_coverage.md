# Mock Exam Coverage

This report summarizes what the existing generated mocks have already covered and what the 2026 forecast still suggests is under-covered.

- Full mock suites analyzed: `5`
- Total mock questions analyzed: `56`

## Paper 1

- Archetype counts: `{'p1:F1:same_variety_cross_origin': 7, 'p1:F2:same_origin_comparative': 5, 'p1:F3:blend_logic': 3, 'p1:F7:quality_calibration': 3, 'p1:F6:maturity_axis': 2}`
- Family counts: `{'F1': 7, 'F2': 5, 'F3': 3, 'F7': 3, 'F6': 2}`

### Forecast gap analysis

- Q1 `p1:F1:same_variety_cross_origin`: status=`covered`, same-slot seen=`4`, paper-wide seen=`7`
- Q2 `p1:F7:quality_calibration`: status=`covered`, same-slot seen=`2`, paper-wide seen=`3`
- Q3 `p1:F2:same_origin_comparative`: status=`covered`, same-slot seen=`2`, paper-wide seen=`5`
- Q4 `p1:F6:maturity_axis`: status=`covered`, same-slot seen=`2`, paper-wide seen=`2`

## Paper 2

- Archetype counts: `{'p2:F6:maturity_axis': 1, 'p2:F2:same_origin_comparative': 4, 'p2:F4:mixed_bag': 2, 'p2:F2:same_region_internal_diversity': 2, 'p2:F1:same_variety_cross_origin': 6, 'p2:F7:quality_calibration': 2}`
- Family counts: `{'F6': 1, 'F2': 6, 'F4': 2, 'F1': 6, 'F7': 2}`

### Forecast gap analysis

- Q1 `p2:F1:same_variety_cross_origin`: status=`covered`, same-slot seen=`2`, paper-wide seen=`6`
- Q2 `p2:F7:quality_calibration`: status=`covered`, same-slot seen=`2`, paper-wide seen=`2`
- Q3 `p2:F2:same_origin_comparative`: status=`covered`, same-slot seen=`3`, paper-wide seen=`4`

## Paper 3

- Archetype counts: `{'p3:F5:sparkling_method': 5, 'p3:F2:same_origin_comparative': 6, 'p3:F6:sweetness_axis': 3, 'p3:F5:fortification_maturation': 4, 'p3:F7:quality_calibration': 1}`
- Family counts: `{'F5': 9, 'F2': 6, 'F6': 3, 'F7': 1}`

### Forecast gap analysis

- Q1 `p3:F5:sparkling_method`: status=`covered`, same-slot seen=`5`, paper-wide seen=`5`
- Q2 `p3:F2:same_origin_comparative`: status=`covered`, same-slot seen=`5`, paper-wide seen=`6`
- Q3 `p3:F7:quality_calibration`: status=`covered`, same-slot seen=`1`, paper-wide seen=`1`

## How to use this

- Prefer generating new mocks that cover forecasted slot/archetype combinations marked `unseen_in_paper` first.
- Next prefer `missing_same_slot` combinations, where the archetype exists in the paper historically but not yet in that slot in your mock set.
- Once high-value gaps are covered, vary wine roles, tiers and regions within those structures rather than repeating the same wines.
