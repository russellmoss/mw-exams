"""Score a blind tree backtest: ranked predictions vs resolved ground truth.

Inputs (all under --dir):
  preds/*.json      per-question predictions {id, varieties_ranked, countries_ranked,
                    regions_ranked, tree_branch, confidence}
  truth/*.json      per-wine resolved truth  {id, slot, variety, country, region}
  era1_answer_key.json  used only to check every wine got resolved

Metrics (computed per WINE, aggregated per paper and overall), matching the conventions
already used in data/backtest_results.json:
  variety_top1 / variety_top3 / variety_in_set
  country_top1 / country_top3 / country_in_set
  region_in_set   (region strings are noisy, so only set membership is scored)
  mrr_variety / mrr_country   (reciprocal rank; 0 if absent)

Run:  python scripts/score_backtest.py --dir <dir> [--out <report.json>]
"""

import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

# Variety synonyms — the prediction and the bottle often use different names for one grape.
SYNONYMS = {
    "shiraz": "syrah", "pinot grigio": "pinot gris", "pinot nero": "pinot noir",
    "grauburgunder": "pinot gris", "weissburgunder": "pinot blanc",
    "spatburgunder": "pinot noir", "spätburgunder": "pinot noir",
    "tempranillo": "tempranillo", "tinta roriz": "tempranillo", "aragonez": "tempranillo",
    "garnacha": "grenache", "garnatxa": "grenache", "cannonau": "grenache",
    "monastrell": "mourvedre", "mataro": "mourvedre", "mourvèdre": "mourvedre",
    "carignan": "carignan", "carinena": "carignan", "mazuelo": "carignan",
    "gewurztraminer": "gewurztraminer", "gewürztraminer": "gewurztraminer",
    "malvasia": "malvasia", "malmsey": "malvasia",
    "verdelho": "verdelho", "sercial": "sercial", "bual": "boal", "boal": "boal",
    "furmint": "furmint", "gruner veltliner": "gruner veltliner",
    "grüner veltliner": "gruner veltliner", "gruener veltliner": "gruner veltliner",
    "albarino": "albarino", "albariño": "albarino", "alvarinho": "albarino",
    "macabeo": "macabeo", "viura": "macabeo",
    "ugni blanc": "trebbiano", "trebbiano": "trebbiano",
    "sangiovese": "sangiovese", "brunello": "sangiovese", "nielluccio": "sangiovese",
    "cabernet sauvignon": "cabernet sauvignon", "cab sauv": "cabernet sauvignon",
    "sauvignon blanc": "sauvignon blanc", "fume blanc": "sauvignon blanc",
    "chenin blanc": "chenin blanc", "steen": "chenin blanc",
    "melon de bourgogne": "melon de bourgogne", "muscadet": "melon de bourgogne",
    "primitivo": "zinfandel", "zinfandel": "zinfandel", "crljenak": "zinfandel",
    "muscat": "muscat", "moscato": "muscat", "moscatel": "muscat", "muskateller": "muscat",
    "palomino": "palomino", "pedro ximenez": "pedro ximenez", "px": "pedro ximenez",
    "riesling": "riesling", "chardonnay": "chardonnay", "semillon": "semillon",
    "sémillon": "semillon", "viognier": "viognier", "marsanne": "marsanne",
    "roussanne": "roussanne", "nebbiolo": "nebbiolo", "barbera": "barbera",
    "dolcetto": "dolcetto", "corvina": "corvina", "malbec": "malbec", "cot": "malbec",
    "merlot": "merlot", "cabernet franc": "cabernet franc", "gamay": "gamay",
    "pinotage": "pinotage", "touriga nacional": "touriga nacional",
    "assyrtiko": "assyrtiko", "godello": "godello", "verdejo": "verdejo",
    "glera": "glera", "prosecco": "glera", "xarel-lo": "xarel-lo", "parellada": "parellada",
    "cortese": "cortese", "gavi": "cortese", "vermentino": "vermentino",
    "grenache blanc": "grenache blanc", "petit verdot": "petit verdot",
    "carmenere": "carmenere", "carménère": "carmenere", "blaufrankisch": "blaufrankisch",
    "blaufränkisch": "blaufrankisch", "lemberger": "blaufrankisch",
    "scheurebe": "scheurebe", "silvaner": "silvaner", "sylvaner": "silvaner",
    "vidal": "vidal", "colombard": "colombard", "torrontes": "torrontes",
    "torrontés": "torrontes", "greco": "greco", "fiano": "fiano", "falanghina": "falanghina",
    "aglianico": "aglianico", "montepulciano": "montepulciano", "nero d'avola": "nero d'avola",
    "tannat": "tannat", "mencia": "mencia", "mencía": "mencia", "bobal": "bobal",
    "pinot meunier": "pinot meunier", "meunier": "pinot meunier",
}

COUNTRY_SYNONYMS = {
    "usa": "usa", "united states": "usa", "america": "usa", "california": "usa",
    "us": "usa", "u.s.a.": "usa", "uk": "uk", "england": "uk", "great britain": "uk",
    "nz": "new zealand", "new zealand": "new zealand", "south africa": "south africa",
    "rsa": "south africa",
}


def norm(s):
    s = (s or "").strip().lower()
    s = re.sub(r"\(.*?\)", " ", s)          # drop parentheticals: "Palomino (Sherry)"
    s = re.sub(r"[^a-zÀ-ſ' -]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def canon_variety(s):
    n = norm(s)
    if n in SYNONYMS:
        return SYNONYMS[n]
    for k, v in SYNONYMS.items():          # substring fallback: "barossa shiraz" -> syrah
        if re.search(r"\b" + re.escape(k) + r"\b", n):
            return v
    return n


def canon_country(s):
    n = norm(s)
    return COUNTRY_SYNONYMS.get(n, n)


def rank_of(target, ranked, canon):
    t = canon(target)
    if not t:
        return None
    for i, cand in enumerate(ranked or [], start=1):
        if canon(cand) == t:
            return i
    return None


def region_hit(region, ranked_regions):
    """Loose: the truth region counts as hit if its head word appears in any predicted region."""
    r = norm(region)
    if not r:
        return False
    head = r.split(",")[0].strip()
    if not head:
        return False
    for cand in ranked_regions or []:
        c = norm(cand)
        if head and (head in c or c.split(",")[0].strip() in r):
            return True
    return False


def main():
    args = sys.argv[1:]
    d = Path(args[args.index("--dir") + 1]) if "--dir" in args else None
    out = Path(args[args.index("--out") + 1]) if "--out" in args else None
    if not d:
        print(__doc__)
        return 2

    preds = {}
    for f in sorted((d / "preds").glob("*.json")):
        for p in json.loads(f.read_text(encoding="utf-8")):
            preds[p["id"]] = p
    truth = defaultdict(list)
    for f in sorted((d / "truth").glob("*.json")):
        for t in json.loads(f.read_text(encoding="utf-8")):
            truth[t["id"]].append(t)

    key = json.loads((d / "era1_answer_key.json").read_text(encoding="utf-8"))
    expected_wines = sum(len(k["wines"]) for k in key)
    resolved = sum(len(v) for v in truth.values())
    print(f"predictions: {len(preds)} questions | resolved wines: {resolved}/{expected_wines}")
    missing_p = [k["id"] for k in key if k["id"] not in preds]
    if missing_p:
        print(f"  WARNING: {len(missing_p)} questions have no prediction: {missing_p[:6]}")

    rows, no_branch = [], 0
    for qid, wines in truth.items():
        p = preds.get(qid)
        if not p:
            continue
        if "NO MATCHING BRANCH" in (p.get("tree_branch") or "").upper():
            no_branch += 1
        for w in wines:
            vr = rank_of(w.get("variety"), p.get("varieties_ranked"), canon_variety)
            cr = rank_of(w.get("country"), p.get("countries_ranked"), canon_country)
            rows.append({
                "id": qid, "year": int(qid[:4]), "paper": int(qid.split("_p")[1][0]),
                "slot": w.get("slot"), "variety": w.get("variety"), "country": w.get("country"),
                "region": w.get("region"),
                "v_rank": vr, "c_rank": cr,
                "v_top1": vr == 1, "v_top3": bool(vr and vr <= 3), "v_in_set": vr is not None,
                "c_top1": cr == 1, "c_top3": bool(cr and cr <= 3), "c_in_set": cr is not None,
                "r_in_set": region_hit(w.get("region"), p.get("regions_ranked")),
                "mrr_v": 1.0 / vr if vr else 0.0,
                "mrr_c": 1.0 / cr if cr else 0.0,
            })

    def agg(sel, label):
        n = len(sel)
        if not n:
            return None
        f = lambda k: round(sum(1 for r in sel if r[k]) / n, 3)
        m = lambda k: round(sum(r[k] for r in sel) / n, 3)
        return {"label": label, "wines": n,
                "variety_top1": f("v_top1"), "variety_top3": f("v_top3"), "variety_in_set": f("v_in_set"),
                "country_top1": f("c_top1"), "country_top3": f("c_top3"), "country_in_set": f("c_in_set"),
                "region_in_set": f("r_in_set"), "mrr_variety": m("mrr_v"), "mrr_country": m("mrr_c")}

    overall = agg(rows, "ALL 2000-2010")
    per_paper = [agg([r for r in rows if r["paper"] == p], f"Paper {p}") for p in (1, 2, 3)]
    per_year = [agg([r for r in rows if r["year"] == y], str(y)) for y in sorted({r["year"] for r in rows})]

    def show(a):
        if not a:
            return
        print(f"  {a['label']:<14}{a['wines']:>5}  "
              f"var {a['variety_top1']:.0%}/{a['variety_top3']:.0%}/{a['variety_in_set']:.0%}  "
              f"cty {a['country_top1']:.0%}/{a['country_top3']:.0%}/{a['country_in_set']:.0%}  "
              f"reg {a['region_in_set']:.0%}  mrr {a['mrr_variety']:.2f}/{a['mrr_country']:.2f}")

    print(f"\nquestions with NO MATCHING TREE BRANCH: {no_branch}/{len(preds)}")
    print("\n(top1/top3/in-set)")
    show(overall)
    print()
    for a in per_paper:
        show(a)
    print()
    for a in per_year:
        show(a)

    if out:
        out.write_text(json.dumps({
            "corpus": "era1_2000_2010", "blind": True,
            "questions": len(preds), "wines": len(rows),
            "questions_no_tree_branch": no_branch,
            "overall": overall, "per_paper": per_paper, "per_year": per_year,
            "rows": rows,
        }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"\nwrote {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
