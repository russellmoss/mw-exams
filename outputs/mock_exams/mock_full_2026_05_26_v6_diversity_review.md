# Diversity Scorecard Review

## Summary

- Result: `FAIL`
- Mock: `mock_full_2026_05_26_v6`
- Checked exam: `C:\Users\russe\Documents\MW_exam\outputs\mock_exams\mock_full_2026_05_26_v6.md`
- Checked answers: `C:\Users\russe\Documents\MW_exam\outputs\mock_exams\mock_full_2026_05_26_v6_answers.md`

## Hard Fail Checks

| Check | Result | Evidence | Action |
|---|---:|---|---|
| Source-backed research present | FAIL | 34 named wines missing research entries | Add entries in data/mock_wine_research/{mock_exam_id}.json before final answer acceptance. |

## Soft Warnings

| Warning | Evidence | Recommendation |
|---|---|---|
| mock_full_2026_05_26_v6_p1_q1 below historical norm | benchmark | Confirm this is intentional, or adjust wines/stem to activate the expected axes. |
| mock_full_2026_05_26_v6_p1_q2 below historical norm | variety, style, winemaking, structure | Confirm this is intentional, or adjust wines/stem to activate the expected axes. |
| mock_full_2026_05_26_v6_p1_q3 below historical norm | maturity | Confirm this is intentional, or adjust wines/stem to activate the expected axes. |
| mock_full_2026_05_26_v6_p1_q4 below historical norm | price_quality | Confirm this is intentional, or adjust wines/stem to activate the expected axes. |
| mock_full_2026_05_26_v6_p2_q1 below historical norm | variety, maturity | Confirm this is intentional, or adjust wines/stem to activate the expected axes. |
| mock_full_2026_05_26_v6_p2_q2 below historical norm | variety, benchmark, maturity | Confirm this is intentional, or adjust wines/stem to activate the expected axes. |
| mock_full_2026_05_26_v6_p3_q2 below historical norm | benchmark, maturity | Confirm this is intentional, or adjust wines/stem to activate the expected axes. |
| mock_full_2026_05_26_v6_p3_q3 below historical norm | variety, style, winemaking, price_quality | Confirm this is intentional, or adjust wines/stem to activate the expected axes. |

## Per-Question Notes

- `mock_full_2026_05_26_v6_p1_q1` `F1/F1b`: fit=`strong`; active axes=variety, origin, style, winemaking, price_quality, maturity, structure; below norm=benchmark
- `mock_full_2026_05_26_v6_p1_q2` `F1/F1a`: fit=`acceptable`; active axes=origin, price_quality, benchmark, maturity; below norm=variety, style, winemaking, structure
- `mock_full_2026_05_26_v6_p1_q3` `F2/F2x`: fit=`strong`; active axes=variety, origin, style, winemaking, price_quality, benchmark, structure; below norm=maturity
- `mock_full_2026_05_26_v6_p1_q4` `F1/F1c`: fit=`strong`; active axes=variety, origin, style, winemaking, benchmark, maturity, structure; below norm=price_quality
- `mock_full_2026_05_26_v6_p2_q1` `F1/F1b`: fit=`strong`; active axes=origin, style, winemaking, price_quality, benchmark, structure; below norm=variety, maturity
- `mock_full_2026_05_26_v6_p2_q2` `F7/F7x`: fit=`acceptable`; active axes=origin, winemaking, price_quality, structure; below norm=variety, benchmark, maturity
- `mock_full_2026_05_26_v6_p2_q3` `F2/F2x`: fit=`acceptable`; active axes=variety, origin, price_quality, benchmark, maturity, structure; below norm=none
- `mock_full_2026_05_26_v6_p3_q1` `F5/F5x`: fit=`strong`; active axes=variety, origin, style, winemaking, price_quality, benchmark, maturity, structure; below norm=none
- `mock_full_2026_05_26_v6_p3_q2` `F2/F2x`: fit=`strong`; active axes=variety, origin, style, winemaking, price_quality, structure; below norm=benchmark, maturity
- `mock_full_2026_05_26_v6_p3_q3` `F6/F6a`: fit=`acceptable`; active axes=origin, benchmark, maturity, structure; below norm=variety, style, winemaking, price_quality

## Use

A mock should not be treated as final until this review is PASS or PASS WITH WARNINGS and `scripts/validate_mock_wine_facts.py --strict-research` passes.
