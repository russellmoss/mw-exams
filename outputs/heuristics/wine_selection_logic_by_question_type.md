# Wine Selection Logic By Question Type

This report scores how the MW historical practical corpus chooses wines relative to question type. It is intended as the rule base for the mock exam writer: the stem defines the expected contrast axes, and the wine set must actually deliver those contrasts.

Axes scored per question:

- `variety`: Variety differentiation
- `origin`: Origin/geography differentiation
- `style`: Style/category differentiation
- `winemaking`: Winemaking/method differentiation
- `price_quality`: Price/quality-tier spread
- `benchmark`: Benchmark/curveball role spread
- `maturity`: Maturity/development spread
- `structure`: Structural/sensory spread

Scores are deterministic proxies from `data/wine_research`, historical classification, price-tier analysis, and question taxonomy tags. A score of `0.45+` means the axis is meaningfully active; `0.75+` means high diversity.

## Corpus Summary

- Historical questions scored: `153`
- Fit statuses: strong=113, acceptable=23, fail=11, weak=6
- Family counts: F1=33, F2=38, F3=7, F4=43, F5=16, F6=5, F7=11

## Family Norms

- `F1` (`n=33`): main active axes = origin, maturity, winemaking, benchmark; means: origin=0.92, maturity=0.72, winemaking=0.87, benchmark=0.68
- `F2` (`n=38`): main active axes = variety, maturity, origin, benchmark; means: variety=0.90, maturity=0.69, origin=0.85, benchmark=0.68
- `F3` (`n=7`): main active axes = variety, origin, price_quality, benchmark; means: variety=0.93, origin=0.96, price_quality=0.70, benchmark=0.59
- `F4` (`n=43`): main active axes = variety, origin, winemaking, price_quality; means: variety=0.97, origin=0.97, winemaking=0.85, price_quality=0.64
- `F5` (`n=16`): main active axes = variety, origin, winemaking, style; means: variety=0.98, origin=1.00, winemaking=0.98, style=0.80
- `F6` (`n=5`): main active axes = variety, origin, style, winemaking; means: variety=0.95, origin=1.00, style=0.77, winemaking=1.00
- `F7` (`n=11`): main active axes = origin, variety, price_quality, structure; means: origin=0.79, variety=0.65, price_quality=0.51, structure=0.58

## Subtype Rules

- `F1a` (`n=2`): expect variety, origin, style, winemaking; active rates variety=100%, origin=100%, style=100%, winemaking=100%
- `F1b` (`n=20`): expect origin, maturity, winemaking, benchmark; active rates origin=100%, maturity=100%, winemaking=90%, benchmark=90%
- `F1c` (`n=5`): expect origin, style, winemaking, price_quality; active rates origin=100%, style=100%, winemaking=100%, price_quality=100%
- `F1d` (`n=6`): expect origin, winemaking, price_quality, style; active rates origin=100%, winemaking=100%, price_quality=100%, style=83%
- `F2a` (`n=16`): expect variety, origin, winemaking, maturity; active rates variety=100%, origin=100%, winemaking=100%, maturity=100%
- `F2d` (`n=7`): expect variety, origin, style, winemaking; active rates variety=100%, origin=100%, style=100%, winemaking=100%
- `F2x` (`n=14`): expect variety, benchmark, maturity, origin; active rates variety=93%, benchmark=86%, maturity=79%, origin=71%
- `F3a` (`n=2`): expect variety, origin, style, winemaking; active rates variety=100%, origin=100%, style=100%, winemaking=100%
- `F3b` (`n=2`): expect variety, origin, winemaking, price_quality; active rates variety=100%, origin=100%, winemaking=100%, price_quality=100%
- `F4a` (`n=26`): expect variety, origin, winemaking, price_quality; active rates variety=100%, origin=100%, winemaking=100%, price_quality=100%
- `F4c` (`n=6`): expect variety, origin, winemaking, structure; active rates variety=100%, origin=100%, winemaking=100%, structure=83%
- `F4x` (`n=10`): expect variety, origin, maturity, winemaking; active rates variety=100%, origin=100%, maturity=100%, winemaking=80%
- `F5a` (`n=2`): expect variety, origin, style, winemaking; active rates variety=100%, origin=100%, style=100%, winemaking=100%
- `F5c` (`n=3`): expect variety, origin, style, winemaking; active rates variety=100%, origin=100%, style=100%, winemaking=100%
- `F5d` (`n=3`): expect variety, origin, style, winemaking; active rates variety=100%, origin=100%, style=100%, winemaking=100%
- `F5f` (`n=2`): expect variety, origin, style, winemaking; active rates variety=100%, origin=100%, style=100%, winemaking=100%
- `F5x` (`n=4`): expect variety, origin, winemaking, maturity; active rates variety=100%, origin=100%, winemaking=100%, maturity=100%
- `F6a` (`n=5`): expect variety, origin, style, winemaking; active rates variety=100%, origin=100%, style=100%, winemaking=100%
- `F7b` (`n=3`): expect variety, origin, style, winemaking; active rates variety=100%, origin=100%, style=100%, winemaking=100%
- `F7d` (`n=4`): expect variety, origin, style, winemaking; active rates variety=75%, origin=75%, style=75%, winemaking=75%
- `F7x` (`n=3`): expect origin, maturity, variety, price_quality; active rates origin=100%, maturity=100%, variety=67%, price_quality=67%

## Mock v6 Diagnostics

- `mock_full_2026_05_26_v6_p1_q1` `F1/F1b`: fit=`strong`; active=variety, origin, style, winemaking, price_quality, maturity, structure; below historical norm=benchmark; critical=none
  - scores: variety=0.50, origin=1.00, style=0.50, winemaking=1.00, price_quality=0.67, benchmark=0.25, maturity=0.50, structure=1.00
- `mock_full_2026_05_26_v6_p1_q2` `F1/F1a`: fit=`acceptable`; active=origin, price_quality, benchmark, maturity; below historical norm=variety, style, winemaking, structure; critical=none
  - scores: variety=0.33, origin=1.00, style=0.33, winemaking=0.33, price_quality=0.67, benchmark=0.67, maturity=0.67, structure=0.00
- `mock_full_2026_05_26_v6_p1_q3` `F2/F2x`: fit=`strong`; active=variety, origin, style, winemaking, price_quality, benchmark, structure; below historical norm=maturity; critical=none
  - scores: variety=0.67, origin=1.00, style=0.67, winemaking=0.67, price_quality=0.67, benchmark=0.67, maturity=0.33, structure=1.00
- `mock_full_2026_05_26_v6_p1_q4` `F1/F1c`: fit=`strong`; active=variety, origin, style, winemaking, benchmark, maturity, structure; below historical norm=price_quality; critical=none
  - scores: variety=1.00, origin=1.00, style=1.00, winemaking=1.00, price_quality=0.00, benchmark=1.00, maturity=1.00, structure=1.00
- `mock_full_2026_05_26_v6_p2_q1` `F1/F1b`: fit=`strong`; active=origin, style, winemaking, price_quality, benchmark, structure; below historical norm=variety, maturity; critical=none
  - scores: variety=0.25, origin=1.00, style=0.50, winemaking=1.00, price_quality=1.00, benchmark=0.67, maturity=0.25, structure=1.00
- `mock_full_2026_05_26_v6_p2_q2` `F7/F7x`: fit=`acceptable`; active=origin, winemaking, price_quality, structure; below historical norm=variety, benchmark, maturity; critical=none
  - scores: variety=0.25, origin=1.00, style=0.25, winemaking=0.50, price_quality=0.50, benchmark=0.25, maturity=0.25, structure=0.67
- `mock_full_2026_05_26_v6_p2_q3` `F2/F2x`: fit=`acceptable`; active=variety, origin, price_quality, benchmark, maturity, structure; below historical norm=none; critical=none
  - scores: variety=0.75, origin=1.00, style=0.25, winemaking=0.25, price_quality=0.75, benchmark=0.50, maturity=0.50, structure=1.00
- `mock_full_2026_05_26_v6_p3_q1` `F5/F5x`: fit=`strong`; active=variety, origin, style, winemaking, price_quality, benchmark, maturity, structure; below historical norm=none; critical=none
  - scores: variety=0.67, origin=1.00, style=0.67, winemaking=1.00, price_quality=0.67, benchmark=0.67, maturity=0.67, structure=0.67
- `mock_full_2026_05_26_v6_p3_q2` `F2/F2x`: fit=`strong`; active=variety, origin, style, winemaking, price_quality, structure; below historical norm=benchmark, maturity; critical=none
  - scores: variety=1.00, origin=1.00, style=0.50, winemaking=0.50, price_quality=1.00, benchmark=0.25, maturity=0.25, structure=0.50
- `mock_full_2026_05_26_v6_p3_q3` `F6/F6a`: fit=`acceptable`; active=origin, benchmark, maturity, structure; below historical norm=variety, style, winemaking, price_quality; critical=none
  - scores: variety=0.20, origin=1.00, style=0.20, winemaking=0.20, price_quality=0.00, benchmark=1.00, maturity=0.60, structure=0.60

## Hard Rules For The Exam Writer

- `F1 same variety`: the shared grape is not enough. Require origin/style/structure spread; add winemaking or maturity spread when those words appear in the stem.
- `F2 same origin`: the shared place is not enough. Require variety/style/sub-region/classification spread inside that origin.
- `F3 blend logic`: require visible blend-composition or varietal-role differences, plus style or structure differences.
- `F4 mixed breadth`: require high independence across variety and origin; avoid hidden overlinking unless tagged `F4b/F4c`.
- `F5 method dominant`: require high winemaking/method diversity. Method should be the strongest active axis.
- `F6 style mechanism`: require structural/style spread on the named mechanism: RS, alcohol, tannin/body, maturity, or commercial tier.
- `F7 hierarchy/quality`: require price-quality, benchmark, classification, producer, maturity, or commercial-tier ladder. Premium-heavy flights are acceptable only with an explicit hierarchy hook.
- Any `commercial-position-led` question needs price/channel spread.
- Any `quality-led` ranking question needs either quality-tier spread or an explicit origin/classification/producer hierarchy.
- Any `method-led` quality question needs at least two distinct winemaking signatures for 3 wines and at least three for 4 wines, unless the stem explicitly tells candidates the axis is origin/classification instead.

## Agent Team Design

Use agents as reviewers over deterministic scorecards, not as the primary source of facts:

- Question Taxonomist: checks family/subtype and expected axes.
- Wine Metadata Analyst: checks source-backed producer, origin, variety, method, price and quality fields.
- Diversity Scorer: verifies the generated wine set meets required active axes.
- Historical Pattern Auditor: compares the mock against family/subtype norms and flags outliers.
- Mock Exam Critic: decides whether to revise the stem or change the wines when the expected axis is not delivered.
