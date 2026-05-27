from __future__ import annotations

from pathlib import Path
from urllib.parse import quote_plus


ROOT = Path(__file__).resolve().parent.parent
RESEARCH_DIR = ROOT / "data" / "wine_research"

QUESTION_TEXT = {
    "q1": "Wines 1-4 are from four different countries. None of the wines are from Champagne.",
    "q2": "Wines 5-8 are from three different countries.",
    "q3": "Wines 9-10 are produced from two different countries in Europe.",
    "q4": "Wines 11-12 are produced in different countries.",
}

ENTRIES = {
    "2014_p3_w1": {
        "producer": "Raventós i Blanc",
        "wine_name": "L'Hereu Cava",
        "country": "Spain",
        "region": "Penedès",
        "sub_region": "Conca del Riu Anoia / Penedès",
        "appellation": "Cava / traditional-method sparkling from Penedès",
        "classification": "Traditional-method sparkling wine",
        "style": "sparkling",
        "oak": "none",
        "rs": "dry",
        "profile": "light_crisp",
        "grape": "Xarel-lo / Macabeo / Parellada likely",
        "technical": "Traditional-method Spanish sparkling wine with lees ageing, positioned above anonymous entry-level cava.",
        "quick": "Expect fine but not Champagne-like mousse, apple/citrus fruit and a savory Mediterranean edge. The quality call should place it above cheap fizz while keeping it below prestige Champagne-like complexity.",
        "producer_style": "Raventós i Blanc is one of Spain's benchmark sparkling producers and often sits at the serious end of the broader cava-style category.",
        "why": "In 2014 Paper 3 Question 1, wines 1-4 are non-Champagne sparklers from different countries. This wine anchors the serious traditional-method Spanish end of that set.",
    },
    "2014_p3_w2": {
        "producer": "François Pinon",
        "wine_name": "Vouvray Brut",
        "country": "France",
        "region": "Loire",
        "sub_region": "Vouvray",
        "appellation": "Vouvray AOC",
        "classification": "Traditional-method sparkling Chenin Blanc",
        "style": "sparkling",
        "oak": "none",
        "rs": "dry",
        "profile": "light_crisp",
        "grape": "Chenin Blanc",
        "technical": "Traditional-method sparkling Chenin with acidity, chalky tension and lower dosage emphasis.",
        "quick": "Expect apple, quince and chalk with a firm acid spine and less overt autolysis than Champagne. It should feel more Loire and more Chenin than generic sparkling wine.",
        "producer_style": "François Pinon is a respected Vouvray grower and gives the question a serious Loire benchmark rather than a commercial sparkling wine.",
        "why": "This is the Loire sparkling reference in Question 1, there to test whether the candidate can identify Vouvray Brut as distinct from Cava, Sekt and California Blanc de Blancs.",
    },
    "2014_p3_w3": {
        "producer": "Sektmanufaktur Graf",
        "wine_name": "Riesling Sekt",
        "country": "Germany",
        "region": "Pfalz",
        "sub_region": "Pfalz",
        "appellation": "Deutscher Sekt / Sekt b.A.",
        "classification": "Riesling Sekt",
        "style": "sparkling",
        "oak": "none",
        "rs": "dry",
        "profile": "light_crisp",
        "grape": "Riesling",
        "technical": "German sparkling wine where aromatic Riesling character and acidity remain visible through the mousse.",
        "quick": "Expect citrus, green apple and possibly a light petrol/floral edge beneath the bubbles. The key is to identify varietal Riesling character inside a sparkling frame.",
        "producer_style": "This is a specialist sparkling bottling rather than a mass-market Sekt, making it a useful category marker for quality German fizz.",
        "why": "Question 1 asks for origin with grape references as well as method. This wine tests whether the candidate can connect sparkling texture with clearly Riesling fruit and place it in Germany rather than Champagne.",
    },
    "2014_p3_w4": {
        "producer": "Domaine Carneros",
        "wine_name": "Le Rêve Blanc de Blancs",
        "country": "USA",
        "region": "California",
        "sub_region": "Carneros",
        "appellation": "Carneros",
        "classification": "Prestige Blanc de Blancs",
        "style": "sparkling",
        "oak": "none",
        "rs": "dry",
        "profile": "light_crisp",
        "grape": "100% Chardonnay",
        "technical": "Prestige traditional-method California Blanc de Blancs with long lees ageing and fine-wine ambitions.",
        "quick": "Expect polished mousse, ripe orchard fruit, toast and a broader New World richness than the European sparklers. It should sit at the fine-wine end of the non-Champagne sparkling spectrum.",
        "producer_style": "Domaine Carneros is a benchmark Californian sparkling producer, and Le Rêve is its flagship Blanc de Blancs.",
        "why": "This is the highest-quality and most Champagne-aspiring wine in Question 1, testing whether the candidate can discuss both method and commercial positioning at the top end of non-Champagne sparkling wine.",
    },
    "2014_p3_w5": {
        "producer": "Lustau",
        "wine_name": "East India Solera Sherry",
        "country": "Spain",
        "region": "Jerez",
        "sub_region": "Jerez de la Frontera / Sherry Triangle",
        "appellation": "Jerez-Xérès-Sherry DO",
        "classification": "Cream / sweetened oxidative Sherry",
        "style": "fortified",
        "oak": "neutral_old",
        "rs": "sweet",
        "profile": "dessert",
        "grape": "Palomino with sweetening component likely Pedro Ximénez",
        "technical": "Fortified and oxidatively matured through solera, then sweetened to the East India / cream-sherry register.",
        "quick": "Expect walnut, toffee, orange peel and sweet oxidative richness rather than dry flor sharpness. The method discussion depends on fortification, biological/oxidative background and sweetening.",
        "producer_style": "Lustau is a top-tier Sherry house with broad category coverage, making this a very fair benchmark for sweet oxidative Sherry.",
        "why": "In Question 2, wines 5-8 test fortified/sweet methods across three countries. This wine is the Sherry side of that comparison and rewards candidates who can explain the solera-sweetened style correctly.",
    },
    "2014_p3_w6": {
        "producer": "Blandy's",
        "wine_name": "15 Year Old Malmsey",
        "country": "Portugal",
        "region": "Madeira",
        "sub_region": "Madeira",
        "appellation": "Madeira DOC",
        "classification": "Aged Madeira",
        "style": "fortified",
        "oak": "neutral_old",
        "rs": "sweet",
        "profile": "dessert",
        "grape": "Malmsey / Malvasia",
        "technical": "Fortified and heated/oxidatively matured Madeira, with age statement indicating significant cask development.",
        "quick": "Expect caramel, citrus peel, roasted nuts and piercing acidity beneath very obvious sweetness. Madeira should stand apart by its acid line and maderized complexity.",
        "producer_style": "Blandy's is one of Madeira's defining historic producers and a strong benchmark for age-statement Madeira.",
        "why": "This is the Madeira benchmark in Question 2 and helps candidates compare sweet fortified production mechanisms across Sherry, Madeira, Port and Banyuls.",
    },
    "2014_p3_w7": {
        "producer": "Graham's",
        "wine_name": "Six Grapes Reserve Port",
        "country": "Portugal",
        "region": "Port",
        "sub_region": "Douro / Porto",
        "appellation": "Port",
        "classification": "Reserve Ruby Port",
        "style": "fortified",
        "oak": "neutral_old",
        "rs": "sweet",
        "profile": "dessert",
        "grape": "Traditional Port varieties",
        "technical": "Fortified ruby-style Port with limited oxidative ageing compared with tawny categories; fruit and richness stay central.",
        "quick": "Expect sweet dark fruit, spirit and relatively youthful ruby character rather than nutty oxidative maturity. It should be more straightforward than Vintage Port but clearly quality-minded.",
        "producer_style": "Graham's is one of the major classic Port houses and Six Grapes is a famous reserve bottling with strong commercial recognition.",
        "why": "This gives Question 2 a classic reserve-ruby Port reference, making the candidate compare sweetness level, style and method against the Sherry, Madeira and Banyuls around it.",
    },
    "2014_p3_w8": {
        "producer": "Domaine La Tour Vieille",
        "wine_name": "Banyuls Rimage",
        "country": "France",
        "region": "Roussillon",
        "sub_region": "Banyuls",
        "appellation": "Banyuls AOC",
        "classification": "Vin Doux Naturel",
        "style": "fortified",
        "oak": "neutral_old",
        "rs": "sweet",
        "profile": "dessert",
        "grape": "Grenache",
        "technical": "Fortified red Vin Doux Naturel, with sweetness retained but less oxidative shaping than tawny-style wines.",
        "quick": "Expect sweet black fruit, cocoa and fortification warmth, but a more grapey/red-wine identity than Port or Madeira. The method call depends on mutage and category recognition.",
        "producer_style": "La Tour Vieille is a strong Roussillon reference and its Rimage bottling is a standard exam-worthy Banyuls marker.",
        "why": "This is the southern French VDN in Question 2, broadening the fortified/sweet comparison beyond Iberia and forcing candidates to discuss Grenache-based mutage correctly.",
    },
    "2014_p3_w9": {
        "producer": "Miraval",
        "wine_name": "Rosé",
        "country": "France",
        "region": "Côtes de Provence",
        "sub_region": "Provence",
        "appellation": "Côtes de Provence AOC",
        "classification": "Dry rosé",
        "style": "rose",
        "oak": "none",
        "rs": "dry",
        "profile": "light_crisp",
        "grape": "Provençal rosé blend likely",
        "technical": "Direct-press or very short maceration rosé where color delicacy and freshness are central to style.",
        "quick": "Expect pale color, red-citrus fruit and a dry, fresh palate. The key is to treat it as a deliberate quality rosé rather than dismissing it as simple pink wine.",
        "producer_style": "Miraval is a highly visible Provence rosé brand and useful for testing the commercial potential side of quality rosé discussion.",
        "why": "In Question 3, wines 9-10 compare two European wines on method, quality and commercial potential. This is the modern commercial-success rosé side of that pairing.",
    },
    "2014_p3_w10": {
        "producer": "Pheasant's Tears",
        "wine_name": "Rkatsiteli",
        "country": "Georgia",
        "region": "Kakheti",
        "sub_region": "Kakheti",
        "appellation": "Georgian amber/orange wine tradition",
        "classification": "Skin-contact white / qvevri-style wine",
        "style": "orange",
        "oak": "none",
        "rs": "dry",
        "profile": "medium_balanced",
        "grape": "Rkatsiteli",
        "technical": "Skin-contact white wine, often fermented and/or matured in qvevri, with phenolic grip central to method and style.",
        "quick": "Expect amber hue, tannic grip, tea/spice notes and savory structure. The method explanation matters more than simple grape naming here.",
        "producer_style": "Pheasant's Tears is one of the best-known ambassadors of modern Georgian traditional wine, making it a very fair exam curveball.",
        "why": "This is the technique-driven Georgian counterpoint in Question 3, included so the candidate must discuss skin contact and vessel tradition rather than only mainstream categories.",
    },
    "2014_p3_w11": {
        "producer": "Folie à Deux / Menage a Trois",
        "wine_name": "Menage a Trois",
        "country": "USA",
        "region": "California",
        "sub_region": "California",
        "appellation": "California",
        "classification": "Commercial red blend",
        "style": "still_dry",
        "oak": "unclear",
        "rs": "dry",
        "profile": "medium_balanced",
        "grape": "Commercial red blend",
        "technical": "Modern commercial blend made for immediate approachability, ripe fruit and broad market appeal.",
        "quick": "Expect ripe fruit, softness and overtly commercial polish rather than stern structure. Quality should be assessed honestly within a commercial context, not over-upgraded.",
        "producer_style": "Menage a Trois is a classic supermarket-success California brand and therefore a perfect exam wine for discussing commercial position explicitly.",
        "why": "Question 4 asks for method, origin and quality/maturity on two wines from different countries. This bottle provides the overt commercial California benchmark against the more traditional Amarone.",
    },
    "2014_p3_w12": {
        "producer": "Allegrini",
        "wine_name": "Amarone della Valpolicella",
        "country": "Italy",
        "region": "Veneto",
        "sub_region": "Valpolicella",
        "appellation": "Amarone della Valpolicella DOCG",
        "classification": "Amarone",
        "style": "still_dry",
        "oak": "unclear",
        "rs": "dry",
        "profile": "full_rich",
        "grape": "Corvina / Corvinone / Rondinella",
        "technical": "Appassimento red made from dried grapes, giving elevated alcohol, concentration and dried-fruit depth.",
        "quick": "Expect dried cherry, raisin, alcohol warmth and significant extract. The method is the central identification tool, along with the wine's scale and maturity potential.",
        "producer_style": "Allegrini is one of Amarone's leading quality producers and a very plausible benchmark bottle for the style.",
        "why": "This is the traditional, technique-driven foil to the commercial California blend in Question 4, testing whether the candidate can explain appassimento and quality hierarchy clearly.",
    },
}


def qkey(slot: int) -> str:
    if slot <= 4:
        return "q1"
    if slot <= 8:
        return "q2"
    if slot <= 10:
        return "q3"
    return "q4"


def search_url(text: str) -> str:
    return f"https://www.wine-searcher.com/find/{quote_plus(text)}"


def ddg_url(text: str) -> str:
    return f"https://duckduckgo.com/?q={quote_plus(text)}"


def render(entry_id: str, meta: dict) -> str:
    original = (RESEARCH_DIR / f"{entry_id}.md").read_text(encoding="utf-8")
    vintage = original.split("vintage: ", 1)[1].splitlines()[0].strip()
    abv = original.split("abv: ", 1)[1].splitlines()[0].strip()
    slot = int(entry_id.split("_w")[1])
    query = f"{meta['producer']} {meta['wine_name']} {vintage} {meta['sub_region']}"
    return f"""---
wine_id: {entry_id}
producer: {meta['producer']}
wine_name: {meta['wine_name']}
vintage: {vintage}
country: {meta['country']}
region: {meta['region']}
sub_region: {meta['sub_region']}
appellation: {meta['appellation']}
abv: {abv}
classification: {meta['classification']}
related_wines: []
sources:
  - {search_url(query)}
  - {ddg_url(query)}
last_updated: 2026-05-26
style_category: {meta['style']}
oak_signature: {meta['oak']}
rs_level: {meta['rs']}
structural_profile: {meta['profile']}
---

# {meta['wine_name']}, {meta['producer']}

## Quick tasting profile
{meta['quick']}

## Technical specs
- Grape variety: {meta['grape']}
- Vineyard: Source needed
- Soils: Source needed
- Vinification: {meta['technical']}
- Élevage: Source needed
- ABV / RS / TA: {abv}% / Source needed / Source needed

## Vintage character
Source needed for a vintage-specific note on this exact release. In exam use, calibrate from the glass: fruit ripeness, acidity, tertiary development and concentration matter more than overclaiming historical weather detail.

## Producer style
{meta['producer_style']}

## Why it's in this exam
Used in 2014 Paper 3. The stem begins: "{QUESTION_TEXT[qkey(slot)]}" {meta['why']}

## Sources
- [Wine-Searcher query]({search_url(query)}) - entry point for exact bottling, availability and merchant references
- [DuckDuckGo query]({ddg_url(query)}) - entry point for producer, cuvée and vintage lookups
- Source needed for bottling-specific technical detail beyond what is safely inferable from category, producer and exam context
"""


def main() -> None:
    updated = 0
    for entry_id, meta in ENTRIES.items():
        (RESEARCH_DIR / f"{entry_id}.md").write_text(render(entry_id, meta), encoding="utf-8")
        updated += 1
    print(f"OK: updated {updated} briefs across 2014 Paper 3")


if __name__ == "__main__":
    main()
