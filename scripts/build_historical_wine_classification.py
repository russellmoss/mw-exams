from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
EXAMS_PATH = ROOT / "data" / "exams.json"
WINES_PATH = ROOT / "data" / "wines.json"
RESEARCH_DIR = ROOT / "data" / "wine_research"
OUT_JSON_PATH = ROOT / "data" / "historical_wine_classification.json"
OUT_MD_PATH = ROOT / "outputs" / "heuristics" / "historical_wine_classification.md"


def normalize_text(text: str) -> str:
    text = (text or "").lower()
    replacements = {
        "Ã¢â‚¬â€œ": "-",
        "â€“": "-",
        "â€”": "-",
        "Ã©": "e",
        "Ã¨": "e",
        "Ãª": "e",
        "Ã«": "e",
        "Ã¡": "a",
        "Ã ": "a",
        "Ã¤": "a",
        "Ã¶": "o",
        "Ã³": "o",
        "Ã²": "o",
        "Ã¼": "u",
        "Ãº": "u",
        "Ã¹": "u",
        "Ã­": "i",
        "Ã¬": "i",
        "Ã§": "c",
        "Ã±": "n",
    }
    for src, dst in replacements.items():
        text = text.replace(src, dst)
    return text


def parse_frontmatter(path: Path) -> tuple[dict[str, str], str]:
    text = path.read_text(encoding="utf-8", errors="replace")
    if not text.startswith("---"):
        return {}, text
    parts = text.split("---", 2)
    if len(parts) < 3:
        return {}, text
    data: dict[str, str] = {}
    for line in parts[1].splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        data[key.strip()] = value.strip()
    return data, parts[2]


def parse_vintage_year(vintage: str) -> int | None:
    match = re.search(r"\b(19|20)\d{2}\b", vintage or "")
    return int(match.group(0)) if match else None


def load_research() -> dict[str, dict]:
    research: dict[str, dict] = {}
    for path in sorted(RESEARCH_DIR.glob("*.md")):
        fm, body = parse_frontmatter(path)
        research[path.stem] = {"frontmatter": fm, "body": body}
    return research


def build_question_index() -> dict[str, dict]:
    exams = json.loads(EXAMS_PATH.read_text(encoding="utf-8"))
    out: dict[str, dict] = {}
    for exam in exams:
        year = exam["year"]
        for paper in exam["papers"]:
            paper_n = paper["paper"]
            question_lookup = {q["n"]: q for q in paper["questions"]}
            wine_to_question: dict[int, dict] = {}
            for q in paper["questions"]:
                for slot in q["wines"]:
                    wine_to_question[slot] = q
            for wine in paper["wines"]:
                slot = wine["slot"]
                wine_id = f"{year}_p{paper_n}_w{slot}"
                question = wine_to_question.get(slot)
                out[wine_id] = {
                    "year": year,
                    "paper": paper_n,
                    "slot": slot,
                    "question_n": question["n"] if question else None,
                    "question_text": question["text"] if question else "",
                    "wine_text": wine["full_text"],
                }
    return out


def benchmark_status(fm: dict[str, str], body: str, wine_text: str) -> str:
    text = normalize_text(" ".join([body, wine_text, fm.get("classification", ""), fm.get("appellation", ""), fm.get("sub_region", "")]))
    if any(
        token in text
        for token in [
            "grand cru",
            "first growth",
            "premier cru classe",
            "cru classe",
            "clos de vougeot",
            "montrachet",
            "le musigny",
            "barolo",
            "brunello di montalcino",
            "champagne",
            "vdp",
            "beerenauslese",
            "trockenbeerenauslese",
            "gran reserva",
            "vintage port",
        ]
    ):
        return "iconic_benchmark"
    if "benchmark" in text or any(
        token in text
        for token in [
            "classic old world",
            "classic new world",
            "benchmark regional",
            "regional classic",
            "vouvray",
            "chablis",
            "pessac-leognan",
            "margaret river",
            "mosel",
            "sancerre",
            "chianti classico",
            "rioja",
            "tokaji",
            "jerez",
        ]
    ):
        return "benchmark_classic"
    if any(
        token in text
        for token in [
            "typical",
            "representative",
            "regional reference",
            "punching above its weight class",
            "serious-but-accessible",
        ]
    ):
        return "benchmark_regional"
    return "nonbenchmark"


def commercial_tier(fm: dict[str, str], body: str, wine_text: str) -> str:
    text = normalize_text(" ".join([body, wine_text]))
    if any(token in text for token in ["average retail price ~$", "average retail price ~$", "$100", "$150", "$200", "icon wine", "blue-chip", "grand cru", "first growth"]):
        return "fine_wine"
    if any(token in text for token in ["$50", "$60", "$70", "$80", "$90", "premium", "classified bordeaux", "single vineyard", "reserva", "riserva"]):
        return "specialist_premium"
    if any(token in text for token in ["entry-level", "well-priced", "value", "commercial", "widely available"]):
        return "commercial"
    return "specialist_premium" if fm.get("classification") else "commercial"


def maturity_role(fm: dict[str, str], body: str, wine_year: int, exam_year: int) -> str:
    style = normalize_text(fm.get("style_category", ""))
    vintage = normalize_text(fm.get("vintage", ""))
    if vintage == "nv" or "non-vintage" in body.lower():
        return "non_vintage_category"
    if style in {"sweet", "fortified", "oxidative", "sparkling"} and any(
        token in normalize_text(body) for token in ["oxidative", "solera", "rancio", "natively aged", "botrytis", "aged tawny"]
    ):
        return "oxidative_or_natively_aged"
    if wine_year is None:
        return "unknown"
    age = exam_year - wine_year
    if age <= 2:
        return "young_primary"
    if age <= 5:
        return "developing"
    if age >= 6:
        return "mature_tertiary"
    return "developing"


def curveball_level(
    fm: dict[str, str],
    body: str,
    question_text: str,
    benchmark: str,
    maturity: str,
    style: str,
) -> str:
    text = normalize_text(" ".join([body, question_text, fm.get("grape_variety", ""), fm.get("sub_region", ""), fm.get("appellation", "")]))
    score = 0
    if any(token in text for token in ["curveball", "lesser-known", "unexpected", "hidden organizing theme", "wild card"]):
        score += 2
    if benchmark == "nonbenchmark":
        score += 1
    if maturity in {"oxidative_or_natively_aged", "mature_tertiary"}:
        score += 1
    if style in {"fortified", "sweet", "sparkling", "rose"}:
        score += 1
    if any(token in text for token in ["muscat", "malvasia", "trebbiano", "furmint", "harslevelu", "savagnin", "palomino", "moschofilero", "xinomavro", "lagrein"]):
        score += 1
    if score >= 3:
        return "high"
    if score == 2:
        return "medium"
    return "low"


def question_role(
    fm: dict[str, str],
    body: str,
    question_text: str,
    benchmark: str,
    commercial: str,
    maturity: str,
    curveball: str,
) -> str:
    q = normalize_text(question_text)
    style = normalize_text(fm.get("style_category", ""))
    if any(token in q for token in ["method of production", "human inputs versus natural factors", "winemaking", "fortified", "sparkling"]):
        return "method_reference"
    if maturity in {"mature_tertiary", "oxidative_or_natively_aged"} or "maturity" in q:
        return "maturity_reference"
    if style in {"sweet", "fortified"} or "residual sugar" in q:
        return "sweetness_reference"
    if curveball == "high":
        return "curveball_probe"
    if commercial == "commercial" and any(token in q for token in ["quality", "commercial position", "style-commercial"]):
        return "commercial_foil"
    if benchmark in {"iconic_benchmark", "benchmark_classic"}:
        return "benchmark_anchor"
    if "same producer" in q or "same region" in q or "same country" in q:
        return "comparative_peer"
    return "supporting_reference"


def build_records() -> list[dict]:
    wines = {row["id"]: row for row in json.loads(WINES_PATH.read_text(encoding="utf-8"))}
    research = load_research()
    q_index = build_question_index()
    records: list[dict] = []
    for wine_id, wine in sorted(wines.items()):
        meta = research.get(wine_id, {"frontmatter": {}, "body": ""})
        fm = meta["frontmatter"]
        body = meta["body"]
        qctx = q_index.get(wine_id, {})
        wine_text = qctx.get("wine_text", wine.get("full_text", ""))
        exam_year = qctx.get("year", wine.get("year"))
        wine_year = parse_vintage_year(fm.get("vintage", "")) or parse_vintage_year(wine_text)
        style = fm.get("style_category", "unknown")

        benchmark = benchmark_status(fm, body, wine_text)
        commercial = commercial_tier(fm, body, wine_text)
        maturity = maturity_role(fm, body, wine_year, exam_year)
        curveball = curveball_level(fm, body, qctx.get("question_text", ""), benchmark, maturity, style)
        role = question_role(fm, body, qctx.get("question_text", ""), benchmark, commercial, maturity, curveball)

        records.append(
            {
                "wine_id": wine_id,
                "year": qctx.get("year", wine.get("year")),
                "paper": qctx.get("paper", wine.get("paper")),
                "question": qctx.get("question_n"),
                "slot": qctx.get("slot", wine.get("slot")),
                "producer": fm.get("producer", ""),
                "wine_name": fm.get("wine_name", ""),
                "country": fm.get("country", ""),
                "region": fm.get("region", ""),
                "style_category": style,
                "benchmark_status": benchmark,
                "question_role": role,
                "curveball_level": curveball,
                "commercial_tier": commercial,
                "maturity_role": maturity,
            }
        )
    return records


def render_md(records: list[dict]) -> str:
    by_field = {
        "benchmark_status": Counter(r["benchmark_status"] for r in records),
        "question_role": Counter(r["question_role"] for r in records),
        "curveball_level": Counter(r["curveball_level"] for r in records),
        "commercial_tier": Counter(r["commercial_tier"] for r in records),
        "maturity_role": Counter(r["maturity_role"] for r in records),
    }
    lines = [
        "# Historical Wine Classification",
        "",
        "This file classifies the historical exam wine corpus into reusable sourcing roles for mock generation and predictive modeling.",
        "",
        f"- Wines classified: `{len(records)}`",
        "",
        "## Distribution",
        "",
    ]
    for field, counts in by_field.items():
        lines.append(f"### {field}")
        lines.append("")
        for key, count in counts.most_common():
            lines.append(f"- `{key}`: `{count}`")
        lines.append("")
    lines.extend(
        [
            "## Label meanings",
            "",
            "- `benchmark_status`: whether the wine acts as an iconic benchmark, a classic benchmark, a regional benchmark, or a non-benchmark foil.",
            "- `question_role`: the main job the wine appears to do inside the question.",
            "- `curveball_level`: how likely the wine is to disrupt a straightforward exam-reading path.",
            "- `commercial_tier`: rough commercial positioning, used for quality-tier balancing.",
            "- `maturity_role`: how the wine is likely functioning on the maturity axis.",
            "",
        ]
    )
    return "\n".join(lines) + "\n"


def main() -> None:
    records = build_records()
    OUT_JSON_PATH.write_text(json.dumps(records, indent=2, ensure_ascii=False), encoding="utf-8")
    OUT_MD_PATH.write_text(render_md(records), encoding="utf-8")
    print(f"OK: wrote {OUT_JSON_PATH}")
    print(f"OK: wrote {OUT_MD_PATH}")


if __name__ == "__main__":
    main()
