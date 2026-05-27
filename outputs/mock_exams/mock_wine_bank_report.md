# Mock Wine Bank Report

- Entries: `94`
- Validation errors: `0`
- Warnings: `6`

## Coverage

### Families

- `F1`: `62`
- `F2`: `46`
- `F3`: `12`
- `F4`: `32`
- `F5`: `42`
- `F6`: `37`
- `F7`: `91`

### Styles

- `still_dry`: `63`
- `sparkling`: `9`
- `fortified`: `8`
- `still_sweet`: `6`
- `oxidative`: `4`
- `still_off_dry`: `2`
- `orange`: `1`
- `rose`: `1`

### Price Bands

- `premium`: `43`
- `super_premium`: `20`
- `mainstream`: `18`
- `luxury`: `10`
- `value`: `3`

### Quality Tiers

- `benchmark`: `45`
- `iconic`: `28`
- `regional`: `11`
- `commercial`: `6`
- `premium`: `4`

### Top Countries

- `France`: `27`
- `Italy`: `12`
- `Spain`: `9`
- `Australia`: `9`
- `Portugal`: `8`
- `South Africa`: `6`
- `Germany`: `5`
- `Argentina`: `3`
- `Chile`: `3`
- `United States`: `3`
- `Austria`: `2`
- `Greece`: `2`
- `New Zealand`: `2`
- `Canada`: `1`
- `United Kingdom`: `1`

### Top Cooldown Motifs

- `riesling`: `8`
- `chardonnay`: `6`
- `pinot_noir`: `6`
- `italian_red`: `6`
- `australia`: `5`
- `sauvignon_blanc`: `5`
- `bordeaux`: `5`
- `oxidative_aging`: `5`
- `douro`: `4`
- `mosel`: `4`
- `burgundy`: `4`
- `biodynamic`: `4`
- `cabernet_sauvignon`: `4`
- `loire`: `4`
- `portugal`: `4`
- `swartland`: `3`
- `old_vines`: `3`
- `rioja`: `3`
- `grenache`: `3`
- `syrah`: `3`

## Warnings

- fr_loire_huet_le_mont_sec: uses cooldown-heavy motifs ['huet', 'vouvray']
- fr_loire_closel_clos_du_papillon: uses cooldown-heavy motifs ['savennieres']
- it_etna_terre_nere_etna_rosso: uses cooldown-heavy motifs ['etna']
- pt_madeira_blandys_10_year_bual: uses cooldown-heavy motifs ['madeira']
- hu_tokaj_royal_tokaji_aszu_5_puttonyos: uses cooldown-heavy motifs ['tokaji']
- au_rutherglen_morris_old_premium_rare_muscat: uses cooldown-heavy motifs ['rutherglen']

## Selection Rule

The mock writer should select from this bank only after applying cooldown, source confidence, question-family fit, and diversity scorecard checks.
