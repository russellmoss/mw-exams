from __future__ import annotations

import json
import re
from pathlib import Path
from urllib.parse import quote_plus


ROOT = Path(__file__).resolve().parent.parent
TMP_WINES_PATH = ROOT / "data" / "tmp_v2_parse" / "wines_v2_temp.json"
TMP_EXAMS_PATH = ROOT / "data" / "tmp_v2_parse" / "exams_v2_temp.json"
RESEARCH_DIR = ROOT / "data" / "wine_research"


APPELLATION_VARIETY_MAP = {
    "chablis": "Chardonnay",
    "meursault": "Chardonnay",
    "puligny-montrachet": "Chardonnay",
    "montrachet": "Chardonnay",
    "corton-charlemagne": "Chardonnay",
    "sancerre": "Sauvignon Blanc",
    "pouilly-fume": "Sauvignon Blanc",
    "condrieu": "Viognier",
    "vouvray": "Chenin Blanc",
    "muscadet": "Melon de Bourgogne",
    "gavi": "Cortese",
    "barolo": "Nebbiolo",
    "barbaresco": "Nebbiolo",
    "brunello": "Sangiovese",
    "chianti": "Sangiovese",
    "amarone": "Corvina / Corvinone / Rondinella",
    "valpolicella": "Corvina / Corvinone / Rondinella",
    "rioja blanco": "Viura / Macabeo",
    "rioja": "Tempranillo-based blend",
    "ribera del duero": "Tempranillo",
    "chinon": "Cabernet Franc",
    "crozes-hermitage": "Syrah",
    "saint joseph": "Syrah",
    "gigondas": "Grenache / Syrah / Mourvedre",
    "chateauneuf-du-pape": "Grenache-based blend",
    "tokaji": "Furmint / Harslevelu",
    "sauternes": "Semillon / Sauvignon Blanc",
    "jerez": "Palomino",
    "sherry": "Palomino",
    "madeira": "Traditional Madeira varieties",
    "port": "Traditional Port varieties",
    "banyuls": "Grenache",
}

STYLE_KEYWORDS = {
    "sparkling": ["champagne", "cava", "sekt", "brut", "cremant", "lambrusco", "prosecco", "franciacorta", "mousseux"],
    "fortified": ["sherry", "madeira", "port", "marsala", "banyuls", "rutherglen", "moscatel", "malmsey", "tawny"],
    "still_sweet": ["vendanges tardives", "beerenauslese", "trockenbeerenauslese", "tokaji", "sauternes", "vin santo", "icewine", "late harvest"],
    "rose": ["rose", "rosé", "rosato"],
    "orange": ["rkatsiteli", "pheasant's tears", "qvevri", "amber"],
}


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def normalize(text: str) -> str:
    text = text.lower()
    replacements = {
        "Ã©": "e",
        "Ã¨": "e",
        "Ã¢â‚¬â€œ": "-",
        "â€“": "-",
        "â€”": "-",
        "Ã¼": "u",
        "Ã¶": "o",
        "Ã¤": "a",
        "Ã³": "o",
        "Ã¡": "a",
        "Ã±": "n",
        "Ã§": "c",
        "Ã´": "o",
        "Ã»": "u",
    }
    for src, dst in replacements.items():
        text = text.replace(src, dst)
    return text


def infer_style(text: str, paper: int) -> str:
    t = normalize(text)
    for style, keywords in STYLE_KEYWORDS.items():
        if any(keyword in t for keyword in keywords):
            return style
    if paper == 3:
        return "still_dry"
    return "still_dry"


def infer_rs_level(style: str) -> str:
    if style == "sparkling":
        return "dry"
    if style == "fortified":
        return "sweet"
    if style == "still_sweet":
        return "very_sweet"
    if style == "rose":
        return "dry"
    if style == "orange":
        return "dry"
    return "dry"


def infer_structural_profile(style: str, paper: int) -> str:
    if style in {"still_sweet", "fortified"}:
        return "dessert"
    if style == "sparkling":
        return "light_crisp"
    if paper == 2:
        return "tannic_structured"
    if style == "orange":
        return "medium_balanced"
    return "medium_balanced"


def infer_oak_signature(text: str, paper: int, style: str) -> str:
    t = normalize(text)
    if style in {"sparkling", "rose", "orange"}:
        return "none"
    if any(keyword in t for keyword in ["reserva", "gran reserva", "barolo", "brunello", "condrieu", "chardonnay"]):
        return "unclear"
    if paper == 2:
        return "unclear"
    return "none"


def parse_wine_row(full_text: str) -> dict[str, str]:
    abv_match = re.search(r"\(([\d.]+)%\)\s*$", full_text)
    abv = abv_match.group(1) if abv_match else "Source needed"
    no_abv = re.sub(r"\s*\([\d.]+%\)\s*$", "", full_text).strip()
    vintage_match = re.search(r"\b(NV|19\d{2}|20\d{2})\b", no_abv)
    if not vintage_match:
        return {
            "head": no_abv,
            "vintage": "Source needed",
            "place": "Source needed",
            "abv": abv,
        }
    head = no_abv[: vintage_match.start()].rstrip(" .,")
    vintage = vintage_match.group(1)
    place = no_abv[vintage_match.end() :].lstrip(" .,")
    return {
        "head": head,
        "vintage": vintage,
        "place": place,
        "abv": abv,
    }


def split_head(head: str) -> tuple[str, str]:
    parts = [part.strip() for part in head.split(",") if part.strip()]
    if len(parts) >= 2:
        producer = parts[-1]
        wine_name = ", ".join(parts[:-1])
    else:
        producer = parts[0] if parts else "Source needed"
        wine_name = parts[0] if parts else "Source needed"
    return producer, wine_name


def split_place(place: str) -> tuple[str, str, str]:
    parts = [part.strip() for part in place.split(",") if part.strip()]
    country = parts[-1] if parts else "Source needed"
    region = parts[-2] if len(parts) >= 2 else country
    sub_region = ", ".join(parts[:-1]) if len(parts) >= 2 else region
    return country, region, sub_region


def infer_grape(wine_name: str, full_text: str) -> str:
    combined = normalize(f"{wine_name} {full_text}")
    explicit = [
        "chardonnay",
        "riesling",
        "sauvignon blanc",
        "semillon",
        "viognier",
        "pinot gris",
        "pinot grigio",
        "muscat",
        "torrontes",
        "assyrtiko",
        "gruner veltliner",
        "gewurztraminer",
        "chenin blanc",
        "cabernet franc",
        "cabernet sauvignon",
        "merlot",
        "syrah",
        "shiraz",
        "pinot noir",
        "sangiovese",
        "nebbiolo",
        "tempranillo",
        "grenache",
        "malbec",
        "carmenere",
        "agiorgitiko",
        "rkatsiteli",
        "palomino",
        "furmint",
        "harslevelu",
    ]
    for grape in explicit:
        if grape in combined:
            return grape.title()
    for appellation, grape in APPELLATION_VARIETY_MAP.items():
        if appellation in combined:
            return grape
    return "Source needed"


def infer_classification(wine_name: str, full_text: str, style: str) -> str:
    text = normalize(f"{wine_name} {full_text}")
    if "grand cru" in text:
        return "Grand Cru"
    if "1er cru" in text or "premier cru" in text:
        return "Premier Cru"
    if "vendanges tardives" in text:
        return "Vendanges Tardives"
    if "smaragd" in text:
        return "Smaragd"
    if "gran reserva" in text:
        return "Gran Reserva"
    if "reserva" in text:
        return "Reserva"
    if style == "sparkling":
        return "Quality sparkling wine"
    if style == "fortified":
        return "Fortified wine"
    return "Source needed"


def build_question_lookup() -> dict[str, tuple[int, str]]:
    exams = load_json(TMP_EXAMS_PATH)
    lookup: dict[str, tuple[int, str]] = {}
    for exam in exams:
        year = exam["year"]
        for paper in exam["papers"]:
            paper_n = paper["paper"]
            for q in paper["questions"]:
                for slot in q["wines"]:
                    lookup[f"{year}_p{paper_n}_w{slot}"] = (q["n"], q["text"])
    return lookup


def render_brief(row: dict, question_lookup: dict[str, tuple[int, str]]) -> str:
    parsed = parse_wine_row(row["full_text"])
    producer, wine_name = split_head(parsed["head"])
    country, region, sub_region = split_place(parsed["place"])
    style = infer_style(row["full_text"], row["paper"])
    grape = infer_grape(wine_name, row["full_text"])
    classification = infer_classification(wine_name, row["full_text"], style)
    rs_level = infer_rs_level(style)
    structural_profile = infer_structural_profile(style, row["paper"])
    oak_signature = infer_oak_signature(row["full_text"], row["paper"], style)
    qn, qtext = question_lookup.get(row["id"], (None, "Source needed"))

    search_query = quote_plus(f"{producer} {wine_name} {parsed['vintage']} {parsed['place']}")
    ws_url = f"https://www.wine-searcher.com/find/{search_query}"
    ddg_url = f"https://duckduckgo.com/?q={search_query}"
    heading = f"{wine_name}, {producer}, {parsed['vintage']}" if producer not in wine_name else f"{wine_name}, {parsed['vintage']}"
    qs = qtext.splitlines()[0].strip() if qtext else "Source needed"

    quick = {
        "sparkling": "Expect an exam-relevant sparkling profile built around mousse, acidity and autolytic or fruit-driven cues depending on method and age. The palate should read dry to off-dry unless the category itself suggests otherwise, with quality judged by persistence, precision and balance.",
        "fortified": "Expect an amplified profile shaped by fortification and/or oxidative or biological ageing, with alcohol, texture and maturity cues doing much of the identification work. Quality should be judged by integration of spirit, concentration, freshness and length.",
        "still_sweet": "Expect clear sweetness supported by acidity, flavor concentration and persistence rather than simple sugar weight. The wine should show a dessert-wine profile driven by late harvest, botrytis or concentrated fruit, depending on category.",
        "rose": "Expect a dry rosé profile where color, aromatic register and texture are central to identification. Quality should be judged by precision, balance, flavor persistence and whether the wine feels intentional rather than merely by-product pink.",
        "orange": "Expect a structured, savory white with skin-contact texture, phenolic grip and an amber/orange hue rather than a simple fruit-led profile. The wine should be judged on balance between grip, freshness and aromatic complexity.",
        "still_dry": "Expect a dry still-wine profile where varietal and regional clues matter more than sweetness or mousse. Quality should be judged by concentration, balance, precision and how convincingly the wine expresses its likely origin and style family.",
    }[style]

    method_line = {
        "sparkling": "Traditional or tank sparkling production is likely depending on category; Source needed for the exact method of this bottling.",
        "fortified": "Fortification and subsequent maturation are central to style; Source needed for the exact production details of this bottling.",
        "still_sweet": "Late harvest, botrytis and/or concentration are likely style drivers; Source needed for the exact mechanism on this bottling.",
        "rose": "Direct pressing and/or short skin contact are likely; Source needed for the exact regime.",
        "orange": "Extended skin contact is likely central to style; Source needed for the exact vessel and élevage.",
        "still_dry": "Still-wine vinification appropriate to the category; Source needed for the exact fermentation and élevage details.",
    }[style]

    if qn is None:
        why = (
            f"Used in {row['year']} Paper {row['paper']}. The exact question mapping was not recovered from the temporary parse, "
            f"so this brief should be treated as a sourcing and identification aid first. The wine still belongs to the historical exam corpus and remains useful for variety, origin, style and quality calibration."
        )
    else:
        why = (
            f"Used in {row['year']} Paper {row['paper']} Question {qn}. The stem begins: \"{qs}\" "
            f"This wine's exam role is to test whether the candidate can place the wine within that set through variety, origin, style and quality logic."
        )

    return f"""---
wine_id: {row['id']}
producer: {producer}
wine_name: {wine_name}
vintage: {parsed['vintage']}
country: {country}
region: {region}
sub_region: {sub_region}
appellation: {region if region != country else parsed['place']}
abv: {parsed['abv']}
classification: {classification}
related_wines: []
sources:
  - {ws_url}
  - {ddg_url}
last_updated: 2026-05-26
style_category: {style}
oak_signature: {oak_signature}
rs_level: {rs_level}
structural_profile: {structural_profile}
---

# {heading}

## Quick tasting profile
{quick}

## Technical specs
- Grape variety: {grape}
- Vineyard: Source needed
- Soils: Source needed
- Vinification: {method_line}
- Élevage: Source needed
- ABV / RS / TA: {parsed['abv']}% / Source needed / Source needed

## Vintage character ({parsed['vintage']} {region})
Source needed. Use the wine's likely balance of fruit ripeness, acidity, structure and development to calibrate how the vintage is showing in-glass rather than over-claiming specifics.

## Producer style
Source needed for a producer-specific summary. At minimum, treat this as a commercially real bottling from a recognisable exam-worthy source rather than an invented placeholder.

## Why it's in this exam
{why}

## Sources
- [Wine-Searcher query]({ws_url}) - search entry point for the exact wine or bottling line
- [DuckDuckGo query]({ddg_url}) - search entry point for producer, cuvée and vintage lookups
- Source needed for bottling-specific technical detail beyond what is safely inferable from the exam text
"""


def main() -> None:
    wines = load_json(TMP_WINES_PATH)
    question_lookup = build_question_lookup()
    generated = 0
    skipped = 0
    for row in wines:
        out_path = RESEARCH_DIR / f"{row['id']}.md"
        if out_path.exists():
            skipped += 1
            continue
        out_path.write_text(render_brief(row, question_lookup), encoding="utf-8")
        generated += 1
    print(f"OK: generated {generated} draft research files")
    print(f"OK: skipped {skipped} existing files")


if __name__ == "__main__":
    main()
