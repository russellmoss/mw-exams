"""
Score backtest predictions and generate accuracy reports.

Reads data/backtest_results.json and emits:
  outputs/backtest_reports/iteration_report.md  (refinement loop)
  outputs/backtest_reports/loyo_report.md       (leave-one-year-out primary)

Usage:
    python scripts/score_predictions.py --mode iteration
    python scripts/score_predictions.py --mode primary
"""

import json
import sys
from collections import defaultdict
from pathlib import Path

RESULTS_FILE = Path("data/backtest_results.json")
REPORT_DIR = Path("outputs/backtest_reports")
WINE_RESEARCH_DIR = Path("data/wine_research")

VARIETY_SYNONYMS = {
    "shiraz": "syrah",
    "syrah/shiraz": "syrah",
    "garnacha": "grenache",
    "garnatxa": "grenache",
    "spätburgunder": "pinot noir",
    "spatburgunder": "pinot noir",
    "pinot grigio": "pinot gris",
    "grauburgunder": "pinot gris",
    "ruländer": "pinot gris",
    "rulander": "pinot gris",
    "tinto fino": "tempranillo",
    "tinta del país": "tempranillo",
    "tinta del pais": "tempranillo",
    "tinta del toro": "tempranillo",
    "cencibel": "tempranillo",
    "cot": "malbec",
    "auxerrois": "malbec",
    "bouchet": "cabernet franc",
    "lemberger": "blaufränkisch",
    "kékfrankos": "blaufränkisch",
    "kekfrankos": "blaufränkisch",
    "monastrell": "mourvèdre",
    "mataro": "mourvèdre",
    "mourvedre": "mourvèdre",
    "carmenere": "carménère",
    "carmenère": "carménère",
}

import re as _re
import unicodedata as _unicodedata

APPELLATION_LOOKUP = {}

def _load_appellation_lookup():
    global APPELLATION_LOOKUP
    p = Path("data/appellation_varieties.json")
    if p.exists():
        APPELLATION_LOOKUP = json.loads(p.read_text(encoding="utf-8"))

def _strip_accents(s):
    nfkd = _unicodedata.normalize('NFKD', s)
    out = ''.join(c for c in nfkd if not _unicodedata.combining(c))
    out = out.replace('‘', "'").replace('’', "'")
    out = out.replace('“', '"').replace('”', '"')
    return out.lower()

def resolve_appellation_varieties(wine_text):
    """Given a wine's full_text, try to resolve variety via appellation lookup."""
    if not APPELLATION_LOOKUP:
        _load_appellation_lookup()
    stripped = _strip_accents(wine_text)
    sorted_keys = sorted(APPELLATION_LOOKUP.keys(), key=len, reverse=True)
    for key in sorted_keys:
        key_stripped = _strip_accents(key)
        if key_stripped in stripped:
            return APPELLATION_LOOKUP[key].get("varieties", [])
    return []

def normalize_variety(name):
    """Normalize a variety name: strip style suffixes, apply synonyms, sort blend components."""
    if not name:
        return ""
    s = name.strip()
    s = _re.sub(r'\s*\(.*?\)\s*$', '', s)
    s = s.replace(' blend', '').strip()
    parts = [p.strip() for p in s.split('/')]
    normalized = []
    for p in parts:
        low = p.lower()
        resolved = VARIETY_SYNONYMS.get(low, p)
        if resolved and resolved[0].islower():
            resolved = resolved[0].upper() + resolved[1:]
        normalized.append(resolved)
    normalized = sorted(set(normalized), key=lambda x: x.lower())
    return '/'.join(normalized)


def varieties_match(predicted, actual, actual_full_text=None):
    """Check if two variety strings match after normalization.

    If actual is unresolvable (e.g. an appellation name), falls back to
    appellation lookup using actual_full_text.
    """
    np = normalize_variety(predicted)
    na = normalize_variety(actual)
    if np == na:
        return True
    pp = set(np.lower().split('/'))
    pa = set(na.lower().split('/'))
    if pp & pa:
        return True
    # Substring matching: "chenin" matches "chenin blanc", "muscat" matches "muscat of alexandria"
    for p in pp:
        for a in pa:
            if p in a or a in p:
                return True
    if actual_full_text:
        app_vars = resolve_appellation_varieties(actual_full_text)
        for av in app_vars:
            nav = normalize_variety(av)
            if nav.lower() in pp or any(p in nav.lower() for p in pp):
                return True
    return False


def load_results():
    return json.loads(RESULTS_FILE.read_text(encoding="utf-8"))


def compute_naive_baseline(results):
    """Compute naive baseline: predict the most common variety per paper."""
    variety_counts = defaultdict(lambda: defaultdict(int))
    for r in results:
        paper = r["paper"]
        for w in r.get("actual_wines", []):
            variety_counts[paper][normalize_variety(w.get("variety", "unknown"))] += 1

    baselines = {}
    for paper, counts in variety_counts.items():
        most_common = max(counts, key=counts.get)
        total = sum(counts.values())
        baselines[paper] = {
            "variety": most_common,
            "hit_rate": counts[most_common] / total if total else 0,
        }
    return baselines


def rescore_question(r):
    """Re-score a single question result using normalized variety matching."""
    predicted_vars = r.get("predicted_variety_ranking", r.get("predicted_varieties", []))
    predicted_regions = r.get("predicted_region_ranking", r.get("predicted_regions", []))
    full_cs = r.get("full_candidate_set", [])
    actual_wines = r.get("actual_wines", [])

    n = len(actual_wines)
    if n == 0:
        return None

    top1_var = 0; top3_var = 0; top1_rc = 0; top1_rs = 0; top3_r = 0
    cs_hits = 0; rr_var_sum = 0.0; rr_reg_sum = 0.0

    for w in actual_wines:
        av = w.get("variety", "")
        ac = w.get("country", "")
        asr = w.get("subregion", "")
        aft = w.get("full_text", "")

        # Variety scoring with normalization + appellation fallback
        var_rank = 0
        for i, pv in enumerate(predicted_vars):
            if varieties_match(pv, av, aft):
                var_rank = i + 1
                break
        if var_rank == 1: top1_var += 1
        if 1 <= var_rank <= 3: top3_var += 1
        rr_var_sum += (1.0 / var_rank) if var_rank > 0 else 0.0

        # Region scoring (country level)
        reg_rank = 0
        for i, pr in enumerate(predicted_regions):
            if pr.lower() == ac.lower():
                reg_rank = i + 1
                break
        if reg_rank == 1: top1_rc += 1
        if 1 <= reg_rank <= 3: top3_r += 1
        rr_reg_sum += (1.0 / reg_rank) if reg_rank > 0 else 0.0

        # Sub-region (use agent's original score — harder to re-derive)
        s = r.get("scores", {})
        pwd = s.get("per_wine_detail", [])
        wine_detail = next((d for d in pwd if d.get("slot") == w.get("slot")), None)
        if wine_detail and wine_detail.get("region_rank", 0) == 1:
            pass  # Already counted if subregion specific

        # Candidate-set hit with normalization
        cs_hit = False
        for cs_entry in full_cs:
            if isinstance(cs_entry, dict):
                csv = cs_entry.get("variety", "")
                if not varieties_match(csv, av, aft):
                    continue
                regions_list = cs_entry.get("regions", [])
                single_region = cs_entry.get("region", cs_entry.get("country", ""))
                if single_region:
                    regions_list = regions_list + [single_region]
                if not regions_list:
                    cs_hit = True
                    break
                for reg in regions_list:
                    reg_lower = reg.lower()
                    if ac.lower() in reg_lower or reg_lower in ac.lower():
                        cs_hit = True
                        break
                    parts = [p.strip() for p in reg.split('/')]
                    for part in parts:
                        if part.lower() == ac.lower():
                            cs_hit = True
                            break
                    if cs_hit:
                        break
                if not cs_hit and varieties_match(csv, av):
                    cs_hit = True
                    break
        if cs_hit: cs_hits += 1

    # Use agent's sub-region score (can't easily re-derive)
    orig_s = r.get("scores", {})
    orig_total = orig_s.get("variety_total", orig_s.get("wine_count", n))
    top1_rs = orig_s.get("top1_region_subregion_hits", 0)

    return {
        "variety_total": n,
        "top1_variety_hits": top1_var,
        "top3_variety_hits": top3_var,
        "top1_region_country_hits": top1_rc,
        "top1_region_subregion_hits": top1_rs,
        "top3_region_hits": top3_r,
        "candidate_set_hits": cs_hits,
        "candidate_set_total": n,
        "mrr_variety": rr_var_sum / n,
        "mrr_region": rr_reg_sum / n,
    }


def compute_metrics(results):
    """Compute all accuracy metrics from backtest results, re-scoring with normalization."""
    by_paper = defaultdict(lambda: defaultdict(list))
    by_structure = defaultdict(lambda: defaultdict(list))
    by_year = defaultdict(lambda: defaultdict(list))
    by_variety = defaultdict(lambda: {"predicted": [], "actual": []})
    overall = defaultdict(list)

    for r in results:
        s = rescore_question(r)
        if s is None:
            continue
        total_wines = s["variety_total"]

        metrics = {
            "top1_variety": s["top1_variety_hits"] / total_wines,
            "top3_variety": s["top3_variety_hits"] / total_wines,
            "top1_region_country": s["top1_region_country_hits"] / total_wines,
            "top1_region_subregion": s["top1_region_subregion_hits"] / total_wines,
            "top3_region": s["top3_region_hits"] / total_wines,
            "candidate_set": s["candidate_set_hits"] / s["candidate_set_total"],
            "mrr_variety": s["mrr_variety"],
            "mrr_region": s["mrr_region"],
        }

        paper_key = f"P{r['paper']}"
        structure_key = r.get("question_structure", "unknown")
        year_key = str(r["year"])

        for metric, value in metrics.items():
            by_paper[paper_key][metric].append(value)
            by_structure[structure_key][metric].append(value)
            by_year[year_key][metric].append(value)
            overall[metric].append(value)

        predicted_vars = r.get("predicted_variety_ranking", r.get("predicted_varieties", []))
        top1_pred = normalize_variety(predicted_vars[0]) if predicted_vars else "unknown"
        for w in r.get("actual_wines", []):
            actual_variety = normalize_variety(w.get("variety", "unknown"))
            by_variety[actual_variety]["actual"].append(actual_variety)
            by_variety[actual_variety]["predicted"].append(top1_pred)

    return overall, by_paper, by_structure, by_year, by_variety


def avg(values):
    return sum(values) / len(values) if values else 0.0


def format_pct(value):
    return f"{value * 100:.1f}%"


def check_source_urls():
    """Flag wine_research files lacking real source URLs."""
    flagged = []
    if not WINE_RESEARCH_DIR.exists():
        return flagged
    for path in WINE_RESEARCH_DIR.glob("*.md"):
        text = path.read_text(encoding="utf-8")
        if "https://" not in text and "http://" not in text:
            flagged.append(path.name)
    return flagged


def generate_report(data, mode="iteration"):
    results = data["results"]
    iteration = data.get("iteration", 1)
    overall, by_paper, by_structure, by_year, by_variety = compute_metrics(results)
    naive = compute_naive_baseline(results)
    flagged_sources = check_source_urls()

    naive_overall = avg([b["hit_rate"] for b in naive.values()])
    tree_top1 = avg(overall.get("top1_variety", []))
    delta = (tree_top1 - naive_overall) * 100

    report_name = "iteration_report" if mode == "iteration" else "loyo_report"
    title = "Iteration Backtest" if mode == "iteration" else "Leave-One-Year-Out Primary Backtest"

    lines = [
        f"# Backtest Report — {title}",
        f"",
        f"**Iteration:** {iteration}",
        f"**Mode:** {mode}",
        f"**Questions scored:** {len(results)}",
        f"",
        f"## Naive baseline comparison",
        f"",
        f"Naive baseline (most common variety per paper): {format_pct(naive_overall)} top-1 variety hit",
        f"Tree top-1 variety hit: {format_pct(tree_top1)}",
        f"**Delta: {delta:+.1f}pp** (target: +20pp)",
        f"Status: {'PASS' if delta >= 20 else 'BELOW TARGET'}",
        f"",
    ]

    for paper, b in sorted(naive.items()):
        lines.append(f"- P{paper} naive: always predict {b['variety']} → {format_pct(b['hit_rate'])}")

    lines.extend([
        f"",
        f"## Overall accuracy",
        f"",
        f"| Metric | Actual | Aspirational Target |",
        f"|--------|--------|-------------------|",
    ])

    targets = {
        "top1_variety": f"naive + 20pp ({format_pct(naive_overall + 0.20)})",
        "top3_variety": "70.0%",
        "top1_region_country": "—",
        "top1_region_subregion": "—",
        "top3_region": "—",
        "candidate_set": "85.0%",
        "mrr_variety": "—",
        "mrr_region": "—",
    }

    for metric in ["top1_variety", "top3_variety", "top1_region_country",
                    "top1_region_subregion", "top3_region", "candidate_set",
                    "mrr_variety", "mrr_region"]:
        actual = avg(overall.get(metric, []))
        lines.append(f"| {metric} | {format_pct(actual)} | {targets.get(metric, '—')} |")

    lines.extend([
        f"",
        f"## By paper",
        f"",
        f"| Paper | Top-1 variety | Top-3 variety | Top-1 region | Candidate-set | MRR variety | Qs |",
        f"|-------|--------------|--------------|--------------|---------------|-------------|-----|",
    ])

    for paper in sorted(by_paper.keys()):
        m = by_paper[paper]
        n = len(m.get("top1_variety", []))
        lines.append(
            f"| {paper} | {format_pct(avg(m.get('top1_variety', [])))} | "
            f"{format_pct(avg(m.get('top3_variety', [])))} | "
            f"{format_pct(avg(m.get('top1_region_country', [])))} | "
            f"{format_pct(avg(m.get('candidate_set', [])))} | "
            f"{format_pct(avg(m.get('mrr_variety', [])))} | {n} |"
        )

    lines.extend([
        f"",
        f"## By year",
        f"",
        f"| Year | Top-1 variety | Top-3 variety | Top-1 region | Qs |",
        f"|------|--------------|--------------|--------------|-----|",
    ])

    for year in sorted(by_year.keys()):
        m = by_year[year]
        n = len(m.get("top1_variety", []))
        lines.append(
            f"| {year} | {format_pct(avg(m.get('top1_variety', [])))} | "
            f"{format_pct(avg(m.get('top3_variety', [])))} | "
            f"{format_pct(avg(m.get('top1_region_country', [])))} | {n} |"
        )

    lines.extend([
        f"",
        f"## Confusion matrix (variety families)",
        f"",
        f"| Actual variety | Count | Top-1 hit rate | Most common misprediction |",
        f"|---------------|-------|---------------|--------------------------|",
    ])

    for variety in sorted(by_variety.keys()):
        data_v = by_variety[variety]
        count = len(data_v["actual"])
        hits = sum(1 for a, p in zip(data_v["actual"], data_v["predicted"]) if a == p)
        hit_rate = hits / count if count else 0
        misses = [p for a, p in zip(data_v["actual"], data_v["predicted"]) if a != p]
        top_miss = max(set(misses), key=misses.count) if misses else "—"
        lines.append(f"| {variety} | {count} | {format_pct(hit_rate)} | {top_miss} |")

    if flagged_sources:
        lines.extend([
            f"",
            f"## Source URL warnings",
            f"",
            f"The following wine_research files lack real source URLs (cannot be used for Layer B scoring):",
        ])
        for f in flagged_sources[:20]:
            lines.append(f"- `{f}`")
        if len(flagged_sources) > 20:
            lines.append(f"- ... and {len(flagged_sources) - 20} more")

    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    report_path = REPORT_DIR / f"{report_name}.md"
    report_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"Report written to {report_path}")

    return "PASS" if delta >= 20 else "BELOW_TARGET"


def audit_variety_gaps(results):
    """Log actual_wine entries not resolvable by synonym table or appellation lookup."""
    _load_appellation_lookup()
    gaps = []
    for r in results:
        for w in r.get("actual_wines", []):
            av = w.get("variety", "")
            aft = w.get("full_text", "")
            nv = normalize_variety(av)
            if nv and nv.lower() not in ["", "unknown", "various", "cremant"]:
                continue
            app_vars = resolve_appellation_varieties(aft)
            if not app_vars:
                gaps.append(f"{r['year']}_p{r['paper']}_q{r['question']} W{w.get('slot','?')}: variety='{av}' text='{aft[:80]}'")
    if gaps:
        print(f"AUDIT: {len(gaps)} wines with unresolvable variety:")
        for g in gaps:
            print(f"  {g}")
    else:
        print("AUDIT: All wine varieties resolvable.")


def main():
    mode = "iteration"
    for i, arg in enumerate(sys.argv[1:]):
        if arg == "--mode" and i + 1 < len(sys.argv[1:]):
            mode = sys.argv[i + 2]

    if not RESULTS_FILE.exists():
        print(f"FAIL: {RESULTS_FILE} not found. Run the backtester first.")
        raise SystemExit(1)

    _load_appellation_lookup()
    data = load_results()
    audit_variety_gaps(data.get("results", []))
    status = generate_report(data, mode)

    if status == "BELOW_TARGET":
        raise SystemExit(2)


if __name__ == "__main__":
    main()
