from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
EXAMS_PATH = ROOT / "data" / "exams.json"
RESEARCH_DIR = ROOT / "data" / "wine_research"
MOCK_EXAM_PATH = ROOT / "outputs" / "mock_exams" / "mock_full_2026_05_26_v6.md"
MOCK_ANSWERS_PATH = ROOT / "outputs" / "mock_exams" / "mock_full_2026_05_26_v6_answers.md"
OUT_JSON_PATH = ROOT / "data" / "winemaking_diversity_quality_questions.json"
OUT_MD_PATH = ROOT / "outputs" / "heuristics" / "winemaking_diversity_quality_questions.md"


QUALITY_TERMS = ["quality", "higher quality", "quality order"]
WINEMAKING_TERMS = [
    "winemaking",
    "method of production",
    "methods of production",
    "method",
    "production techniques",
    "techniques",
    "maturation",
    "oak",
    "human factors",
    "winemaker",
]


def normalize(text: str) -> str:
    text = (text or "").lower()
    replacements = {
        "ã©": "e",
        "ã¨": "e",
        "ã´": "o",
        "ã¼": "u",
        "ã¶": "o",
        "ã¤": "a",
        "é": "e",
        "è": "e",
        "ô": "o",
        "ü": "u",
        "ö": "o",
        "ä": "a",
        "—": "-",
        "–": "-",
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
    fm = {}
    for line in parts[1].splitlines():
        if ":" in line:
            key, value = line.split(":", 1)
            fm[key.strip()] = value.strip()
    return fm, parts[2]


def load_research(wine_id: str) -> tuple[dict[str, str], str]:
    path = RESEARCH_DIR / f"{wine_id}.md"
    if not path.exists():
        return {}, ""
    return parse_frontmatter(path)


def is_quality_winemaking_question(text: str) -> bool:
    q = normalize(text)
    return any(term in q for term in QUALITY_TERMS) and any(term in q for term in WINEMAKING_TERMS)


def stem_tags(text: str) -> list[str]:
    q = normalize(text)
    tags = []
    if "same single grape" in q or "same grape variety" in q or "same, single grape" in q:
        tags.append("same_variety")
    if "same country" in q:
        tags.append("same_country")
    if "same region" in q or "same region of origin" in q:
        tags.append("same_region")
    if "same producer" in q:
        tags.append("same_producer")
    if "compare" in q or "contrast" in q:
        tags.append("compare_contrast")
    if "rank" in q or "higher quality" in q or "quality order" in q:
        tags.append("ranking")
    if "oak" in q or "maturation" in q:
        tags.append("oak_maturation_explicit")
    if "method of production" in q or "production techniques" in q or "key winemaking" in q:
        tags.append("method_explicit")
    return tags


def feature_set(fm: dict[str, str], body: str) -> set[str]:
    text = normalize(" ".join([body, fm.get("oak_signature", ""), fm.get("style_category", ""), fm.get("rs_level", "")]))
    features: set[str] = set()
    style = fm.get("style_category", "unknown") or "unknown"
    oak = fm.get("oak_signature", "unknown") or "unknown"
    rs = fm.get("rs_level", "unknown") or "unknown"
    features.add(f"style:{style}")
    features.add(f"oak:{oak}")
    features.add(f"rs:{rs}")

    token_map = {
        "barrel_fermentation": ["barrel ferment", "fermentation in barrel", "fermented in barrel", "barrique ferment"],
        "stainless": ["stainless", "steel tank", "inox"],
        "new_oak": ["new oak", "new french oak", "new american oak", "one-third new", "100% new"],
        "old_oak": ["old oak", "older oak", "used oak", "neutral oak", "large old", "foudre", "fuder"],
        "malo": ["malolactic", "malo", "mlf"],
        "lees": ["lees", "sur lie", "batonnage"],
        "skin_contact": ["skin contact", "maceration on skins", "orange wine"],
        "whole_bunch": ["whole bunch", "whole cluster"],
        "botrytis": ["botrytis", "noble rot", "aszú", "aszu"],
        "appassimento": ["appassimento", "dried grapes", "passito"],
        "traditional_method": ["traditional method", "secondary fermentation in bottle", "tirage"],
        "tank_method": ["tank method", "charmat"],
        "oxidative": ["oxidative", "rancio", "flor", "solera"],
        "fortified": ["fortification", "fortified", "grape spirit"],
        "carbonic": ["carbonic"],
        "amphora": ["amphora", "qvevri"],
    }
    for feature, tokens in token_map.items():
        if any(token in text for token in tokens):
            features.add(feature)
    return features


def coarse_signature(features: set[str]) -> str:
    style = next((f for f in features if f.startswith("style:")), "style:unknown")
    oak = next((f for f in features if f.startswith("oak:")), "oak:unknown")
    rs = next((f for f in features if f.startswith("rs:")), "rs:unknown")
    method_flags = sorted(
        f
        for f in features
        if not f.startswith("style:") and not f.startswith("oak:") and not f.startswith("rs:")
    )
    return "|".join([style, oak, rs, ",".join(method_flags[:5])])


def diversity_summary(wines: list[dict]) -> dict:
    n = len(wines)
    signatures = Counter(w["signature"] for w in wines)
    style_count = len({w["style_category"] for w in wines})
    oak_count = len({w["oak_signature"] for w in wines})
    rs_count = len({w["rs_level"] for w in wines})
    method_feature_union = set().union(*(w["features"] for w in wines)) if wines else set()
    method_feature_intersection = set(wines[0]["features"]) if wines else set()
    for wine in wines[1:]:
        method_feature_intersection &= wine["features"]
    differentiating_features = sorted(method_feature_union - method_feature_intersection)
    unique_signatures = len(signatures)

    if unique_signatures == 1:
        category = "homogeneous"
    elif unique_signatures == 2 and n >= 4:
        category = "paired_or_limited_diversity"
    elif unique_signatures >= max(2, n - 1):
        category = "high_diversity"
    else:
        category = "moderate_diversity"

    axis_count = sum(1 for count in [style_count, oak_count, rs_count] if count > 1)
    if unique_signatures == 1 and axis_count == 0 and len(differentiating_features) <= 1:
        category = "homogeneous"
    elif unique_signatures > 1 and axis_count == 0 and len(differentiating_features) <= 1:
        category = "paired_or_limited_diversity"

    return {
        "n_wines": n,
        "unique_signatures": unique_signatures,
        "style_count": style_count,
        "oak_count": oak_count,
        "rs_count": rs_count,
        "differentiating_features": differentiating_features,
        "category": category,
        "signatures": dict(signatures),
    }


def load_historical_records() -> list[dict]:
    exams = json.loads(EXAMS_PATH.read_text(encoding="utf-8"))
    records = []
    for exam in exams:
        year = exam["year"]
        for paper in exam["papers"]:
            paper_n = paper["paper"]
            wine_lookup = {wine["slot"]: wine for wine in paper["wines"]}
            for question in paper["questions"]:
                text = question["text"]
                if not is_quality_winemaking_question(text):
                    continue
                qid = f"{year}_p{paper_n}_q{question['n']}"
                wines = []
                for slot in question["wines"]:
                    wine_id = f"{year}_p{paper_n}_w{slot}"
                    fm, body = load_research(wine_id)
                    features = feature_set(fm, body)
                    wines.append(
                        {
                            "wine_id": wine_id,
                            "slot": slot,
                            "wine_text": wine_lookup[slot]["full_text"],
                            "style_category": fm.get("style_category", "unknown"),
                            "oak_signature": fm.get("oak_signature", "unknown"),
                            "rs_level": fm.get("rs_level", "unknown"),
                            "features": features,
                            "signature": coarse_signature(features),
                        }
                    )
                summary = diversity_summary(wines)
                records.append(
                    {
                        "qid": qid,
                        "year": year,
                        "paper": paper_n,
                        "question": question["n"],
                        "question_text": text,
                        "stem_tags": stem_tags(text),
                        "wines": [
                            {**wine, "features": sorted(wine["features"])}
                            for wine in wines
                        ],
                        **summary,
                    }
                )
    return records


def parse_mock_p1q2() -> dict:
    exam_text = MOCK_EXAM_PATH.read_text(encoding="utf-8", errors="replace")
    answers_text = MOCK_ANSWERS_PATH.read_text(encoding="utf-8", errors="replace")
    q_match = re.search(r"### Question 2\s*\n(.*?)(?:\n---\n\n### Question 3)", exam_text, re.S)
    wines_match = re.search(r"### Wines\s*\n(.*?)(?:\n---\n\n## Paper 2)", exam_text, re.S)
    answer_match = re.search(r"### Question 2\s*(.*?)(?:\n---\n\n## Proposed annotation)", answers_text, re.S)
    wines = []
    if wines_match:
        for line in wines_match.group(1).splitlines():
            m = re.match(r"\s*([5-7])\.\s+(.+)", line)
            if not m:
                continue
            slot = int(m.group(1))
            wine_text = m.group(2).strip()
            text = normalize(wine_text + " " + (answer_match.group(1) if answer_match else ""))
            # The current answer key treats all three as Loire Sauvignon Blanc with no malo/new-oak contrast.
            features = {
                "style:still_dry",
                "oak:none_or_old_neutral",
                "rs:dry",
                "stainless",
                "old_oak" if any(token in text for token in ["foudre", "older"]) else "stainless",
            }
            wines.append(
                {
                    "wine_id": f"mock_p1_w{slot}",
                    "slot": slot,
                    "wine_text": wine_text,
                    "style_category": "still_dry",
                    "oak_signature": "none_or_old_neutral",
                    "rs_level": "dry",
                    "features": features,
                    "signature": coarse_signature(features),
                }
            )
    summary = diversity_summary(wines)
    return {
        "qid": "mock_full_2026_05_26_v6_p1_q2",
        "question_text": q_match.group(1).strip() if q_match else "",
        "stem_tags": ["same_variety", "same_country", "ranking"],
        "mentions_winemaking": any(term in normalize(q_match.group(1) if q_match else "") for term in WINEMAKING_TERMS),
        "wines": [{**wine, "features": sorted(wine["features"])} for wine in wines],
        **summary,
    }


def pct(n: int, d: int) -> str:
    if d == 0:
        return "0%"
    return f"{(n / d):.0%}"


def render_md(records: list[dict], mock: dict) -> str:
    total = len(records)
    by_category = Counter(r["category"] for r in records)
    by_size = defaultdict(Counter)
    by_paper = defaultdict(Counter)
    same_variety = []
    same_variety_country_region = []
    explicit_rank_or_compare = []
    for row in records:
        by_size[row["n_wines"]][row["category"]] += 1
        by_paper[row["paper"]][row["category"]] += 1
        tags = set(row["stem_tags"])
        if "same_variety" in tags:
            same_variety.append(row)
        if "same_variety" in tags and ("same_country" in tags or "same_region" in tags):
            same_variety_country_region.append(row)
        if "ranking" in tags or "compare_contrast" in tags:
            explicit_rank_or_compare.append(row)

    def category_line(label: str, rows: list[dict]) -> list[str]:
        counts = Counter(r["category"] for r in rows)
        n = len(rows)
        return [
            f"- {label}: `{n}` questions; high/moderate/paired diversity = `{pct(sum(counts[c] for c in ['high_diversity', 'moderate_diversity', 'paired_or_limited_diversity']), n)}`; homogeneous = `{pct(counts['homogeneous'], n)}`"
        ]

    comparable = [
        r
        for r in records
        if "same_variety" in r["stem_tags"]
        and ("same_country" in r["stem_tags"] or "same_region" in r["stem_tags"])
    ]
    comparable = sorted(comparable, key=lambda r: (r["category"] == "homogeneous", r["n_wines"], r["year"]))

    lines = [
        "# Winemaking Diversity in Quality-Led Questions",
        "",
        "This analysis asks whether historical MW practical questions that combine quality assessment with winemaking/method discussion usually select wines with meaningfully different winemaking signatures.",
        "",
        "A question is included when its stem contains quality language and winemaking/method/production/oak/maturation language. Diversity is inferred from source-backed `data/wine_research` metadata and technical-note keywords: style category, oak signature, residual sugar, barrel/stainless, malo, lees, skin contact, botrytis, traditional method, oxidative handling, fortification, and related cues.",
        "",
        "## Headline",
        "",
        f"- Historical quality + winemaking/method questions analysed: `{total}`",
        f"- High diversity: `{by_category['high_diversity']}` ({pct(by_category['high_diversity'], total)})",
        f"- Moderate diversity: `{by_category['moderate_diversity']}` ({pct(by_category['moderate_diversity'], total)})",
        f"- Paired or limited diversity: `{by_category['paired_or_limited_diversity']}` ({pct(by_category['paired_or_limited_diversity'], total)})",
        f"- Homogeneous winemaking signatures: `{by_category['homogeneous']}` ({pct(by_category['homogeneous'], total)})",
        "",
        "So yes: historically, these questions usually create some winemaking diversity. Fully homogeneous production signatures are the minority, and when they appear they are normally not asking winemaking to carry the quality ranking by itself.",
        "",
        "## Relevant Subsets",
        "",
        *category_line("Same-variety questions", same_variety),
        *category_line("Same-variety plus same-country/same-region questions", same_variety_country_region),
        *category_line("Explicit compare/rank questions", explicit_rank_or_compare),
        "",
        "## By Flight Size",
        "",
    ]
    for size in sorted(by_size):
        counts = by_size[size]
        n = sum(counts.values())
        parts = ", ".join(f"{cat}={counts[cat]}" for cat in ["high_diversity", "moderate_diversity", "paired_or_limited_diversity", "homogeneous"] if counts[cat])
        lines.append(f"- `{size}` wines: `{n}` questions; {parts}")

    lines.extend(["", "## By Paper", ""])
    for paper in sorted(by_paper):
        counts = by_paper[paper]
        n = sum(counts.values())
        parts = ", ".join(f"{cat}={counts[cat]}" for cat in ["high_diversity", "moderate_diversity", "paired_or_limited_diversity", "homogeneous"] if counts[cat])
        lines.append(f"- Paper {paper}: `{n}` questions; {parts}")

    lines.extend(
        [
            "",
            "## Mock v6 Paper 1 Question 2",
            "",
            f"- Stem: same variety, same country, quality ranking.",
            f"- Stem mentions winemaking/method: `{mock.get('mentions_winemaking', False)}`",
            f"- Flight size: `{mock['n_wines']}`",
            f"- Diversity category: `{mock['category']}`",
            f"- Unique winemaking signatures: `{mock['unique_signatures']}`",
            f"- Style count: `{mock['style_count']}`; oak count: `{mock['oak_count']}`; RS count: `{mock['rs_count']}`",
            "",
            "Diagnosis: the Loire Sauvignon Blanc set has homogeneous production logic: cool fermentation, no malo, no overt new oak, mostly stainless/neutral vessel handling. This is acceptable only if the stem makes origin/site/producer hierarchy the quality axis. It is weak if the stem asks winemaking to justify the ranking.",
            "",
            "The current repaired stem uses origin, site expression, producer reputation and regional hierarchy, which matches the actual contrast. If winemaking is named in a future version, the flight should include at least one visible production lever: barrel/large-oak vs stainless, lees ageing difference, malo/no malo, skin contact, oxidative/reductive handling, sweetness/arrested fermentation, or bottle age/maturation regime.",
            "",
            "## Comparable Historical Questions",
            "",
        ]
    )
    for row in comparable[:25]:
        parts = ", ".join(f"{k}={v}" for k, v in {
            "sig": row["unique_signatures"],
            "style": row["style_count"],
            "oak": row["oak_count"],
            "rs": row["rs_count"],
        }.items())
        tags = ", ".join(row["stem_tags"])
        lines.append(f"- `{row['qid']}` ({row['n_wines']} wines, `{row['category']}`, {tags}): {parts}")

    lines.extend(
        [
            "",
            "## Exam Writer Optimization",
            "",
            "- If the stem says quality with reference to winemaking, do not choose three or four wines whose production answer is essentially identical.",
            "- For a three-wine quality-ranking flight, require at least two distinct winemaking signatures; for a four-wine flight, require at least three unless the stem explicitly says classification, terroir, or same producer is the point.",
            "- If the desired lesson is appellation hierarchy with similar production, phrase the stem as quality with reference to origin/classification, not winemaking.",
            "- If keeping Loire Sauvignon Blanc, improve P1 Q2 by changing one slot to a visibly different production style: e.g. top Pouilly-Fumé/Sancerre with barrel or extended lees, a simpler stainless satellite appellation, and a premium single-site cuvée with neutral oak/foudre texture. Otherwise remove `winemaking` from the ranking justification.",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    records = load_historical_records()
    mock = parse_mock_p1q2()
    OUT_JSON_PATH.write_text(json.dumps({"records": records, "mock_v6_p1_q2": mock}, indent=2, ensure_ascii=False), encoding="utf-8")
    OUT_MD_PATH.write_text(render_md(records, mock), encoding="utf-8")
    print(f"OK: wrote {OUT_JSON_PATH}")
    print(f"OK: wrote {OUT_MD_PATH}")


if __name__ == "__main__":
    main()
