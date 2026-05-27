# Mock Rotation Analysis

This report checks whether generated mock exams are repeating question positions, question families, stems, and wine motifs across mock versions.

## Headline

- Mock full exams analysed: `7`
- Mock questions analysed: `35`
- Mock wines analysed: `244`
- Historical Vouvray appearances: `7` / `504` wines (1%)
- Historical P3 Q1 sparkling stems: `4` / `13` P3 Q1 questions (31%)

Conclusion: P3 Q1 does not always have to be three sparkling wines from three countries. Sparkling is a real recurring P3 opening pattern, but repeating it in consecutive full mocks is a rotation failure unless the whole point is targeted drilling.

Vouvray is historically important but not common enough to appear casually in repeated mocks. It should be treated as a cooldown-limited motif, especially Huet/Foreau demi-sec Loire Chenin.

## Repeated Question Positions

- `p1_q1`: dominant `F1/F1a` appears `3` / `7` mocks; mocks=mock_full_2026_05_26, mock_full_2026_05_26_v2, mock_full_2026_05_26_v3, mock_full_2026_05_26_v4, mock_full_2026_05_26_v5, mock_full_2026_05_26_v6, mock_full_2026_05_26_v7
- `p1_q3`: dominant `F2/F2x` appears `2` / `2` mocks; mocks=mock_full_2026_05_26_v6, mock_full_2026_05_26_v7
- `p1_q4`: dominant `F1/F1c` appears `2` / `2` mocks; mocks=mock_full_2026_05_26_v6, mock_full_2026_05_26_v7
- `p2_q1`: dominant `F1/F1a` appears `4` / `7` mocks; mocks=mock_full_2026_05_26, mock_full_2026_05_26_v2, mock_full_2026_05_26_v3, mock_full_2026_05_26_v4, mock_full_2026_05_26_v5, mock_full_2026_05_26_v6, mock_full_2026_05_26_v7
- `p3_q1`: dominant `F6/F6a` appears `4` / `7` mocks; mocks=mock_full_2026_05_26, mock_full_2026_05_26_v2, mock_full_2026_05_26_v3, mock_full_2026_05_26_v4, mock_full_2026_05_26_v5, mock_full_2026_05_26_v6, mock_full_2026_05_26_v7
- `p3_q2`: dominant `F2/F2x` appears `2` / `2` mocks; mocks=mock_full_2026_05_26_v6, mock_full_2026_05_26_v7
- `p3_q3`: dominant `F6/F6a` appears `2` / `2` mocks; mocks=mock_full_2026_05_26_v6, mock_full_2026_05_26_v7

## Repeated Wine Motifs

- `riesling`: `27` uses across `7` mocks; {'mock_full_2026_05_26': 3, 'mock_full_2026_05_26_v2': 1, 'mock_full_2026_05_26_v3': 5, 'mock_full_2026_05_26_v4': 5, 'mock_full_2026_05_26_v5': 3, 'mock_full_2026_05_26_v6': 6, 'mock_full_2026_05_26_v7': 4}
- `bordeaux`: `16` uses across `6` mocks; {'mock_full_2026_05_26': 1, 'mock_full_2026_05_26_v2': 1, 'mock_full_2026_05_26_v4': 3, 'mock_full_2026_05_26_v5': 3, 'mock_full_2026_05_26_v6': 4, 'mock_full_2026_05_26_v7': 4}
- `vouvray`: `13` uses across `7` mocks; {'mock_full_2026_05_26': 2, 'mock_full_2026_05_26_v2': 2, 'mock_full_2026_05_26_v3': 2, 'mock_full_2026_05_26_v4': 2, 'mock_full_2026_05_26_v5': 2, 'mock_full_2026_05_26_v6': 2, 'mock_full_2026_05_26_v7': 1}
- `huet`: `12` uses across `6` mocks; {'mock_full_2026_05_26': 2, 'mock_full_2026_05_26_v2': 2, 'mock_full_2026_05_26_v3': 2, 'mock_full_2026_05_26_v4': 2, 'mock_full_2026_05_26_v5': 2, 'mock_full_2026_05_26_v6': 2}
- `mosel`: `8` uses across `5` mocks; {'mock_full_2026_05_26': 1, 'mock_full_2026_05_26_v3': 1, 'mock_full_2026_05_26_v4': 3, 'mock_full_2026_05_26_v6': 2, 'mock_full_2026_05_26_v7': 1}
- `madeira`: `8` uses across `5` mocks; {'mock_full_2026_05_26': 1, 'mock_full_2026_05_26_v2': 1, 'mock_full_2026_05_26_v3': 1, 'mock_full_2026_05_26_v5': 1, 'mock_full_2026_05_26_v6': 4}
- `chardonnay`: `7` uses across `4` mocks; {'mock_full_2026_05_26': 1, 'mock_full_2026_05_26_v2': 2, 'mock_full_2026_05_26_v4': 2, 'mock_full_2026_05_26_v5': 2}
- `jerez`: `7` uses across `4` mocks; {'mock_full_2026_05_26_v3': 1, 'mock_full_2026_05_26_v4': 2, 'mock_full_2026_05_26_v5': 1, 'mock_full_2026_05_26_v7': 3}
- `pinot noir`: `6` uses across `3` mocks; {'mock_full_2026_05_26': 1, 'mock_full_2026_05_26_v2': 3, 'mock_full_2026_05_26_v3': 2}
- `syrah`: `6` uses across `3` mocks; {'mock_full_2026_05_26_v4': 2, 'mock_full_2026_05_26_v5': 2, 'mock_full_2026_05_26_v6': 2}
- `vouvray clos du bourg demi-sec`: `5` uses across `5` mocks; {'mock_full_2026_05_26': 1, 'mock_full_2026_05_26_v2': 1, 'mock_full_2026_05_26_v3': 1, 'mock_full_2026_05_26_v4': 1, 'mock_full_2026_05_26_v5': 1}
- `chianti`: `5` uses across `4` mocks; {'mock_full_2026_05_26': 2, 'mock_full_2026_05_26_v2': 1, 'mock_full_2026_05_26_v3': 1, 'mock_full_2026_05_26_v6': 1}
- `barolo`: `5` uses across `4` mocks; {'mock_full_2026_05_26': 1, 'mock_full_2026_05_26_v2': 1, 'mock_full_2026_05_26_v6': 1, 'mock_full_2026_05_26_v7': 2}
- `icewine`: `5` uses across `5` mocks; {'mock_full_2026_05_26': 1, 'mock_full_2026_05_26_v2': 1, 'mock_full_2026_05_26_v3': 1, 'mock_full_2026_05_26_v6': 1, 'mock_full_2026_05_26_v7': 1}
- `sauvignon blanc`: `5` uses across `2` mocks; {'mock_full_2026_05_26_v2': 2, 'mock_full_2026_05_26_v7': 3}
- `polish hill riesling`: `5` uses across `3` mocks; {'mock_full_2026_05_26_v4': 2, 'mock_full_2026_05_26_v5': 2, 'mock_full_2026_05_26_v6': 1}
- `vidal icewine`: `4` uses across `4` mocks; {'mock_full_2026_05_26': 1, 'mock_full_2026_05_26_v2': 1, 'mock_full_2026_05_26_v3': 1, 'mock_full_2026_05_26_v7': 1}
- `cabernet franc`: `4` uses across `2` mocks; {'mock_full_2026_05_26_v2': 1, 'mock_full_2026_05_26_v7': 3}
- `muscadet sevre-et-maine monnieres saint-fiacre l'ancestrale`: `3` uses across `3` mocks; {'mock_full_2026_05_26': 1, 'mock_full_2026_05_26_v2': 1, 'mock_full_2026_05_26_v3': 1}
- `riesling silberberg de rorschwihr`: `3` uses across `3` mocks; {'mock_full_2026_05_26': 1, 'mock_full_2026_05_26_v2': 1, 'mock_full_2026_05_26_v3': 1}
- `sauvignon semillon circa 77`: `3` uses across `3` mocks; {'mock_full_2026_05_26': 1, 'mock_full_2026_05_26_v2': 1, 'mock_full_2026_05_26_v3': 1}
- `clos du bourg demi-sec`: `3` uses across `3` mocks; {'mock_full_2026_05_26': 1, 'mock_full_2026_05_26_v2': 1, 'mock_full_2026_05_26_v3': 1}
- `sercial 10 years old`: `3` uses across `3` mocks; {'mock_full_2026_05_26': 1, 'mock_full_2026_05_26_v2': 1, 'mock_full_2026_05_26_v3': 1}
- `fine ruby port`: `3` uses across `3` mocks; {'mock_full_2026_05_26': 1, 'mock_full_2026_05_26_v2': 1, 'mock_full_2026_05_26_v3': 1}
- `corton-charlemagne grand cru`: `3` uses across `3` mocks; {'mock_full_2026_05_26_v2': 1, 'mock_full_2026_05_26_v4': 1, 'mock_full_2026_05_26_v5': 1}
- `cava`: `3` uses across `3` mocks; {'mock_full_2026_05_26_v2': 1, 'mock_full_2026_05_26_v6': 1, 'mock_full_2026_05_26_v7': 1}
- `tokaji`: `3` uses across `2` mocks; {'mock_full_2026_05_26_v3': 2, 'mock_full_2026_05_26_v6': 1}
- `savennières`: `3` uses across `3` mocks; {'mock_full_2026_05_26_v4': 1, 'mock_full_2026_05_26_v5': 1, 'mock_full_2026_05_26_v7': 1}
- `vouvray le mont sec`: `3` uses across `3` mocks; {'mock_full_2026_05_26_v4': 1, 'mock_full_2026_05_26_v5': 1, 'mock_full_2026_05_26_v6': 1}
- `cabernet sauvignon`: `3` uses across `1` mocks; {'mock_full_2026_05_26_v5': 3}
- `château de fieuzal blanc`: `2` uses across `2` mocks; {'mock_full_2026_05_26': 1, 'mock_full_2026_05_26_v2': 1}
- `château rieussec r de rieussec`: `2` uses across `2` mocks; {'mock_full_2026_05_26': 1, 'mock_full_2026_05_26_v2': 1}
- `pinot gris`: `2` uses across `1` mocks; {'mock_full_2026_05_26': 2}
- `rioja reserva`: `2` uses across `2` mocks; {'mock_full_2026_05_26': 1, 'mock_full_2026_05_26_v3': 1}
- `nebbiolo`: `2` uses across `2` mocks; {'mock_full_2026_05_26': 1, 'mock_full_2026_05_26_v7': 1}
- `brunello di montalcino`: `2` uses across `2` mocks; {'mock_full_2026_05_26': 1, 'mock_full_2026_05_26_v3': 1}
- `chardonnay en flandre`: `2` uses across `2` mocks; {'mock_full_2026_05_26': 1, 'mock_full_2026_05_26_v2': 1}
- `l’etoile`: `2` uses across `2` mocks; {'mock_full_2026_05_26': 1, 'mock_full_2026_05_26_v2': 1}
- `beerenauslese cuvee`: `2` uses across `2` mocks; {'mock_full_2026_05_26': 1, 'mock_full_2026_05_26_v2': 1}
- `vin santo del chianti classico`: `2` uses across `2` mocks; {'mock_full_2026_05_26': 1, 'mock_full_2026_05_26_v2': 1}

## Rotation Rules For Future Mocks

- Do not repeat the same `paper/question -> family/subtype` position in consecutive full mocks unless explicitly running a targeted drill.
- Do not repeat a near-identical stem in the same position across vN and vN+1.
- For each paper, rotate the opening question family. Example: P3 Q1 can be sparkling, same-variety multi-style, fortified/oxidative, residual-sugar mechanism, or mixed category/commercial analysis. It should not default to sparkling every time.
- Put forecast families into different positions across versions. If P3 F5 sparkling is Q1 in v6, then in v7 move F5 to Q2/Q3 or choose a different F5 subtype.
- Apply motif cooldowns. A named appellation/producer/style motif used in one full mock should normally be unavailable for the next two full mocks unless historical frequency justifies it.
- High-frequency classics get shorter cooldowns: Chardonnay, Riesling, Sauvignon Blanc, Bordeaux, Burgundy, Champagne. Lower-frequency motifs get longer cooldowns: Vouvray, Huet/Foreau, Savennières, Etna, Tokaji, Rutherglen, Vin Santo.
- The mock writer must consult `mock_rotation_analysis.md` plus `mock_exam_coverage.md` before selecting wines.

## Need For More Wine Research

Yes, but only after the rotation logic is fixed. More wines will not solve repeated exams if the writer keeps choosing the same question skeleton. Add new researched wines to fill underused family/subtype needs: P3 non-sparkling method questions, P1 non-Loire Chenin alternatives, P2 non-Bordeaux/non-Italy hierarchy ladders, and commercial-position flights outside obvious prestige categories.
