"""Diagnose P3 candidate-set failures in the LOYO scorer."""
import json
import sys
import io
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

sys.path.insert(0, str(Path(__file__).parent))
from score_predictions import (
    normalize_variety, varieties_match, resolve_appellation_varieties,
    _load_appellation_lookup, _strip_accents, VARIETY_SYNONYMS,
)

_load_appellation_lookup()

preds = json.loads(Path("data/loyo_predictions.json").read_text(encoding="utf-8"))
exams = json.loads(Path("data/exams.json").read_text(encoding="utf-8"))
wines_data = json.loads(Path("data/wines.json").read_text(encoding="utf-8"))
wine_lookup = {w["id"]: w for w in wines_data}


def extract_variety(ft):
    ft_s = _strip_accents(ft).lower()
    checks = [
        ("chardonnay", "Chardonnay"), ("riesling", "Riesling"),
        ("sauvignon blanc", "Sauvignon Blanc"), ("pinot noir", "Pinot Noir"),
        ("cabernet sauvignon", "Cabernet Sauvignon"), ("cabernet franc", "Cabernet Franc"),
        ("merlot", "Merlot"), ("syrah", "Syrah"), ("shiraz", "Shiraz"),
        ("grenache", "Grenache"), ("garnacha", "Grenache"),
        ("tempranillo", "Tempranillo"), ("nebbiolo", "Nebbiolo"),
        ("sangiovese", "Sangiovese"), ("pinot gris", "Pinot Gris"),
        ("pinot grigio", "Pinot Gris"), ("gewurztraminer", "Gewurztraminer"),
        ("chenin blanc", "Chenin Blanc"), ("semillon", "Semillon"),
        ("viognier", "Viognier"), ("muscat", "Muscat"), ("moscato", "Muscat"),
        ("malbec", "Malbec"), ("zinfandel", "Zinfandel"),
        ("mourvedre", "Mourvedre"), ("cinsault", "Cinsault"),
        ("gamay", "Gamay"), ("furmint", "Furmint"),
        ("glera", "Glera"), ("garganega", "Garganega"),
        ("albarino", "Albarino"), ("torrontes", "Torrontes"),
        ("gruner veltliner", "Gruner Veltliner"),
        ("marsanne", "Marsanne"), ("roussanne", "Roussanne"),
        ("savagnin", "Savagnin"), ("palomino", "Palomino"),
        ("pedro ximenez", "Pedro Ximenez"),
        ("sercial", "Sercial"), ("verdelho", "Verdelho"),
        ("boal", "Boal"), ("malmsey", "Malmsey"),
        ("corvina", "Corvina"), ("brachetto", "Brachetto"),
        ("lambrusco", "Lambrusco"), ("touriga", "Touriga Nacional"),
        ("tinta negra", "Tinta Negra"),
    ]
    for pattern, name in checks:
        if pattern in ft_s:
            return name
    app_vars = resolve_appellation_varieties(ft)
    if app_vars:
        return "/".join(app_vars[:2])
    return "Unknown"


def extract_country(ft):
    ft_l = _strip_accents(ft).lower()
    for pattern, name in [
        ("france", "France"), ("italy", "Italy"), ("spain", "Spain"),
        ("germany", "Germany"), ("australia", "Australia"),
        ("new zealand", "New Zealand"), ("usa", "USA"),
        ("california", "USA"), ("oregon", "USA"), ("napa", "USA"),
        ("south africa", "South Africa"), ("portugal", "Portugal"),
        ("argentina", "Argentina"), ("chile", "Chile"),
        ("austria", "Austria"), ("hungary", "Hungary"),
        ("greece", "Greece"), ("england", "England"),
        ("georgia", "Georgia"), ("canada", "Canada"),
    ]:
        if pattern in ft_l:
            return name
    return "Unknown"


p3_preds = sorted(
    [p for p in preds if p["paper"] == 3],
    key=lambda x: (x["year"], x["question"])
)

total_wines = 0
total_cs_hits = 0
failures = []

for pred in p3_preds:
    year = pred["year"]
    question = pred["question"]
    wine_slots = pred["wine_slots"]
    var_ranking = pred["variety_ranking"]
    full_cs = pred["full_candidate_set"]

    for slot in wine_slots:
        wid = "{}_p3_w{}".format(year, slot)
        w = wine_lookup.get(wid, {})
        ft = w.get("full_text", "")
        av = extract_variety(ft)
        ac = extract_country(ft)

        total_wines += 1

        # Check candidate-set hit
        cs_hit = False
        for cs_entry in full_cs:
            csv = cs_entry.get("variety", "")
            if not varieties_match(csv, av, ft):
                continue
            cs_regions = cs_entry.get("regions", [])
            if not cs_regions:
                cs_hit = True
                break
            for cr in cs_regions:
                cr_s = _strip_accents(cr).lower()
                ac_s = _strip_accents(ac).lower()
                if ac_s in cr_s or cr_s in ac_s:
                    cs_hit = True
                    break
            if cs_hit:
                break
            if varieties_match(csv, av, ft):
                cs_hit = True
                break

        if cs_hit:
            total_cs_hits += 1
        else:
            failures.append({
                "qid": "{}_p3_q{}".format(year, question),
                "slot": slot,
                "actual_variety": av,
                "actual_country": ac,
                "full_text": ft[:120],
                "pred_varieties": var_ranking[:5],
                "cs_varieties": [e.get("variety", "") for e in full_cs[:8]],
                "cs_count": len(full_cs),
            })

print("=" * 80)
print("P3 CANDIDATE-SET DIAGNOSIS")
print("=" * 80)
print("Total P3 wines: {}".format(total_wines))
print("CS hits: {}".format(total_cs_hits))
print("CS misses: {}".format(len(failures)))
print("CS hit rate: {:.1%}".format(total_cs_hits / total_wines if total_wines else 0))
print()
print("=" * 80)
print("ALL CS FAILURES (by question)")
print("=" * 80)

by_q = {}
for f in failures:
    by_q.setdefault(f["qid"], []).append(f)

for qid in sorted(by_q):
    wines = by_q[qid]
    print()
    print("--- {} ({} misses) ---".format(qid, len(wines)))
    for w in wines:
        print("  W{}: actual={} ({})".format(w["slot"], w["actual_variety"], w["actual_country"]))
        print("       full_text: {}".format(w["full_text"]))
        print("       pred_vars: {}".format(w["pred_varieties"]))
        print("       cs_vars:   {} ({} entries)".format(w["cs_varieties"], w["cs_count"]))

# Categorize failures
print()
print("=" * 80)
print("FAILURE CATEGORIES")
print("=" * 80)

variety_missing = 0
region_missing = 0
both_missing = 0
unknown_actual = 0

for f in failures:
    av = f["actual_variety"]
    ac = f["actual_country"]

    if av == "Unknown":
        unknown_actual += 1
        continue

    var_in_cs = False
    for csv in f["cs_varieties"]:
        if varieties_match(csv, av):
            var_in_cs = True
            break

    if not var_in_cs:
        variety_missing += 1
    else:
        region_missing += 1

print("Variety not in CS at all:     {}".format(variety_missing))
print("Variety in CS, region wrong:  {}".format(region_missing))
print("Actual variety = Unknown:     {}".format(unknown_actual))
print("Total failures:               {}".format(len(failures)))
