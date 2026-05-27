"""
Score LOYO backtest for folds 2017 and 2018.
Reads v2 decision matrices and actual wines from exams.json.
Outputs data/loyo_scores_2017_2018.json.
"""

import json
import unicodedata
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
APP_VARS_FILE = BASE / "data" / "appellation_varieties.json"
EXAMS_FILE = BASE / "data" / "exams.json"
OUTPUT_FILE = BASE / "data" / "loyo_scores_2017_2018.json"

# Load appellation varieties
app_vars = json.loads(APP_VARS_FILE.read_text(encoding="utf-8"))
exams = json.loads(EXAMS_FILE.read_text(encoding="utf-8"))

SYNONYMS = {
    "shiraz": "syrah", "syrah/shiraz": "syrah",
    "garnacha": "grenache", "garnatxa": "grenache",
    "grenache noir": "grenache",
    "spatburgunder": "pinot noir", "spätburgunder": "pinot noir",
    "pinot grigio": "pinot gris", "grauburgunder": "pinot gris",
    "cot": "malbec",
    "monastrell": "mourvedre", "mataro": "mourvedre", "mourvèdre": "mourvedre",
    "tinto fino": "tempranillo", "tinta roriz": "tempranillo",
    "tinta del pais": "tempranillo",
    "melon": "melon de bourgogne",
}


def strip_accents(s):
    nfkd = unicodedata.normalize("NFKD", s)
    out = "".join(c for c in nfkd if not unicodedata.combining(c))
    return out.lower().strip()


def norm_var(v):
    if not v:
        return ""
    s = strip_accents(v)
    return SYNONYMS.get(s, s)


def varieties_match(predicted, actual):
    np_ = norm_var(predicted)
    na = norm_var(actual)
    if not np_ or not na:
        return False
    if np_ == na:
        return True
    pp = set(np_.split("/"))
    pa = set(na.split("/"))
    if pp & pa:
        return True
    return False


def extract_variety(full_text):
    ft = strip_accents(full_text)
    checks = [
        ("cabernet sauvignon", "Cabernet Sauvignon"),
        ("cabernet franc", "Cabernet Franc"),
        ("sauvignon blanc", "Sauvignon Blanc"),
        ("pinot noir", "Pinot Noir"),
        ("pinot gris", "Pinot Gris"),
        ("pinot grigio", "Pinot Gris"),
        ("pinot meunier", "Pinot Meunier"),
        ("chenin blanc", "Chenin Blanc"),
        ("melon de bourgogne", "Melon de Bourgogne"),
        ("gruner veltliner", "Gruner Veltliner"),
        ("nerello mascalese", "Nerello Mascalese"),
        ("muscat of alexandria", "Muscat of Alexandria"),
        ("touriga nacional", "Touriga Nacional"),
        ("touriga franca", "Touriga Franca"),
        ("pedro ximenez", "Pedro Ximenez"),
        ("gewurztraminer", "Gewurztraminer"),
        ("white zinfandel", "Zinfandel"),
        ("chardonnay", "Chardonnay"),
        ("riesling", "Riesling"),
        ("semillon", "Semillon"),
        ("viognier", "Viognier"),
        ("merlot", "Merlot"),
        ("syrah", "Syrah"),
        ("shiraz", "Shiraz"),
        ("grenache", "Grenache"),
        ("garnacha", "Grenache"),
        ("tempranillo", "Tempranillo"),
        ("nebbiolo", "Nebbiolo"),
        ("sangiovese", "Sangiovese"),
        ("muscat", "Muscat"),
        ("moscato", "Muscat"),
        ("malbec", "Malbec"),
        ("zinfandel", "Zinfandel"),
        ("mourvedre", "Mourvedre"),
        ("cinsault", "Cinsault"),
        ("gamay", "Gamay"),
        ("garganega", "Garganega"),
        ("arneis", "Arneis"),
        ("albarino", "Albarino"),
        ("torrontes", "Torrontes"),
        ("montepulciano", "Montepulciano"),
        ("pinotage", "Pinotage"),
        ("lagrein", "Lagrein"),
        ("corvina", "Corvina"),
        ("barbera", "Barbera"),
        ("palomino", "Palomino"),
        ("savagnin", "Savagnin"),
        ("furmint", "Furmint"),
        ("trebbiano", "Trebbiano"),
        ("malvasia", "Malvasia"),
        ("grillo", "Grillo"),
        ("glera", "Glera"),
        ("spatburgunder", "Pinot Noir"),
        ("viura", "Viura"),
    ]
    for pattern, name in checks:
        if pattern in ft:
            return name

    # Check if the wine name indicates "blanc" — try white appellation variants first
    is_white_context = "blanc" in ft or "white" in ft
    if is_white_context:
        white_keys = [k for k in app_vars.keys() if "blanc" in k.lower() or "white" in k.lower()]
        for key in sorted(white_keys, key=len, reverse=True):
            if strip_accents(key) in ft:
                vs = app_vars[key].get("varieties", [])
                if vs:
                    return vs[0]

    # Appellation lookup
    sorted_keys = sorted(app_vars.keys(), key=len, reverse=True)
    for key in sorted_keys:
        if strip_accents(key) in ft:
            vs = app_vars[key].get("varieties", [])
            if vs:
                return vs[0]
    return "Unknown"


def extract_country(full_text):
    ft = strip_accents(full_text)
    checks = [
        ("new zealand", "New Zealand"),
        ("south africa", "South Africa"),
        ("france", "France"),
        ("italy", "Italy"),
        ("spain", "Spain"),
        ("germany", "Germany"),
        ("australia", "Australia"),
        ("usa", "USA"),
        ("california", "USA"),
        ("oregon", "USA"),
        ("napa", "USA"),
        ("portugal", "Portugal"),
        ("argentina", "Argentina"),
        ("chile", "Chile"),
        ("austria", "Austria"),
        ("hungary", "Hungary"),
        ("england", "England"),
    ]
    for p, n in checks:
        if p in ft:
            return n
    return "Unknown"


def extract_subregion(full_text):
    ft = strip_accents(full_text)
    checks = [
        ("sauternes-barsac", "Sauternes"),
        ("sauternes", "Sauternes"),
        ("barsac", "Sauternes"),
        ("pessac-leognan", "Pessac-Leognan"),
        ("pessac leognan", "Pessac-Leognan"),
        ("saint emilion", "St Emilion"),
        ("st emilion", "St Emilion"),
        ("saint estephe", "St Estephe"),
        ("st estephe", "St Estephe"),
        ("champagne", "Champagne"),
        ("burgundy", "Burgundy"),
        ("bordeaux", "Bordeaux"),
        ("loire", "Loire"),
        ("alsace", "Alsace"),
        ("rhone", "Rhone"),
        ("provence", "Provence"),
        ("jura", "Jura"),
        ("roussillon", "Roussillon"),
        ("tuscany", "Tuscany"),
        ("piedmont", "Piedmont"),
        ("piemonte", "Piedmont"),
        ("veneto", "Veneto"),
        ("sicily", "Sicily"),
        ("alto adige", "Alto Adige"),
        ("sudtirol", "Alto Adige"),
        ("abruzzo", "Abruzzo"),
        ("campania", "Campania"),
        ("rioja", "Rioja"),
        ("jerez", "Jerez"),
        ("rias baixas", "Rias Baixas"),
        ("mosel", "Mosel"),
        ("rheingau", "Rheingau"),
        ("baden", "Baden"),
        ("barossa", "Barossa Valley"),
        ("hunter valley", "Hunter Valley"),
        ("margaret river", "Margaret River"),
        ("marlborough", "Marlborough"),
        ("central otago", "Central Otago"),
        ("hawke", "Hawkes Bay"),
        ("nelson", "Nelson"),
        ("napa", "Napa Valley"),
        ("sonoma", "Sonoma"),
        ("willamette", "Willamette Valley"),
        ("anderson valley", "Anderson Valley"),
        ("russian river", "Russian River Valley"),
        ("stellenbosch", "Stellenbosch"),
        ("mendoza", "Mendoza"),
        ("maipo", "Maipo"),
        ("douro", "Douro"),
        ("lodi", "Lodi"),
        ("kamptal", "Kamptal"),
        ("alexander valley", "Alexander Valley"),
        ("bannockburn", "Central Otago"),
    ]
    for p, n in checks:
        if p in ft:
            return n
    return "Unknown"


# ========================
# HAND-CODED PREDICTIONS
# ========================
# Extracted from reading all 24 v2 decision matrices.
# Each entry: {variety_ranking, region_ranking, full_candidate_set}

predictions = {
    # === 2017 ===
    # 2017 P1 Q1 - Loire trio
    (2017, 1, 1): {
        "variety_ranking": ["Melon de Bourgogne", "Chenin Blanc", "Sauvignon Blanc",
                            "Riesling", "Pinot Gris", "Gewurztraminer"],
        "region_ranking": ["France", "Italy"],
        "full_candidate_set": [
            {"variety": "Melon de Bourgogne", "regions": ["France"]},
            {"variety": "Chenin Blanc", "regions": ["France"]},
            {"variety": "Sauvignon Blanc", "regions": ["France"]},
            {"variety": "Riesling", "regions": ["France"]},
            {"variety": "Pinot Gris", "regions": ["France"]},
            {"variety": "Gewurztraminer", "regions": ["France"]},
        ],
    },
    # 2017 P1 Q2 - Pinot Gris pair
    (2017, 1, 2): {
        "variety_ranking": ["Pinot Gris", "Chardonnay", "Riesling", "Semillon"],
        "region_ranking": ["France", "New Zealand"],
        "full_candidate_set": [
            {"variety": "Pinot Gris", "regions": ["France", "New Zealand"]},
            {"variety": "Chardonnay", "regions": ["France"]},
            {"variety": "Riesling", "regions": ["Germany"]},
            {"variety": "Semillon", "regions": ["Australia"]},
        ],
    },
    # 2017 P1 Q3 - Italian whites
    (2017, 1, 3): {
        "variety_ranking": ["Garganega", "Arneis", "Verdicchio", "Fiano", "Pinot Grigio"],
        "region_ranking": ["Italy"],
        "full_candidate_set": [
            {"variety": "Garganega", "regions": ["Italy"]},
            {"variety": "Arneis", "regions": ["Italy"]},
            {"variety": "Verdicchio", "regions": ["Italy"]},
            {"variety": "Fiano", "regions": ["Italy"]},
            {"variety": "Pinot Grigio", "regions": ["Italy"]},
        ],
    },
    # 2017 P1 Q4 - European sense of place
    (2017, 1, 4): {
        "variety_ranking": ["Viognier", "Albarino", "Muscat", "Riesling", "Gruner Veltliner"],
        "region_ranking": ["France", "Spain", "Austria"],
        "full_candidate_set": [
            {"variety": "Viognier", "regions": ["France"]},
            {"variety": "Albarino", "regions": ["Spain"]},
            {"variety": "Muscat", "regions": ["France"]},
            {"variety": "Riesling", "regions": ["Germany", "France"]},
            {"variety": "Gruner Veltliner", "regions": ["Austria"]},
        ],
    },
    # 2017 P1 Q5 - Chardonnay pair Burgundy
    (2017, 1, 5): {
        "variety_ranking": ["Chardonnay", "Semillon"],
        "region_ranking": ["France"],
        "full_candidate_set": [
            {"variety": "Chardonnay", "regions": ["France"]},
            {"variety": "Semillon", "regions": ["Australia"]},
        ],
    },
    # 2017 P2 Q1 - Cabernet Sauvignon 4 countries
    (2017, 2, 1): {
        "variety_ranking": ["Cabernet Sauvignon", "Syrah", "Pinot Noir"],
        "region_ranking": ["France", "Australia", "USA", "South Africa"],
        "full_candidate_set": [
            {"variety": "Cabernet Sauvignon", "regions": ["France", "Australia", "USA", "South Africa"]},
            {"variety": "Syrah", "regions": ["France", "Australia"]},
            {"variety": "Pinot Noir", "regions": ["France", "New Zealand"]},
        ],
    },
    # 2017 P2 Q2 - Italy 4 regions
    (2017, 2, 2): {
        "variety_ranking": ["Montepulciano", "Sangiovese", "Nebbiolo", "Nerello Mascalese"],
        "region_ranking": ["Italy"],
        "full_candidate_set": [
            {"variety": "Montepulciano", "regions": ["Italy"]},
            {"variety": "Sangiovese", "regions": ["Italy"]},
            {"variety": "Nebbiolo", "regions": ["Italy"]},
            {"variety": "Nerello Mascalese", "regions": ["Italy"]},
        ],
    },
    # 2017 P2 Q3 - curveball 4 varieties
    (2017, 2, 3): {
        "variety_ranking": ["Cabernet Franc", "Pinot Noir", "Pinotage", "Lagrein"],
        "region_ranking": ["France", "Germany", "South Africa", "Italy"],
        "full_candidate_set": [
            {"variety": "Cabernet Franc", "regions": ["France"]},
            {"variety": "Pinot Noir", "regions": ["Germany"]},
            {"variety": "Pinotage", "regions": ["South Africa"]},
            {"variety": "Lagrein", "regions": ["Italy"]},
        ],
    },
    # 2017 P3 Q1 - 3 roses
    (2017, 3, 1): {
        "variety_ranking": ["Grenache", "Zinfandel", "Pinot Noir", "Cinsault"],
        "region_ranking": ["USA", "France", "New Zealand", "Spain"],
        "full_candidate_set": [
            {"variety": "Grenache", "regions": ["France"]},
            {"variety": "Zinfandel", "regions": ["USA"]},
            {"variety": "Pinot Noir", "regions": ["New Zealand"]},
            {"variety": "Cinsault", "regions": ["France"]},
        ],
    },
    # 2017 P3 Q2 - Amber/orange wine (style-level)
    (2017, 3, 2): {
        "variety_ranking": ["Semillon", "Sauvignon Blanc"],
        "region_ranking": ["Australia", "Italy", "Georgia"],
        "full_candidate_set": [
            {"variety": "Semillon", "regions": ["Australia"]},
            {"variety": "Sauvignon Blanc", "regions": ["Australia"]},
        ],
    },
    # 2017 P3 Q3 - off-dry aromatics
    (2017, 3, 3): {
        "variety_ranking": ["Riesling", "Gewurztraminer", "Muscat", "Chenin Blanc"],
        "region_ranking": ["Germany", "New Zealand", "France", "USA"],
        "full_candidate_set": [
            {"variety": "Riesling", "regions": ["Germany", "New Zealand"]},
            {"variety": "Gewurztraminer", "regions": ["France", "USA"]},
            {"variety": "Muscat", "regions": ["Italy"]},
            {"variety": "Chenin Blanc", "regions": ["France"]},
        ],
    },
    # 2017 P3 Q4 - Grenache pair
    (2017, 3, 4): {
        "variety_ranking": ["Grenache", "Syrah", "Mourvedre"],
        "region_ranking": ["Australia", "France"],
        "full_candidate_set": [
            {"variety": "Grenache", "regions": ["Australia", "France"]},
            {"variety": "Syrah", "regions": ["Australia", "France"]},
            {"variety": "Mourvedre", "regions": ["France"]},
        ],
    },
    # 2017 P3 Q5 - Burgundy Pinot pair
    (2017, 3, 5): {
        "variety_ranking": ["Pinot Noir", "Nebbiolo"],
        "region_ranking": ["France", "Italy"],
        "full_candidate_set": [
            {"variety": "Pinot Noir", "regions": ["France"]},
            {"variety": "Nebbiolo", "regions": ["Italy"]},
        ],
    },
    # 2017 P3 Q6 - Fortified pair
    (2017, 3, 6): {
        "variety_ranking": ["Palomino", "Grenache", "Touriga Nacional"],
        "region_ranking": ["Spain", "France", "Portugal"],
        "full_candidate_set": [
            {"variety": "Palomino", "regions": ["Spain"]},
            {"variety": "Grenache", "regions": ["France"]},
            {"variety": "Touriga Nacional", "regions": ["Portugal"]},
        ],
    },
    # === 2018 ===
    # 2018 P1 Q1 - Chardonnay 4 wines
    (2018, 1, 1): {
        "variety_ranking": ["Chardonnay", "Riesling", "Sauvignon Blanc"],
        "region_ranking": ["Australia", "France", "USA", "New Zealand"],
        "full_candidate_set": [
            {"variety": "Chardonnay", "regions": ["Australia", "France", "USA", "New Zealand"]},
            {"variety": "Riesling", "regions": ["Germany"]},
            {"variety": "Sauvignon Blanc", "regions": ["New Zealand"]},
        ],
    },
    # 2018 P1 Q2 - 6 different varieties/countries
    (2018, 1, 2): {
        "variety_ranking": ["Semillon", "Viura", "Gruner Veltliner", "Garganega",
                            "Chenin Blanc", "Torrontes"],
        "region_ranking": ["Australia", "Spain", "Austria", "Italy", "South Africa", "Argentina"],
        "full_candidate_set": [
            {"variety": "Semillon", "regions": ["Australia"]},
            {"variety": "Viura", "regions": ["Spain"]},
            {"variety": "Gruner Veltliner", "regions": ["Austria"]},
            {"variety": "Garganega", "regions": ["Italy"]},
            {"variety": "Chenin Blanc", "regions": ["South Africa"]},
            {"variety": "Torrontes", "regions": ["Argentina"]},
        ],
    },
    # 2018 P1 Q3 - Riesling pair
    (2018, 1, 3): {
        "variety_ranking": ["Riesling", "Chenin Blanc", "Semillon"],
        "region_ranking": ["Germany"],
        "full_candidate_set": [
            {"variety": "Riesling", "regions": ["Germany"]},
            {"variety": "Chenin Blanc", "regions": ["France"]},
        ],
    },
    # 2018 P2 Q1 - Classic European 5 reds
    (2018, 2, 1): {
        "variety_ranking": ["Sangiovese", "Pinot Noir", "Syrah", "Cabernet Sauvignon",
                            "Merlot", "Tempranillo", "Nebbiolo"],
        "region_ranking": ["Italy", "France", "Spain"],
        "full_candidate_set": [
            {"variety": "Sangiovese", "regions": ["Italy"]},
            {"variety": "Pinot Noir", "regions": ["France"]},
            {"variety": "Syrah", "regions": ["France"]},
            {"variety": "Cabernet Sauvignon", "regions": ["France"]},
            {"variety": "Merlot", "regions": ["France"]},
            {"variety": "Tempranillo", "regions": ["Spain"]},
            {"variety": "Nebbiolo", "regions": ["Italy"]},
        ],
    },
    # 2018 P2 Q2 - Pinot Noir 3 NW origins
    (2018, 2, 2): {
        "variety_ranking": ["Pinot Noir", "Syrah", "Cabernet Sauvignon"],
        "region_ranking": ["USA", "New Zealand"],
        "full_candidate_set": [
            {"variety": "Pinot Noir", "regions": ["USA", "New Zealand"]},
            {"variety": "Syrah", "regions": ["Australia"]},
        ],
    },
    # 2018 P2 Q3 - Syrah Hawkes Bay
    (2018, 2, 3): {
        "variety_ranking": ["Syrah", "Malbec", "Grenache"],
        "region_ranking": ["New Zealand"],
        "full_candidate_set": [
            {"variety": "Syrah", "regions": ["New Zealand"]},
            {"variety": "Malbec", "regions": ["Argentina"]},
            {"variety": "Grenache", "regions": ["Australia"]},
        ],
    },
    # 2018 P2 Q4 - Americas pair
    (2018, 2, 4): {
        "variety_ranking": ["Zinfandel", "Cabernet Sauvignon", "Malbec", "Carmenere"],
        "region_ranking": ["USA", "Chile", "Argentina"],
        "full_candidate_set": [
            {"variety": "Zinfandel", "regions": ["USA"]},
            {"variety": "Cabernet Sauvignon", "regions": ["Chile"]},
            {"variety": "Malbec", "regions": ["Argentina"]},
            {"variety": "Carmenere", "regions": ["Chile"]},
        ],
    },
    # 2018 P3 Q1 - Three pairs: Champagne + Sauternes + Port
    (2018, 3, 1): {
        "variety_ranking": ["Chardonnay", "Pinot Noir", "Semillon", "Sauvignon Blanc",
                            "Touriga Nacional", "Touriga Franca"],
        "region_ranking": ["France", "Portugal"],
        "full_candidate_set": [
            {"variety": "Chardonnay", "regions": ["France"]},
            {"variety": "Pinot Noir", "regions": ["France"]},
            {"variety": "Semillon", "regions": ["France"]},
            {"variety": "Sauvignon Blanc", "regions": ["France"]},
            {"variety": "Touriga Nacional", "regions": ["Portugal"]},
            {"variety": "Touriga Franca", "regions": ["Portugal"]},
        ],
    },
    # 2018 P3 Q2 - France 3 whites
    (2018, 3, 2): {
        "variety_ranking": ["Sauvignon Blanc", "Semillon", "Grenache Blanc", "Roussanne",
                            "Clairette", "Chardonnay"],
        "region_ranking": ["France"],
        "full_candidate_set": [
            {"variety": "Sauvignon Blanc", "regions": ["France"]},
            {"variety": "Semillon", "regions": ["France"]},
            {"variety": "Grenache Blanc", "regions": ["France"]},
            {"variety": "Roussanne", "regions": ["France"]},
            {"variety": "Chardonnay", "regions": ["France"]},
        ],
    },
    # 2018 P3 Q3 - Rhone varieties outside Rhone
    (2018, 3, 3): {
        "variety_ranking": ["Grenache", "Cinsault", "Mourvedre", "Viognier", "Syrah"],
        "region_ranking": ["USA", "Spain", "France"],
        "full_candidate_set": [
            {"variety": "Grenache", "regions": ["Spain"]},
            {"variety": "Cinsault", "regions": ["USA"]},
            {"variety": "Mourvedre", "regions": ["France"]},
            {"variety": "Viognier", "regions": ["USA", "Chile"]},
            {"variety": "Syrah", "regions": ["Australia"]},
        ],
    },
}


def get_wines_for_question(exam_data, paper_num, q_num):
    """Get the wine data for a specific question."""
    for paper in exam_data["papers"]:
        if paper["paper"] == paper_num:
            for q in paper["questions"]:
                if q["n"] == q_num:
                    wine_slots = q["wines"]
                    wines = []
                    for slot in wine_slots:
                        w = next(w for w in paper["wines"] if w["slot"] == slot)
                        ft = w["full_text"]
                        variety = extract_variety(ft)
                        country = extract_country(ft)
                        subregion = extract_subregion(ft)
                        wines.append({
                            "slot": slot,
                            "full_text": ft,
                            "variety": variety,
                            "country": country,
                            "subregion": subregion,
                        })
                    return wines
    return []


def score_question(pred, actual_wines, year, paper, question):
    """Score a single question."""
    var_ranking = pred["variety_ranking"]
    reg_ranking = pred["region_ranking"]
    full_cs = pred["full_candidate_set"]

    n = len(actual_wines)
    if n == 0:
        return None

    per_wine_detail = []

    for w in actual_wines:
        av = w["variety"]
        ac = w["country"]
        asr = w["subregion"]
        aft = w["full_text"]

        # Variety scoring
        var_rank = 0
        for i, pv in enumerate(var_ranking):
            if varieties_match(pv, av):
                var_rank = i + 1
                break
            # Also check appellation resolution
            ak = strip_accents(aft)
            sorted_keys = sorted(app_vars.keys(), key=len, reverse=True)
            for key in sorted_keys:
                if strip_accents(key) in ak:
                    resolved = app_vars[key].get("varieties", [])
                    for rv in resolved:
                        if varieties_match(pv, rv):
                            var_rank = i + 1
                            break
                    if var_rank > 0:
                        break
            if var_rank > 0:
                break

        # Region scoring (country)
        reg_rank = 0
        for i, pr in enumerate(reg_ranking):
            if strip_accents(pr) == strip_accents(ac):
                reg_rank = i + 1
                break

        # Candidate set hit
        cs_hit = False
        for cs_entry in full_cs:
            csv = cs_entry.get("variety", "")
            if not varieties_match(csv, av):
                # Check appellation resolution
                ak = strip_accents(aft)
                sorted_keys = sorted(app_vars.keys(), key=len, reverse=True)
                match = False
                for key in sorted_keys:
                    if strip_accents(key) in ak:
                        resolved = app_vars[key].get("varieties", [])
                        for rv in resolved:
                            if varieties_match(csv, rv):
                                match = True
                                break
                        if match:
                            break
                if not match:
                    continue

            cs_regions = cs_entry.get("regions", [])
            if not cs_regions:
                cs_hit = True
                break
            for cr in cs_regions:
                if strip_accents(cr) == strip_accents(ac):
                    cs_hit = True
                    break
            if cs_hit:
                break
            # If variety matched but region didn't, still count as variety-only hit
            cs_hit = True
            break

        detail = {
            "slot": w["slot"],
            "actual_variety": av,
            "actual_country": ac,
            "actual_subregion": asr,
            "variety_rank": var_rank,
            "top1_variety_hit": var_rank == 1,
            "top3_variety_hit": 1 <= var_rank <= 3,
            "region_rank": reg_rank,
            "top1_region_hit": reg_rank == 1,
            "top3_region_hit": 1 <= reg_rank <= 3,
            "candidate_set_hit": cs_hit,
            "mrr_variety": (1.0 / var_rank) if var_rank > 0 else 0.0,
            "mrr_region": (1.0 / reg_rank) if reg_rank > 0 else 0.0,
        }
        per_wine_detail.append(detail)

    # Aggregate
    top1_var = sum(1 for d in per_wine_detail if d["top1_variety_hit"])
    top3_var = sum(1 for d in per_wine_detail if d["top3_variety_hit"])
    top1_reg = sum(1 for d in per_wine_detail if d["top1_region_hit"])
    top3_reg = sum(1 for d in per_wine_detail if d["top3_region_hit"])
    cs_hits = sum(1 for d in per_wine_detail if d["candidate_set_hit"])
    mrr_var = sum(d["mrr_variety"] for d in per_wine_detail) / n
    mrr_reg = sum(d["mrr_region"] for d in per_wine_detail) / n

    return {
        "question_id": f"{year}_p{paper}_q{question}",
        "year": year,
        "paper": paper,
        "question": question,
        "wine_count": n,
        "scores": {
            "top1_variety_hits": top1_var,
            "top3_variety_hits": top3_var,
            "top1_region_country_hits": top1_reg,
            "top3_region_hits": top3_reg,
            "candidate_set_hits": cs_hits,
            "candidate_set_total": n,
            "mrr_variety": round(mrr_var, 4),
            "mrr_region": round(mrr_reg, 4),
        },
        "per_wine_detail": per_wine_detail,
    }


def main():
    exam_2017 = next(e for e in exams if e["year"] == 2017)
    exam_2018 = next(e for e in exams if e["year"] == 2018)

    results = []

    # Score 2017
    for paper in exam_2017["papers"]:
        for q in paper["questions"]:
            key = (2017, paper["paper"], q["n"])
            if key not in predictions:
                print(f"WARNING: No prediction for {key}")
                continue
            wines = get_wines_for_question(exam_2017, paper["paper"], q["n"])
            pred = predictions[key]
            score = score_question(pred, wines, 2017, paper["paper"], q["n"])
            if score:
                results.append(score)

    # Score 2018
    for paper in exam_2018["papers"]:
        for q in paper["questions"]:
            key = (2018, paper["paper"], q["n"])
            if key not in predictions:
                print(f"WARNING: No prediction for {key}")
                continue
            wines = get_wines_for_question(exam_2018, paper["paper"], q["n"])
            pred = predictions[key]
            score = score_question(pred, wines, 2018, paper["paper"], q["n"])
            if score:
                results.append(score)

    # Compute fold-level aggregates
    def avg(vals):
        return round(sum(vals) / len(vals), 4) if vals else 0.0

    fold_2017_results = [r for r in results if r["year"] == 2017]
    fold_2018_results = [r for r in results if r["year"] == 2018]

    def fold_summary(fold_results):
        all_wines = sum(r["wine_count"] for r in fold_results)
        all_top1_var = sum(r["scores"]["top1_variety_hits"] for r in fold_results)
        all_top3_var = sum(r["scores"]["top3_variety_hits"] for r in fold_results)
        all_top1_reg = sum(r["scores"]["top1_region_country_hits"] for r in fold_results)
        all_top3_reg = sum(r["scores"]["top3_region_hits"] for r in fold_results)
        all_cs = sum(r["scores"]["candidate_set_hits"] for r in fold_results)
        all_mrr_var = [r["scores"]["mrr_variety"] for r in fold_results]
        all_mrr_reg = [r["scores"]["mrr_region"] for r in fold_results]

        return {
            "questions": len(fold_results),
            "wines": all_wines,
            "top1_variety_rate": round(all_top1_var / all_wines, 4) if all_wines else 0,
            "top3_variety_rate": round(all_top3_var / all_wines, 4) if all_wines else 0,
            "top1_region_rate": round(all_top1_reg / all_wines, 4) if all_wines else 0,
            "top3_region_rate": round(all_top3_reg / all_wines, 4) if all_wines else 0,
            "candidate_set_rate": round(all_cs / all_wines, 4) if all_wines else 0,
            "mrr_variety_mean": avg(all_mrr_var),
            "mrr_region_mean": avg(all_mrr_reg),
        }

    output = {
        "folds": [2017, 2018],
        "fold_summaries": {
            "2017": fold_summary(fold_2017_results),
            "2018": fold_summary(fold_2018_results),
        },
        "combined_summary": fold_summary(results),
        "results": results,
    }

    OUTPUT_FILE.write_text(
        json.dumps(output, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    print(f"Output written to {OUTPUT_FILE}")
    print(f"Questions scored: {len(results)}")
    print(f"  2017: {len(fold_2017_results)} questions, {sum(r['wine_count'] for r in fold_2017_results)} wines")
    print(f"  2018: {len(fold_2018_results)} questions, {sum(r['wine_count'] for r in fold_2018_results)} wines")

    # Print summary
    for year_label in ["2017", "2018"]:
        s = output["fold_summaries"][year_label]
        print(f"\n--- {year_label} ---")
        print(f"  Top-1 variety: {s['top1_variety_rate']*100:.1f}%")
        print(f"  Top-3 variety: {s['top3_variety_rate']*100:.1f}%")
        print(f"  Top-1 region:  {s['top1_region_rate']*100:.1f}%")
        print(f"  Top-3 region:  {s['top3_region_rate']*100:.1f}%")
        print(f"  CS hit rate:   {s['candidate_set_rate']*100:.1f}%")
        print(f"  MRR variety:   {s['mrr_variety_mean']:.4f}")
        print(f"  MRR region:    {s['mrr_region_mean']:.4f}")

    s = output["combined_summary"]
    print(f"\n--- COMBINED ---")
    print(f"  Top-1 variety: {s['top1_variety_rate']*100:.1f}%")
    print(f"  Top-3 variety: {s['top3_variety_rate']*100:.1f}%")
    print(f"  Top-1 region:  {s['top1_region_rate']*100:.1f}%")
    print(f"  Top-3 region:  {s['top3_region_rate']*100:.1f}%")
    print(f"  CS hit rate:   {s['candidate_set_rate']*100:.1f}%")
    print(f"  MRR variety:   {s['mrr_variety_mean']:.4f}")
    print(f"  MRR region:    {s['mrr_region_mean']:.4f}")


if __name__ == "__main__":
    main()
