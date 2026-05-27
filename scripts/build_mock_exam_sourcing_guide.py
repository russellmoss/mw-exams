from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
WINES_PATH = ROOT / "data" / "wines.json"
RESEARCH_DIR = ROOT / "data" / "wine_research"
OUTPUT_PATH = ROOT / "outputs" / "mock_exams" / "mock_exam_sourcing_guide.md"
QUALITY_PRICE_PATH = ROOT / "data" / "quality_price_tier_analysis.json"
WINEMAKING_DIVERSITY_PATH = ROOT / "data" / "winemaking_diversity_quality_questions.json"
WINE_SELECTION_LOGIC_PATH = ROOT / "data" / "wine_selection_logic_analysis.json"
MOCK_ROTATION_PATH = ROOT / "data" / "mock_rotation_analysis.json"
MOCK_WINE_BANK_PATH = ROOT / "data" / "mock_wine_bank.json"
CURRENT_YEAR = 2026


def parse_frontmatter(path: Path) -> dict[str, str]:
    text = path.read_text(encoding="utf-8", errors="replace")
    if not text.startswith("---\n"):
        return {}
    parts = text.split("---", 2)
    if len(parts) < 3:
        return {}
    frontmatter = parts[1].splitlines()
    data: dict[str, str] = {}
    for line in frontmatter:
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        data[key.strip()] = value.strip()
    return data


def classification_bucket(classification: str) -> str:
    c = classification.lower()
    if any(token in c for token in ["grand cru", "1er cru", "premier cru", "gg", "grosses gewachs"]):
        return "upper_tier"
    if any(token in c for token in ["barolo", "brunello", "riserva", "classé", "grand cru classe", "champagne", "vouvray", "condrieu", "châteauneuf", "cru communal"]):
        return "benchmark_premium"
    if any(token in c for token in ["village", "aoc", "doc", "docg", "gi", "regional", "aop", "quality sparkling wine"]):
        return "mid_tier"
    if any(token in c for token in ["commodity", "none"]):
        return "commercial"
    return "unspecified"


def vintage_bucket(vintage: str, paper: int) -> str:
    if not vintage or vintage == "NV":
        return "nv"
    match = re.search(r"\d{4}", vintage)
    if not match:
        return "unknown"
    year = int(match.group(0))
    age = CURRENT_YEAR - year
    if paper == 1:
        if age <= 2:
            return "young_0_2y"
        if age <= 6:
            return "developing_3_6y"
        return "mature_7y_plus"
    if paper == 2:
        if age <= 3:
            return "young_0_3y"
        if age <= 8:
            return "developing_4_8y"
        return "mature_9y_plus"
    if age <= 3:
        return "young_0_3y"
    if age <= 8:
        return "developing_4_8y"
    return "mature_9y_plus"


def load_quality_price_summary() -> dict:
    if not QUALITY_PRICE_PATH.exists():
        return {}
    data = json.loads(QUALITY_PRICE_PATH.read_text(encoding="utf-8"))
    records = data.get("records", [])
    questions = [q for q in data.get("questions", []) if q.get("mapped_question")]
    quality_questions = [q for q in questions if q.get("quality_led")]
    return {
        "bands": Counter(r["price_band"] for r in records),
        "quality_questions": len(quality_questions),
        "wide_quality_questions": sum(1 for q in quality_questions if q.get("band_spread", 0) >= 3),
        "compressed_high_quality_questions": sum(
            1 for q in quality_questions if q.get("band_spread", 0) <= 2 and q.get("high_price_share") == 1.0
        ),
        "top_heavy_quality_questions": sum(1 for q in quality_questions if q.get("top_price_share", 0) >= 0.5),
    }


def load_winemaking_diversity_summary() -> dict:
    if not WINEMAKING_DIVERSITY_PATH.exists():
        return {}
    data = json.loads(WINEMAKING_DIVERSITY_PATH.read_text(encoding="utf-8"))
    records = data.get("records", [])
    counts = Counter(r["category"] for r in records)
    same_variety = [r for r in records if "same_variety" in r.get("stem_tags", [])]
    rank_compare = [
        r
        for r in records
        if "ranking" in r.get("stem_tags", []) or "compare_contrast" in r.get("stem_tags", [])
    ]
    return {
        "total": len(records),
        "counts": counts,
        "same_variety_total": len(same_variety),
        "same_variety_homogeneous": sum(1 for r in same_variety if r["category"] == "homogeneous"),
        "rank_compare_total": len(rank_compare),
        "rank_compare_homogeneous": sum(1 for r in rank_compare if r["category"] == "homogeneous"),
    }


def load_wine_selection_logic_summary() -> dict:
    if not WINE_SELECTION_LOGIC_PATH.exists():
        return {}
    data = json.loads(WINE_SELECTION_LOGIC_PATH.read_text(encoding="utf-8"))
    rows = data.get("historical_questions", [])
    diagnostics = data.get("mock_v6_diagnostics", [])
    return {
        "historical_total": len(rows),
        "fit_counts": Counter(r["fit_status"] for r in rows),
        "family_counts": Counter(r["family"] for r in rows),
        "mock_fit_counts": Counter(d["fit_status"] for d in diagnostics),
    }


def load_mock_rotation_summary() -> dict:
    if not MOCK_ROTATION_PATH.exists():
        return {}
    data = json.loads(MOCK_ROTATION_PATH.read_text(encoding="utf-8"))
    hist = data.get("historical_motifs", {})
    p3_rows = data.get("historical_positions", {}).get("p3_q1_stems", [])
    sparkling = [row for row in p3_rows if "sparkling" in row.get("text", "").lower()]
    return {
        "mock_count": len(data.get("mocks", [])),
        "question_count": data.get("question_count", 0),
        "wine_count": data.get("wine_count", 0),
        "vouvray_count": hist.get("vouvray", 0),
        "historical_wine_total": hist.get("__total_wines__", 0),
        "p3_q1_sparkling": len(sparkling),
        "p3_q1_total": len(p3_rows),
        "top_repeated_motifs": data.get("repeated_motifs", [])[:8],
    }


def load_mock_wine_bank_summary() -> dict:
    if not MOCK_WINE_BANK_PATH.exists():
        return {}
    data = json.loads(MOCK_WINE_BANK_PATH.read_text(encoding="utf-8"))
    entries = data.get("entries", [])
    return {
        "entries": len(entries),
        "styles": Counter(entry.get("style_category", "unknown") for entry in entries),
        "families": Counter(family for entry in entries for family in entry.get("useful_families", [])),
        "prices": Counter(entry.get("price_band", "unknown") for entry in entries),
        "qualities": Counter(entry.get("quality_tier", "unknown") for entry in entries),
        "countries": Counter(entry.get("country", "unknown") for entry in entries),
    }


def main() -> None:
    wines = json.loads(WINES_PATH.read_text(encoding="utf-8"))
    by_paper: dict[int, list[dict[str, str]]] = defaultdict(list)
    quality_price = load_quality_price_summary()
    winemaking_diversity = load_winemaking_diversity_summary()
    wine_selection_logic = load_wine_selection_logic_summary()
    mock_rotation = load_mock_rotation_summary()
    mock_wine_bank = load_mock_wine_bank_summary()

    for wine in wines:
        fm = parse_frontmatter(RESEARCH_DIR / f"{wine['id']}.md")
        row = {
            "id": wine["id"],
            "paper": wine["paper"],
            "country": fm.get("country", "Unknown"),
            "region": fm.get("region", "Unknown"),
            "producer": fm.get("producer", "Unknown"),
            "classification": fm.get("classification", "Unknown"),
            "style_category": fm.get("style_category", "unknown"),
            "oak_signature": fm.get("oak_signature", "unknown"),
            "rs_level": fm.get("rs_level", "unknown"),
            "structural_profile": fm.get("structural_profile", "unknown"),
            "vintage": fm.get("vintage", "unknown"),
        }
        row["class_bucket"] = classification_bucket(row["classification"])
        row["vintage_bucket"] = vintage_bucket(row["vintage"], wine["paper"])
        by_paper[wine["paper"]].append(row)

    lines: list[str] = []
    lines.append("# Mock Exam Sourcing Guide")
    lines.append("")
    lines.append(f"*Generated from the historical corpus on {CURRENT_YEAR}-05-26.*")
    lines.append("")
    lines.append("## Why this exists")
    lines.append("")
    lines.append("This guide makes the mock-exam writer more human and more exam-realistic. It should not blindly reuse the same producers or exact sourcing patterns from the past papers, but it should stay inside the historical sourcing envelope: benchmark regions, representative producers, realistic quality ladders, and plausible vintage freshness for a 2026 exam.")
    lines.append("")
    lines.append("## Hard sourcing rules for 2026 mocks")
    lines.append("")
    lines.append("- Use the historical corpus as a sourcing envelope, not a cloning list.")
    lines.append("- Default to real, currently plausible market vintages for 2026.")
    lines.append("- For young whites on Paper 1, prefer 2024-2025 vintages unless the question needs bottle development.")
    lines.append("- For young reds on Paper 2, prefer 2023-2024 vintages unless the question needs development, oak integration, or mature tertiary structure.")
    lines.append("- For Paper 3, let category drive vintage: NV for many sparkling/fortified wines, recent vintages for fresh aromatic or demi-sec wines, older vintages where oxidative or mature sweet styles are intrinsic.")
    lines.append("- Within each question, deliberately vary quality tier, region, and commercial position when the marks ask for those distinctions.")
    lines.append("- For quality-ranking questions, use the price-tier analysis as a guardrail: broad discrimination needs at least three price bands; all-premium flights need an explicit hierarchy hook.")
    lines.append("- For Paper 1 production-method or winemaking questions, require a method-hook ledger before finalizing the flight: each wine needs a distinct discussable production hook, or at least one wine must be a clear method outlier. Do not ask production-method marks on three similar clean aromatic whites from the same region and tier.")
    lines.append("- Use `data/mock_wine_bank.json` as the first external-candidate pool when the historical corpus is too narrow or recent mocks have overused a motif. Filter by `useful_families`, `style_category`, `price_band`, `quality_tier`, and cooldown motifs before naming wines.")
    lines.append("- Default mix for new full mocks: at least 30% of named wines should come from the historical corpus, with the remaining selections drawn from `data/mock_wine_bank.json` or other validated external research. For a 36-wine exam, that means at least 11 historical wines and up to 25 bank-backed wines.")
    lines.append("- Before finalizing any named mock wine, create a source-backed entry in `data/mock_wine_research/{mock_exam_id}.json`; do not let the answer writer invent vineyard, soil, producer, oak, price, or classification facts from memory.")
    lines.append("- If the mock wine bank lacks a wine for the needed role, run wine research first and add a validated bank entry rather than letting the writer improvise.")
    lines.append("- Run `python scripts/validate_mock_wine_facts.py --exam <mock.md> --answers <answers.md> --strict-research` before accepting a mock answer key.")
    lines.append("- If you leave the corpus for a wine, research it first and mark it as external only if necessary.")
    lines.append("")
    if quality_price:
        lines.append("## Quality / price-tier guardrail")
        lines.append("")
        lines.append("Use `outputs/heuristics/quality_price_tier_analysis.md` when building quality-led questions.")
        lines.append("")
        band_text = ", ".join(
            f"{band}={count}" for band, count in quality_price["bands"].most_common()
        )
        lines.append(f"- Historical price-band proxy distribution: {band_text}")
        lines.append(f"- Quality-led questions analysed: `{quality_price['quality_questions']}`")
        lines.append(f"- Quality-led questions with three or more price bands: `{quality_price['wide_quality_questions']}`")
        lines.append(f"- Compressed all-high-priced quality questions: `{quality_price['compressed_high_quality_questions']}`")
        lines.append(f"- Top-heavy quality questions: `{quality_price['top_heavy_quality_questions']}`")
        lines.append("")
        lines.append("Exam-writer rule: if a question asks candidates to rank or distinguish quality, either build a visible ladder from value/mainstream to premium/fine wine, or make the stem explicitly about classification, same producer, same appellation, or another legally meaningful hierarchy.")
        lines.append("")
    if winemaking_diversity:
        lines.append("## Quality / winemaking-diversity guardrail")
        lines.append("")
        lines.append("Use `outputs/heuristics/winemaking_diversity_quality_questions.md` when a quality question also cites winemaking, method, production, oak, maturation, or human factors.")
        lines.append("")
        counts = winemaking_diversity["counts"]
        lines.append(f"- Historical quality + winemaking/method questions analysed: `{winemaking_diversity['total']}`")
        lines.append(f"- High diversity: `{counts['high_diversity']}`")
        lines.append(f"- Moderate or paired/limited diversity: `{counts['moderate_diversity'] + counts['paired_or_limited_diversity']}`")
        lines.append(f"- Homogeneous winemaking signatures: `{counts['homogeneous']}`")
        lines.append(f"- Same-variety homogeneous rate: `{winemaking_diversity['same_variety_homogeneous']}` / `{winemaking_diversity['same_variety_total']}`")
        lines.append(f"- Compare/rank homogeneous rate: `{winemaking_diversity['rank_compare_homogeneous']}` / `{winemaking_diversity['rank_compare_total']}`")
        lines.append("")
        lines.append("Exam-writer rule: if the stem asks for quality with reference to winemaking, a 3-wine flight needs at least two distinct winemaking signatures and a 4-wine flight needs at least three, unless the stem explicitly says classification, terroir, or same producer is the point. If the wines share the same production logic, ask quality with reference to origin/classification instead of winemaking.")
        lines.append("")
    if wine_selection_logic:
        lines.append("## Full wine-selection scorecard guardrail")
        lines.append("")
        lines.append("Use `outputs/heuristics/wine_selection_logic_by_question_type.md` and `scripts/build_mock_design_review.py` before finalizing a mock.")
        lines.append("")
        fit_text = ", ".join(f"{k}={v}" for k, v in wine_selection_logic["fit_counts"].most_common())
        family_text = ", ".join(f"{k}={v}" for k, v in sorted(wine_selection_logic["family_counts"].items()))
        lines.append(f"- Historical questions scored: `{wine_selection_logic['historical_total']}`")
        lines.append(f"- Historical fit statuses: {fit_text}")
        lines.append(f"- Family coverage: {family_text}")
        lines.append("")
        lines.append("Exam-writer rule: each question family has required active contrast axes. F1 needs expression spread; F2 needs internal-origin diversity; F3 needs blend-role differences; F4 needs independence; F5 needs method diversity; F6 needs structural mechanism spread; F7 needs a hierarchy or quality ladder.")
        lines.append("")
    if mock_rotation:
        lines.append("## Cross-mock rotation guardrail")
        lines.append("")
        lines.append("Use `outputs/mock_exams/mock_rotation_analysis.md` before selecting a new full mock blueprint.")
        lines.append("")
        lines.append(f"- Full mocks analysed: `{mock_rotation['mock_count']}`")
        lines.append(f"- Historical Vouvray frequency: `{mock_rotation['vouvray_count']}` / `{mock_rotation['historical_wine_total']}` wines")
        lines.append(f"- Historical P3 Q1 sparkling frequency: `{mock_rotation['p3_q1_sparkling']}` / `{mock_rotation['p3_q1_total']}` P3 Q1 questions")
        if mock_rotation["top_repeated_motifs"]:
            motif_text = ", ".join(
                f"{item['motif']}={item['total_mock_count']}"
                for item in mock_rotation["top_repeated_motifs"][:6]
            )
            lines.append(f"- Current repeated mock motifs: {motif_text}")
        lines.append("")
        lines.append("Exam-writer rule: never repeat the same paper/question family-subtype position in consecutive full mocks unless explicitly drilling. Rotate opening families, especially P3 Q1. Do not default P3 Q1 to three-country sparkling. Put lower-frequency motifs such as Vouvray, Huet/Foreau, Savennières, Tokaji, Rutherglen, Vin Santo, Etna, and Madeira on a two-mock cooldown after use.")
        lines.append("")
    if mock_wine_bank:
        lines.append("## Validated mock wine bank")
        lines.append("")
        lines.append("Use `data/mock_wine_bank.json` as the controlled candidate pool for new or underused wines, and check `outputs/mock_exams/mock_wine_bank_report.md` for current coverage.")
        lines.append("")
        lines.append(f"- Validated entries: `{mock_wine_bank['entries']}`")
        style_text = ", ".join(f"{k}={v}" for k, v in mock_wine_bank["styles"].most_common())
        price_text = ", ".join(f"{k}={v}" for k, v in mock_wine_bank["prices"].most_common())
        quality_text = ", ".join(f"{k}={v}" for k, v in mock_wine_bank["qualities"].most_common())
        family_text = ", ".join(f"{k}={v}" for k, v in sorted(mock_wine_bank["families"].items()))
        country_text = ", ".join(f"{k}={v}" for k, v in mock_wine_bank["countries"].most_common(10))
        lines.append(f"- Style coverage: {style_text}")
        lines.append(f"- Price-band coverage: {price_text}")
        lines.append(f"- Quality-tier coverage: {quality_text}")
        lines.append(f"- Family coverage: {family_text}")
        lines.append(f"- Top country coverage: {country_text}")
        lines.append("")
        lines.append("Exam-writer rule: select from the bank by role, not by habit. Each chosen wine must match the question family, add a live contrast axis, avoid current cooldown motifs, and have source-backed facts copied into the mock-specific research file before the answer key is written.")
        lines.append("")
    lines.append("## Paper-specific vintage logic")
    lines.append("")
    lines.append("- Paper 1: freshness matters, so youthful examples should usually be 2024-2025; top-tier Chardonnay/Riesling/Chenin can be older when ageability or maturity is part of the question.")
    lines.append("- Paper 2: youthful commercial reds should usually be 2023-2024; serious Nebbiolo, Rioja, Bordeaux blends, and structured Syrah/Sangiovese can be older where development is educationally useful.")
    lines.append("- Paper 3: NV is normal for many sparkling and fortified wines; sweet/oxidative wines can be much older if that is part of category identity.")
    lines.append("")

    paper_titles = {
        1: "Paper 1 - Whites",
        2: "Paper 2 - Reds",
        3: "Paper 3 - Special",
    }
    for paper in [1, 2, 3]:
        rows = by_paper[paper]
        lines.append(f"## {paper_titles[paper]}")
        lines.append("")
        lines.append(f"- Historical wines in corpus: `{len(rows)}`")
        lines.append("")

        def top_lines(counter: Counter[str], label: str, n: int = 8) -> None:
            lines.append(f"### {label}")
            lines.append("")
            for name, count in counter.most_common(n):
                lines.append(f"- `{name}`: {count}")
            lines.append("")

        top_lines(Counter(r["country"] for r in rows), "Top countries")
        top_lines(Counter(r["region"] for r in rows), "Top regions")
        top_lines(Counter(r["style_category"] for r in rows), "Top style categories")
        top_lines(Counter(r["class_bucket"] for r in rows), "Quality-tier proxy buckets")
        top_lines(Counter(r["vintage_bucket"] for r in rows), "Age / vintage buckets")

        lines.append("### Sourcing guidance")
        lines.append("")
        if paper == 1:
            lines.extend(
                [
                    "- Build questions around benchmark white families first: Chardonnay, Riesling, Sauvignon Blanc, Chenin Blanc, Semillon, Pinot Gris, white blends.",
                    "- Make at least one question distinguish hierarchy or winemaking, not just raw grape ID.",
                    "- If a question asks for method of production or winemaking, give candidates real production hooks: oak/MLF/lees handling, sur lie, skin contact, oxidative handling, sweetness mechanism, wild ferment, age-release strategy, or a commercial-vs-premium cellar regime. A same-region aromatic trio such as Alsace Pinot Gris, Gewurztraminer, and Muscat is historically better as an ID/style/maturity question unless one wine has a clearly different method.",
                    "- Include a spread of tiers: at least one commercial or mid-tier foil, at least one benchmark premium wine, and at least one wine with genuine ageing or complexity value.",
                    "- Representative producers should feel exam-plausible: serious regional benchmarks, widely known estates, or credible premium commercial labels.",
                ]
            )
        elif paper == 2:
            lines.extend(
                [
                    "- Build around structurally distinct red families: Pinot Noir, Nebbiolo, Sangiovese, Tempranillo, Syrah/Shiraz, Bordeaux varieties and blends.",
                    "- Make the paper test tannin, oak, climate, and maturity, not just fruit profile.",
                    "- Include tier spread deliberately: one or two benchmark ageworthy wines, one value or entry-level contrast, and one mid-premium regional classic.",
                    "- Historical sourcing strongly favors classic red regions over novelty for novelty's sake.",
                ]
            )
        else:
            lines.extend(
                [
                    "- Category logic is primary: sparkling method, oxidative vs topped-up, sweetness mechanism, fortification route.",
                    "- Include at least one trap where sugar is present but not at dessert-wine scale, or where oxidation is category-defining rather than faulty.",
                    "- Make sure the wine mix spans commercial reality: benchmark category leaders plus at least one niche or sommelier-facing curveball.",
                    "- Be cautious with blend-family predictions here; category cues matter more than exact grape in many question structures.",
                ]
            )
        lines.append("")

    lines.append("## How the mock-exam writer should use this")
    lines.append("")
    lines.append("- Start from the question structure you want to test.")
    lines.append("- Choose the educational contrast needed: quality ladder, region contrast, winemaking contrast, maturity contrast, commercial contrast, or sweetness/fortification mechanism.")
    lines.append("- Then choose wines that fit that contrast while staying inside the historical sourcing envelope.")
    lines.append("- For full mocks, keep the selection mix roughly 30% historical corpus and 70% validated bank/external candidates unless a paper-specific pattern calls for a stronger historical tilt.")
    lines.append("- Do not back-solve by copying historic producer choices. Instead, pick representative wines that a human exam setter could plausibly source in 2026.")
    lines.append("- Use `data/wine_research/` first for historical wines and `data/mock_wine_bank.json` for validated external candidates. If a category gap appears, invoke wine research and add the result to the bank before finalizing the mock.")
    lines.append("- Do not reuse Vouvray, Huet, Foreau, generic sparkling-openers, Madeira, or other cooldown motifs just because they are familiar; the bank exists to give the writer better options.")
    lines.append("")

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"OK: wrote {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
