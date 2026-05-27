# Mock Wine Bank Staging Schema Brief

Every staging file written under `data/mock_wine_bank_staging/{bucket_name}.json` must be a JSON array of wine entries. Each entry must follow this schema and be backed by real URLs in `sources`.

## Required fields (all must be present and non-empty)

```
id                  string, lowercase ASCII, snake_case, pattern: {country_code}_{region_slug}_{producer_slug}_{wine_slug}
producer            string
wine_name           string
country             string
region              string
grape_varieties     non-empty array of strings
style_category      one of: still_dry, still_off_dry, still_sweet, sparkling, fortified, oxidative, orange, rose
price_band          one of: value, mainstream, premium, super_premium, luxury, unknown
quality_tier        one of: commercial, regional, premium, benchmark, iconic, unknown
useful_families     non-empty array of: F1, F2, F3, F4, F5, F6, F7, F8
cooldown_motifs     non-empty array of lower-snake-case motif tags (region, variety, method)
sources             non-empty array of fully-formed http(s) URLs
```

## Recommended additional fields

```
vintage_guidance       short string about the vintage you researched
sub_region             string
appellation            string (DOC / AOC / DOCa / WO / etc.)
classification         string (Cru Classé, Reserva, Gran Reserva, GG, Erste Lage, 1er Cru, etc.)
method_tags            array of method tags (e.g. ["traditional_method", "long_lees"])
structure_tags         array of structure tags (e.g. ["high_acid", "medium_body"])
oak_signature          string
rs_level               string (dry / off_dry / sweet / "12 g/L" / etc.)
abv                    string with percent (e.g. "13.5%")
commercial_channels    array (e.g. ["retail", "on_premise", "specialist_retail"])
useful_subtypes        array (descriptive: ["same_variety_origin_spread"], etc.)
question_roles         array (descriptive: ["nv_champagne_foil"], etc.)
avoid_if_recent_motifs array of motif tags for cooldown
selection_notes        single string explaining mock-flight role
source_confidence      one of: low, medium, high
```

## Source URL rules (strict)

- **Every entry must have at least one URL.** Prefer producer websites, importer tech sheets, Wine-Searcher pages, Decanter / Vinous / JancisRobinson articles, CellarTracker pages.
- Avoid `duckduckgo.com/?q=...` search-result links — they do not validate. If a producer URL is unavailable, prefer an authoritative retailer (wine.com, BBR) over a search query.
- If you cannot find a real URL, **skip the wine** rather than fabricate.

## Quality discipline

- Use **real** facts only. If you cannot verify ABV, soil, classification, leave the field omitted, do not guess.
- Set `source_confidence: high` only if you have ≥2 corroborating URLs OR a producer technical sheet PDF.
- Set `source_confidence: medium` if you have 1 producer or 1 critic / retailer source.
- Never invent producers, vintages, classifications, prices.
- Price-band guidance: **value** = retail ~$5–12 supermarket; **mainstream** = ~$12–30 retail; **premium** = ~$30–80; **super_premium** = ~$80–250; **luxury** = $250+ / allocation tier.
- Quality-tier guidance: **commercial** = supermarket high-volume; **regional** = good village-level / regional appellation; **premium** = serious estate, mid-tier appellation; **benchmark** = regional reference standard; **iconic** = world-recognized fine wine.

## Existing IDs (forbidden — you must not reuse any of these)

```
at_kamptal_brundlmayer_terrassen_gruner_veltliner
at_kamptal_gobelsburg_ried_lamm_gruner_veltliner
pt_moncao_soalheiro_primeiras_vinhas_alvarinho
es_rias_baixas_do_ferreiro_cepas_vellas_albarino
it_soave_pieropan_la_rocca
it_alto_adige_terlano_vorberg_pinot_bianco
es_rioja_lopez_de_heredia_tondonia_blanco_reserva
fr_jura_berthet_bondet_chateau_chalon
ar_mendoza_susana_balbo_signature_torrontes
za_swartland_mullineux_old_vines_white
au_hunter_tyrrells_vat_1_semillon
es_rioja_alta_vina_alberdi_reserva
es_rioja_muga_prado_enea_gran_reserva
pt_douro_vale_meao_tinto
pt_douro_niepoort_charme
za_stellenbosch_kanonkop_estate_pinotage
za_swartland_sadie_columella
gr_nemea_gaia_estate_agiorgitiko
gr_naoussa_kir_yianni_ramnista
cl_maipo_don_melchor
cl_colchagua_clos_apalta
ar_uco_catena_adrianna_vineyard_river_malbec
us_sonoma_ridge_geyserville
au_south_australia_penfolds_bin_389
au_eden_valley_henschke_mount_edelstone_shiraz
fr_maury_mas_amiel_vintage
fr_banyuls_la_tour_vieille_rimage
pt_setubal_jmf_alambre_20_years
it_friuli_radikon_ribolla_gialla
za_constantia_klein_constantia_vin_de_constance
ca_niagara_inniskillin_gold_vidal_icewine
it_pantelleria_donnafugata_ben_rye
cl_aconcagua_errazuriz_sauvignon_blanc
es_rioja_cvne_monopole
au_south_australia_oxford_landing_cabernet_shiraz
za_stellenbosch_jordan_syrah
fr_champagne_de_laurency_brut
it_veneto_valdo_prosecco_superiore_oro_puro
de_mosel_dr_loosen_riesling_sekt_extra_dry
au_south_east_jacobs_creek_sparkling_shiraz
it_piedmont_elio_perrone_sourgal_moscato_dasti
```

## Country code prefixes to use in `id`

`fr` France, `it` Italy, `es` Spain, `pt` Portugal, `de` Germany, `at` Austria, `gr` Greece, `hu` Hungary, `gb` Great Britain, `ch` Switzerland, `us` United States, `ca` Canada, `cl` Chile, `ar` Argentina, `au` Australia, `nz` New Zealand, `za` South Africa, `lb` Lebanon, `ge` Georgia.

## Example entry (reference shape)

```json
{
  "id": "fr_burgundy_louis_jadot_meursault",
  "producer": "Maison Louis Jadot",
  "wine_name": "Meursault",
  "vintage_guidance": "Use current or recent vintage; 2021 was researched.",
  "country": "France",
  "region": "Burgundy",
  "sub_region": "Côte de Beaune",
  "appellation": "Meursault AOC",
  "grape_varieties": ["Chardonnay"],
  "style_category": "still_dry",
  "method_tags": ["barrel_fermented", "lees", "malolactic", "french_oak"],
  "structure_tags": ["full_body", "medium_plus_acid", "hazelnut", "stone_fruit"],
  "oak_signature": "french_barriques_partial_new",
  "rs_level": "dry",
  "abv": "13.5%",
  "price_band": "premium",
  "quality_tier": "benchmark",
  "commercial_channels": ["specialist_retail", "restaurant"],
  "useful_families": ["F1", "F2", "F7"],
  "useful_subtypes": ["chardonnay_quality_ladder", "burgundy_village_anchor"],
  "question_roles": ["village_burgundy_anchor", "oak_textured_chardonnay"],
  "cooldown_motifs": ["meursault", "chardonnay", "cote_de_beaune", "burgundy"],
  "avoid_if_recent_motifs": ["burgundy_white"],
  "selection_notes": "Useful as a village-level Meursault contrast against Chablis (oak-driven vs steely) or NW Chardonnay.",
  "source_confidence": "high",
  "sources": [
    "https://www.louisjadot.com/en/wine/meursault/",
    "https://www.wine.com/product/louis-jadot-meursault-2021/661063"
  ]
}
```

## Output file convention

Write your file to `data/mock_wine_bank_staging/bucket_{LETTER}_{summary}.json` containing the JSON array of entries. Do not modify any other file. Do not modify `data/mock_wine_bank.json` directly.
