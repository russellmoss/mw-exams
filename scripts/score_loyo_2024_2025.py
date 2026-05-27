"""
LOYO scorer for 2024+2025 folds.

Reads predictions from data/loyo_predictions.json,
reads actual wines from data/exams.json + data/wines.json,
scores using appellation-aware synonym-normalized scorer,
writes data/loyo_scores_2024_2025.json.

No LLM calls. Pure Python aggregation.
"""

import json
import sys
import math
import unicodedata
import re
from collections import defaultdict, Counter
from pathlib import Path

# ------------------------------------------------------------------
# CONSTANTS
# ------------------------------------------------------------------
VARIETY_SYNONYMS = {
    "shiraz": "syrah", "syrah/shiraz": "syrah",
    "garnacha": "grenache", "garnatxa": "grenache",
    "spatburgunder": "pinot noir", "spätburgunder": "pinot noir",
    "pinot grigio": "pinot gris", "grauburgunder": "pinot gris",
    "ruländer": "pinot gris", "rulander": "pinot gris",
    "tinto fino": "tempranillo", "tinta del país": "tempranillo",
    "tinta del pais": "tempranillo", "tinta del toro": "tempranillo",
    "cencibel": "tempranillo",
    "cot": "malbec", "auxerrois": "malbec",
    "bouchet": "cabernet franc",
    "lemberger": "blaufränkisch",
    "kékfrankos": "blaufränkisch", "kekfrankos": "blaufränkisch",
    "monastrell": "mourvèdre", "mataro": "mourvèdre", "mourvedre": "mourvèdre",
    "carmenere": "carménère", "carménère": "carménère",
}

APPELLATION_LOOKUP = {}


def _load_appellation_lookup():
    global APPELLATION_LOOKUP
    p = Path("data/appellation_varieties.json")
    if p.exists():
        APPELLATION_LOOKUP = json.loads(p.read_text(encoding="utf-8"))


def _strip_accents(s):
    nfkd = unicodedata.normalize("NFKD", s)
    out = "".join(c for c in nfkd if not unicodedata.combining(c))
    out = out.replace("‘", "'").replace("’", "'")
    out = out.replace("“", '"').replace("”", '"')
    return out.lower()


def resolve_appellation_varieties(wine_text):
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
    if not name:
        return ""
    s = name.strip()
    s = re.sub(r"\s*\(.*?\)\s*$", "", s)
    s = s.replace(" blend", "").strip()
    parts = [p.strip() for p in s.split("/")]
    normalized = []
    for p in parts:
        low = p.lower()
        resolved = VARIETY_SYNONYMS.get(low, p)
        if resolved and resolved[0].islower():
            resolved = resolved[0].upper() + resolved[1:]
        normalized.append(resolved)
    normalized = sorted(set(normalized), key=lambda x: x.lower())
    return "/".join(normalized)


def varieties_match(predicted, actual, actual_full_text=None):
    np_ = normalize_variety(predicted)
    na_ = normalize_variety(actual)
    if np_ == na_:
        return True
    pp = set(np_.lower().split("/"))
    pa = set(na_.lower().split("/"))
    if pp & pa:
        return True
    if actual_full_text:
        app_vars = resolve_appellation_varieties(actual_full_text)
        for av in app_vars:
            nav = normalize_variety(av)
            if nav.lower() in pp or any(p in nav.lower() for p in pp):
                return True
    return False


# ------------------------------------------------------------------
# Extraction helpers
# ------------------------------------------------------------------
def extract_variety_from_text(ft):
    ft_stripped = _strip_accents(ft)
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
    app_vars = resolve_appellation_varieties(ft)
    if app_vars:
        return "/".join(app_vars[:2])
    return "Unknown"


def extract_country_from_text(ft):
    ft_lower = _strip_accents(ft)
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
        if pattern in ft_lower:
            return name
    return "Unknown"


def extract_subregion_from_text(ft):
    ft_stripped = _strip_accents(ft)
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
        ("peloponnese", "Peloponnese"),
        ("monterey", "Monterey"),
        ("elgin", "Elgin"),
        ("aconcagua", "Aconcagua"),
        ("niagara", "Niagara"),
        ("amyndeon", "Amyndeon"),
        ("gredos", "Sierra de Gredos"),
        ("tietar", "Sierra de Gredos"),
    ]
    for pattern, name in subregion_map:
        if pattern in ft_stripped:
            return name
    return "Unknown"


# ------------------------------------------------------------------
# Scoring
# ------------------------------------------------------------------
def score_question(pred, actual_wines):
    var_ranking = pred.get("variety_ranking", [])
    reg_ranking = pred.get("region_ranking", [])
    full_cs = pred.get("full_candidate_set", [])
    n = len(actual_wines)
    if n == 0:
        return None

    top1_var = 0
    top3_var = 0
    top1_rc = 0
    top1_rs = 0
    top3_r = 0
    cs_hits = 0
    rr_var_sum = 0.0
    rr_reg_sum = 0.0
    per_wine_details = []

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
        if var_rank == 1:
            top1_var += 1
        if 1 <= var_rank <= 3:
            top3_var += 1
        rr_var_sum += (1.0 / var_rank) if var_rank > 0 else 0.0

        # Region scoring (country)
        reg_rank = 0
        for i, pr in enumerate(reg_ranking):
            pr_s = _strip_accents(pr)
            ac_s = _strip_accents(ac)
            if pr_s == ac_s or pr_s in ac_s or ac_s in pr_s:
                reg_rank = i + 1
                break
        if reg_rank == 1:
            top1_rc += 1
        if 1 <= reg_rank <= 3:
            top3_r += 1
        rr_reg_sum += (1.0 / reg_rank) if reg_rank > 0 else 0.0

        # Sub-region scoring
        origins = pred.get("origins_per_slot", {})
        slot_origin = origins.get(str(w["slot"]), {})
        sub_hit = False
        if slot_origin:
            raw = slot_origin.get("raw", "").lower()
            if asr.lower() != "unknown" and _strip_accents(asr) in _strip_accents(raw):
                top1_rs += 1
                sub_hit = True

        # Candidate-set hit
        cs_hit = False
        for cs_entry in full_cs:
            csv = cs_entry.get("variety", "")
            if not varieties_match(csv, av, aft):
                continue
            cs_regions = cs_entry.get("regions", [])
            if not cs_regions:
                cs_hit = True
                break
            for cr in cs_regions:
                cr_s = _strip_accents(cr)
                ac_s = _strip_accents(ac)
                if ac_s in cr_s or cr_s in ac_s:
                    cs_hit = True
                    break
            if cs_hit:
                break
            # If variety matched but regions didn't match, still count variety-only hit
            if varieties_match(csv, av, aft):
                cs_hit = True
                break
        if cs_hit:
            cs_hits += 1

        per_wine_details.append({
            "slot": w["slot"],
            "actual_variety": av,
            "actual_country": ac,
            "actual_subregion": asr,
            "variety_rank": var_rank,
            "variety_top1": var_rank == 1,
            "variety_top3": 1 <= var_rank <= 3,
            "region_rank": reg_rank,
            "region_top1": reg_rank == 1,
            "subregion_hit": sub_hit,
            "candidate_set_hit": cs_hit,
            "mrr_variety": (1.0 / var_rank) if var_rank > 0 else 0.0,
            "mrr_region": (1.0 / reg_rank) if reg_rank > 0 else 0.0,
        })

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
        "per_wine": per_wine_details,
    }


# ------------------------------------------------------------------
# MAIN
# ------------------------------------------------------------------
def main():
    _load_appellation_lookup()

    preds_data = json.loads(Path("data/loyo_predictions.json").read_text(encoding="utf-8"))
    exams_data = json.loads(Path("data/exams.json").read_text(encoding="utf-8"))
    wines_data = json.loads(Path("data/wines.json").read_text(encoding="utf-8"))

    wine_lookup = {w["id"]: w for w in wines_data}

    # Build predictions lookup
    pred_lookup = {}
    for p in preds_data:
        key = (p["year"], p["paper"], p["question"])
        pred_lookup[key] = p

    YEARS = [2024, 2025]
    METRICS = [
        "top1_variety", "top3_variety", "top1_region_country",
        "top1_region_subregion", "top3_region", "candidate_set",
        "mrr_variety", "mrr_region",
    ]

    results = {
        "fold_years": YEARS,
        "total_questions": 0,
        "total_wines": 0,
        "questions": [],
        "per_year": {},
        "overall": {},
        "per_paper": {},
    }

    all_scores = {m: [] for m in METRICS}
    year_scores = {y: {m: [] for m in METRICS} for y in YEARS}
    paper_scores = defaultdict(lambda: {m: [] for m in METRICS})

    for year in YEARS:
        year_exam = next((e for e in exams_data if e["year"] == year), None)
        if not year_exam:
            continue

        for paper_data in year_exam["papers"]:
            paper = paper_data["paper"]
            for q in paper_data["questions"]:
                qnum = q["n"]
                wine_slots = q["wines"]

                pred = pred_lookup.get((year, paper, qnum))
                if not pred:
                    print(f"WARNING: No prediction for {year}_p{paper}_q{qnum}", file=sys.stderr)
                    continue

                # Build actual wines
                actual_wines = []
                for slot in wine_slots:
                    wid = f"{year}_p{paper}_w{slot}"
                    w = wine_lookup.get(wid, {})
                    ft = w.get("full_text", "")
                    if not ft:
                        # Try from exam papers directly
                        for wp in paper_data["wines"]:
                            if wp["slot"] == slot:
                                ft = wp["full_text"]
                                break
                    variety = extract_variety_from_text(ft)
                    country = extract_country_from_text(ft)
                    subregion = extract_subregion_from_text(ft)
                    actual_wines.append({
                        "slot": slot,
                        "variety": variety,
                        "country": country,
                        "subregion": subregion,
                        "full_text": ft,
                    })

                score = score_question(pred, actual_wines)
                if not score:
                    continue

                qid = f"{year}_p{paper}_q{qnum}"
                q_result = {
                    "question_id": qid,
                    "year": year,
                    "paper": paper,
                    "question": qnum,
                    "n_wines": score["n"],
                    "scores": {m: round(score[m], 4) for m in METRICS},
                    "per_wine": score["per_wine"],
                    "predicted_varieties": pred.get("variety_ranking", [])[:5],
                    "predicted_regions": pred.get("region_ranking", [])[:5],
                }
                results["questions"].append(q_result)
                results["total_questions"] += 1
                results["total_wines"] += score["n"]

                for m in METRICS:
                    all_scores[m].append(score[m])
                    year_scores[year][m].append(score[m])
                    paper_scores[paper][m].append(score[m])

    # Compute averages
    def avg(vals):
        return round(sum(vals) / len(vals), 4) if vals else 0.0

    results["overall"] = {m: avg(all_scores[m]) for m in METRICS}

    for y in YEARS:
        results["per_year"][str(y)] = {
            "n_questions": len(year_scores[y][METRICS[0]]),
            "scores": {m: avg(year_scores[y][m]) for m in METRICS},
        }

    for p in sorted(paper_scores.keys()):
        results["per_paper"][str(p)] = {
            "n_questions": len(paper_scores[p][METRICS[0]]),
            "scores": {m: avg(paper_scores[p][m]) for m in METRICS},
        }

    # Write output
    outpath = Path("data/loyo_scores_2024_2025.json")
    outpath.write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Written {outpath}")
    print(f"Total questions: {results['total_questions']}")
    print(f"Total wines: {results['total_wines']}")
    print()
    print("Overall:")
    for m in METRICS:
        print(f"  {m}: {results['overall'][m]*100:.1f}%")
    print()
    for y in YEARS:
        yr = results["per_year"][str(y)]
        print(f"{y} ({yr['n_questions']} questions):")
        for m in METRICS:
            print(f"  {m}: {yr['scores'][m]*100:.1f}%")
        print()
    for p in sorted(paper_scores.keys()):
        pp = results["per_paper"][str(p)]
        print(f"Paper {p} ({pp['n_questions']} questions):")
        for m in METRICS:
            print(f"  {m}: {pp['scores'][m]*100:.1f}%")
        print()

    # Print per-question details
    print("=== Per-question detail ===")
    for q in results["questions"]:
        sc = q["scores"]
        print(f"{q['question_id']}: top1_v={sc['top1_variety']*100:.0f}% top3_v={sc['top3_variety']*100:.0f}% "
              f"top1_rc={sc['top1_region_country']*100:.0f}% cs={sc['candidate_set']*100:.0f}% "
              f"mrr_v={sc['mrr_variety']:.2f}")
        for w in q["per_wine"]:
            hit_v = "Y" if w["variety_top1"] else ("T3" if w["variety_top3"] else "N")
            hit_r = "Y" if w["region_top1"] else "N"
            print(f"  w{w['slot']}: {w['actual_variety']} ({w['actual_country']}/{w['actual_subregion']}) "
                  f"var_rank={w['variety_rank']} [{hit_v}] "
                  f"reg_rank={w['region_rank']} [{hit_r}] "
                  f"cs={w['candidate_set_hit']}")


if __name__ == "__main__":
    main()
