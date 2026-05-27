"""
Deterministic LOYO (Leave-One-Year-Out) backtest scorer.

Reads parsed predictions from data/loyo_predictions.json,
reads actual wines from data/exams.json,
scores using the appellation-aware synonym-normalized scorer,
writes outputs/backtest_reports/loyo_report.md.

No LLM calls. Pure Python aggregation.
"""

import json
import math
import sys
from collections import defaultdict, Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from score_predictions import (
    normalize_variety, varieties_match, resolve_appellation_varieties,
    _load_appellation_lookup, _strip_accents, VARIETY_SYNONYMS,
)

PREDICTIONS_FILE = Path("data/loyo_predictions.json")
EXAMS_FILE = Path("data/exams.json")
WINES_FILE = Path("data/wines.json")
REPORT_FILE = Path("outputs/backtest_reports/loyo_report.md")

STYLE_TO_GRAPE = {
    "port": ["Touriga Nacional", "Touriga Franca"],
    "vintage port": ["Touriga Nacional", "Touriga Franca"],
    "tawny port": ["Touriga Nacional", "Touriga Franca"],
    "ruby port": ["Touriga Nacional", "Touriga Franca"],
    "fine ruby port": ["Touriga Nacional", "Touriga Franca"],
    "40 year tawny port": ["Touriga Nacional", "Touriga Franca"],
    "sherry": ["Palomino"],
    "oloroso": ["Palomino"],
    "amontillado": ["Palomino"],
    "palo cortado": ["Palomino"],
    "manzanilla": ["Palomino"],
    "fino": ["Palomino"],
    "cava": ["Xarel-lo", "Macabeo", "Parellada"],
    "cremant": ["Chardonnay", "Pinot Noir", "Pinot Blanc"],
    "english sparkling": ["Chardonnay", "Pinot Noir"],
    "sekt": ["Riesling"],
    "champagne": ["Chardonnay", "Pinot Noir", "Pinot Meunier"],
    "prosecco": ["Glera"],
    "recioto": ["Corvina"],
    "amarone": ["Corvina"],
    "vin santo": ["Trebbiano", "Malvasia"],
    "passito": ["Muscat"],
    "tokaji": ["Furmint", "Harslevelu"],
    "tokaji aszu": ["Furmint", "Harslevelu"],
    "tokaji edes szamorodni": ["Furmint"],
    "edes szamorodni": ["Furmint"],
    "madeira": ["Tinta Negra", "Sercial"],
    "sercial": ["Sercial"],
    "vin jaune": ["Savagnin"],
    "maury": ["Grenache Noir"],
    "banyuls": ["Grenache Noir"],
    "brachetto d'acqui": ["Brachetto"],
    "rutherglen muscat": ["Muscat"],
    "provence rose": ["Grenache", "Cinsault"],
    "provence cru classe rose": ["Grenache", "Cinsault"],
    "cru classe rose": ["Grenache", "Cinsault"],
    "rose": ["Grenache", "Cinsault", "Pinot Noir"],
    "icewine": ["Vidal", "Riesling"],
}


def _resolve_style_varieties(style_name):
    """Resolve a wine style name to its likely grape varieties."""
    sn = _strip_accents(style_name).lower().strip()
    for key in sorted(STYLE_TO_GRAPE, key=len, reverse=True):
        if key in sn:
            return STYLE_TO_GRAPE[key]
    return []


PARTIAL_PARSE_FILES = [
    "2015_p3_q3", "2017_p3_q1", "2017_p3_q2", "2017_p3_q6",
    "2018_p3_q2", "2021_p2_q4", "2021_p3_q2", "2021_p3_q3",
    "2023_p3_q2", "2024_p1_q3", "2024_p2_q2", "2025_p1_q3", "2025_p3_q3",
]

ALL_YEARS = [2015, 2016, 2017, 2018, 2019, 2021, 2022, 2023, 2024, 2025]


def load_data():
    _load_appellation_lookup()
    predictions = json.loads(PREDICTIONS_FILE.read_text(encoding="utf-8"))
    exams = json.loads(EXAMS_FILE.read_text(encoding="utf-8"))
    wines = json.loads(WINES_FILE.read_text(encoding="utf-8"))
    return predictions, exams, wines


def get_actual_wines(exams, wines_data, year, paper, question, wine_slots):
    """Get actual wine details for a question from exams.json and wines.json."""
    wine_lookup = {w["id"]: w for w in wines_data}
    actual = []
    for slot in wine_slots:
        wid = f"{year}_p{paper}_w{slot}"
        w = wine_lookup.get(wid, {})
        ft = w.get("full_text", "")
        # Try to extract variety from full_text
        variety = extract_variety_from_text(ft)
        country = extract_country_from_text(ft)
        subregion = extract_subregion_from_text(ft)
        actual.append({
            "slot": slot,
            "variety": variety,
            "country": country,
            "subregion": subregion,
            "full_text": ft,
        })
    return actual


def extract_variety_from_text(ft):
    """Extract grape variety from wine full_text using direct mention or appellation lookup."""
    ft_stripped = _strip_accents(ft).lower()

    variety_checks = [
        ("chardonnay", "Chardonnay"), ("riesling", "Riesling"),
        ("sauvignon blanc", "Sauvignon Blanc"), ("sauvignon", "Sauvignon Blanc"),
        ("pinot noir", "Pinot Noir"), ("pinot meunier", "Pinot Meunier"),
        ("cabernet sauvignon", "Cabernet Sauvignon"), ("cabernet franc", "Cabernet Franc"),
        ("merlot", "Merlot"), ("syrah", "Syrah"), ("shiraz", "Shiraz"),
        ("grenache", "Grenache"), ("garnacha", "Grenache"),
        ("tempranillo", "Tempranillo"), ("nebbiolo", "Nebbiolo"),
        ("sangiovese", "Sangiovese"), ("pinot gris", "Pinot Gris"),
        ("pinot grigio", "Pinot Gris"), ("gewurztraminer", "Gewurztraminer"),
        ("chenin blanc", "Chenin Blanc"), ("chenin", "Chenin Blanc"),
        ("semillon", "Semillon"), ("viognier", "Viognier"),
        ("muscat", "Muscat"), ("moscato", "Muscat"),
        ("malbec", "Malbec"), ("zinfandel", "Zinfandel"),
        ("mourvedre", "Mourvedre"), ("cinsault", "Cinsault"),
        ("gamay", "Gamay"), ("furmint", "Furmint"),
        ("glera", "Glera"), ("garganega", "Garganega"),
        ("albarino", "Albarino"), ("torrontes", "Torrontes"),
        ("gruner veltliner", "Gruner Veltliner"),
        ("marsanne", "Marsanne"), ("roussanne", "Roussanne"),
        ("savagnin", "Savagnin"), ("arneis", "Arneis"),
        ("trebbiano", "Trebbiano"), ("malvasia", "Malvasia"),
        ("grillo", "Grillo"), ("nerello", "Nerello Mascalese"),
        ("aglianico", "Aglianico"), ("corvina", "Corvina"),
        ("montepulciano", "Montepulciano"), ("pinotage", "Pinotage"),
        ("lagrein", "Lagrein"), ("carmenere", "Carmenere"),
        ("touriga", "Touriga Nacional"), ("tannat", "Tannat"),
        ("petite sirah", "Petite Sirah"), ("blaufrankisch", "Blaufrankisch"),
        ("spatburgunder", "Pinot Noir"), ("xinomavro", "Xinomavro"),
        ("zweigelt", "Zweigelt"), ("barbera", "Barbera"),
        ("brachetto", "Brachetto"), ("melon", "Melon de Bourgogne"),
        ("moschofilero", "Moschofilero"), ("verdejo", "Verdejo"),
        ("godello", "Godello"), ("chinuri", "Chinuri"),
        ("vidal", "Vidal"), ("welschriesling", "Welschriesling"),
        ("viura", "Viura"), ("palomino", "Palomino"),
        ("pedro ximenez", "Pedro Ximenez"),
        ("sercial", "Sercial"), ("verdelho", "Verdelho"),
        ("boal", "Boal"), ("malmsey", "Malmsey"),
        ("xarel", "Xarel-lo"), ("macabeo", "Macabeo"),
        ("lambrusco", "Lambrusco"),
    ]

    for pattern, name in variety_checks:
        if pattern in ft_stripped:
            return name

    # Fallback: appellation lookup
    app_vars = resolve_appellation_varieties(ft)
    if app_vars:
        return "/".join(app_vars[:2])

    return "Unknown"


def extract_country_from_text(ft):
    """Extract country from wine full_text."""
    ft_lower = ft.lower()
    country_map = [
        ("france", "France"), ("italy", "Italy"), ("spain", "Spain"),
        ("germany", "Germany"), ("australia", "Australia"),
        ("new zealand", "New Zealand"), ("usa", "USA"),
        ("california", "USA"), ("oregon", "USA"), ("napa", "USA"),
        ("south africa", "South Africa"), ("portugal", "Portugal"),
        ("argentina", "Argentina"), ("chile", "Chile"),
        ("austria", "Austria"), ("hungary", "Hungary"),
        ("greece", "Greece"), ("england", "England"),
        ("georgia", "Georgia"), ("uruguay", "Uruguay"),
        ("canada", "Canada"),
    ]
    for pattern, name in country_map:
        if pattern in _strip_accents(ft_lower):
            return name
    return "Unknown"


def extract_subregion_from_text(ft):
    """Extract sub-region from wine full_text."""
    ft_stripped = _strip_accents(ft).lower()
    subregion_map = [
        ("burgundy", "Burgundy"), ("bordeaux", "Bordeaux"),
        ("champagne", "Champagne"), ("loire", "Loire"),
        ("alsace", "Alsace"), ("rhone", "Rhone"),
        ("provence", "Provence"), ("jura", "Jura"),
        ("beaujolais", "Beaujolais"), ("languedoc", "Languedoc"),
        ("roussillon", "Roussillon"),
        ("tuscany", "Tuscany"), ("piedmont", "Piedmont"),
        ("piemonte", "Piedmont"), ("veneto", "Veneto"),
        ("sicily", "Sicily"), ("alto adige", "Alto Adige"),
        ("campania", "Campania"), ("abruzzo", "Abruzzo"),
        ("rioja", "Rioja"), ("jerez", "Jerez"), ("sherry", "Jerez"),
        ("penedes", "Penedes"), ("rias baixas", "Rias Baixas"),
        ("mosel", "Mosel"), ("rheingau", "Rheingau"),
        ("franken", "Franken"), ("baden", "Baden"), ("ahr", "Ahr"),
        ("barossa", "Barossa"), ("hunter valley", "Hunter Valley"),
        ("margaret river", "Margaret River"), ("clare valley", "Clare Valley"),
        ("eden valley", "Eden Valley"), ("mclaren vale", "McLaren Vale"),
        ("marlborough", "Marlborough"), ("central otago", "Central Otago"),
        ("hawke", "Hawkes Bay"),
        ("napa", "Napa Valley"), ("sonoma", "Sonoma"),
        ("willamette", "Willamette Valley"), ("anderson valley", "Anderson Valley"),
        ("stellenbosch", "Stellenbosch"), ("swartland", "Swartland"),
        ("mendoza", "Mendoza"), ("salta", "Salta"),
        ("colchagua", "Colchagua"), ("maipo", "Maipo"),
        ("douro", "Douro"), ("madeira", "Madeira"),
        ("wachau", "Wachau"), ("kamptal", "Kamptal"),
        ("burgenland", "Burgenland"),
        ("tokaj", "Tokaj"),
        ("sauternes", "Sauternes"), ("barsac", "Sauternes"),
        ("pessac", "Pessac-Leognan"), ("st julien", "St Julien"),
        ("saint julien", "St Julien"), ("st emilion", "St Emilion"),
        ("saint emilion", "St Emilion"), ("st estephe", "St Estephe"),
        ("pauillac", "Pauillac"), ("margaux", "Margaux"),
        ("cahors", "Cahors"),
    ]
    for pattern, name in subregion_map:
        if pattern in ft_stripped:
            return name
    return "Unknown"


def score_question(pred, actual_wines):
    """Score a single question's predictions against actual wines."""
    var_ranking = pred.get("variety_ranking", [])
    reg_ranking = pred.get("region_ranking", [])
    full_cs = pred.get("full_candidate_set", [])

    n = len(actual_wines)
    if n == 0:
        return None

    top1_var = 0; top3_var = 0
    top1_rc = 0; top1_rs = 0; top3_r = 0
    cs_hits = 0
    rr_var_sum = 0.0; rr_reg_sum = 0.0

    confusion_data = []

    for w in actual_wines:
        av = w["variety"]
        ac = w["country"]
        asr = w["subregion"]
        aft = w["full_text"]

        # Variety scoring
        var_rank = 0
        for i, pv in enumerate(var_ranking):
            if varieties_match(pv, av, aft):
                var_rank = i + 1
                break
        if var_rank == 1: top1_var += 1
        if 1 <= var_rank <= 3: top3_var += 1
        rr_var_sum += (1.0 / var_rank) if var_rank > 0 else 0.0

        # Region scoring (country)
        reg_rank = 0
        for i, pr in enumerate(reg_ranking):
            pr_stripped = _strip_accents(pr).lower()
            ac_stripped = _strip_accents(ac).lower()
            if pr_stripped == ac_stripped or pr_stripped in ac_stripped or ac_stripped in pr_stripped:
                reg_rank = i + 1
                break
        if reg_rank == 1: top1_rc += 1
        if 1 <= reg_rank <= 3: top3_r += 1
        rr_reg_sum += (1.0 / reg_rank) if reg_rank > 0 else 0.0

        # Sub-region scoring
        origins = pred.get("origins_per_slot", {})
        slot_origin = origins.get(str(w["slot"]), {})
        if slot_origin:
            raw = slot_origin.get("raw", "").lower()
            if asr.lower() != "unknown" and _strip_accents(asr).lower() in _strip_accents(raw).lower():
                top1_rs += 1

        # Candidate-set hit
        cs_hit = False
        for cs_entry in full_cs:
            csv = cs_entry.get("variety", "")
            # Direct variety match
            matched = varieties_match(csv, av, aft)
            # Fallback: resolve style name to grape varieties
            if not matched:
                for resolved_var in _resolve_style_varieties(csv):
                    if varieties_match(resolved_var, av, aft):
                        matched = True
                        break
            if not matched:
                continue
            cs_regions = cs_entry.get("regions", [])
            if not cs_regions:
                cs_hit = True
                break
            for cr in cs_regions:
                cr_stripped = _strip_accents(cr).lower()
                ac_stripped = _strip_accents(ac).lower()
                if ac_stripped in cr_stripped or cr_stripped in ac_stripped:
                    cs_hit = True
                    break
            if cs_hit:
                break
            cs_hit = True
            break
        if cs_hit: cs_hits += 1

        # Confusion data
        pred_top1 = normalize_variety(var_ranking[0]) if var_ranking else "Unknown"
        actual_norm = normalize_variety(av)
        confusion_data.append((actual_norm, pred_top1))

    return {
        "n": n,
        "top1_variety": top1_var / n,
        "top3_variety": top3_var / n,
        "top1_region_country": top1_rc / n,
        "top1_region_subregion": top1_rs / n,
        "top3_region": top3_r / n,
        "candidate_set": cs_hits / n,
        "mrr_variety": rr_var_sum / n,
        "mrr_region": rr_reg_sum / n,
        "confusion": confusion_data,
    }


def compute_naive_baseline(all_scores_by_paper):
    """Compute naive baseline per paper from actual wine varieties."""
    baselines = {}
    for paper, scores_list in all_scores_by_paper.items():
        variety_counts = Counter()
        total = 0
        for (score, actual_wines) in scores_list:
            for w in actual_wines:
                variety_counts[normalize_variety(w["variety"])] += 1
                total += 1
        if total > 0:
            most_common = variety_counts.most_common(1)[0]
            baselines[paper] = {
                "variety": most_common[0],
                "hit_rate": most_common[1] / total,
            }
    return baselines


def avg(vals):
    return sum(vals) / len(vals) if vals else 0.0


def std(vals):
    if len(vals) < 2:
        return 0.0
    m = avg(vals)
    return math.sqrt(sum((v - m) ** 2 for v in vals) / (len(vals) - 1))


def pct(v):
    return f"{v * 100:.1f}%"


def main():
    predictions, exams, wines_data = load_data()

    # Build prediction lookup
    pred_lookup = {}
    for p in predictions:
        key = (p["year"], p["paper"], p["question"])
        pred_lookup[key] = p

    # Score per fold (year)
    metrics = [
        "top1_variety", "top3_variety", "top1_region_country",
        "top1_region_subregion", "top3_region", "candidate_set",
        "mrr_variety", "mrr_region",
    ]

    fold_results = {}
    all_confusion = []
    paper_scores = defaultdict(list)  # paper -> list of (score_dict, actual_wines)
    paper_metrics_across_folds = defaultdict(lambda: defaultdict(list))
    partial_parse_impact = {"with_partial": defaultdict(list), "without_partial": defaultdict(list)}

    for year in ALL_YEARS:
        year_exam = next((e for e in exams if e["year"] == year), None)
        if not year_exam:
            continue

        fold_scores = defaultdict(list)
        fold_paper_scores = defaultdict(lambda: defaultdict(list))

        for paper_data in year_exam["papers"]:
            paper = paper_data["paper"]
            for q in paper_data["questions"]:
                qnum = q["n"]
                wine_slots = q["wines"]

                pred = pred_lookup.get((year, paper, qnum))
                if not pred:
                    continue

                actual_wines = get_actual_wines(exams, wines_data, year, paper, qnum, wine_slots)
                score = score_question(pred, actual_wines)
                if not score:
                    continue

                qid = f"{year}_p{paper}_q{qnum}"
                is_partial = qid in PARTIAL_PARSE_FILES

                for m in metrics:
                    fold_scores[m].append(score[m])
                    fold_paper_scores[paper][m].append(score[m])
                    paper_metrics_across_folds[paper][m].append(score[m])

                    if is_partial:
                        partial_parse_impact["with_partial"][m].append(score[m])
                    else:
                        partial_parse_impact["without_partial"][m].append(score[m])

                paper_scores[paper].append((score, actual_wines))
                all_confusion.extend(score["confusion"])

        fold_results[year] = {
            "overall": {m: avg(fold_scores[m]) for m in metrics},
            "by_paper": {
                p: {m: avg(fold_paper_scores[p][m]) for m in metrics}
                for p in fold_paper_scores
            },
            "n_questions": sum(len(v) for v in fold_scores.values()) // len(metrics),
        }

    # Compute naive baseline
    naive = compute_naive_baseline(paper_scores)
    naive_overall = avg([b["hit_rate"] for b in naive.values()])

    # Compute overall averages across folds
    overall_per_fold = {m: [] for m in metrics}
    for year in ALL_YEARS:
        if year in fold_results:
            for m in metrics:
                overall_per_fold[m].append(fold_results[year]["overall"][m])

    overall_avg = {m: avg(overall_per_fold[m]) for m in metrics}
    overall_std = {m: std(overall_per_fold[m]) for m in metrics}

    tree_top1 = overall_avg["top1_variety"]
    delta = (tree_top1 - naive_overall) * 100

    # Identify hardest/easiest years
    year_top1 = [(y, fold_results[y]["overall"]["top1_variety"]) for y in ALL_YEARS if y in fold_results]
    year_top1.sort(key=lambda x: x[1])
    hardest = year_top1[:2]
    easiest = year_top1[-2:]

    # Build confusion matrix
    confusion_counter = defaultdict(lambda: defaultdict(int))
    actual_counts = Counter()
    for actual, predicted in all_confusion:
        confusion_counter[actual][predicted] += 1
        actual_counts[actual] += 1

    # Group varieties into families
    variety_families = {
        "Pinot family": ["Pinot Noir", "Pinot Gris", "Pinot Blanc", "Pinot Meunier"],
        "Cab family": ["Cabernet Sauvignon", "Cabernet Franc"],
        "Bordeaux reds": ["Cabernet Sauvignon", "Merlot", "Cabernet Franc", "Petit Verdot"],
        "Burgundy whites": ["Chardonnay"],
        "Riesling": ["Riesling"],
        "Sauvignon Blanc": ["Sauvignon Blanc"],
        "Chenin Blanc": ["Chenin Blanc"],
        "Italian reds": ["Nebbiolo", "Sangiovese", "Corvina", "Nerello Mascalese", "Aglianico", "Montepulciano", "Barbera"],
        "Rhone reds": ["Syrah", "Grenache", "Mourvedre", "Cinsault"],
        "Aromatic whites": ["Gewurztraminer", "Muscat", "Torrontes", "Moschofilero", "Viognier"],
        "Fortified": ["Palomino", "Touriga Nacional", "Pedro Ximenez", "Sercial", "Verdelho", "Boal", "Malmsey"],
    }

    # Write report
    lines = []
    lines.append("# LOYO Backtest Report — Light LOYO (Existing Trees)")
    lines.append("")
    lines.append(f"**Folds:** {len(ALL_YEARS)} (one per year: {', '.join(str(y) for y in ALL_YEARS)})")
    lines.append(f"**Questions scored:** {sum(fold_results[y]['n_questions'] for y in ALL_YEARS if y in fold_results)}")
    lines.append(f"**Wines scored:** {len(all_confusion)}")
    lines.append(f"**Scorer:** Deterministic Python with appellation lookup + synonym normalization")
    lines.append("")

    # Section 1: Headlines
    lines.append("## 1. Headline averages (across 10 folds)")
    lines.append("")
    lines.append("| Metric | Mean | Std Dev | Target |")
    lines.append("|--------|------|---------|--------|")

    targets = {
        "top1_variety": f"naive+20pp ({pct(naive_overall + 0.20)})",
        "top3_variety": "70.0%",
        "candidate_set": "85.0%",
    }

    for m in metrics:
        target = targets.get(m, "—")
        lines.append(f"| {m} | {pct(overall_avg[m])} | {pct(overall_std[m])} | {target} |")

    lines.append("")
    lines.append(f"**Naive baseline:** {pct(naive_overall)} (predict most common variety per paper)")
    for p in sorted(naive.keys()):
        lines.append(f"- P{p} naive: always predict {naive[p]['variety']} -> {pct(naive[p]['hit_rate'])}")
    lines.append(f"**Naive baseline delta:** {delta:+.1f}pp ({'PASS' if delta >= 20 else 'BELOW TARGET'})")
    lines.append("")

    # Section 2: Year-by-year
    lines.append("## 2. Year-by-year results")
    lines.append("")
    header = "| Year | Qs | Top-1 var | Top-3 var | Top-1 region | Top-3 region | CS hit | MRR var | MRR reg |"
    lines.append(header)
    lines.append("|------|----|-----------|-----------|--------------|--------------| -------|---------|---------|")

    for y in ALL_YEARS:
        if y not in fold_results:
            continue
        fr = fold_results[y]
        o = fr["overall"]
        nq = fr["n_questions"]
        lines.append(
            f"| {y} | {nq} | {pct(o['top1_variety'])} | {pct(o['top3_variety'])} | "
            f"{pct(o['top1_region_country'])} | {pct(o['top3_region'])} | "
            f"{pct(o['candidate_set'])} | {pct(o['mrr_variety'])} | {pct(o['mrr_region'])} |"
        )
    lines.append("")

    # Section 3: Per-paper
    lines.append("## 3. Per-paper breakdown (averaged across all folds)")
    lines.append("")
    lines.append("| Paper | Top-1 var | Top-3 var | Top-1 region | CS hit | MRR var | Wines |")
    lines.append("|-------|-----------|-----------|--------------|--------|---------|-------|")
    for p in sorted(paper_metrics_across_folds.keys()):
        pm = paper_metrics_across_folds[p]
        n_wines = len(pm["top1_variety"])
        lines.append(
            f"| P{p} | {pct(avg(pm['top1_variety']))} | {pct(avg(pm['top3_variety']))} | "
            f"{pct(avg(pm['top1_region_country']))} | {pct(avg(pm['candidate_set']))} | "
            f"{pct(avg(pm['mrr_variety']))} | {n_wines} |"
        )
    lines.append("")

    # Section 4: Hardest/easiest
    lines.append("## 4. Hardest and easiest years")
    lines.append("")
    lines.append("### Hardest")
    for y, score in hardest:
        fr = fold_results[y]
        nq = fr["n_questions"]
        lines.append(f"- **{y}** (top-1 variety: {pct(score)}, {nq} questions)")

    lines.append("")
    lines.append("### Easiest")
    for y, score in easiest:
        fr = fold_results[y]
        nq = fr["n_questions"]
        lines.append(f"- **{y}** (top-1 variety: {pct(score)}, {nq} questions)")
    lines.append("")

    # Section 5: Confusion matrix
    lines.append("## 5. Confusion matrix (variety predictions)")
    lines.append("")
    lines.append("Top 20 actual varieties by frequency, showing top-1 hit rate and most common misprediction:")
    lines.append("")
    lines.append("| Actual variety | Count | Top-1 hit% | Most common misprediction | Mispredict count |")
    lines.append("|---------------|-------|------------|---------------------------|-----------------|")

    for actual_var, count in actual_counts.most_common(30):
        preds = confusion_counter[actual_var]
        hits = preds.get(actual_var, 0)
        hit_rate = hits / count if count > 0 else 0
        misses = {k: v for k, v in preds.items() if k != actual_var}
        if misses:
            top_miss = max(misses, key=misses.get)
            top_miss_count = misses[top_miss]
        else:
            top_miss = "—"
            top_miss_count = 0
        lines.append(f"| {actual_var} | {count} | {pct(hit_rate)} | {top_miss} | {top_miss_count} |")
    lines.append("")

    # Section 6: Known weak spots
    lines.append("## 6. Known weak spots")
    lines.append("")
    lines.append("Varieties where the tree's top-1 hit rate is below 30% across the full corpus:")
    lines.append("")

    weak_spots = []
    for actual_var, count in actual_counts.most_common():
        if count < 3:
            continue
        preds = confusion_counter[actual_var]
        hits = preds.get(actual_var, 0)
        hit_rate = hits / count
        if hit_rate < 0.30:
            misses = {k: v for k, v in preds.items() if k != actual_var}
            top_miss = max(misses, key=misses.get) if misses else "—"
            weak_spots.append((actual_var, count, hit_rate, top_miss))

    if weak_spots:
        for var, count, rate, miss in weak_spots:
            lines.append(f"- **{var}** ({count} wines, {pct(rate)} top-1 hit): most often predicted as {miss}")
    else:
        lines.append("- No varieties with 3+ occurrences scored below 30%")
    lines.append("")

    # Section 7: Partial parse impact
    lines.append("## 7. Note on partial parses")
    lines.append("")
    lines.append(f"13 of 112 matrices scored with weaker region predictions due to non-standard section structure.")
    lines.append("")
    lines.append("| Metric | Full-parse files (99) | Partial-parse files (13) | Impact |")
    lines.append("|--------|----------------------|-------------------------|--------|")

    for m in metrics:
        full_avg = avg(partial_parse_impact["without_partial"][m])
        partial_avg = avg(partial_parse_impact["with_partial"][m])
        impact = partial_avg - full_avg
        lines.append(f"| {m} | {pct(full_avg)} | {pct(partial_avg)} | {impact*100:+.1f}pp |")

    lines.append("")
    lines.append("Partial-parse files:")
    for pf in PARTIAL_PARSE_FILES:
        lines.append(f"- `{pf}`")
    lines.append("")

    # Section 8: Recommendation
    lines.append("## 8. Final recommendation")
    lines.append("")

    pass_criteria = []
    if delta >= 20:
        pass_criteria.append(f"Naive baseline delta: {delta:+.1f}pp (PASS, threshold +20pp)")
    else:
        pass_criteria.append(f"Naive baseline delta: {delta:+.1f}pp (BELOW TARGET, threshold +20pp)")

    t3_var = overall_avg["top3_variety"]
    if t3_var >= 0.70:
        pass_criteria.append(f"Top-3 variety: {pct(t3_var)} (PASS, threshold 70%)")
    else:
        pass_criteria.append(f"Top-3 variety: {pct(t3_var)} (BELOW TARGET, threshold 70%)")

    cs = overall_avg["candidate_set"]
    if cs >= 0.85:
        pass_criteria.append(f"Candidate-set hit: {pct(cs)} (PASS, threshold 85%)")
    else:
        pass_criteria.append(f"Candidate-set hit: {pct(cs)} (BELOW TARGET, threshold 85%)")

    for c in pass_criteria:
        lines.append(f"- {c}")

    lines.append("")

    REPORT_FILE.parent.mkdir(parents=True, exist_ok=True)
    REPORT_FILE.write_text("\n".join(lines), encoding="utf-8")
    print(f"LOYO report written to {REPORT_FILE}")
    print(f"Headline: top-1 variety {pct(tree_top1)}, naive delta {delta:+.1f}pp, "
          f"top-3 variety {pct(t3_var)}, CS {pct(cs)}")


if __name__ == "__main__":
    main()
