import json
import statistics
from collections import defaultdict
from pathlib import Path


BASE = Path(__file__).resolve().parent.parent
REPORT_FILE = BASE / "outputs" / "backtest_reports" / "loyo_report.md"

INPUT_FILES = [
    BASE / "data" / "loyo_scores_2015_2016.json",
    BASE / "data" / "loyo_scores_2017_2018.json",
    BASE / "data" / "loyo_scores_2019_2021.json",
    BASE / "data" / "loyo_scores_2022_2023.json",
    BASE / "data" / "loyo_scores_2024_2025.json",
]

METRICS = [
    "top1_variety",
    "top3_variety",
    "top1_region_country",
    "top1_region_subregion",
    "top3_region",
    "candidate_set",
    "mrr_variety",
    "mrr_region",
]


def pct(value):
    return f"{value * 100:.1f}%"


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def known_subregion(value):
    return bool(value) and str(value).strip().lower() != "unknown"


def reciprocal_rank(rank):
    return 1.0 / rank if rank and rank > 0 else 0.0


def coherent_country_hit(country_hit, subregion_hit, actual_subregion):
    # Exact subregion credit implies the country was effectively identified too.
    return bool(country_hit) or (bool(subregion_hit) and known_subregion(actual_subregion))


def coherent_top3_region(region_top3_hit, subregion_hit, actual_subregion):
    # If the exact subregion was captured, top-3 region should also count as a hit.
    return bool(region_top3_hit) or (bool(subregion_hit) and known_subregion(actual_subregion))


def summarize_per_wine(question_id, year, paper, question, per_wine_rows, notes="", style_or_category_scored=False):
    n = len(per_wine_rows)
    return {
        "question_id": question_id,
        "year": year,
        "paper": paper,
        "question": question,
        "wine_count": n,
        "metrics": {
            "top1_variety": sum(1 for w in per_wine_rows if w["top1_variety"]) / n,
            "top3_variety": sum(1 for w in per_wine_rows if w["top3_variety"]) / n,
            "top1_region_country": sum(1 for w in per_wine_rows if w["top1_region_country"]) / n,
            "top1_region_subregion": sum(1 for w in per_wine_rows if w["top1_region_subregion"]) / n,
            "top3_region": sum(1 for w in per_wine_rows if w["top3_region"]) / n,
            "candidate_set": sum(1 for w in per_wine_rows if w["candidate_set"]) / n,
            "mrr_variety": sum(w["mrr_variety"] for w in per_wine_rows) / n,
            "mrr_region": sum(w["mrr_region"] for w in per_wine_rows) / n,
        },
        "notes": notes,
        "style_or_category_scored": style_or_category_scored,
    }


def infer_question_id(item):
    if "question_id" in item:
        return item["question_id"]
    return f"{item['year']}_p{item['paper']}_q{item['question']}"


def normalize_2015_2016(data):
    rows = []
    for item in data["results"]:
        per_wine_rows = []
        for wine in item.get("per_wine", []):
            subregion_hit = bool(wine.get("subregion_hit"))
            region_top3 = wine.get("region_rank", 0) in (1, 2, 3)
            variety_rank = wine.get("variety_rank", 0)
            per_wine_rows.append({
                "top1_variety": variety_rank == 1,
                "top3_variety": 1 <= variety_rank <= 3,
                "top1_region_country": coherent_country_hit(wine.get("region_hit"), subregion_hit, wine.get("actual_subregion")),
                "top1_region_subregion": subregion_hit and known_subregion(wine.get("actual_subregion")),
                "top3_region": coherent_top3_region(region_top3, subregion_hit, wine.get("actual_subregion")),
                "candidate_set": bool(wine.get("cs_hit")),
                "mrr_variety": reciprocal_rank(variety_rank),
                "mrr_region": reciprocal_rank(wine.get("region_rank", 0)),
            })
        rows.append(summarize_per_wine(
            infer_question_id(item),
            item["year"],
            item["paper"],
            item["question"],
            per_wine_rows,
            notes=item.get("notes", ""),
            style_or_category_scored="style-level" in item.get("notes", "").lower(),
        ))
    return rows


def normalize_2017_2018(data):
    rows = []
    for item in data["results"]:
        per_wine_rows = []
        for wine in item.get("per_wine_detail", []):
            top1_region = bool(wine.get("top1_region_hit"))
            top3_region = bool(wine.get("top3_region_hit"))
            per_wine_rows.append({
                "top1_variety": bool(wine.get("top1_variety_hit")),
                "top3_variety": bool(wine.get("top3_variety_hit")),
                "top1_region_country": coherent_country_hit(top1_region, top1_region, wine.get("actual_subregion")),
                "top1_region_subregion": top1_region and known_subregion(wine.get("actual_subregion")),
                "top3_region": coherent_top3_region(top3_region, top1_region, wine.get("actual_subregion")),
                "candidate_set": bool(wine.get("candidate_set_hit")),
                "mrr_variety": wine.get("mrr_variety", reciprocal_rank(wine.get("variety_rank", 0))),
                "mrr_region": wine.get("mrr_region", reciprocal_rank(wine.get("region_rank", 0))),
            })
        rows.append(summarize_per_wine(
            infer_question_id(item),
            item["year"],
            item["paper"],
            item["question"],
            per_wine_rows,
            notes=item.get("notes", ""),
            style_or_category_scored=False,
        ))
    return rows


def normalize_2019_2021(data):
    rows = []
    for item in data["results"]:
        per_wine_rows = []
        for wine in item.get("per_wine", []):
            region_hit = bool(wine.get("region_hit"))
            region_top3 = wine.get("region_rank", 0) in (1, 2, 3)
            variety_rank = wine.get("variety_rank", 0)
            # These folds only retain one per-wine origin hit field. Use it coherently:
            # an exact region/subregion hit also implies country credit.
            per_wine_rows.append({
                "top1_variety": variety_rank == 1,
                "top3_variety": 1 <= variety_rank <= 3,
                "top1_region_country": coherent_country_hit(region_hit, region_hit, wine.get("actual_subregion")),
                "top1_region_subregion": region_hit and known_subregion(wine.get("actual_subregion")),
                "top3_region": coherent_top3_region(region_top3, region_hit, wine.get("actual_subregion")),
                "candidate_set": bool(wine.get("cs_hit")),
                "mrr_variety": reciprocal_rank(variety_rank),
                "mrr_region": reciprocal_rank(wine.get("region_rank", 0)),
            })
        rows.append(summarize_per_wine(
            infer_question_id(item),
            item["year"],
            item["paper"],
            item["question"],
            per_wine_rows,
            notes=item.get("notes", ""),
            style_or_category_scored="resolved via appellation_varieties" in item.get("notes", "").lower(),
        ))
    return rows


def normalize_2022_2023(data):
    rows = []
    for item in data["scores"]:
        slot_scores = item["per_slot_scores"]
        actual_by_slot = {str(a["slot"]): a for a in item.get("actuals", [])}
        per_wine_rows = []
        for slot, score in slot_scores.items():
            actual = actual_by_slot.get(str(slot), {})
            subregion = actual.get("sub_region")
            subregion_hit = bool(score.get("sub_region_top1_hit"))
            per_wine_rows.append({
                "top1_variety": bool(score.get("variety_top1_hit")),
                "top3_variety": bool(score.get("variety_top3_hit")),
                "top1_region_country": coherent_country_hit(score.get("country_top1_hit"), subregion_hit, subregion),
                "top1_region_subregion": subregion_hit and known_subregion(subregion),
                "top3_region": coherent_top3_region(score.get("sub_region_top3_hit") or score.get("country_top3_hit"), subregion_hit, subregion),
                "candidate_set": bool(score.get("variety_candidate_set_hit")),
                "mrr_variety": score.get("variety_mrr", 0.0),
                "mrr_region": score.get("region_mrr", 0.0),
            })
        note_blob = " ".join(s.get("notes", "") for s in slot_scores.values())
        rows.append(summarize_per_wine(
            infer_question_id(item),
            item["year"],
            item["paper"],
            item["question"],
            per_wine_rows,
            notes=note_blob,
            style_or_category_scored="resolved via appellation_varieties" in note_blob.lower(),
        ))
    return rows


def normalize_2024_2025(data):
    rows = []
    for item in data["questions"]:
        wines = item["per_wine"]
        per_wine_rows = []
        for wine in wines:
            subregion_hit = bool(wine.get("subregion_hit"))
            region_top3 = wine.get("region_rank", 0) in (1, 2, 3)
            per_wine_rows.append({
                "top1_variety": bool(wine.get("variety_top1")),
                "top3_variety": bool(wine.get("variety_top3")),
                "top1_region_country": coherent_country_hit(wine.get("region_top1"), subregion_hit, wine.get("actual_subregion")),
                "top1_region_subregion": subregion_hit and known_subregion(wine.get("actual_subregion")),
                "top3_region": coherent_top3_region(region_top3, subregion_hit, wine.get("actual_subregion")),
                "candidate_set": bool(wine.get("candidate_set_hit")),
                "mrr_variety": wine.get("mrr_variety", 0.0),
                "mrr_region": wine.get("mrr_region", 0.0),
            })
        rows.append(summarize_per_wine(
            infer_question_id(item),
            item["year"],
            item["paper"],
            item["question"],
            per_wine_rows,
            notes=item.get("notes", ""),
            style_or_category_scored=False,
        ))
    return rows


def load_rows():
    all_rows = []
    for path in INPUT_FILES:
        data = load_json(path)
        if path.name == "loyo_scores_2015_2016.json":
            all_rows.extend(normalize_2015_2016(data))
        elif path.name == "loyo_scores_2017_2018.json":
            all_rows.extend(normalize_2017_2018(data))
        elif path.name == "loyo_scores_2019_2021.json":
            all_rows.extend(normalize_2019_2021(data))
        elif path.name == "loyo_scores_2022_2023.json":
            all_rows.extend(normalize_2022_2023(data))
        elif path.name == "loyo_scores_2024_2025.json":
            all_rows.extend(normalize_2024_2025(data))
    return sorted(all_rows, key=lambda r: (r["year"], r["paper"], r["question"]))


def extract_actual_varieties():
    actuals = []
    for path in INPUT_FILES:
        data = load_json(path)
        if path.name == "loyo_scores_2015_2016.json":
            for item in data["results"]:
                for wine in item.get("per_wine", []):
                    actuals.append({"paper": item["paper"], "variety": wine.get("actual_variety", "Unknown")})
        elif path.name == "loyo_scores_2017_2018.json":
            for item in data["results"]:
                for wine in item.get("per_wine_detail", []):
                    actuals.append({"paper": item["paper"], "variety": wine.get("actual_variety", "Unknown")})
        elif path.name == "loyo_scores_2019_2021.json":
            for item in data["results"]:
                for wine in item.get("per_wine", []):
                    actuals.append({"paper": item["paper"], "variety": wine.get("actual_variety", "Unknown")})
        elif path.name == "loyo_scores_2022_2023.json":
            for item in data["scores"]:
                for wine in item.get("actuals", []):
                    actuals.append({"paper": item["paper"], "variety": wine.get("variety", "Unknown")})
        elif path.name == "loyo_scores_2024_2025.json":
            for item in data["questions"]:
                for wine in item.get("per_wine", []):
                    actuals.append({"paper": item["paper"], "variety": wine.get("actual_variety", "Unknown")})
    return actuals


def compute_naive_baseline(actuals):
    counts = defaultdict(lambda: defaultdict(int))
    for item in actuals:
        counts[item["paper"]][item["variety"]] += 1

    baselines = {}
    for paper, paper_counts in counts.items():
        most_common = max(paper_counts, key=paper_counts.get)
        total = sum(paper_counts.values())
        baselines[paper] = {
            "variety": most_common,
            "hit_rate": paper_counts[most_common] / total if total else 0.0,
        }

    overall = sum(v["hit_rate"] for v in baselines.values()) / len(baselines) if baselines else 0.0
    return baselines, overall


def find_source_url_warnings():
    warnings = []
    research_dir = BASE / "data" / "wine_research"
    if not research_dir.exists():
        return warnings
    for path in sorted(research_dir.glob("*.md")):
        text = path.read_text(encoding="utf-8")
        if "https://" not in text and "http://" not in text:
            warnings.append(path.name)
    return warnings


def aggregate(rows):
    total_questions = len(rows)
    total_wines = sum(r["wine_count"] for r in rows)

    weighted = {}
    for metric in METRICS:
        numerator = sum(r["metrics"][metric] * r["wine_count"] for r in rows)
        weighted[metric] = numerator / total_wines

    by_year = defaultdict(list)
    by_paper = defaultdict(list)
    for row in rows:
        by_year[row["year"]].append(row)
        by_paper[row["paper"]].append(row)

    year_summary = {}
    for year, year_rows in by_year.items():
        wines = sum(r["wine_count"] for r in year_rows)
        year_summary[year] = {
            "questions": len(year_rows),
            "wines": wines,
            **{
                metric: sum(r["metrics"][metric] * r["wine_count"] for r in year_rows) / wines
                for metric in METRICS
            },
        }

    paper_summary = {}
    for paper, paper_rows in by_paper.items():
        wines = sum(r["wine_count"] for r in paper_rows)
        paper_summary[paper] = {
            "questions": len(paper_rows),
            "wines": wines,
            **{
                metric: sum(r["metrics"][metric] * r["wine_count"] for r in paper_rows) / wines
                for metric in METRICS
            },
        }

    fold_means = {
        metric: statistics.mean(year_summary[y][metric] for y in sorted(year_summary))
        for metric in METRICS
    }
    fold_stdev = {
        metric: statistics.pstdev(year_summary[y][metric] for y in sorted(year_summary))
        for metric in METRICS
    }

    hardest = sorted(year_summary.items(), key=lambda kv: kv[1]["top1_variety"])[:2]
    easiest = sorted(year_summary.items(), key=lambda kv: kv[1]["top1_variety"], reverse=True)[:2]

    flagged = [r for r in rows if r["style_or_category_scored"]]
    actuals = extract_actual_varieties()
    naive_by_paper, naive_overall = compute_naive_baseline(actuals)
    weak_papers = sorted(
        paper_summary.items(),
        key=lambda kv: kv[1]["top1_variety"]
    )
    weak_years = sorted(
        year_summary.items(),
        key=lambda kv: kv[1]["top1_variety"]
    )[:3]
    source_warnings = find_source_url_warnings()

    return {
        "total_questions": total_questions,
        "total_wines": total_wines,
        "weighted": weighted,
        "year_summary": year_summary,
        "paper_summary": paper_summary,
        "fold_means": fold_means,
        "fold_stdev": fold_stdev,
        "hardest": hardest,
        "easiest": easiest,
        "flagged": flagged,
        "naive_by_paper": naive_by_paper,
        "naive_overall": naive_overall,
        "naive_delta": weighted["top1_variety"] - naive_overall,
        "weak_papers": weak_papers,
        "weak_years": weak_years,
        "source_warnings": source_warnings,
    }


def build_report(summary):
    lines = []
    lines.append("# LOYO Backtest Report - Scored Fold Aggregate")
    lines.append("")
    lines.append(f"**Folds:** 10 (2015, 2016, 2017, 2018, 2019, 2021, 2022, 2023, 2024, 2025)")
    lines.append(f"**Questions scored:** {summary['total_questions']}")
    lines.append(f"**Wines scored:** {summary['total_wines']}")
    lines.append("**Method:** aggregate the existing scored fold outputs in `data/loyo_scores_*.json` through one canonical per-wine schema; exact subregion hits imply country credit so origin metrics are internally coherent across fold families.")
    lines.append("")
    lines.append("## 1. Naive baseline comparison")
    lines.append("")
    lines.append(f"Naive baseline (most common variety per paper): {pct(summary['naive_overall'])} top-1 variety hit")
    lines.append(f"Tree top-1 variety hit: {pct(summary['weighted']['top1_variety'])}")
    lines.append(f"**Delta: {summary['naive_delta'] * 100:+.1f}pp** (target: +20pp)")
    lines.append(f"Status: {'PASS' if summary['naive_delta'] >= 0.20 else 'BELOW TARGET'}")
    lines.append("")
    for paper in sorted(summary["naive_by_paper"]):
        baseline = summary["naive_by_paper"][paper]
        lines.append(f"- P{paper} naive: always predict {baseline['variety']} -> {pct(baseline['hit_rate'])}")
    lines.append("")
    lines.append("## 2. Overall weighted accuracy")
    lines.append("")
    lines.append("| Metric | Weighted result |")
    lines.append("|--------|-----------------|")
    for metric in METRICS:
        lines.append(f"| {metric} | {pct(summary['weighted'][metric])} |")
    lines.append("")
    lines.append("## 3. Fold-average accuracy (mean across 10 held-out years)")
    lines.append("")
    lines.append("| Metric | Mean | Std Dev |")
    lines.append("|--------|------|---------|")
    for metric in METRICS:
        lines.append(
            f"| {metric} | {pct(summary['fold_means'][metric])} | {pct(summary['fold_stdev'][metric])} |"
        )
    lines.append("")
    lines.append("## 4. Year-by-year results")
    lines.append("")
    lines.append("| Year | Qs | Wines | Top-1 var | Top-3 var | Top-1 country | Top-1 subregion | Top-3 region | Candidate-set | MRR var | MRR reg |")
    lines.append("|------|----|------|-----------|-----------|---------------|-----------------|--------------|---------------|---------|---------|")
    for year in sorted(summary["year_summary"]):
        y = summary["year_summary"][year]
        lines.append(
            f"| {year} | {y['questions']} | {y['wines']} | {pct(y['top1_variety'])} | {pct(y['top3_variety'])} | "
            f"{pct(y['top1_region_country'])} | {pct(y['top1_region_subregion'])} | {pct(y['top3_region'])} | "
            f"{pct(y['candidate_set'])} | {pct(y['mrr_variety'])} | {pct(y['mrr_region'])} |"
        )
    lines.append("")
    lines.append("## 5. Per-paper breakdown")
    lines.append("")
    lines.append("| Paper | Qs | Wines | Top-1 var | Top-3 var | Top-1 country | Top-1 subregion | Candidate-set | MRR var | MRR reg |")
    lines.append("|-------|----|------|-----------|-----------|---------------|-----------------|---------------|---------|---------|")
    for paper in sorted(summary["paper_summary"]):
        p = summary["paper_summary"][paper]
        lines.append(
            f"| P{paper} | {p['questions']} | {p['wines']} | {pct(p['top1_variety'])} | {pct(p['top3_variety'])} | "
            f"{pct(p['top1_region_country'])} | {pct(p['top1_region_subregion'])} | {pct(p['candidate_set'])} | "
            f"{pct(p['mrr_variety'])} | {pct(p['mrr_region'])} |"
        )
    lines.append("")
    lines.append("## 6. Hardest and easiest years")
    lines.append("")
    lines.append("### Hardest by top-1 variety")
    for year, data in summary["hardest"]:
        lines.append(f"- **{year}**: {pct(data['top1_variety'])} top-1 variety on {data['wines']} wines")
    lines.append("")
    lines.append("### Easiest by top-1 variety")
    for year, data in summary["easiest"]:
        lines.append(f"- **{year}**: {pct(data['top1_variety'])} top-1 variety on {data['wines']} wines")
    lines.append("")
    lines.append("## 7. Known weak spots - taste carefully here")
    lines.append("")
    if summary["weak_papers"]:
        weakest_paper, weakest_data = summary["weak_papers"][0]
        lines.append(
            f"- **Weakest paper family:** P{weakest_paper} at {pct(weakest_data['top1_variety'])} top-1 variety and {pct(weakest_data['candidate_set'])} candidate-set hit."
        )
    for year, data in summary["weak_years"]:
        lines.append(
            f"- **{year} fold:** {pct(data['top1_variety'])} top-1 variety, {pct(data['top3_region'])} top-3 region, {pct(data['candidate_set'])} candidate-set hit."
        )
    lines.append(
        f"- **Style/category-led questions:** {len(summary['flagged'])} questions needed style or appellation-to-variety resolution notes; these are the least cleanly varietal questions in the corpus."
    )
    lines.append(
        "- **Interpretation risk:** 2021-2023 folds are near-perfect in the existing scored outputs, so treat those as methodology-aligned scoring artifacts rather than robust evidence that the tree generalizes perfectly."
    )
    lines.append("")
    lines.append("## 8. Style/category-level scoring flags")
    lines.append("")
    lines.append(
        f"{len(summary['flagged'])} of {summary['total_questions']} questions were explicitly scored with style/category or appellation-to-variety resolution notes rather than clean single-variety wording."
    )
    lines.append("")
    for row in summary["flagged"][:20]:
        lines.append(f"- `{row['question_id']}`: {row['notes'][:180].strip()}")
    if len(summary["flagged"]) > 20:
        lines.append(f"- ... plus {len(summary['flagged']) - 20} additional flagged questions")
    lines.append("")
    lines.append("## 9. Source URL warnings")
    lines.append("")
    if summary["source_warnings"]:
        lines.append("The following `data/wine_research/*.md` files lack a real source URL and should not be trusted for Layer B sourced scoring until fixed:")
        lines.append("")
        for name in summary["source_warnings"][:25]:
            lines.append(f"- `{name}`")
        if len(summary["source_warnings"]) > 25:
            lines.append(f"- ... plus {len(summary['source_warnings']) - 25} additional files")
    else:
        lines.append("No Source URL warnings detected in `data/wine_research/`.")
    lines.append("")
    lines.append("## 10. Notes")
    lines.append("")
    lines.append("- The prior `Light LOYO (Existing Trees)` report was parser-based and is superseded by this fold aggregate.")
    lines.append("- `2015_2016` was regenerated from `score_loyo.py` during this run to fill the only missing fold file.")
    lines.append("- This aggregate now recomputes every reported metric from per-wine rows instead of mixing question-level and fold-specific summary fields.")
    lines.append("- Exact subregion hits imply country credit in the aggregate scorer so `top1_region_country` and `top1_region_subregion` cannot contradict each other.")
    lines.append("- 2017-2021 fold files do not preserve fully separate country-vs-subregion per-wine origin hits, so their origin metrics still reflect the best available per-wine region evidence rather than a perfect two-level origin trace.")
    return "\n".join(lines) + "\n"


def main():
    rows = load_rows()
    summary = aggregate(rows)
    report = build_report(summary)
    REPORT_FILE.write_text(report, encoding="utf-8")
    print(f"Wrote {REPORT_FILE}")
    print(f"Questions: {summary['total_questions']}")
    print(f"Wines: {summary['total_wines']}")
    print(f"Weighted top1 variety: {pct(summary['weighted']['top1_variety'])}")


if __name__ == "__main__":
    main()
