from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
EXAMS_PATH = ROOT / "data" / "exams.json"
RESEARCH_DIR = ROOT / "data" / "wine_research"
CLASSIFICATION_PATH = ROOT / "data" / "historical_wine_classification.json"

BACKTEST_JSON_PATH = ROOT / "data" / "exam_predictor_backtest.json"
BACKTEST_MD_PATH = ROOT / "outputs" / "backtest_reports" / "exam_predictor_backtest.md"
FORECAST_JSON_PATH = ROOT / "data" / "predicted_2026_exam_profile.json"
FORECAST_MD_PATH = ROOT / "outputs" / "mock_exams" / "predicted_2026_exam_profile.md"

BACKTEST_YEARS = [2022, 2023, 2024, 2025]
FUTURE_YEAR = 2026
RECENT_STRUCTURE_START_YEAR = 2018


VARIETY_ALIASES = {
    "shiraz": "syrah",
    "syrah/shiraz": "syrah",
    "spatburgunder": "pinot noir",
    "pinot grigio": "pinot gris",
    "gewÃ¼rztraminer": "gewurztraminer",
    "gewurztraminer": "gewurztraminer",
    "gruner veltliner": "gruner veltliner",
    "grÃ¼ner veltliner": "gruner veltliner",
    "mourvÃ¨dre": "mourvedre",
    "xarel-lo": "xarel-lo",
    "xarelÂ·lo": "xarel-lo",
    "trebbiano toscano": "trebbiano",
}

KNOWN_VARIETIES = [
    "cabernet sauvignon",
    "cabernet franc",
    "pinot noir",
    "pinot gris",
    "pinot grigio",
    "sauvignon blanc",
    "chenin blanc",
    "semillon",
    "chardonnay",
    "riesling",
    "gewurztraminer",
    "gruner veltliner",
    "albarino",
    "viognier",
    "marsanne",
    "roussanne",
    "grenache blanc",
    "clairette",
    "muscat",
    "torrontes",
    "garganega",
    "savagnin",
    "chinuri",
    "moschofilero",
    "arneis",
    "grillo",
    "furmint",
    "harslevelu",
    "melon de bourgogne",
    "palomino",
    "glera",
    "xarel-lo",
    "macabeo",
    "parellada",
    "vidal",
    "trebbiano",
    "malvasia",
    "syrah",
    "shiraz",
    "tempranillo",
    "sangiovese",
    "nebbiolo",
    "gamay",
    "malbec",
    "carmenere",
    "zinfandel",
    "petite sirah",
    "tannat",
    "xinomavro",
    "agiorgitiko",
    "touriga nacional",
    "touriga franca",
    "zweigelt",
    "blaufrankisch",
    "lagrein",
    "pinotage",
    "corvina",
    "corvinone",
    "mourvedre",
    "grenache",
    "cinsault",
    "merlot",
]


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


def canonical_variety_token(token: str) -> str:
    token = normalize_text(token)
    token = re.sub(r"\([^)]*\)", "", token)
    token = re.sub(r"\b\d+%?\b", "", token)
    token = token.replace("&", "/")
    token = token.replace("%", " ")
    token = re.sub(r"\s+", " ", token).strip(" -/,;.")
    return VARIETY_ALIASES.get(token, token)


def classify_variety_family(varieties: list[str]) -> str:
    vset = set(varieties)
    if {"chardonnay", "pinot noir"} <= vset:
        return "sparkling_classic_blend"
    if {"sauvignon blanc", "semillon"} <= vset:
        return "bordeaux_white_blend"
    if {"marsanne", "roussanne"} & vset or {"grenache blanc", "clairette"} & vset:
        return "rhone_white_blend"
    if {"cabernet sauvignon", "merlot", "cabernet franc"} & vset and len(vset) >= 2:
        return "bordeaux_red_family"
    if {"grenache", "syrah", "mourvedre", "cinsault"} & vset and len(vset) >= 2:
        return "gsm_rhone_red_blend"
    if {"touriga nacional", "touriga franca"} & vset:
        return "douro_red_family"
    if {"trebbiano", "malvasia"} <= vset:
        return "vin_santo_family"
    if {"furmint", "harslevelu"} & vset:
        return "tokaj_family"
    if len(vset) == 1:
        return next(iter(vset))
    if vset:
        return "/".join(sorted(vset))
    return "unknown"


def extract_variety_family(markdown_body: str) -> str:
    match = re.search(r"^- Grape variet(?:y|ies):\s*(.+)$", markdown_body, re.MULTILINE)
    if not match:
        return "unknown"
    raw = match.group(1).strip()
    normalized = normalize_text(raw)
    cleaned = []
    for grape in KNOWN_VARIETIES:
        pattern = r"\b" + re.escape(normalize_text(grape)) + r"\b"
        if re.search(pattern, normalized):
            cleaned.append(canonical_variety_token(grape))
    unique = []
    for item in cleaned:
        if item not in unique:
            unique.append(item)
    if not unique:
        token = canonical_variety_token(raw)
        return token or "unknown"
    return classify_variety_family(unique)


def parse_vintage_year(vintage: str) -> int | None:
    match = re.search(r"\b(19|20)\d{2}\b", vintage or "")
    return int(match.group(0)) if match else None


def question_features(text: str, paper: int, wine_count: int) -> dict[str, bool | int | str]:
    t = normalize_text(text)
    flags: dict[str, bool | int | str] = {
        "wine_count": wine_count,
        "pairs": "pair" in t or "pairs" in t,
        "same_single_variety": "same single grape variety" in t or "same grape variety" in t,
        "predominant_variety": "predominant grape variety" in t,
        "same_country": "same country" in t or "from italy" in t or "from europe" in t or "from the americas" in t,
        "same_region": "same region" in t,
        "same_producer": "same producer" in t,
        "same_vintage": "same vintage" in t or "different vintage" in t or "different vintages" in t,
        "different_countries": "different countries" in t or "different european countries" in t or "three different countries" in t or "four different countries" in t,
        "different_varieties": "different grape varieties" in t or "different single grape varieties" in t or "different predominant grape varieties" in t,
        "mixed_bag": "mixed bag" in t,
        "blends": "blend" in t or "blends" in t,
        "sparkling": "sparkling" in t or "cava" in t or "champagne" in t or "sekt" in t,
        "fortified": "fortified" in t,
        "residual_sugar": "residual sugar" in t,
        "rose": "rose" in t or "rosÃ©" in t,
        "same_country_region": "same country and region" in t,
        "same_region_diff_subregions": "different sub-regions" in t or "different subregions" in t,
        "classic_europe": "classic european" in t or "classic western european" in t,
        "americas": "americas" in t or "north and south america" in t,
        "producer_vertical": "different vintage" in t or "different vintages" in t,
        "human_vs_natural": "human inputs versus natural factors" in t,
        "quality_focus": "quality" in t or "commercial position" in t,
        "maturity_focus": "maturity" in t or "development" in t,
        "method_focus": "method of production" in t or "winemaking" in t or "fortification" in t,
    }

    family = "F4"
    subcategory = "breadth"
    if paper == 3 and flags["same_single_variety"] and (flags["sparkling"] or flags["fortified"] or flags["residual_sugar"]):
        family, subcategory = "F1", "same_variety_cross_style"
    elif flags["same_single_variety"] and flags["same_country"]:
        family, subcategory = "F1", "same_variety_same_country"
    elif flags["same_single_variety"] and flags["same_region"]:
        family, subcategory = "F1", "same_variety_same_region"
    elif flags["same_single_variety"] or flags["predominant_variety"]:
        family, subcategory = "F1", "same_variety_cross_origin"
    elif flags["same_country_region"] or (flags["same_region"] and flags["different_varieties"]):
        family, subcategory = "F2", "same_region_internal_diversity"
    elif flags["same_country"] or flags["same_region"]:
        family, subcategory = "F2", "same_origin_comparative"
    elif flags["blends"]:
        family, subcategory = "F3", "blend_logic"
    elif flags["mixed_bag"]:
        family, subcategory = "F4", "mixed_bag"
    elif flags["human_vs_natural"]:
        family, subcategory = "F5", "human_vs_natural"
    elif paper == 3 and flags["sparkling"]:
        family, subcategory = "F5", "sparkling_method"
    elif paper == 3 and flags["fortified"]:
        family, subcategory = "F5", "fortification_maturation"
    elif paper == 3 and flags["residual_sugar"]:
        family, subcategory = "F6", "sweetness_axis"
    elif flags["maturity_focus"]:
        family, subcategory = "F6", "maturity_axis"
    elif flags["quality_focus"]:
        family, subcategory = "F7", "quality_calibration"
    elif flags["different_countries"] or flags["different_varieties"]:
        family, subcategory = "F4", "independent_breadth"

    flags["family"] = family
    flags["subcategory"] = subcategory
    flags["archetype"] = f"p{paper}:{family}:{subcategory}"
    return flags


def load_research_metadata() -> dict[str, dict[str, str]]:
    out: dict[str, dict[str, str]] = {}
    for path in RESEARCH_DIR.glob("*.md"):
        fm, body = parse_frontmatter(path)
        fm["variety_family"] = extract_variety_family(body)
        out[path.stem] = fm
    return out


def load_classification() -> dict[str, dict]:
    if not CLASSIFICATION_PATH.exists():
        return {}
    rows = json.loads(CLASSIFICATION_PATH.read_text(encoding="utf-8"))
    return {row["wine_id"]: row for row in rows}


def build_question_rows() -> list[dict]:
    exams = json.loads(EXAMS_PATH.read_text(encoding="utf-8"))
    research = load_research_metadata()
    classification = load_classification()
    rows: list[dict] = []
    for exam in exams:
        year = exam["year"]
        for paper in exam["papers"]:
            paper_n = paper["paper"]
            for q in paper["questions"]:
                features = question_features(q["text"], paper_n, len(q["wines"]))
                wine_ids = [f"{year}_p{paper_n}_w{slot}" for slot in q["wines"]]
                attrs = [research[w] for w in wine_ids if w in research]
                class_rows = [classification[w] for w in wine_ids if w in classification]
                variety_families = sorted({a.get("variety_family", "unknown") for a in attrs if a.get("variety_family")})
                countries = sorted({a.get("country", "Unknown") for a in attrs if a.get("country")})
                regions = sorted({a.get("region", "Unknown") for a in attrs if a.get("region")})
                styles = sorted({a.get("style_category", "unknown") for a in attrs if a.get("style_category")})
                rs_levels = sorted({a.get("rs_level", "unknown") for a in attrs if a.get("rs_level")})
                vintages = [parse_vintage_year(a.get("vintage", "")) for a in attrs]
                vintages = [v for v in vintages if v is not None]
                rows.append(
                    {
                        "year": year,
                        "paper": paper_n,
                        "question": q["n"],
                        "text": q["text"],
                        "wine_ids": wine_ids,
                        "features": features,
                        "archetype": features["archetype"],
                        "family": features["family"],
                        "subcategory": features["subcategory"],
                        "variety_families": variety_families,
                        "countries": countries,
                        "regions": regions,
                        "styles": styles,
                        "rs_levels": rs_levels,
                        "benchmark_statuses": sorted({r["benchmark_status"] for r in class_rows if r.get("benchmark_status")}),
                        "question_roles": sorted({r["question_role"] for r in class_rows if r.get("question_role")}),
                        "commercial_tiers": sorted({r["commercial_tier"] for r in class_rows if r.get("commercial_tier")}),
                        "curveball_levels": sorted({r["curveball_level"] for r in class_rows if r.get("curveball_level")}),
                        "maturity_roles": sorted({r["maturity_role"] for r in class_rows if r.get("maturity_role")}),
                        "mean_vintage": round(sum(vintages) / len(vintages), 1) if vintages else None,
                    }
                )
    return rows


def _recency_gap(train_year: int, target_year: int) -> int:
    return max(target_year - train_year, 0)


def recency_weight(train_year: int, target_year: int) -> float:
    gap = _recency_gap(train_year, target_year)
    return 0.80 ** gap


def structure_recency_weight(train_year: int, target_year: int) -> float:
    gap = _recency_gap(train_year, target_year)
    weight = 0.72 ** gap
    if gap >= 8:
        weight *= 0.45
    return max(weight, 0.01)


def label_recency_weight(train_year: int, target_year: int) -> float:
    gap = _recency_gap(train_year, target_year)
    weight = 0.86 ** gap
    if gap >= 10:
        weight *= 0.75
    return max(weight, 0.03)


def split_training_rows(training_rows: list[dict]) -> tuple[list[dict], list[dict]]:
    recent_structure_rows = [row for row in training_rows if row["year"] >= RECENT_STRUCTURE_START_YEAR]
    if not recent_structure_rows:
        recent_structure_rows = training_rows[:]
    return recent_structure_rows, training_rows


def predict_question_count(training_rows: list[dict], paper: int, target_year: int) -> int:
    yearly_counts: dict[int, int] = defaultdict(int)
    for row in training_rows:
        if row["paper"] == paper:
            yearly_counts[row["year"]] += 1
    weighted_sum = 0.0
    total_weight = 0.0
    for year, count in yearly_counts.items():
        w = structure_recency_weight(year, target_year)
        weighted_sum += w * count
        total_weight += w
    if not total_weight:
        return 4 if paper in {1, 2} else 3
    rounded = int(round(weighted_sum / total_weight))
    if paper == 3:
        return max(3, min(5, rounded))
    return max(3, min(4, rounded))


def last_seen_gap(training_rows: list[dict], paper: int, key: str, value: str, target_year: int) -> int:
    years = [row["year"] for row in training_rows if row["paper"] == paper and row.get(key) == value]
    if not years:
        return 99
    return target_year - max(years)


def feature_overlap_score(a: dict, b: dict) -> float:
    score = 0.0
    for key in [
        "wine_count",
        "pairs",
        "same_single_variety",
        "predominant_variety",
        "same_country",
        "same_region",
        "same_producer",
        "same_vintage",
        "different_countries",
        "different_varieties",
        "mixed_bag",
        "blends",
        "sparkling",
        "fortified",
        "residual_sugar",
        "rose",
        "classic_europe",
        "americas",
        "human_vs_natural",
        "quality_focus",
        "maturity_focus",
        "method_focus",
    ]:
        if a.get(key) and b.get(key):
            score += 1.0
    if a.get("family") == b.get("family"):
        score += 1.5
    if a.get("subcategory") == b.get("subcategory"):
        score += 1.0
    return score


def slot_archetype_score(
    archetype: str,
    training_rows: list[dict],
    paper: int,
    slot: int,
    target_year: int,
    chosen: list[dict],
) -> float:
    base = 0.0
    slot_bonus = 0.0
    family = archetype.split(":")[1]
    last_year = None
    for row in training_rows:
        if row["paper"] != paper or row["archetype"] != archetype:
            continue
        w = structure_recency_weight(row["year"], target_year)
        base += w
        if row["question"] == slot:
            slot_bonus += 1.5 * w
        if last_year is None or row["year"] > last_year:
            last_year = row["year"]

    gap = 99 if last_year is None else target_year - last_year
    gap_bonus = min(gap, 4) * 0.25
    return_bonus = 1.0 if gap >= 3 else 0.0

    diversity_penalty = 0.0
    transition_bonus = 0.0
    if chosen:
        previous = chosen[-1]
        if previous["family"] == family:
            diversity_penalty += 2.0
        if any(item["archetype"] == archetype for item in chosen):
            diversity_penalty += 2.5
        if previous["family"] != family:
            transition_bonus += 0.6

    return base + slot_bonus + gap_bonus + return_bonus + transition_bonus - diversity_penalty


def predict_paper_sequence(training_rows: list[dict], paper: int, target_year: int, forced_count: int | None = None) -> list[dict]:
    count = forced_count or predict_question_count(training_rows, paper, target_year)
    archetypes = sorted({row["archetype"] for row in training_rows if row["paper"] == paper})
    chosen: list[dict] = []
    for slot in range(1, count + 1):
        best = None
        best_score = float("-inf")
        for archetype in archetypes:
            score = slot_archetype_score(archetype, training_rows, paper, slot, target_year, chosen)
            if score > best_score:
                best_score = score
                parts = archetype.split(":")
                best = {
                    "slot": slot,
                    "archetype": archetype,
                    "family": parts[1],
                    "subcategory": parts[2],
                    "score": round(score, 3),
                }
        if best:
            chosen.append(best)
    return chosen


def predict_question_labels(
    target_row: dict,
    training_rows: list[dict],
    label_key: str,
    top_k: int = 3,
) -> list[str]:
    weighted_counts: Counter[str] = Counter()
    for row in training_rows:
        if row["paper"] != target_row["paper"]:
            continue
        sim = feature_overlap_score(target_row["features"], row["features"])
        if sim <= 0:
            continue
        weight = sim * label_recency_weight(row["year"], target_row["year"])
        if row["question"] == target_row["question"]:
            weight *= 1.35
        if row["family"] == target_row["family"]:
            weight *= 1.25
        for label in row.get(label_key, []):
            if not label or label == "unknown":
                continue
            weighted_counts[label] += weight

    gap_adjusted = Counter()
    for label, score in weighted_counts.items():
        gap = last_seen_gap(training_rows, target_row["paper"], label_key, label, target_row["year"])
        gap_bonus = 0.10 * min(gap, 4)
        gap_adjusted[label] = score + gap_bonus
    return [label for label, _ in gap_adjusted.most_common(top_k)]


def score_topk(actual: list[str], predicted: list[str]) -> dict[str, float | bool]:
    actual_set = {x for x in actual if x and x != "unknown"}
    predicted_set = {x for x in predicted if x and x != "unknown"}
    if not actual_set:
        return {"hit": False, "recall": 0.0}
    inter = actual_set & predicted_set
    return {"hit": bool(inter), "recall": len(inter) / len(actual_set)}


def run_backtest(rows: list[dict]) -> dict:
    results: dict[str, dict] = {"years": {}, "summary": {}}
    structure_hits = []
    variety_hits = []
    country_hits = []
    style_hits = []
    role_hits = []
    variety_recalls = []
    country_recalls = []
    style_recalls = []
    role_recalls = []

    for test_year in BACKTEST_YEARS:
        train_rows = [r for r in rows if r["year"] < test_year]
        structure_rows, label_rows = split_training_rows(train_rows)
        test_rows = [r for r in rows if r["year"] == test_year]
        year_result = {"papers": {}, "question_level": []}

        for paper in [1, 2, 3]:
            paper_rows = [r for r in test_rows if r["paper"] == paper]
            predicted_seq = predict_paper_sequence(structure_rows, paper, test_year, forced_count=len(paper_rows))
            actual_counter = Counter(r["archetype"] for r in paper_rows)
            predicted_counter = Counter(item["archetype"] for item in predicted_seq)
            overlap = sum(min(actual_counter[k], predicted_counter[k]) for k in set(actual_counter) | set(predicted_counter))
            precision = overlap / sum(predicted_counter.values()) if predicted_counter else 0.0
            recall = overlap / sum(actual_counter.values()) if actual_counter else 0.0
            exact_count_match = sum(predicted_counter.values()) == sum(actual_counter.values())
            year_result["papers"][str(paper)] = {
                "actual_structures": dict(actual_counter),
                "predicted_structures": dict(predicted_counter),
                "predicted_sequence": predicted_seq,
                "precision": precision,
                "recall": recall,
                "exact_count_match": exact_count_match,
            }
            structure_hits.append((precision + recall) / 2 if actual_counter else 0.0)

        for row in test_rows:
            predicted_varieties = predict_question_labels(row, label_rows, "variety_families")
            predicted_countries = predict_question_labels(row, label_rows, "countries")
            predicted_styles = predict_question_labels(row, label_rows, "styles")
            predicted_roles = predict_question_labels(row, label_rows, "question_roles")

            variety_score = score_topk(row["variety_families"], predicted_varieties)
            country_score = score_topk(row["countries"], predicted_countries)
            style_score = score_topk(row["styles"], predicted_styles)
            role_score = score_topk(row["question_roles"], predicted_roles)

            variety_hits.append(variety_score["hit"])
            country_hits.append(country_score["hit"])
            style_hits.append(style_score["hit"])
            role_hits.append(role_score["hit"])
            variety_recalls.append(variety_score["recall"])
            country_recalls.append(country_score["recall"])
            style_recalls.append(style_score["recall"])
            role_recalls.append(role_score["recall"])

            year_result["question_level"].append(
                {
                    "paper": row["paper"],
                    "question": row["question"],
                    "family": row["family"],
                    "subcategory": row["subcategory"],
                    "archetype": row["archetype"],
                    "actual_varieties": row["variety_families"],
                    "predicted_varieties_top3": predicted_varieties,
                    "actual_countries": row["countries"],
                    "predicted_countries_top3": predicted_countries,
                    "actual_styles": row["styles"],
                    "predicted_styles_top3": predicted_styles,
                    "actual_roles": row["question_roles"],
                    "predicted_roles_top3": predicted_roles,
                    "variety_top3_hit": variety_score["hit"],
                    "country_top3_hit": country_score["hit"],
                    "style_top3_hit": style_score["hit"],
                    "role_top3_hit": role_score["hit"],
                    "variety_recall": variety_score["recall"],
                    "country_recall": country_score["recall"],
                    "style_recall": style_score["recall"],
                    "role_recall": role_score["recall"],
                }
            )

        results["years"][str(test_year)] = year_result

    results["summary"] = {
        "structure_mean_f1_proxy": sum(structure_hits) / len(structure_hits),
        "variety_top3_hit_rate": sum(1 for x in variety_hits if x) / len(variety_hits),
        "country_top3_hit_rate": sum(1 for x in country_hits if x) / len(country_hits),
        "style_top3_hit_rate": sum(1 for x in style_hits if x) / len(style_hits),
        "role_top3_hit_rate": sum(1 for x in role_hits if x) / len(role_hits),
        "variety_mean_recall": sum(variety_recalls) / len(variety_recalls),
        "country_mean_recall": sum(country_recalls) / len(country_recalls),
        "style_mean_recall": sum(style_recalls) / len(style_recalls),
        "role_mean_recall": sum(role_recalls) / len(role_recalls),
    }
    return results


def predict_balance_signals(training_rows: list[dict], paper: int, target_year: int, sequence: list[dict]) -> dict:
    family_gaps = {}
    for item in sequence:
        family_gaps[item["family"]] = last_seen_gap(training_rows, paper, "family", item["family"], target_year)
    repeated_families = [family for family, count in Counter(item["family"] for item in sequence).items() if count > 1]
    return {
        "repeated_families": repeated_families,
        "family_recurrence_gaps": family_gaps,
        "diversity_warning": bool(repeated_families),
    }


def forecast_2026(rows: list[dict]) -> dict:
    training_rows = rows[:]
    structure_rows, label_rows = split_training_rows(training_rows)
    forecast: dict[str, dict] = {"papers": {}}
    for paper in [1, 2, 3]:
        predicted_sequence = predict_paper_sequence(structure_rows, paper, FUTURE_YEAR)
        question_details = []
        for item in predicted_sequence:
            exemplar = next(
                (r for r in label_rows if r["paper"] == paper and r["archetype"] == item["archetype"] and r["question"] == item["slot"]),
                None,
            ) or next(r for r in label_rows if r["paper"] == paper and r["archetype"] == item["archetype"])
            predicted_varieties = predict_question_labels(exemplar | {"year": FUTURE_YEAR}, label_rows, "variety_families")
            predicted_countries = predict_question_labels(exemplar | {"year": FUTURE_YEAR}, label_rows, "countries")
            predicted_styles = predict_question_labels(exemplar | {"year": FUTURE_YEAR}, label_rows, "styles")
            predicted_roles = predict_question_labels(exemplar | {"year": FUTURE_YEAR}, label_rows, "question_roles")
            predicted_benchmarks = predict_question_labels(exemplar | {"year": FUTURE_YEAR}, label_rows, "benchmark_statuses")
            predicted_commercial = predict_question_labels(exemplar | {"year": FUTURE_YEAR}, label_rows, "commercial_tiers")
            predicted_maturity = predict_question_labels(exemplar | {"year": FUTURE_YEAR}, label_rows, "maturity_roles")
            predicted_curveballs = predict_question_labels(exemplar | {"year": FUTURE_YEAR}, label_rows, "curveball_levels")
            question_details.append(
                {
                    **item,
                    "likely_varieties_top3": predicted_varieties,
                    "likely_countries_top3": predicted_countries,
                    "likely_styles_top3": predicted_styles,
                    "likely_roles_top3": predicted_roles,
                    "likely_benchmark_statuses_top3": predicted_benchmarks,
                    "likely_commercial_tiers_top3": predicted_commercial,
                    "likely_maturity_roles_top3": predicted_maturity,
                    "likely_curveball_levels_top3": predicted_curveballs,
                }
            )
        balance = predict_balance_signals(structure_rows, paper, FUTURE_YEAR, predicted_sequence)
        forecast["papers"][str(paper)] = {
            "predicted_question_count": len(predicted_sequence),
            "predicted_structures": dict(Counter(item["archetype"] for item in predicted_sequence)),
            "predicted_sequence": question_details,
            "balance_model": balance,
        }
    return forecast


def render_backtest_md(backtest: dict) -> str:
    lines = [
        "# Predictive Exam Analyzer Backtest",
        "",
        "This report backtests the richer sequence-aware predictor on `2022-2025`.",
        "",
        "The model now has five layers:",
        "- historical wine classification: benchmark, role, curveball, commercial tier, maturity role",
        "- richer question taxonomy, especially for Paper 3 mechanism/style questions",
        "- sequence features by paper and slot",
        "- exam-balance logic: repetition penalty plus recurrence-gap bonus",
        f"- two-model split: recent-era structure model (`{RECENT_STRUCTURE_START_YEAR}+`) plus full-history label model",
        "",
        "## Summary",
        "",
    ]
    s = backtest["summary"]
    lines.extend(
        [
            f"- Structure mean F1 proxy: `{s['structure_mean_f1_proxy']:.3f}`",
            f"- Variety top-3 hit rate: `{s['variety_top3_hit_rate']:.3f}`",
            f"- Country top-3 hit rate: `{s['country_top3_hit_rate']:.3f}`",
            f"- Style top-3 hit rate: `{s['style_top3_hit_rate']:.3f}`",
            f"- Question-role top-3 hit rate: `{s['role_top3_hit_rate']:.3f}`",
            f"- Variety mean recall: `{s['variety_mean_recall']:.3f}`",
            f"- Country mean recall: `{s['country_mean_recall']:.3f}`",
            f"- Style mean recall: `{s['style_mean_recall']:.3f}`",
            f"- Question-role mean recall: `{s['role_mean_recall']:.3f}`",
            "",
            "## Year-by-year",
            "",
        ]
    )
    for year, payload in backtest["years"].items():
        lines.append(f"### {year}")
        lines.append("")
        for paper, paper_payload in payload["papers"].items():
            lines.append(f"- Paper {paper}:")
            lines.append(f"  - structure precision: `{paper_payload['precision']:.3f}`")
            lines.append(f"  - structure recall: `{paper_payload['recall']:.3f}`")
            lines.append(f"  - predicted question count matched actual: `{paper_payload['exact_count_match']}`")
            lines.append(f"  - predicted archetypes: `{paper_payload['predicted_structures']}`")
            lines.append(f"  - actual archetypes: `{paper_payload['actual_structures']}`")
        hits = payload["question_level"]
        var_hit = sum(1 for q in hits if q["variety_top3_hit"]) / len(hits)
        c_hit = sum(1 for q in hits if q["country_top3_hit"]) / len(hits)
        sty_hit = sum(1 for q in hits if q["style_top3_hit"]) / len(hits)
        role_hit = sum(1 for q in hits if q["role_top3_hit"]) / len(hits)
        lines.append(
            f"- Question-level top-3 hit rates: variety `{var_hit:.3f}`, country `{c_hit:.3f}`, style `{sty_hit:.3f}`, role `{role_hit:.3f}`"
        )
        lines.append("")
    lines.extend(
        [
            "## Interpretation",
            "",
            "- The model is still a steering layer, not an oracle.",
            "- Sequence-aware structure prediction is more faithful to how exam papers are assembled than bag-of-archetypes counting.",
            "- The new wine-role labels are most useful for mock-exam design, because they help choose the right job for each wine even when exact producer prediction remains weak.",
        ]
    )
    return "\n".join(lines) + "\n"


def render_forecast_md(forecast: dict) -> str:
    lines = [
        "# Predicted 2026 Exam Profile",
        "",
        "This forecast is intended to guide mock-exam generation with sequence-aware and balance-aware priors.",
        f"It uses recent exams (`{RECENT_STRUCTURE_START_YEAR}+`) for structure and the full historical corpus for wine-family and role labels.",
        "",
    ]
    for paper, payload in forecast["papers"].items():
        lines.append(f"## Paper {paper}")
        lines.append("")
        lines.append(f"- Predicted question count: `{payload['predicted_question_count']}`")
        lines.append(f"- Predicted structure mix: `{payload['predicted_structures']}`")
        lines.append(f"- Balance model: `{payload['balance_model']}`")
        lines.append("")
        lines.append("### Slot-by-slot guidance")
        lines.append("")
        for item in payload["predicted_sequence"]:
            lines.append(f"- Q{item['slot']}: `{item['archetype']}`")
            lines.append(f"  - likely varieties: `{item['likely_varieties_top3']}`")
            lines.append(f"  - likely countries: `{item['likely_countries_top3']}`")
            lines.append(f"  - likely styles: `{item['likely_styles_top3']}`")
            lines.append(f"  - likely wine roles: `{item['likely_roles_top3']}`")
            lines.append(f"  - likely benchmark status: `{item['likely_benchmark_statuses_top3']}`")
            lines.append(f"  - likely commercial tier: `{item['likely_commercial_tiers_top3']}`")
            lines.append(f"  - likely maturity role: `{item['likely_maturity_roles_top3']}`")
            lines.append(f"  - likely curveball level: `{item['likely_curveball_levels_top3']}`")
        lines.append("")
    lines.extend(
        [
            "## How to use this",
            "",
            "- Use the slot-level sequence as a prior for what each question is trying to do.",
            "- Use the wine-role outputs to choose wines by exam function, not just by region or grape.",
            "- Preserve one defensible surprise per paper, but do not build a paper that repeats the same family too often.",
        ]
    )
    return "\n".join(lines) + "\n"


def main() -> None:
    rows = build_question_rows()
    backtest = run_backtest(rows)
    forecast = forecast_2026(rows)

    BACKTEST_JSON_PATH.write_text(json.dumps(backtest, indent=2, ensure_ascii=False), encoding="utf-8")
    BACKTEST_MD_PATH.write_text(render_backtest_md(backtest), encoding="utf-8")
    FORECAST_JSON_PATH.write_text(json.dumps(forecast, indent=2, ensure_ascii=False), encoding="utf-8")
    FORECAST_MD_PATH.write_text(render_forecast_md(forecast), encoding="utf-8")

    print(f"OK: wrote {BACKTEST_JSON_PATH}")
    print(f"OK: wrote {BACKTEST_MD_PATH}")
    print(f"OK: wrote {FORECAST_JSON_PATH}")
    print(f"OK: wrote {FORECAST_MD_PATH}")


if __name__ == "__main__":
    main()
