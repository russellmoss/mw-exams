"""
Whole-test composition validator (Phase 3).

Checks a generated mock PAPER (12 wines) against the per-paper bands in
data/structured/whole_test_targets.json. Advisory only — it prints PASS/WARN per axis and a warning
count, and always exits 0 (it never blocks; it surfaces composition the way a real exam would look).

Designed for the BLUEPRINT-FIRST workflow: the mock-exam-writer allocates a 12-slot blueprint (each
slot carrying world / price_tier / curveball / is_blend / macro_style), generates wines to fill it,
then runs this. Axes the wine LABEL cannot carry (price, curveball, blend, macro-style) are checked
from the blueprint metadata when present; without it they are reported "not asserted" rather than
guessed (the benchmark/price proxies are too noisy to gate on — findings/08). Variety, country, world
and the mark-mix are always derivable from the wines + question text.

Input JSON (one paper):
  { "paper": 1,
    "wines": [ { "slot": 1, "full_text": "...",
                 "world"?: "old_world|new_world", "price_band"?: "value|mainstream|premium|super_premium|luxury",
                 "curveball"?: true, "is_blend"?: false, "macro_style"?: "..." }, ... ],
    "questions": [ { "n": 1, "wine_slots"|"wines": [1,2,3], "text": "..." }, ... ] }

Usage:
  python scripts/validate_mock_paper.py <paper.json>
  python scripts/validate_mock_paper.py --suite <suite.json>   # {"papers":[p1,p2,p3]}

Reuses the backtest-trusted extractors (run_loyo) + the corpus builder's world/sub-question helpers,
so detection matches the corpus exactly.
"""
import io
import json
import sys
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")  # Windows consoles default to cp1252
except Exception:
    pass

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from run_loyo import extract_variety_from_text, extract_country_from_text  # noqa: E402
from build_structured_corpus import world_of, split_subquestions  # noqa: E402

TARGETS = json.load(io.open(ROOT / "data" / "structured" / "whole_test_targets.json", encoding="utf-8"))
ID_TYPES = {"variety_id", "origin_id", "vintage_id"}


def wine_world(w):
    return w.get("world") or world_of(extract_country_from_text(w.get("full_text", "")))


def analyse_paper(rec):
    paper = rec["paper"]
    wines = rec.get("wines", [])
    questions = rec.get("questions", [])
    n = len(wines)
    t = TARGETS.get(f"P{paper}", {})
    g = TARGETS["global"]
    checks = []  # (axis, status PASS/WARN/INFO, detail)

    def add(axis, ok, detail, info=False):
        checks.append((axis, "INFO" if info else ("PASS" if ok else "WARN"), detail))

    # --- variety / country (always derivable) ---
    varieties = [extract_variety_from_text(w.get("full_text", "")) for w in wines]
    varieties = [v for v in varieties if v and v != "Unknown"]
    countries = [extract_country_from_text(w.get("full_text", "")) for w in wines]
    countries = [c for c in countries if c and c != "Unknown"]
    nvar, ncty = len(set(varieties)), len(set(countries))
    add("varieties", nvar >= t.get("min_varieties", 0), f"{nvar} distinct (target >= {t.get('min_varieties')})")
    add("countries", ncty >= t.get("min_countries", 0), f"{ncty} distinct (target >= {t.get('min_countries')})")
    if countries:
        top = max(set(countries), key=countries.count)
        frac = countries.count(top) / n
        add("single-country ceiling", frac <= g["single_country_max_frac"],
            f"{top} is {countries.count(top)}/{n} ({round(100*frac)}%); ceiling {round(100*g['single_country_max_frac'])}%")

    # --- old/new world ---
    worlds = [wine_world(w) for w in wines]
    worlds = [w for w in worlds if w in ("old_world", "new_world")]
    if worlds:
        ow = worlds.count("old_world")
        ow_frac = ow / len(worlds)
        add("OW:NW", ow_frac >= t.get("ow_frac_min", 0),
            f"{ow}:{len(worlds)-ow} OW:NW ({round(100*ow_frac)}% OW; target >= {round(100*t.get('ow_frac_min',0))}%)")
        if t.get("never_nw_majority"):
            add("never NW-majority", ow >= (len(worlds) - ow), f"OW {ow} vs NW {len(worlds)-ow}")
    else:
        add("OW:NW", True, "no detectable origins", info=True)

    # --- mark-mix (from question text) ---
    total_marks = 0
    id_marks = 0
    has_commercial = has_style = False
    for q in questions:
        for part in split_subquestions(q.get("text", "")):
            m = part["marks_sum"] or 0
            if not m:
                continue
            total_marks += m
            hits = set(part["type_hits"])
            if hits & ID_TYPES:
                id_marks += m
            if "commercial" in hits:
                has_commercial = True
            if "style" in hits:
                has_style = True
    if total_marks:
        id_share = id_marks / total_marks
        add("ID-composite share", id_share <= t.get("id_composite_max", 1),
            f"{round(100*id_share)}% of marks (cap {round(100*t.get('id_composite_max',1))}%)")
        if t.get("commercial_present"):
            add("commercial present", has_commercial, ">=1 commercial sub-question" if has_commercial else "no commercial sub-question on the paper")
        if t.get("style_present"):
            add("style present", has_style, ">=1 style sub-question" if has_style else "no style sub-question on the paper")
    else:
        add("mark-mix", True, "no parseable marks in questions", info=True)

    # --- blueprint-only axes (price / curveball / blend / macro-style) ---
    if any("price_band" in w for w in wines):
        high = sum(1 for w in wines if w.get("price_band") in ("super_premium", "luxury"))
        lo, hi = t.get("high_price_frac", [0, 1])
        add("price HIGH share", lo <= high / n <= hi, f"{high}/{n} ({round(100*high/n)}%) super-premium+luxury; band {round(100*lo)}-{round(100*hi)}%")
    else:
        add("price HIGH share", True, "not asserted — add price_band to the blueprint slots", info=True)

    if any("curveball" in w for w in wines):
        cb = sum(1 for w in wines if w.get("curveball"))
        lo, hi = t.get("curveball_budget", [0, n])
        add("curveball budget", lo <= cb <= hi, f"{cb} harder wines (band {lo}-{hi} per 12)")
    else:
        add("curveball budget", True, "not asserted — add curveball flags to the blueprint slots", info=True)

    if any("is_blend" in w for w in wines):
        blends = sum(1 for w in wines if w.get("is_blend"))
        add("blend frequency", blends / n >= g["blend_frac_min"], f"{blends}/{n} ({round(100*blends/n)}%); floor {round(100*g['blend_frac_min'])}%")
    else:
        add("blend frequency", True, "not asserted — add is_blend to the blueprint slots", info=True)

    if any("macro_style" in w for w in wines) and t.get("color"):
        add("macro-style", True, f"styles: {sorted(set(w.get('macro_style','?') for w in wines))}", info=True)

    return checks


def print_report(rec, checks):
    paper = rec["paper"]
    warns = [c for c in checks if c[1] == "WARN"]
    print(f"\n=== Paper {paper} composition ({len(rec.get('wines',[]))} wines) ===")
    for axis, status, detail in checks:
        mark = {"PASS": "  ok ", "WARN": "WARN ", "INFO": " .. "}[status]
        print(f"  [{mark}] {axis}: {detail}")
    print(f"  --> {len(warns)} WARNING(S)")
    return len(warns)


def main():
    args = [a for a in sys.argv[1:] if a != "--suite"]
    suite = "--suite" in sys.argv
    data = json.load(io.open(args[0], encoding="utf-8"))
    total_warns = 0
    if suite:
        papers = data["papers"]
        suite_cb = 0
        suite_cb_known = False
        for rec in papers:
            total_warns += print_report(rec, analyse_paper(rec))
            if any("curveball" in w for w in rec.get("wines", [])):
                suite_cb_known = True
                suite_cb += sum(1 for w in rec.get("wines", []) if w.get("curveball"))
        if suite_cb_known:
            lo, hi = TARGETS["global"]["suite_curveball_total"]
            ok = lo <= suite_cb <= hi
            print(f"\n=== SUITE === {suite_cb} harder wines across {len(papers)} papers (target {lo}-{hi}) [{'ok' if ok else 'WARN'}]")
            if not ok:
                total_warns += 1
    else:
        total_warns += print_report(data, analyse_paper(data))
    print(f"\nCOMPOSITION WARNINGS: {total_warns}")
    sys.exit(0)


if __name__ == "__main__":
    main()
