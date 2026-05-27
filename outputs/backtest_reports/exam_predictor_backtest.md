# Predictive Exam Analyzer Backtest

This report backtests the richer sequence-aware predictor on `2022-2025`.

The model now has five layers:
- historical wine classification: benchmark, role, curveball, commercial tier, maturity role
- richer question taxonomy, especially for Paper 3 mechanism/style questions
- sequence features by paper and slot
- exam-balance logic: repetition penalty plus recurrence-gap bonus
- two-model split: recent-era structure model (`2018+`) plus full-history label model

## Summary

- Structure mean F1 proxy: `0.499`
- Variety top-3 hit rate: `0.595`
- Country top-3 hit rate: `0.810`
- Style top-3 hit rate: `0.976`
- Question-role top-3 hit rate: `0.929`
- Variety mean recall: `0.327`
- Country mean recall: `0.554`
- Style mean recall: `0.887`
- Question-role mean recall: `0.841`

## Year-by-year

### 2022

- Paper 1:
  - structure precision: `0.500`
  - structure recall: `0.500`
  - predicted question count matched actual: `True`
  - predicted archetypes: `{'p1:F2:same_origin_comparative': 1, 'p1:F7:quality_calibration': 1, 'p1:F3:blend_logic': 1, 'p1:F1:same_variety_cross_origin': 1}`
  - actual archetypes: `{'p1:F6:maturity_axis': 1, 'p1:F2:same_origin_comparative': 2, 'p1:F7:quality_calibration': 1}`
- Paper 2:
  - structure precision: `0.400`
  - structure recall: `0.400`
  - predicted question count matched actual: `True`
  - predicted archetypes: `{'p2:F2:same_origin_comparative': 1, 'p2:F1:same_variety_cross_origin': 1, 'p2:F6:maturity_axis': 1, 'p2:F7:quality_calibration': 1, 'p2:F1:same_variety_same_region': 1}`
  - actual archetypes: `{'p2:F3:blend_logic': 1, 'p2:F2:same_origin_comparative': 2, 'p2:F1:same_variety_same_region': 2}`
- Paper 3:
  - structure precision: `0.667`
  - structure recall: `0.667`
  - predicted question count matched actual: `True`
  - predicted archetypes: `{'p3:F2:same_origin_comparative': 1, 'p3:F6:sweetness_axis': 1, 'p3:F7:quality_calibration': 1}`
  - actual archetypes: `{'p3:F5:sparkling_method': 1, 'p3:F6:sweetness_axis': 1, 'p3:F7:quality_calibration': 1}`
- Question-level top-3 hit rates: variety `0.667`, country `0.750`, style `1.000`, role `0.917`

### 2023

- Paper 1:
  - structure precision: `0.667`
  - structure recall: `0.667`
  - predicted question count matched actual: `True`
  - predicted archetypes: `{'p1:F2:same_origin_comparative': 1, 'p1:F7:quality_calibration': 1, 'p1:F3:blend_logic': 1}`
  - actual archetypes: `{'p1:F1:same_variety_cross_origin': 1, 'p1:F7:quality_calibration': 1, 'p1:F2:same_origin_comparative': 1}`
- Paper 2:
  - structure precision: `0.333`
  - structure recall: `0.333`
  - predicted question count matched actual: `True`
  - predicted archetypes: `{'p2:F2:same_origin_comparative': 1, 'p2:F1:same_variety_cross_origin': 1, 'p2:F6:maturity_axis': 1}`
  - actual archetypes: `{'p2:F2:same_origin_comparative': 1, 'p2:F4:mixed_bag': 1, 'p2:F7:quality_calibration': 1}`
- Paper 3:
  - structure precision: `0.750`
  - structure recall: `0.750`
  - predicted question count matched actual: `True`
  - predicted archetypes: `{'p3:F5:sparkling_method': 1, 'p3:F6:sweetness_axis': 1, 'p3:F7:quality_calibration': 1, 'p3:F2:same_origin_comparative': 1}`
  - actual archetypes: `{'p3:F5:sparkling_method': 1, 'p3:F7:quality_calibration': 1, 'p3:F2:same_origin_comparative': 1, 'p3:F1:same_variety_cross_origin': 1}`
- Question-level top-3 hit rates: variety `0.600`, country `0.700`, style `0.900`, role `0.900`

### 2024

- Paper 1:
  - structure precision: `0.667`
  - structure recall: `0.667`
  - predicted question count matched actual: `True`
  - predicted archetypes: `{'p1:F2:same_origin_comparative': 1, 'p1:F7:quality_calibration': 1, 'p1:F1:same_variety_same_region': 1}`
  - actual archetypes: `{'p1:F1:same_variety_cross_origin': 1, 'p1:F7:quality_calibration': 1, 'p1:F2:same_origin_comparative': 1}`
- Paper 2:
  - structure precision: `0.333`
  - structure recall: `0.333`
  - predicted question count matched actual: `True`
  - predicted archetypes: `{'p2:F2:same_origin_comparative': 1, 'p2:F4:breadth': 1, 'p2:F7:quality_calibration': 1}`
  - actual archetypes: `{'p2:F1:same_variety_cross_origin': 1, 'p2:F7:quality_calibration': 2}`
- Paper 3:
  - structure precision: `0.500`
  - structure recall: `0.500`
  - predicted question count matched actual: `True`
  - predicted archetypes: `{'p3:F5:sparkling_method': 1, 'p3:F7:quality_calibration': 1, 'p3:F2:same_origin_comparative': 1, 'p3:F1:same_variety_cross_origin': 1}`
  - actual archetypes: `{'p3:F5:sparkling_method': 1, 'p3:F2:same_origin_comparative': 2, 'p3:F6:sweetness_axis': 1}`
- Question-level top-3 hit rates: variety `0.500`, country `1.000`, style `1.000`, role `0.900`

### 2025

- Paper 1:
  - structure precision: `0.500`
  - structure recall: `0.500`
  - predicted question count matched actual: `True`
  - predicted archetypes: `{'p1:F1:same_variety_cross_origin': 1, 'p1:F7:quality_calibration': 1, 'p1:F2:same_origin_comparative': 1, 'p1:F1:same_variety_same_region': 1}`
  - actual archetypes: `{'p1:F3:blend_logic': 1, 'p1:F1:same_variety_cross_origin': 1, 'p1:F2:same_origin_comparative': 1, 'p1:F5:human_vs_natural': 1}`
- Paper 2:
  - structure precision: `0.333`
  - structure recall: `0.333`
  - predicted question count matched actual: `True`
  - predicted archetypes: `{'p2:F2:same_origin_comparative': 1, 'p2:F7:quality_calibration': 1, 'p2:F1:same_variety_same_region': 1}`
  - actual archetypes: `{'p2:F1:same_variety_cross_origin': 1, 'p2:F2:same_region_internal_diversity': 1, 'p2:F2:same_origin_comparative': 1}`
- Paper 3:
  - structure precision: `0.333`
  - structure recall: `0.333`
  - predicted question count matched actual: `True`
  - predicted archetypes: `{'p3:F5:sparkling_method': 1, 'p3:F2:same_origin_comparative': 1, 'p3:F7:quality_calibration': 1}`
  - actual archetypes: `{'p3:F1:same_variety_cross_origin': 1, 'p3:F2:same_origin_comparative': 1, 'p3:F4:mixed_bag': 1}`
- Question-level top-3 hit rates: variety `0.600`, country `0.800`, style `1.000`, role `1.000`

## Interpretation

- The model is still a steering layer, not an oracle.
- Sequence-aware structure prediction is more faithful to how exam papers are assembled than bag-of-archetypes counting.
- The new wine-role labels are most useful for mock-exam design, because they help choose the right job for each wine even when exact producer prediction remains weak.
