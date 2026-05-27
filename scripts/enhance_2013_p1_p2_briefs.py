from __future__ import annotations

from pathlib import Path
from urllib.parse import quote_plus


ROOT = Path(__file__).resolve().parent.parent
RESEARCH_DIR = ROOT / "data" / "wine_research"


QUESTION_TEXT = {
    "2013_p1_q1": "Wines 1 and 2 are from the same country, but from different regions and different single grape varieties.",
    "2013_p1_q2": "Wines 3 and 4 are from the same country, but from different regions and different single grape varieties.",
    "2013_p1_q3": "Wines 5 and 6 are from the same country and region, but from different single grape varieties.",
    "2013_p1_q4": "Wines 7 and 8 are from the same country and are made from the same single grape variety.",
    "2013_p1_q5": "Wines 9-12 are from four different countries. Each wine is made from a different single grape variety.",
    "2013_p2_q1": "Wines 1-2 are from the same region of origin.",
    "2013_p2_q2": "Wines 3-5 are all from the same country of origin, but from different grape variety(ies).",
    "2013_p2_q3": "Wines 6-9 are all made from the same predominant grape variety, but from four different countries.",
    "2013_p2_q4": "Wines 10-12 are all from different countries.",
}


ENTRIES = {
    "2013_p1_w1": {
        "producer": "López de Heredia",
        "wine_name": "Viña Gravonia",
        "country": "Spain",
        "region": "Rioja",
        "sub_region": "Rioja Alta / Haro context",
        "appellation": "Rioja DOCa",
        "classification": "Traditional white Rioja",
        "style": "oxidative",
        "oak": "neutral_old",
        "rs": "dry",
        "profile": "medium_balanced",
        "grape": "Viura",
        "technical": "Traditional white Rioja with long cask ageing and bottle development; oxidative handling is part of the style identity.",
        "quick": "Expect mature white Rioja notes of wax, nuts, dried citrus and savory complexity rather than fresh primary fruit. This is a deliberate old-school style wine, not a youthful stainless white.",
        "producer_style": "López de Heredia is one of Rioja's great traditionalists and Viña Gravonia is a classic exam reference for evolved dry white Rioja.",
        "why": "This anchors 2013 Paper 1 Question 1 as the mature, traditional Spanish white against a fresher Albariño from the same country. The point is contrast of region, grape and élevage within Spain.",
    },
    "2013_p1_w2": {
        "producer": "Granbazán",
        "wine_name": "Albariño",
        "country": "Spain",
        "region": "Rías Baixas",
        "sub_region": "Rías Baixas",
        "appellation": "Rías Baixas DO",
        "classification": "Regional Albariño benchmark",
        "style": "still_dry",
        "oak": "none",
        "rs": "dry",
        "profile": "light_crisp",
        "grape": "Albariño",
        "technical": "Aromatic dry white vinified for freshness and salinity rather than oxidative development.",
        "quick": "Expect citrus, peach, saline freshness and bright acidity. It should feel much more youthful and Atlantic than the evolved Gravonia beside it.",
        "producer_style": "Granbazán is a recognised Rías Baixas producer and works well as a clean varietal/regional benchmark for Albariño.",
        "why": "This is the fresh Atlantic Spanish counterpoint in Question 1, testing whether the candidate can separate traditional white Rioja from modern Albariño while keeping the country constant.",
    },
    "2013_p1_w3": {
        "producer": "Schloss Gobelsburg",
        "wine_name": "Grüner Veltliner",
        "country": "Austria",
        "region": "Kamptal",
        "sub_region": "Kamptal",
        "appellation": "Kamptal DAC",
        "classification": "Regional Grüner Veltliner",
        "style": "still_dry",
        "oak": "none",
        "rs": "dry",
        "profile": "medium_balanced",
        "grape": "Grüner Veltliner",
        "technical": "Dry Austrian white, likely made in a reductive style with texture from lees rather than new oak.",
        "quick": "Expect pepper, orchard fruit and stony freshness with medium body. It should feel calmer and less dramatic than the Wachau Smaragd Riesling beside it.",
        "producer_style": "Schloss Gobelsburg is one of Austria's key quality estates and a credible benchmark for Kamptal whites.",
        "why": "Question 2 compares two Austrian whites from different regions and grapes. Gobelsburg provides the Kamptal Grüner reference against a more powerful Wachau Riesling.",
    },
    "2013_p1_w4": {
        "producer": "Prager",
        "wine_name": "Riesling Wachstum Bodenstein Smaragd",
        "country": "Austria",
        "region": "Wachau",
        "sub_region": "Wachau",
        "appellation": "Wachau Smaragd",
        "classification": "Smaragd",
        "style": "still_dry",
        "oak": "none",
        "rs": "dry",
        "profile": "full_rich",
        "grape": "Riesling",
        "technical": "Dry Wachau Riesling in the richest Smaragd tier, emphasizing ripeness, extract and site authority.",
        "quick": "Expect more power, extract and stone-fruit weight than the Kamptal Grüner alongside it. The wine should still read dry and mineral rather than soft or sweet.",
        "producer_style": "Prager is one of the Wachau's benchmark estates and a natural exam anchor for high-quality dry Riesling.",
        "why": "This is the high-authority Wachau wine in Question 2, forcing a candidate to calibrate Austrian dry white quality beyond simple country-level recognition.",
    },
    "2013_p1_w5": {
        "producer": "Te Whare Ra",
        "wine_name": "Riesling 'D'",
        "country": "New Zealand",
        "region": "Marlborough",
        "sub_region": "Marlborough",
        "appellation": "Marlborough",
        "classification": "Single-varietal Riesling",
        "style": "still_dry",
        "oak": "none",
        "rs": "off_dry",
        "profile": "light_crisp",
        "grape": "Riesling",
        "technical": "Aromatic Marlborough Riesling where sugar/acid balance and purity of fruit are central.",
        "quick": "Expect lime, floral notes and bright acidity, possibly with a touch of residual sugar. It should contrast clearly with the Chardonnay beside it even though both come from Marlborough.",
        "producer_style": "Te Whare Ra is a serious Marlborough producer and gives the paper a more artisanal reference than a mass brand.",
        "why": "Question 3 tests whether the candidate can handle same-region but different-grape comparison. This is the aromatic Riesling half of the Marlborough pair.",
    },
    "2013_p1_w6": {
        "producer": "Saint Clair",
        "wine_name": "Omaka Reserve Chardonnay",
        "country": "New Zealand",
        "region": "Marlborough",
        "sub_region": "Omaka / Marlborough",
        "appellation": "Marlborough",
        "classification": "Reserve Chardonnay",
        "style": "still_dry",
        "oak": "new_french",
        "rs": "dry",
        "profile": "medium_balanced",
        "grape": "Chardonnay",
        "technical": "Reserve Chardonnay with oak and likely malolactic influence, contrasting directly with the aromatic Riesling in the same regional frame.",
        "quick": "Expect peach, citrus, cream and oak spice with more body than the Riesling beside it. The question depends on reading winemaking influence as well as variety.",
        "producer_style": "Saint Clair is a well-known Marlborough producer, and the reserve Chardonnay sits above simple regional commodity wine.",
        "why": "This is the Chardonnay counterpoint in the same-region Marlborough question, used to test whether the candidate can separate regional markers from varietal and winemaking cues.",
    },
    "2013_p1_w7": {
        "producer": "Man Vintners",
        "wine_name": "Chenin Blanc",
        "country": "South Africa",
        "region": "South Africa",
        "sub_region": "Coastal",
        "appellation": "Western Cape / Coastal Region",
        "classification": "Commercial/regional Chenin Blanc",
        "style": "still_dry",
        "oak": "none",
        "rs": "dry",
        "profile": "light_crisp",
        "grape": "Chenin Blanc",
        "technical": "Fresh, likely unoaked Chenin aimed at varietal clarity and broad commercial appeal.",
        "quick": "Expect apple, pear and bright acidity with a simpler frame than the Stellenbosch wine beside it. It should function as the more commercial Chenin in the pair.",
        "producer_style": "Man Vintners is a volume-minded but reliable South African brand, making it a natural commercial foil.",
        "why": "Question 4 keeps country and grape constant, so the candidate must differentiate quality and style within South African Chenin rather than just naming Chenin Blanc.",
    },
    "2013_p1_w8": {
        "producer": "De Morgenzon",
        "wine_name": "Chenin Blanc",
        "country": "South Africa",
        "region": "South Africa",
        "sub_region": "Stellenbosch",
        "appellation": "Stellenbosch",
        "classification": "Premium Chenin Blanc",
        "style": "still_dry",
        "oak": "unclear",
        "rs": "dry",
        "profile": "medium_balanced",
        "grape": "Chenin Blanc",
        "technical": "More ambitious Stellenbosch Chenin, likely with greater texture and cellar input than the Coastal-region foil.",
        "quick": "Expect more concentration, texture and seriousness than the Man Vintners wine. Quality should feel more site-specific and less purely commercial.",
        "producer_style": "De Morgenzon is one of South Africa's quality-minded Chenin specialists and a strong benchmark for premium Stellenbosch white wine.",
        "why": "This is the stronger half of the South African Chenin pair, there to test quality calibration within one country and one grape.",
    },
    "2013_p1_w9": {
        "producer": "Ernesto Picollo",
        "wine_name": "Gavi di Gavi, Rovereto",
        "country": "Italy",
        "region": "Piedmont",
        "sub_region": "Gavi",
        "appellation": "Gavi di Gavi DOCG",
        "classification": "Single-vineyard Gavi",
        "style": "still_dry",
        "oak": "none",
        "rs": "dry",
        "profile": "light_crisp",
        "grape": "Cortese",
        "technical": "Classic dry Italian white made for freshness, texture and subtle mineral clarity rather than overt oak.",
        "quick": "Expect a restrained, citrus-led dry white with almond/mineral nuance. It should feel far quieter and less aromatic than the Assyrtiko or Gewürztraminer in the same breadth question.",
        "producer_style": "Ernesto Picollo's Rovereto bottling is a serious Gavi reference and gives the set a classic northern Italian benchmark.",
        "why": "Question 5 is a four-country breadth set. This wine provides a classic but subtle white that punishes overconfident aromatic shortcuts.",
    },
    "2013_p1_w10": {
        "producer": "Sigalas",
        "wine_name": "Assyrtiko",
        "country": "Greece",
        "region": "Santorini",
        "sub_region": "Santorini",
        "appellation": "Santorini PDO",
        "classification": "Regional benchmark Assyrtiko",
        "style": "still_dry",
        "oak": "none",
        "rs": "dry",
        "profile": "light_crisp",
        "grape": "Assyrtiko",
        "technical": "Dry volcanic-island white where acidity, extract and salinity matter more than oak.",
        "quick": "Expect citrus, smoke and saline tension with strong acidity. It should feel much more structural and mineral than its modest aromatic profile first suggests.",
        "producer_style": "Sigalas is one of Santorini's best-known benchmark producers and a very fair exam pick for Assyrtiko.",
        "why": "This is the Greek outlier in the breadth question, designed to reward candidates who can connect acidity and salinity to Santorini rather than defaulting to more obvious aromatic varieties.",
    },
    "2013_p1_w11": {
        "producer": "Gustave Lorentz",
        "wine_name": "Gewurztraminer Reserve",
        "country": "France",
        "region": "Alsace",
        "sub_region": "Alsace",
        "appellation": "Alsace AOC",
        "classification": "Reserve bottling",
        "style": "still_dry",
        "oak": "none",
        "rs": "off_dry",
        "profile": "medium_balanced",
        "grape": "Gewurztraminer",
        "technical": "Aromatic Alsace white where perfume, texture and slight sweetness balance are more important than oak or minerality.",
        "quick": "Expect lychee, rose and spice, with some texture and possibly a touch of residual sugar. The key is to recognize classic Gewürztraminer without automatically assuming fully sweet style.",
        "producer_style": "Gustave Lorentz is a long-established Alsace house and gives the set a clean varietal benchmark.",
        "why": "This is the overtly aromatic wine in Question 5 and helps balance the more restrained Gavi and more structural Assyrtiko.",
    },
    "2013_p1_w12": {
        "producer": "Franciscan",
        "wine_name": "Chardonnay, Cuvée Sauvage",
        "country": "USA",
        "region": "California",
        "sub_region": "Carneros",
        "appellation": "Carneros",
        "classification": "Premium California Chardonnay",
        "style": "still_dry",
        "oak": "new_french",
        "rs": "dry",
        "profile": "full_rich",
        "grape": "Chardonnay",
        "technical": "Californian Chardonnay with visible cellar shaping, likely including oak and malolactic texture.",
        "quick": "Expect ripe fruit, cream and oak spice with fuller body than most of the other wines in the breadth set. This is the most overtly international/New World in feel of the four.",
        "producer_style": "Franciscan's Cuvée Sauvage sits in the premium Napa/Carneros Chardonnay world and gives the examiner a polished New World benchmark.",
        "why": "This rounds out the breadth question with an oak-shaped New World Chardonnay, asking the candidate to handle winemaking cues as confidently as geography and grape.",
    },
    "2013_p2_w1": {
        "producer": "Jean-Baptiste Ponsot",
        "wine_name": "Rully",
        "country": "France",
        "region": "Burgundy",
        "sub_region": "Rully",
        "appellation": "Rully",
        "classification": "Village Burgundy",
        "style": "still_dry",
        "oak": "unclear",
        "rs": "dry",
        "profile": "medium_balanced",
        "grape": "Pinot Noir",
        "technical": "Still red Burgundy with relatively modest village-level weight compared with the Vosne-Romanée alongside it.",
        "quick": "Expect red fruit, moderate body and less depth than a top Côte de Nuits wine. The question depends on comparing maturity and quality within Burgundy rather than just saying Pinot Noir.",
        "producer_style": "Jean-Baptiste Ponsot serves as the more modest Burgundy reference in this pair, useful for calibrating village-level quality.",
        "why": "Question 1 is a same-region comparison. This wine is the less prestigious Burgundy in the pair and is there to make the candidate rank quality and maturity accurately.",
    },
    "2013_p2_w2": {
        "producer": "Sylvain Cathiard",
        "wine_name": "Vosne-Romanée En Orveaux",
        "country": "France",
        "region": "Burgundy",
        "sub_region": "Vosne-Romanée",
        "appellation": "Vosne-Romanée",
        "classification": "Village / premier-cru-adjacent Côte de Nuits Pinot Noir",
        "style": "still_dry",
        "oak": "unclear",
        "rs": "dry",
        "profile": "medium_balanced",
        "grape": "Pinot Noir",
        "technical": "Fine Burgundy Pinot Noir from a far higher-status village than Rully, with more complexity and perfume expected.",
        "quick": "Expect more aromatic complexity, silkier structure and greater length than the Rully. The candidate needed to identify not just Burgundy, but internal hierarchy and maturity.",
        "producer_style": "Sylvain Cathiard is a highly respected Vosne producer, making this the clear quality benchmark in the pair.",
        "why": "This is the stronger half of Question 1 and tests whether the candidate can articulate why Vosne-Romanée sits above Rully in quality and prestige.",
    },
    "2013_p2_w3": {
        "producer": "Peregrine",
        "wine_name": "Pinot Noir",
        "country": "New Zealand",
        "region": "New Zealand",
        "sub_region": "Central Otago",
        "appellation": "Central Otago",
        "classification": "Regional Pinot Noir",
        "style": "still_dry",
        "oak": "unclear",
        "rs": "dry",
        "profile": "medium_balanced",
        "grape": "Pinot Noir",
        "technical": "A cool-climate New Zealand Pinot, more red-fruited and varietally transparent than the Hawke's Bay blends beside it.",
        "quick": "Expect red fruit, spice and moderate tannin rather than the deeper structure of Bordeaux-style or Syrah-based wines. This is the clearest varietal cue in the New Zealand trio.",
        "producer_style": "Peregrine is a credible Central Otago producer and functions as the Pinot Noir marker in the all-New Zealand question.",
        "why": "Question 2 keeps country constant but changes varieties and regions. This wine provides the southern cool-climate Pinot reference against two warmer Hawke's Bay reds.",
    },
    "2013_p2_w4": {
        "producer": "Craggy Range",
        "wine_name": "Te Kahu",
        "country": "New Zealand",
        "region": "New Zealand",
        "sub_region": "Gimblett Gravels, Hawke's Bay",
        "appellation": "Hawke's Bay",
        "classification": "Bordeaux-style blend",
        "style": "still_dry",
        "oak": "unclear",
        "rs": "dry",
        "profile": "tannic_structured",
        "grape": "Bordeaux-style blend",
        "technical": "A Hawke's Bay Bordeaux blend where ripeness, tannin and oak integration are more relevant than pure varietal perfume.",
        "quick": "Expect darker fruit, firmer tannin and more oak shape than the Pinot Noir. The wine should feel international and serious rather than simple varietal expression.",
        "producer_style": "Craggy Range is one of New Zealand's flagship producers, and Te Kahu is a respected second-label Bordeaux blend from Hawke's Bay.",
        "why": "This is the blend foil in Question 2, designed to show New Zealand is not just Pinot and Sauvignon but can also play in the Bordeaux-blend register.",
    },
    "2013_p2_w5": {
        "producer": "Elephant Hill",
        "wine_name": "Syrah",
        "country": "New Zealand",
        "region": "New Zealand",
        "sub_region": "Hawke's Bay",
        "appellation": "Hawke's Bay",
        "classification": "Regional Syrah",
        "style": "still_dry",
        "oak": "unclear",
        "rs": "dry",
        "profile": "medium_balanced",
        "grape": "Syrah",
        "technical": "Cooler-climate Syrah where pepper, violet and freshness should matter more than sheer mass.",
        "quick": "Expect black pepper, dark berry fruit and moderate body rather than blockbuster Shiraz weight. The key is to place it as Hawke's Bay Syrah in an international context.",
        "producer_style": "Elephant Hill is a quality Hawke's Bay producer and a fair exam benchmark for New Zealand Syrah.",
        "why": "This completes the all-New Zealand trio by providing the third major red style the country can produce at quality level.",
    },
    "2013_p2_w6": {
        "producer": "Álvaro Palacios",
        "wine_name": "Priorat Gratallops",
        "country": "Spain",
        "region": "Priorat",
        "sub_region": "Gratallops",
        "appellation": "Priorat DOCa",
        "classification": "Grenache-led Priorat",
        "style": "still_dry",
        "oak": "unclear",
        "rs": "dry",
        "profile": "tannic_structured",
        "grape": "Grenache-led blend",
        "technical": "Mediterranean old-vine red with power, minerality and oak shaping, often with Garnacha dominant.",
        "quick": "Expect ripe dark fruit, alcohol, mineral depth and structure. This is the most concentrated and internationally ambitious wine in the Grenache-family question.",
        "producer_style": "Álvaro Palacios is one of Spain's iconic modern fine-wine producers and Gratallops is a major Priorat reference point.",
        "why": "Question 3 follows Grenache across four countries. This wine anchors the powerful Spanish/Mediterranean end of that family.",
    },
    "2013_p2_w7": {
        "producer": "Birichino",
        "wine_name": "Grenache, Besson Vineyard",
        "country": "USA",
        "region": "USA",
        "sub_region": "Central Coast",
        "appellation": "Central Coast",
        "classification": "Single-vineyard Grenache",
        "style": "still_dry",
        "oak": "unclear",
        "rs": "dry",
        "profile": "medium_balanced",
        "grape": "Grenache",
        "technical": "California Grenache with emphasis on site and fruit purity rather than simple jammy power.",
        "quick": "Expect red fruit, spice and a more lifted style than the Priorat or Châteauneuf. The candidate needed to see family resemblance without forcing all Grenache wines into one weight class.",
        "producer_style": "Birichino is a quality-minded California producer, making this a smart curveball rather than a caricatured high-alcohol bottling.",
        "why": "This is the USA expression in the Grenache-family four-country question, broadening the candidate's map of the grape beyond Europe and Australia.",
    },
    "2013_p2_w8": {
        "producer": "Le Vieux Donjon",
        "wine_name": "Châteauneuf-du-Pape",
        "country": "France",
        "region": "Rhône Valley",
        "sub_region": "Châteauneuf-du-Pape",
        "appellation": "Châteauneuf-du-Pape AOC",
        "classification": "Grenache-led Rhône blend",
        "style": "still_dry",
        "oak": "unclear",
        "rs": "dry",
        "profile": "tannic_structured",
        "grape": "Grenache-led blend",
        "technical": "Southern Rhône blend with Grenache predominant, offering a classic benchmark for the family.",
        "quick": "Expect garrigue, red/dark fruit, warmth and savory complexity. This is the classic Old World benchmark in the Grenache-family set.",
        "producer_style": "Le Vieux Donjon is a highly respected traditional Châteauneuf producer and exactly the sort of reference examiners use.",
        "why": "This is the French benchmark in Question 3 and helps candidates calibrate what a classic Grenache-dominant Old World blend looks like against Spain, California and Australia.",
    },
    "2013_p2_w9": {
        "producer": "Yalumba",
        "wine_name": "Bush Vine Grenache",
        "country": "Australia",
        "region": "Australia",
        "sub_region": "Barossa Valley",
        "appellation": "Barossa Valley",
        "classification": "Regional Grenache",
        "style": "still_dry",
        "oak": "unclear",
        "rs": "dry",
        "profile": "medium_balanced",
        "grape": "Grenache",
        "technical": "Australian Grenache where ripe fruit and generosity are likely, but with old-vine credibility if the wine is serious.",
        "quick": "Expect riper fruit and softer contours than the French wine, but still enough structure to sit as a serious Grenache rather than simple confection.",
        "producer_style": "Yalumba is a major but quality-conscious Australian producer, making this a fair Barossa benchmark with commercial relevance.",
        "why": "This is the Australian expression in the Grenache-family comparison and lets the candidate discuss both quality and commercial appeal across countries.",
    },
    "2013_p2_w10": {
        "producer": "Jacques Dépagneux",
        "wine_name": "Beaujolais Villages",
        "country": "France",
        "region": "Beaujolais",
        "sub_region": "Beaujolais Villages",
        "appellation": "Beaujolais Villages",
        "classification": "Carbonic / semi-carbonic Gamay",
        "style": "still_dry",
        "oak": "none",
        "rs": "dry",
        "profile": "light_crisp",
        "grape": "Gamay",
        "technical": "Likely semi-carbonic or carbonic-influenced winemaking with bright fruit and light tannin.",
        "quick": "Expect juicy red fruit, low tannin and fermentative lift. This is the clearest technique-driven wine in Question 4.",
        "producer_style": "A Beaujolais Villages bottling like this functions as the classic carbonic benchmark in an otherwise mixed-method trio.",
        "why": "Question 4 asks for method first, so this wine is there to test whether candidates can recognize carbonic-derived red-fruit style and connect it to Beaujolais/Gamay.",
    },
    "2013_p2_w11": {
        "producer": "Fabiano",
        "wine_name": "Valpolicella Ripasso",
        "country": "Italy",
        "region": "Veneto",
        "sub_region": "Valpolicella",
        "appellation": "Valpolicella Ripasso DOC",
        "classification": "Ripasso",
        "style": "still_dry",
        "oak": "unclear",
        "rs": "dry",
        "profile": "medium_balanced",
        "grape": "Corvina / Corvinone / Rondinella",
        "technical": "Ripasso production, where refermentation on Amarone lees deepens color, alcohol and texture.",
        "quick": "Expect dried-cherry fruit, extra body and a distinct dried-fruit edge compared with simple Valpolicella. The method is central to the correct answer.",
        "producer_style": "Fabiano is a commercial but legitimate Veneto producer, useful as a clear Ripasso category marker.",
        "why": "This is the method-driven Italian wine in Question 4, set to reward candidates who can explain Ripasso clearly.",
    },
    "2013_p2_w12": {
        "producer": "Pulenta",
        "wine_name": "Gran Corte",
        "country": "Argentina",
        "region": "Argentina",
        "sub_region": "Luján de Cuyo",
        "appellation": "Mendoza / Luján de Cuyo",
        "classification": "Bordeaux-style blend",
        "style": "still_dry",
        "oak": "unclear",
        "rs": "dry",
        "profile": "tannic_structured",
        "grape": "Bordeaux-style blend",
        "technical": "Oak-shaped Mendoza blend with ripeness and structure, likely combining Cabernet Sauvignon, Malbec and related grapes.",
        "quick": "Expect dark fruit, ripe tannin and visible cellar shaping. The method discussion should focus on modern blend construction and élevage rather than regional tradition alone.",
        "producer_style": "Pulenta is a quality Argentine producer and Gran Corte is a serious international-style blend, not a simple varietal bottling.",
        "why": "This rounds out Question 4 with a New World Bordeaux-style production model, balancing the carbonic Beaujolais and Ripasso examples.",
    },
}


def qkey_for_wine(wine_id: str) -> str:
    slot = int(wine_id.split("_w")[1])
    if wine_id.startswith("2013_p1"):
        if slot <= 2:
            return "2013_p1_q1"
        if slot <= 4:
            return "2013_p1_q2"
        if slot <= 6:
            return "2013_p1_q3"
        if slot <= 8:
            return "2013_p1_q4"
        return "2013_p1_q5"
    if slot <= 2:
        return "2013_p2_q1"
    if slot <= 5:
        return "2013_p2_q2"
    if slot <= 9:
        return "2013_p2_q3"
    return "2013_p2_q4"


def search_url(text: str) -> str:
    return f"https://www.wine-searcher.com/find/{quote_plus(text)}"


def ddg_url(text: str) -> str:
    return f"https://duckduckgo.com/?q={quote_plus(text)}"


def render(entry_id: str, meta: dict) -> str:
    original = (RESEARCH_DIR / f"{entry_id}.md").read_text(encoding="utf-8")
    vintage = original.split("vintage: ", 1)[1].splitlines()[0].strip()
    abv = original.split("abv: ", 1)[1].splitlines()[0].strip()
    qkey = qkey_for_wine(entry_id)
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
Used in 2013 {'Paper 1' if entry_id.startswith('2013_p1') else 'Paper 2'}. The stem begins: "{QUESTION_TEXT[qkey]}" {meta['why']}

## Sources
- [Wine-Searcher query]({search_url(query)}) - entry point for exact bottling, availability and merchant references
- [DuckDuckGo query]({ddg_url(query)}) - entry point for producer, cuvée and vintage lookups
- Source needed for bottling-specific technical detail beyond what is safely inferable from category, producer and exam context
"""


def main() -> None:
    updated = 0
    for entry_id, meta in ENTRIES.items():
        path = RESEARCH_DIR / f"{entry_id}.md"
        path.write_text(render(entry_id, meta), encoding="utf-8")
        updated += 1
    print(f"OK: updated {updated} briefs across 2013 Paper 1 and Paper 2")


if __name__ == "__main__":
    main()
