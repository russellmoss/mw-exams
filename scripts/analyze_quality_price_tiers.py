from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
EXAMS_PATH = ROOT / "data" / "exams.json"
WINES_PATH = ROOT / "data" / "wines.json"
RESEARCH_DIR = ROOT / "data" / "wine_research"
CLASSIFICATION_PATH = ROOT / "data" / "historical_wine_classification.json"
MOCK_EXAM_PATH = ROOT / "outputs" / "mock_exams" / "mock_full_2026_05_26_v6.md"
MOCK_ANSWERS_PATH = ROOT / "outputs" / "mock_exams" / "mock_full_2026_05_26_v6_answers.md"
OUT_JSON_PATH = ROOT / "data" / "quality_price_tier_analysis.json"
OUT_MD_PATH = ROOT / "outputs" / "heuristics" / "quality_price_tier_analysis.md"


BAND_ORDER = ["value", "mainstream", "premium", "super_premium", "luxury"]
BAND_LABELS = {
    "value": "<=15",
    "mainstream": "16-30",
    "premium": "31-60",
    "super_premium": "61-120",
    "luxury": "120+",
}
HIGH_BANDS = {"premium", "super_premium", "luxury"}
TOP_BANDS = {"super_premium", "luxury"}


def normalize_text(text: str) -> str:
    return (text or "").lower().replace("ã©", "e").replace("ã¨", "e").replace("ã´", "o")


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


def load_research() -> dict[str, dict[str, str | dict[str, str]]]:
    out = {}
    for path in sorted(RESEARCH_DIR.glob("*.md")):
        fm, body = parse_frontmatter(path)
        out[path.stem] = {"frontmatter": fm, "body": body}
    return out


def load_question_rows() -> list[dict]:
    exams = json.loads(EXAMS_PATH.read_text(encoding="utf-8"))
    rows = []
    for exam in exams:
        year = exam["year"]
        for paper in exam["papers"]:
            paper_n = paper["paper"]
            used_slots = set()
            for question in paper["questions"]:
                qid = f"{year}_p{paper_n}_q{question['n']}"
                for slot in question["wines"]:
                    used_slots.add(slot)
                    wine = next(w for w in paper["wines"] if w["slot"] == slot)
                    rows.append(
                        {
                            "qid": qid,
                            "year": year,
                            "paper": paper_n,
                            "question": question["n"],
                            "slot": slot,
                            "wine_id": f"{year}_p{paper_n}_w{slot}",
                            "question_text": question["text"],
                            "wine_text": wine["full_text"],
                        }
                    )
            for wine in paper["wines"]:
                if wine["slot"] in used_slots:
                    continue
                slot = wine["slot"]
                rows.append(
                    {
                        "qid": f"{year}_p{paper_n}_unmapped",
                        "year": year,
                        "paper": paper_n,
                        "question": None,
                        "slot": slot,
                        "wine_id": f"{year}_p{paper_n}_w{slot}",
                        "question_text": "",
                        "wine_text": wine["full_text"],
                    }
                )
    return rows


def extract_price_numbers(text: str) -> list[float]:
    prices: list[float] = []
    # Capture currency-marked ranges and single values, including "£80-150+".
    pattern = re.compile(r"[$£€]\s*(\d+(?:\.\d+)?)(?:\s*[-–]\s*(\d+(?:\.\d+)?))?\+?")
    for match in pattern.finditer(text):
        first = float(match.group(1))
        second = float(match.group(2)) if match.group(2) else first
        prices.append((first + second) / 2)
    # Capture prose ranges where the currency appears after the range.
    pattern_suffix = re.compile(r"\b(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*(?:usd|gbp|eur|dollars|pounds|euros)\b", re.I)
    for match in pattern_suffix.finditer(text):
        prices.append((float(match.group(1)) + float(match.group(2))) / 2)
    return prices


def band_from_price(price: float | None) -> str | None:
    if price is None:
        return None
    if price <= 15:
        return "value"
    if price <= 30:
        return "mainstream"
    if price <= 60:
        return "premium"
    if price <= 120:
        return "super_premium"
    return "luxury"


def inferred_band(row: dict, fm: dict[str, str], body: str, commercial_tier: str) -> tuple[str, str]:
    text = normalize_text(" ".join([row["wine_text"], body, fm.get("classification", ""), fm.get("appellation", "")]))
    prices = extract_price_numbers(body)
    if prices:
        return band_from_price(max(prices)) or "mainstream", "explicit_price"

    luxury_tokens = [
        "first growth",
        "premier grand cru classe",
        "mouton rothschild",
        "lafite",
        "latour",
        "margaux",
        "haut-brion",
        "drc",
        "montrachet",
        "grand cru classe a",
        "vintage port",
        "trockenbeerenauslese",
    ]
    super_tokens = [
        "second growth",
        "deuxieme",
        "2eme",
        "grand cru",
        "barolo",
        "brunello",
        "corton-charlemagne",
        "clos de vougeot",
        "hermitage",
        "cote-rotie",
        "single vineyard",
        "gran reserva",
        "grand cru classe",
        "iconic",
        "blue-chip",
    ]
    premium_tokens = [
        "premier cru",
        "cru bourgeois",
        "reserva",
        "riserva",
        "sancerre",
        "pouilly-fume",
        "chianti classico",
        "priorat",
        "vouvray",
        "sauternes",
        "champagne",
        "benchmark",
    ]
    value_tokens = ["yellow tail", "barefoot", "entry-level", "supermarket", "commercial", "value", "widely available"]

    if any(token in text for token in luxury_tokens):
        return "luxury", "classification_inferred"
    if any(token in text for token in super_tokens):
        return "super_premium", "classification_inferred"
    if any(token in text for token in premium_tokens):
        return "premium", "classification_inferred"
    if any(token in text for token in value_tokens):
        return "value", "commercial_cue"
    if commercial_tier == "fine_wine":
        return "super_premium", "commercial_tier_inferred"
    if commercial_tier == "specialist_premium":
        return "premium", "commercial_tier_inferred"
    return "mainstream", "fallback"


def question_flags(question_text: str) -> dict[str, bool]:
    q = normalize_text(question_text)
    return {
        "quality_led": "quality" in q,
        "ranking_led": "rank" in q or "quality order" in q,
        "commercial_led": any(token in q for token in ["commercial", "market", "consumer appeal", "sell this wine"]),
        "context_quality": "context" in q and "quality" in q,
    }


def summarize_question(qid: str, rows: list[dict]) -> dict:
    counts = Counter(row["price_band"] for row in rows)
    total = len(rows)
    high = sum(counts[b] for b in HIGH_BANDS)
    top = sum(counts[b] for b in TOP_BANDS)
    spread = sum(1 for b in BAND_ORDER if counts[b])
    flags = question_flags(rows[0]["question_text"])
    return {
        "qid": qid,
        "year": rows[0]["year"],
        "paper": rows[0]["paper"],
        "question": rows[0]["question"],
        "mapped_question": rows[0]["question"] is not None,
        "n_wines": total,
        "price_bands": {band: counts[band] for band in BAND_ORDER if counts[band]},
        "high_price_share": round(high / total, 3),
        "top_price_share": round(top / total, 3),
        "band_spread": spread,
        "quality_led": flags["quality_led"],
        "ranking_led": flags["ranking_led"],
        "commercial_led": flags["commercial_led"],
        "context_quality": flags["context_quality"],
        "wine_ids": [row["wine_id"] for row in rows],
    }


def parse_mock_p2q2() -> dict:
    exam_text = MOCK_EXAM_PATH.read_text(encoding="utf-8", errors="replace")
    answer_text = MOCK_ANSWERS_PATH.read_text(encoding="utf-8", errors="replace")
    section_match = re.search(r"### Question 2\s+(.*?)\n---\n\n### Question 3", exam_text, re.S)
    wines_match = re.search(r"## Paper 2.*?### Wines\s+(.*?)\n---\n\n## Paper 3", exam_text, re.S)
    if not section_match or not wines_match:
        return {}
    question_text = section_match.group(1)
    wine_lines = [line.strip() for line in wines_match.group(1).splitlines() if re.match(r"[5-8]\.", line.strip())]
    rows = []
    classifications = {
        5: ("premium", "Cru Bourgeois Exceptionnel / high non-classified Bordeaux"),
        6: ("super_premium", "Second Growth Bordeaux"),
        7: ("luxury", "Second Growth Pauillac, prestige pricing"),
        8: ("luxury", "First Growth Bordeaux"),
    }
    for line in wine_lines:
        slot = int(line.split(".", 1)[0])
        band, reason = classifications[slot]
        rows.append({"slot": slot, "wine_text": line, "price_band": band, "reason": reason})
    counts = Counter(row["price_band"] for row in rows)
    total = len(rows)
    return {
        "qid": "mock_full_2026_05_26_v6_p2_q2",
        "question_text": question_text,
        "price_bands": {band: counts[band] for band in BAND_ORDER if counts[band]},
        "high_price_share": round(sum(counts[b] for b in HIGH_BANDS) / total, 3),
        "top_price_share": round(sum(counts[b] for b in TOP_BANDS) / total, 3),
        "band_spread": sum(1 for b in BAND_ORDER if counts[b]),
        "rows": rows,
        "answer_mentions_ranking": "Ranking: Wine 8" in answer_text,
    }


def render_counts(counter: Counter) -> list[str]:
    return [f"- `{key}`: `{value}`" for key, value in counter.most_common()]


def render_md(records: list[dict], questions: list[dict], mock: dict) -> str:
    all_bands = Counter(r["price_band"] for r in records)
    source_counts = Counter(r["price_band_source"] for r in records)
    by_paper = defaultdict(Counter)
    mapped_questions = [q for q in questions if q["mapped_question"]]
    quality_questions = [q for q in mapped_questions if q["quality_led"]]
    ranking_questions = [q for q in mapped_questions if q["ranking_led"]]
    for r in records:
        by_paper[r["paper"]][r["price_band"]] += 1

    quality_top_heavy = [q for q in quality_questions if q["top_price_share"] >= 0.5]
    quality_spread = [q for q in quality_questions if q["band_spread"] >= 3]
    quality_compressed = [q for q in quality_questions if q["band_spread"] <= 2 and q["high_price_share"] == 1.0]

    lines = [
        "# Quality Price Tier Analysis",
        "",
        "This report treats MSRP/retail price as a rough quality proxy for historical MW practical wines. It uses explicit price cues in research notes where available, then falls back to classification and commercial-tier cues.",
        "",
        "Price bands are intentionally coarse because historical retail prices vary by market and vintage:",
        "",
        "- `value`: <=15",
        "- `mainstream`: 16-30",
        "- `premium`: 31-60",
        "- `super_premium`: 61-120",
        "- `luxury`: 120+",
        "",
        "## Corpus Distribution",
        "",
        f"- Wines analysed: `{len(records)}`",
        f"- Questions analysed: `{len(mapped_questions)}`",
        f"- Unmapped wine groups: `{len(questions) - len(mapped_questions)}`",
        f"- Quality-led questions: `{len(quality_questions)}`",
        f"- Ranking-led questions: `{len(ranking_questions)}`",
        "",
        "### All wines by price band",
        "",
        *render_counts(all_bands),
        "",
        "### Price-band source",
        "",
        *render_counts(source_counts),
        "",
        "### By paper",
        "",
    ]
    for paper in sorted(by_paper):
        parts = ", ".join(f"{band}={by_paper[paper][band]}" for band in BAND_ORDER if by_paper[paper][band])
        lines.append(f"- Paper {paper}: {parts}")

    lines.extend(
        [
            "",
            "## Quality Question Patterns",
            "",
            f"- Quality questions with three or more price bands: `{len(quality_spread)}` / `{len(quality_questions)}`",
            f"- Quality questions that are compressed but all high-priced: `{len(quality_compressed)}` / `{len(quality_questions)}`",
            f"- Quality questions where at least half the wines are super-premium/luxury: `{len(quality_top_heavy)}` / `{len(quality_questions)}`",
            "",
            "High-signal historical design usually does one of two things:",
            "",
            "- Builds a clear ladder from value/mainstream to premium/fine wine when the candidate must rank quality.",
            "- Keeps all wines high quality only when the question is about internal hierarchy/classification, and then gives a clear legal or producer ladder.",
            "",
            "## Mock v6 Paper 2 Question 2 Check",
            "",
        ]
    )
    if mock:
        parts = ", ".join(f"{band}={mock['price_bands'][band]}" for band in BAND_ORDER if band in mock["price_bands"])
        lines.extend(
            [
                f"- Price-band mix: {parts}",
                f"- High-price share: `{mock['high_price_share']:.0%}`",
                f"- Super-premium/luxury share: `{mock['top_price_share']:.0%}`",
                f"- Band spread: `{mock['band_spread']}`",
                "",
                "Interpretation: this is a valid F7/Bordeaux classification ladder, but it is top-heavy. It tests fine distinctions between high-status classified Bordeaux more than broad quality discrimination. That is historically defensible only if the stem foregrounds classification or internal hierarchy.",
                "",
                "Suggested refinement: either make the stem explicitly classification-led, or replace one of the two Second Growth / First Growth slots with a clearer lower rung such as generic Medoc/Haut-Medoc, second wine, or Cru Bourgeois. The cleaner ladder would be: value/mainstream Bordeaux -> Cru Bourgeois -> classed growth -> First Growth.",
                "",
            ]
        )

    lines.extend(
        [
            "## Most Comparable Historical Questions",
            "",
            "These are quality-led questions with broad price spread and clear exam-writer value for calibration:",
            "",
        ]
    )
    comparable = sorted(
        quality_spread,
        key=lambda q: (q["ranking_led"], q["band_spread"], q["top_price_share"]),
        reverse=True,
    )[:20]
    for q in comparable:
        parts = ", ".join(f"{band}={q['price_bands'][band]}" for band in BAND_ORDER if band in q["price_bands"])
        flags = []
        if q["ranking_led"]:
            flags.append("ranking")
        if q["commercial_led"]:
            flags.append("commercial")
        flag_text = f" ({', '.join(flags)})" if flags else ""
        lines.append(f"- `{q['qid']}`{flag_text}: {parts}; high={q['high_price_share']:.0%}; top={q['top_price_share']:.0%}")

    lines.extend(
        [
            "",
            "## Exam Writer Rule",
            "",
            "For future quality-type questions, target one of these structures:",
            "",
            "- Broad discrimination: at least three price bands, ideally one value/mainstream, one premium, and one super-premium/luxury.",
            "- Internal hierarchy: all premium-plus is acceptable, but the stem should name or imply classification, same producer, same appellation, or a legally meaningful quality ladder.",
            "- Avoid four wines that are all high-priced but not clearly tiered; that creates a ranking question where the answer turns on reputation rather than observable quality evidence.",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    question_rows = load_question_rows()
    research = load_research()
    classifications = {
        row["wine_id"]: row for row in json.loads(CLASSIFICATION_PATH.read_text(encoding="utf-8"))
    }
    records = []
    for row in question_rows:
        meta = research.get(row["wine_id"], {"frontmatter": {}, "body": ""})
        fm = meta["frontmatter"]  # type: ignore[assignment]
        body = meta["body"]  # type: ignore[assignment]
        class_row = classifications.get(row["wine_id"], {})
        band, source = inferred_band(row, fm, body, class_row.get("commercial_tier", ""))
        records.append({**row, "price_band": band, "price_band_source": source})

    grouped = defaultdict(list)
    for record in records:
        grouped[record["qid"]].append(record)
    questions = [summarize_question(qid, rows) for qid, rows in sorted(grouped.items())]
    mock = parse_mock_p2q2()

    OUT_JSON_PATH.write_text(
        json.dumps({"records": records, "questions": questions, "mock_v6_p2_q2": mock}, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    OUT_MD_PATH.write_text(render_md(records, questions, mock), encoding="utf-8")
    print(f"OK: wrote {OUT_JSON_PATH}")
    print(f"OK: wrote {OUT_MD_PATH}")


if __name__ == "__main__":
    main()
