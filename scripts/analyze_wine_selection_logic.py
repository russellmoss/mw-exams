from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from pathlib import Path
from statistics import mean


ROOT = Path(__file__).resolve().parent.parent
EXAMS_PATH = ROOT / "data" / "exams.json"
RESEARCH_DIR = ROOT / "data" / "wine_research"
TAXONOMY_INDEX_PATH = ROOT / "outputs" / "heuristics" / "question_taxonomy_index.md"
CLASSIFICATION_PATH = ROOT / "data" / "historical_wine_classification.json"
PRICE_ANALYSIS_PATH = ROOT / "data" / "quality_price_tier_analysis.json"
WINEMAKING_ANALYSIS_PATH = ROOT / "data" / "winemaking_diversity_quality_questions.json"
MOCK_EXAM_PATH = ROOT / "outputs" / "mock_exams" / "mock_full_2026_05_26_v6.md"
MOCK_ANSWERS_PATH = ROOT / "outputs" / "mock_exams" / "mock_full_2026_05_26_v6_answers.md"
OUT_JSON_PATH = ROOT / "data" / "wine_selection_logic_analysis.json"
OUT_MD_PATH = ROOT / "outputs" / "heuristics" / "wine_selection_logic_by_question_type.md"


AXES = [
    "variety",
    "origin",
    "style",
    "winemaking",
    "price_quality",
    "benchmark",
    "maturity",
    "structure",
]

AXIS_LABELS = {
    "variety": "Variety differentiation",
    "origin": "Origin/geography differentiation",
    "style": "Style/category differentiation",
    "winemaking": "Winemaking/method differentiation",
    "price_quality": "Price/quality-tier spread",
    "benchmark": "Benchmark/curveball role spread",
    "maturity": "Maturity/development spread",
    "structure": "Structural/sensory spread",
}


def normalize(text: str) -> str:
    text = (text or "").lower()
    replacements = {
        "ã©": "e",
        "ã¨": "e",
        "ã´": "o",
        "ã¼": "u",
        "ã¶": "o",
        "ã¤": "a",
        "ã§": "c",
        "ã±": "n",
        "é": "e",
        "è": "e",
        "ô": "o",
        "ü": "u",
        "ö": "o",
        "ä": "a",
        "ç": "c",
        "ñ": "n",
        "—": "-",
        "–": "-",
    }
    for src, dst in replacements.items():
        text = text.replace(src, dst)
    return re.sub(r"\s+", " ", text).strip()


def parse_frontmatter(path: Path) -> tuple[dict[str, str], str]:
    if not path.exists():
        return {}, ""
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


def parse_taxonomy_index() -> dict[str, dict]:
    if not TAXONOMY_INDEX_PATH.exists():
        return {}
    out = {}
    pattern = re.compile(r"- `(\d{4}_p\d_q\d+)` -> `(F\d+[a-z]?)`; (.+)")
    for line in TAXONOMY_INDEX_PATH.read_text(encoding="utf-8", errors="replace").splitlines():
        match = pattern.match(line.strip())
        if not match:
            continue
        qid, subtype, tags = match.groups()
        out[qid] = {
            "family": subtype[:2],
            "subtype": subtype,
            "taxonomy_tags": [tag.strip() for tag in tags.split(",")],
        }
    return out


def parse_grape_from_research(fm: dict[str, str], body: str, wine_text: str) -> str:
    for source in [body, wine_text]:
        for pattern in [
            r"- Grape variet(?:y|ies):\s*(.+)",
            r"Variet(?:y|ies):\s*(.+)",
        ]:
            match = re.search(pattern, source, re.I)
            if match:
                value = match.group(1).split("\n", 1)[0]
                return clean_value(value)
    name = fm.get("wine_name", "") or wine_text
    first = re.split(r"[,.;]", name)[0]
    return clean_value(first)


def clean_value(value: str) -> str:
    value = normalize(value)
    value = re.sub(r"\b100%\b", "", value)
    value = re.sub(r"\([^)]*\)", "", value)
    value = value.replace("shiraz", "syrah")
    value = re.sub(r"\bdominant\b|\bpredominant\b|\bblend\b", "", value)
    value = re.sub(r"\s+", " ", value).strip(" -;,.")
    return value or "unknown"


def structural_bucket(fm: dict[str, str], body: str, wine_text: str) -> str:
    profile = fm.get("structural_profile", "")
    if profile:
        return profile
    text = normalize(" ".join([body, wine_text]))
    bits = []
    if any(t in text for t in ["very high acidity", "high acid", "electric acid", "racy acidity"]):
        bits.append("high_acid")
    if any(t in text for t in ["full-bodied", "full body", "rich", "powerful", "muscular"]):
        bits.append("full_body")
    elif any(t in text for t in ["light-bodied", "light body", "featherweight", "delicate"]):
        bits.append("light_body")
    if any(t in text for t in ["high tannin", "firm tannin", "dense tannin", "grippy"]):
        bits.append("tannic")
    if any(t in text for t in ["sweet", "residual sugar", "off-dry", "dessert"]):
        bits.append("sweetness")
    return "+".join(bits) or "unknown"


def method_features(fm: dict[str, str], body: str) -> set[str]:
    text = normalize(" ".join([body, fm.get("oak_signature", ""), fm.get("style_category", ""), fm.get("rs_level", "")]))
    features = {
        f"style:{fm.get('style_category', 'unknown') or 'unknown'}",
        f"oak:{fm.get('oak_signature', 'unknown') or 'unknown'}",
        f"rs:{fm.get('rs_level', 'unknown') or 'unknown'}",
    }
    token_map = {
        "barrel_fermentation": ["barrel ferment", "fermentation in barrel", "fermented in barrel"],
        "stainless": ["stainless", "steel tank", "inox"],
        "new_oak": ["new oak", "new french oak", "new american oak", "one-third new", "100% new"],
        "old_oak": ["old oak", "older oak", "used oak", "neutral oak", "large old", "foudre", "fuder"],
        "malo": ["malolactic", "malo", "mlf"],
        "lees": ["lees", "sur lie", "batonnage"],
        "skin_contact": ["skin contact", "maceration on skins", "orange wine"],
        "whole_bunch": ["whole bunch", "whole cluster"],
        "botrytis": ["botrytis", "noble rot", "aszu", "aszú"],
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


def method_signature(features: set[str]) -> str:
    method = sorted(f for f in features if not f.startswith(("style:", "oak:", "rs:")))
    return "|".join(
        [
            next((f for f in features if f.startswith("style:")), "style:unknown"),
            next((f for f in features if f.startswith("oak:")), "oak:unknown"),
            next((f for f in features if f.startswith("rs:")), "rs:unknown"),
            ",".join(method[:6]),
        ]
    )


def load_external_maps() -> tuple[dict[str, dict], dict[str, str], dict[str, str]]:
    class_rows = {}
    if CLASSIFICATION_PATH.exists():
        class_rows = {
            row["wine_id"]: row
            for row in json.loads(CLASSIFICATION_PATH.read_text(encoding="utf-8"))
        }
    price_rows = {}
    if PRICE_ANALYSIS_PATH.exists():
        data = json.loads(PRICE_ANALYSIS_PATH.read_text(encoding="utf-8"))
        price_rows = {row["wine_id"]: row.get("price_band", "unknown") for row in data.get("records", [])}
    wine_make_categories = {}
    if WINEMAKING_ANALYSIS_PATH.exists():
        data = json.loads(WINEMAKING_ANALYSIS_PATH.read_text(encoding="utf-8"))
        for q in data.get("records", []):
            for wine in q.get("wines", []):
                wine_make_categories[wine["wine_id"]] = wine.get("signature", "")
    return class_rows, price_rows, wine_make_categories


def question_text_tags(text: str) -> list[str]:
    q = normalize(text)
    tags = []
    checks = {
        "quality-led": ["quality"],
        "method-led": ["winemaking", "method of production", "production techniques", "oak", "maturation", "human factors", "winemaker"],
        "commercial-position-led": ["commercial", "consumer appeal", "market", "sell this wine"],
        "maturity-led": ["maturity", "ageing", "aging", "develop", "vintage"],
        "structure-led": ["alcohol", "residual sugar", "sweetness", "acidity", "tannin", "style"],
        "origin-led": ["origin", "country", "region", "appellation"],
        "variety-led": ["grape", "variety", "varieties"],
        "same-country": ["same country"],
        "same-region": ["same region"],
        "same-producer": ["same producer"],
        "same-vintage": ["same vintage"],
        "same-variety": ["same single grape", "same grape variety", "same, single grape"],
        "blend": ["blend", "blends", "varieties used"],
        "ranking": ["rank", "higher quality", "quality order"],
        "compare-contrast": ["compare", "contrast"],
    }
    for tag, tokens in checks.items():
        if any(token in q for token in tokens):
            tags.append(tag)
    return tags


def infer_family_from_text(text: str, paper: int) -> tuple[str, str, list[str]]:
    tags = question_text_tags(text)
    q = normalize(text)
    if "same-variety" in tags:
        if paper == 3 and ("sparkling" in q or "sweet" in q or "fortified" in q or "style" in q):
            return "F1", "F1d", tags
        if "same-region" in tags or "same-producer" in tags:
            return "F1", "F1c", tags
        if "same-country" in tags:
            return "F1", "F1a", tags
        return "F1", "F1b", tags
    if "blend" in tags:
        return "F3", "F3x", tags
    if any(token in q for token in ["residual sugar", "alcohol level", "sweetness"]):
        return "F6", "F6a", tags
    if "method-led" in tags and paper == 3 and not ("same-country" in tags or "same-region" in tags):
        return "F5", "F5x", tags
    if "same-country" in tags or "same-region" in tags or "same-producer" in tags:
        if "quality-led" in tags and ("ranking" in tags or "classification" in q or "higher quality" in q):
            return "F7", "F7x", tags
        return "F2", "F2x", tags
    if "quality-led" in tags and ("commercial-position-led" in tags or "classification" in q):
        return "F7", "F7x", tags
    return "F4", "F4x", tags


def diversity_score(values: list[str]) -> float:
    vals = [v for v in values if v and v != "unknown" and not v.startswith("source needed")]
    if not vals:
        return 0.0
    return len(set(vals)) / len(vals)


def spread_category(score: float) -> str:
    if score >= 0.75:
        return "high"
    if score >= 0.45:
        return "moderate"
    if score > 0:
        return "low"
    return "unknown"


def score_question(wines: list[dict]) -> dict:
    n = len(wines)
    scores = {
        "variety": diversity_score([w["variety"] for w in wines]),
        "origin": max(
            diversity_score([w["country"] for w in wines]),
            diversity_score([w["region"] for w in wines]),
            diversity_score([w["appellation"] for w in wines]),
        ),
        "style": max(
            diversity_score([w["style_category"] for w in wines]),
            diversity_score([w["rs_level"] for w in wines]),
        ),
        "winemaking": diversity_score([w["method_signature"] for w in wines]),
        "price_quality": max(
            diversity_score([w["price_band"] for w in wines]),
            diversity_score([w["commercial_tier"] for w in wines]),
        ),
        "benchmark": max(
            diversity_score([w["benchmark_status"] for w in wines]),
            diversity_score([w["curveball_level"] for w in wines]),
            diversity_score([w["question_role"] for w in wines]),
        ),
        "maturity": diversity_score([w["maturity_role"] for w in wines]),
        "structure": diversity_score([w["structural_profile"] for w in wines]),
    }
    categories = {axis: spread_category(score) for axis, score in scores.items()}
    active_axes = [axis for axis, score in scores.items() if score >= 0.45]
    dominant_axes = [axis for axis, score in scores.items() if score >= 0.75]
    return {
        "n_wines": n,
        "axis_scores": {axis: round(score, 3) for axis, score in scores.items()},
        "axis_categories": categories,
        "active_axes": active_axes,
        "dominant_axes": dominant_axes,
        "selection_complexity": round(mean(scores.values()), 3) if scores else 0,
    }


EXPECTED_AXES = {
    "F1": ["origin", "style", "structure", "winemaking", "price_quality", "maturity"],
    "F2": ["variety", "style", "origin", "winemaking", "price_quality", "maturity"],
    "F3": ["variety", "style", "winemaking", "structure"],
    "F4": ["variety", "origin", "style", "benchmark", "structure"],
    "F5": ["winemaking", "style", "structure"],
    "F6": ["style", "structure", "maturity", "price_quality"],
    "F7": ["price_quality", "benchmark", "origin", "maturity"],
    "F8": ["benchmark", "style", "origin", "variety"],
}

TAG_EXPECTATIONS = {
    "quality-led": ["price_quality", "benchmark"],
    "method-led": ["winemaking"],
    "commercial-position-led": ["price_quality", "benchmark"],
    "maturity-led": ["maturity"],
    "structure-led": ["structure", "style"],
    "origin-led": ["origin"],
    "variety-led": ["variety"],
    "same-variety": ["origin", "style", "structure"],
    "same-country": ["origin", "variety", "style"],
    "same-region": ["origin", "price_quality", "benchmark"],
    "same-producer": ["price_quality", "maturity", "style"],
    "ranking": ["price_quality", "benchmark"],
    "compare-contrast": ["style", "winemaking", "price_quality", "maturity"],
}


def expected_axes(family: str, tags: list[str]) -> list[str]:
    axes = list(EXPECTED_AXES.get(family, []))
    for tag in tags:
        for axis in TAG_EXPECTATIONS.get(tag, []):
            if axis not in axes:
                axes.append(axis)
    return axes


def fit_assessment(row: dict) -> dict:
    expected = expected_axes(row["family"], row["combined_tags"])
    scores = row["axis_scores"]
    met = [axis for axis in expected if scores.get(axis, 0) >= 0.45]
    weak = [axis for axis in expected if scores.get(axis, 0) < 0.45]
    critical = []
    tags = set(row["combined_tags"])
    if "method-led" in tags and scores.get("winemaking", 0) < 0.45:
        critical.append("method-led stem but low winemaking diversity")
    if ("quality-led" in tags or "ranking" in tags) and max(scores.get("price_quality", 0), scores.get("benchmark", 0), scores.get("origin", 0)) < 0.45:
        critical.append("quality/ranking stem but weak quality-tier/origin/benchmark spread")
    if "commercial-position-led" in tags and scores.get("price_quality", 0) < 0.45:
        critical.append("commercial stem but low price/commercial spread")
    if "same-variety" in tags and max(scores.get("origin", 0), scores.get("style", 0), scores.get("structure", 0)) < 0.45:
        critical.append("same-variety stem but weak expression differentiation")
    if row["family"] == "F4" and min(scores.get("variety", 0), scores.get("origin", 0)) < 0.45:
        critical.append("mixed-breadth family but low variety/origin independence")
    fit_score = len(met) / len(expected) if expected else 1
    if critical:
        status = "fail"
    elif row["family"] == "F7" and scores.get("price_quality", 0) >= 0.45 and (
        scores.get("origin", 0) >= 0.45 or scores.get("benchmark", 0) >= 0.45 or scores.get("maturity", 0) >= 0.45
    ):
        status = "acceptable" if fit_score < 0.75 else "strong"
    elif fit_score >= 0.75:
        status = "strong"
    elif fit_score >= 0.5:
        status = "acceptable"
    else:
        status = "weak"
    return {
        "expected_axes": expected,
        "met_axes": met,
        "weak_axes": weak,
        "fit_score": round(fit_score, 3),
        "fit_status": status,
        "critical_flags": critical,
    }


def historical_rows() -> list[dict]:
    taxonomy = parse_taxonomy_index()
    class_rows, price_rows, _ = load_external_maps()
    exams = json.loads(EXAMS_PATH.read_text(encoding="utf-8"))
    rows = []
    for exam in exams:
        year = exam["year"]
        for paper in exam["papers"]:
            paper_n = paper["paper"]
            wine_lookup = {w["slot"]: w for w in paper["wines"]}
            for question in paper["questions"]:
                qid = f"{year}_p{paper_n}_q{question['n']}"
                inferred_family, inferred_subtype, text_tags = infer_family_from_text(question["text"], paper_n)
                tax = taxonomy.get(qid, {})
                family = tax.get("family", inferred_family)
                subtype = tax.get("subtype", inferred_subtype)
                tags = sorted(set(tax.get("taxonomy_tags", []) + text_tags))
                wines = []
                for slot in question["wines"]:
                    wine_id = f"{year}_p{paper_n}_w{slot}"
                    wine_text = wine_lookup[slot]["full_text"]
                    fm, body = parse_frontmatter(RESEARCH_DIR / f"{wine_id}.md")
                    class_row = class_rows.get(wine_id, {})
                    features = method_features(fm, body)
                    wines.append(
                        {
                            "wine_id": wine_id,
                            "slot": slot,
                            "wine_text": wine_text,
                            "variety": parse_grape_from_research(fm, body, wine_text),
                            "country": fm.get("country", class_row.get("country", "unknown")),
                            "region": fm.get("region", class_row.get("region", "unknown")),
                            "appellation": fm.get("appellation", "unknown"),
                            "producer": fm.get("producer", class_row.get("producer", "unknown")),
                            "style_category": fm.get("style_category", class_row.get("style_category", "unknown")),
                            "oak_signature": fm.get("oak_signature", "unknown"),
                            "rs_level": fm.get("rs_level", "unknown"),
                            "structural_profile": structural_bucket(fm, body, wine_text),
                            "method_signature": method_signature(features),
                            "price_band": price_rows.get(wine_id, "unknown"),
                            "commercial_tier": class_row.get("commercial_tier", "unknown"),
                            "benchmark_status": class_row.get("benchmark_status", "unknown"),
                            "question_role": class_row.get("question_role", "unknown"),
                            "curveball_level": class_row.get("curveball_level", "unknown"),
                            "maturity_role": class_row.get("maturity_role", "unknown"),
                        }
                    )
                scored = score_question(wines)
                row = {
                    "qid": qid,
                    "year": year,
                    "paper": paper_n,
                    "question": question["n"],
                    "family": family,
                    "subtype": subtype,
                    "taxonomy_available": qid in taxonomy,
                    "combined_tags": tags,
                    "question_text": question["text"],
                    "wines": wines,
                    **scored,
                }
                row.update(fit_assessment(row))
                rows.append(row)
    return rows


def parse_mock_exam() -> list[dict]:
    exam_text = MOCK_EXAM_PATH.read_text(encoding="utf-8", errors="replace")
    answer_text = MOCK_ANSWERS_PATH.read_text(encoding="utf-8", errors="replace")
    rows = []
    paper_blocks = re.split(r"\n## Paper\s+", exam_text)
    answer_blocks = {int(m.group(1)): m.group(2) for m in re.finditer(r"\n## Paper\s+(\d+)(.*?)(?=\n## Paper\s+\d+|\Z)", answer_text, re.S)}
    for block in paper_blocks[1:]:
        paper_match = re.match(r"(\d+)", block)
        if not paper_match:
            continue
        paper = int(paper_match.group(1))
        wine_section = re.search(r"\n### Wines\s*\n(.*?)(?:\n---\n|\Z)", block, re.S)
        wine_lookup = {}
        if wine_section:
            for line in wine_section.group(1).splitlines():
                m = re.match(r"\s*(\d+)\.\s+(.+)", line)
                if m:
                    wine_lookup[int(m.group(1))] = m.group(2).strip()
        for q_match in re.finditer(r"\n### Question\s+(\d+)\s*\n(.*?)(?=\n---\n\n### Question|\n---\n\n### Wines|\Z)", block, re.S):
            qn = int(q_match.group(1))
            qtext = q_match.group(2)
            slots = []
            for range_match in re.finditer(r"Wines?\s+(\d+)(?:\s*(?:to|-)\s*(\d+))?", qtext, re.I):
                start = int(range_match.group(1))
                end = int(range_match.group(2) or start)
                slots.extend(range(start, end + 1))
            slots = sorted(set(s for s in slots if s in wine_lookup))
            family, subtype, tags = infer_family_from_text(qtext, paper)
            answer_block = answer_blocks.get(paper, "")
            answer_q = ""
            aq = re.search(rf"\n### Question\s+{qn}\s*(.*?)(?=\n---\n\n### Question|\n---\n\n## Paper|\Z)", answer_block, re.S)
            if aq:
                answer_q = aq.group(1)
            common_variety = infer_common_variety(qtext + " " + answer_q)
            wines = []
            for slot in slots:
                text = wine_lookup[slot]
                per_wine_answer = extract_mock_wine_text(answer_q, slot) or answer_q
                blob = normalize(text + " " + per_wine_answer)
                variety = infer_common_variety(text + " " + per_wine_answer) or common_variety or clean_value(re.split(r"[,.;]", text)[0])
                country = "unknown"
                for c in ["France", "Australia", "Germany", "Austria", "South Africa", "New Zealand", "Italy", "Spain", "England", "Portugal", "Hungary", "Canada"]:
                    if c.lower() in normalize(text):
                        country = c
                region = "unknown"
                location_match = re.search(r"(?:\d{4}|NV)\.?\s+(.+?)\s*\(", text)
                if location_match:
                    bits = [b.strip(" .") for b in location_match.group(1).split(",") if b.strip(" .")]
                    if bits:
                        region = bits[0]
                appellation = infer_appellation_from_line(text)
                style = "sparkling" if any(t in blob for t in ["sparkling", "cremant", "cava", "cuvee"]) else "still_dry"
                if any(t in blob for t in ["fortified", "port", "madeira", "sherry"]):
                    style = "fortified"
                if any(t in blob for t in ["sweet", "asz", "icewine", "beerenauslese", "auslese", "demi-sec"]):
                    rs = "sweet_or_off_dry"
                else:
                    rs = "dry"
                oak = "new_or_visible" if any(t in blob for t in ["new oak", "barrique", "vanilla", "toast", "cigar", "cedar"]) else "none_or_neutral"
                pseudo_fm = {
                    "style_category": style,
                    "oak_signature": oak,
                    "rs_level": rs,
                    "structural_profile": structural_bucket({}, per_wine_answer, text),
                }
                features = method_features(pseudo_fm, per_wine_answer)
                price = "unknown"
                line_blob = normalize(text)
                if "mouton rothschild" in line_blob:
                    price = "luxury"
                elif any(t in line_blob for t in ["gruaud-larose", "pichon comtesse"]):
                    price = "super_premium"
                elif "chateau de pez" in line_blob or "chateau de pez" in blob or "chāteau de pez" in blob:
                    price = "premium"
                elif any(t in blob for t in ["first growth", "mouton", "£80", "£100", "150+", "collector"]):
                    price = "luxury"
                elif any(t in blob for t in ["second growth", "grand cru", "barolo", "prephylloxera", "£60"]):
                    price = "super_premium"
                elif any(t in blob for t in ["£30", "£35", "premium", "gran reserva", "sancerre", "pouilly", "nyetimber"]):
                    price = "premium"
                elif any(t in blob for t in ["£15", "£20", "value", "affordable"]):
                    price = "mainstream"
                wines.append(
                    {
                        "wine_id": f"mock_p{paper}_w{slot}",
                        "slot": slot,
                        "wine_text": text,
                        "variety": variety,
                        "country": country,
                        "region": clean_value(region),
                        "appellation": appellation,
                        "producer": "unknown",
                        "style_category": style,
                        "oak_signature": oak,
                        "rs_level": rs,
                        "structural_profile": pseudo_fm["structural_profile"],
                        "method_signature": method_signature(features),
                        "price_band": price,
                        "commercial_tier": price,
                        "benchmark_status": infer_benchmark_from_blob(blob),
                        "question_role": "unknown",
                        "curveball_level": "unknown",
                        "maturity_role": infer_maturity_from_line(text),
                    }
                )
            scored = score_question(wines)
            row = {
                "qid": f"mock_full_2026_05_26_v6_p{paper}_q{qn}",
                "year": 2026,
                "paper": paper,
                "question": qn,
                "family": family,
                "subtype": subtype,
                "taxonomy_available": False,
                "combined_tags": tags,
                "question_text": qtext,
                "wines": wines,
                **scored,
            }
            row.update(fit_assessment(row))
            rows.append(row)
    return rows


GRAPES = [
    "sauvignon blanc",
    "chenin blanc",
    "gewurztraminer",
    "riesling",
    "chardonnay",
    "pinot gris",
    "pinot noir",
    "syrah",
    "shiraz",
    "cabernet sauvignon",
    "merlot",
    "sangiovese",
    "nebbiolo",
    "nerello mascalese",
    "aglianico",
    "muscat",
    "semillon",
    "xarel-lo",
    "macabeo",
    "parellada",
    "malvasia",
    "furmint",
]


def infer_common_variety(text: str) -> str:
    blob = normalize(text)
    hits = [grape for grape in GRAPES if grape in blob]
    if not hits:
        return ""
    # Prefer longer names so "pinot noir" wins over "pinot".
    hits.sort(key=len, reverse=True)
    return hits[0].replace("shiraz", "syrah")


def extract_mock_wine_text(answer_q: str, slot: int) -> str:
    pattern = re.compile(
        rf"(?:(?:\*+)?Wine\s+{slot}\b.*?)(?=(?:\n\n\*+Wine\s+\d+\b)|(?:\n\n---)|(?:\n\n## Proposed annotation)|\Z)",
        re.S | re.I,
    )
    return "\n\n".join(pattern.findall(answer_q))


def infer_appellation_from_line(text: str) -> str:
    head = text.split(".", 1)[0]
    before_comma = clean_value(head.split(",", 1)[0])
    for token in [
        "sancerre",
        "menetou-salon",
        "pouilly-fume",
        "saint-joseph",
        "barossa valley",
        "swartland",
        "hawke's bay",
        "saint-estephe",
        "saint-julien",
        "pauillac",
        "chianti classico",
        "barolo",
        "etna rosso",
        "aglianico del vulture",
        "cremant de loire",
        "cava",
        "nyetimber",
        "vouvray",
    ]:
        if token in before_comma:
            return token
    return before_comma


def infer_benchmark_from_blob(blob: str) -> str:
    if any(t in blob for t in ["first growth", "grand cru", "barolo", "benchmark", "iconic", "mouton", "pichon", "d'quem", "yquem"]):
        return "iconic_or_classic_benchmark"
    if any(t in blob for t in ["cru bourgeois", "gran reserva", "sancerre", "pouilly", "nyetimber", "gramona"]):
        return "regional_benchmark"
    if any(t in blob for t in ["value", "commercial", "entry", "affordable"]):
        return "commercial_foil"
    return "unknown"


def infer_maturity_from_line(text: str) -> str:
    match = re.search(r"\b(19|20)\d{2}\b", text)
    if not match:
        return "non_vintage_or_unknown"
    vintage = int(match.group(0))
    age = 2026 - vintage
    if age <= 2:
        return "young_primary"
    if age <= 6:
        return "developing"
    return "mature_tertiary"


def aggregate_norms(rows: list[dict]) -> dict:
    groups = defaultdict(list)
    for row in rows:
        groups[f"paper:{row['paper']}"].append(row)
        groups[f"family:{row['family']}"].append(row)
        groups[f"subtype:{row['subtype']}"].append(row)
        groups[f"paper_family:P{row['paper']}_{row['family']}"].append(row)
        for tag in row["combined_tags"]:
            groups[f"tag:{tag}"].append(row)
    norms = {}
    for group, items in groups.items():
        axis_means = {
            axis: round(mean([row["axis_scores"][axis] for row in items]), 3)
            for axis in AXES
        }
        strong_axis_rates = {
            axis: round(sum(1 for row in items if row["axis_scores"][axis] >= 0.45) / len(items), 3)
            for axis in AXES
        }
        norms[group] = {
            "n": len(items),
            "axis_means": axis_means,
            "active_axis_rates": strong_axis_rates,
            "fit_status": dict(Counter(row["fit_status"] for row in items)),
            "top_active_axes": sorted(strong_axis_rates, key=strong_axis_rates.get, reverse=True)[:4],
        }
    return norms


def mock_diagnostics(mock_rows: list[dict], norms: dict) -> list[dict]:
    diagnostics = []
    for row in mock_rows:
        keys = [
            f"subtype:{row['subtype']}",
            f"paper_family:P{row['paper']}_{row['family']}",
            f"family:{row['family']}",
        ]
        norm = next((norms[k] for k in keys if k in norms and norms[k]["n"] >= 3), None)
        below = []
        if norm:
            for axis in AXES:
                if norm["active_axis_rates"][axis] >= 0.6 and row["axis_scores"][axis] < 0.45:
                    below.append(axis)
        diagnostics.append(
            {
                "qid": row["qid"],
                "family": row["family"],
                "subtype": row["subtype"],
                "fit_status": row["fit_status"],
                "critical_flags": row["critical_flags"],
                "below_historical_norm_axes": below,
                "active_axes": row["active_axes"],
                "expected_axes": row["expected_axes"],
            }
        )
    return diagnostics


def axis_summary_line(axis_scores: dict[str, float]) -> str:
    return ", ".join(f"{axis}={axis_scores[axis]:.2f}" for axis in AXES)


def render_md(rows: list[dict], norms: dict, mock_rows: list[dict], mock_diag: list[dict]) -> str:
    total = len(rows)
    fit_counts = Counter(row["fit_status"] for row in rows)
    family_counts = Counter(row["family"] for row in rows)
    lines = [
        "# Wine Selection Logic By Question Type",
        "",
        "This report scores how the MW historical practical corpus chooses wines relative to question type. It is intended as the rule base for the mock exam writer: the stem defines the expected contrast axes, and the wine set must actually deliver those contrasts.",
        "",
        "Axes scored per question:",
        "",
    ]
    for axis in AXES:
        lines.append(f"- `{axis}`: {AXIS_LABELS[axis]}")
    lines.extend(
        [
            "",
            "Scores are deterministic proxies from `data/wine_research`, historical classification, price-tier analysis, and question taxonomy tags. A score of `0.45+` means the axis is meaningfully active; `0.75+` means high diversity.",
            "",
            "## Corpus Summary",
            "",
            f"- Historical questions scored: `{total}`",
            f"- Fit statuses: {', '.join(f'{k}={v}' for k, v in fit_counts.most_common())}",
            f"- Family counts: {', '.join(f'{k}={v}' for k, v in sorted(family_counts.items()))}",
            "",
            "## Family Norms",
            "",
        ]
    )
    for family in sorted(family_counts):
        key = f"family:{family}"
        norm = norms[key]
        top_axes = ", ".join(norm["top_active_axes"])
        means = ", ".join(f"{axis}={norm['axis_means'][axis]:.2f}" for axis in norm["top_active_axes"])
        lines.append(f"- `{family}` (`n={norm['n']}`): main active axes = {top_axes}; means: {means}")

    lines.extend(["", "## Subtype Rules", ""])
    for key in sorted(k for k in norms if k.startswith("subtype:")):
        norm = norms[key]
        if norm["n"] < 2:
            continue
        subtype = key.split(":", 1)[1]
        top_axes = ", ".join(norm["top_active_axes"])
        rates = ", ".join(f"{axis}={norm['active_axis_rates'][axis]:.0%}" for axis in norm["top_active_axes"])
        lines.append(f"- `{subtype}` (`n={norm['n']}`): expect {top_axes}; active rates {rates}")

    lines.extend(
        [
            "",
            "## Mock v6 Diagnostics",
            "",
        ]
    )
    for diag in mock_diag:
        row = next(r for r in mock_rows if r["qid"] == diag["qid"])
        flags = "; ".join(diag["critical_flags"]) if diag["critical_flags"] else "none"
        below = ", ".join(diag["below_historical_norm_axes"]) if diag["below_historical_norm_axes"] else "none"
        active = ", ".join(diag["active_axes"]) if diag["active_axes"] else "none"
        lines.append(f"- `{diag['qid']}` `{diag['family']}/{diag['subtype']}`: fit=`{diag['fit_status']}`; active={active}; below historical norm={below}; critical={flags}")
        lines.append(f"  - scores: {axis_summary_line(row['axis_scores'])}")

    lines.extend(
        [
            "",
            "## Hard Rules For The Exam Writer",
            "",
            "- `F1 same variety`: the shared grape is not enough. Require origin/style/structure spread; add winemaking or maturity spread when those words appear in the stem.",
            "- `F2 same origin`: the shared place is not enough. Require variety/style/sub-region/classification spread inside that origin.",
            "- `F3 blend logic`: require visible blend-composition or varietal-role differences, plus style or structure differences.",
            "- `F4 mixed breadth`: require high independence across variety and origin; avoid hidden overlinking unless tagged `F4b/F4c`.",
            "- `F5 method dominant`: require high winemaking/method diversity. Method should be the strongest active axis.",
            "- `F6 style mechanism`: require structural/style spread on the named mechanism: RS, alcohol, tannin/body, maturity, or commercial tier.",
            "- `F7 hierarchy/quality`: require price-quality, benchmark, classification, producer, maturity, or commercial-tier ladder. Premium-heavy flights are acceptable only with an explicit hierarchy hook.",
            "- Any `commercial-position-led` question needs price/channel spread.",
            "- Any `quality-led` ranking question needs either quality-tier spread or an explicit origin/classification/producer hierarchy.",
            "- Any `method-led` quality question needs at least two distinct winemaking signatures for 3 wines and at least three for 4 wines, unless the stem explicitly tells candidates the axis is origin/classification instead.",
            "",
            "## Agent Team Design",
            "",
            "Use agents as reviewers over deterministic scorecards, not as the primary source of facts:",
            "",
            "- Question Taxonomist: checks family/subtype and expected axes.",
            "- Wine Metadata Analyst: checks source-backed producer, origin, variety, method, price and quality fields.",
            "- Diversity Scorer: verifies the generated wine set meets required active axes.",
            "- Historical Pattern Auditor: compares the mock against family/subtype norms and flags outliers.",
            "- Mock Exam Critic: decides whether to revise the stem or change the wines when the expected axis is not delivered.",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    rows = historical_rows()
    norms = aggregate_norms(rows)
    mock_rows = parse_mock_exam()
    diagnostics = mock_diagnostics(mock_rows, norms)
    OUT_JSON_PATH.write_text(
        json.dumps(
            {
                "historical_questions": rows,
                "norms": norms,
                "mock_v6_questions": mock_rows,
                "mock_v6_diagnostics": diagnostics,
            },
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    OUT_MD_PATH.write_text(render_md(rows, norms, mock_rows, diagnostics), encoding="utf-8")
    print(f"OK: wrote {OUT_JSON_PATH}")
    print(f"OK: wrote {OUT_MD_PATH}")


if __name__ == "__main__":
    main()
