"""
Append a deterministic `## Reality check` to the 2026 decision matrices, and score them.

The 2026 matrices were generated under a blind protocol: each question-analyst got its
stem inline and was forbidden from reading the corpus, so the prediction sections are a
genuine out-of-sample forecast. The grading therefore has to come from OUTSIDE the agent
— this script — otherwise "predict then grade yourself" is unfalsifiable.

What it does per question:
  1. Resolves the actual wines from data/exams.json + data/wines.json, deriving variety
     and country with the canonical run_loyo extractors.
  2. Checks, by literal text search over the PREDICTION sections only, whether each actual
     variety and country was named anywhere in the blind forecast.
  3. Appends a `## Reality check` section with the wine list, the hits/misses, and a score.
  4. Flags any distinctive producer name from the actual list that appears in the
     prediction text — an advisory signal that a matrix may have peeked. Naming Trimbach
     as a plausible Alsace house is normal reasoning; naming Chavost is not.

Idempotent: a matrix that already has a Reality check is skipped.

Usage:
    python scripts/append_matrix_reality_check.py [--year 2026] [--dry-run]
"""

from __future__ import annotations

import argparse
import io
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from run_loyo import (  # noqa: E402
    extract_variety_from_text,
    extract_country_from_text,
    _load_appellation_lookup,
)

_load_appellation_lookup()

MATRIX_DIR = ROOT / "outputs" / "decision_matrices"
MARKER = "## Reality check"

# Synonyms so a forecast saying "Shiraz" counts as naming Syrah, etc.
SYNONYMS = {
    "syrah": {"syrah", "shiraz"},
    "shiraz": {"syrah", "shiraz"},
    "grenache": {"grenache", "garnacha"},
    "garnacha": {"grenache", "garnacha"},
    "pinot gris": {"pinot gris", "pinot grigio"},
    "tempranillo": {"tempranillo", "tinto fino", "tinta del pais"},
    "mourvedre": {"mourvedre", "mourvèdre", "monastrell", "mataro"},
    "melon de bourgogne": {"melon de bourgogne", "melon", "muscadet"},
    "semillon": {"semillon", "sémillon"},
}

# Producers distinctive enough that naming them in a blind forecast is suspicious.
# Deliberately excludes famous houses a candidate would reasonably cite unprompted
# (Trimbach, Taylor's, Kopke, Torbreck, Shafer, Pieropan, Castello di Ama, Gaia...).
SUSPICIOUS_PRODUCERS = [
    "Josh Cellars", "Chavost", "Delacourt", "Harrow & Hope", "Pibarnon", "Artuke",
    "Delmond", "Jakob Schneider", "Patrick Piuze", "Latour-Giraud", "Greywacke",
    "Alois Lageder", "Domaine de la Margot", "Cave de Saumur", "Moncontour",
    "Dominio de la Vega", "Cleto Chiarli", "Pewsey Vale", "Argiolas", "Melini",
]


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9 ]+", " ", s.lower()).strip()


def variety_terms(v: str) -> list[set[str]]:
    """Split a possibly-blended variety string into per-component synonym sets."""
    out = []
    for part in v.split("/"):
        p = norm(part)
        if not p or p == "unknown":
            continue
        out.append(SYNONYMS.get(p, {p}))
    return out


def load_actuals(year: int) -> dict[tuple[int, int], list[dict]]:
    exams = json.load(io.open(ROOT / "data" / "exams.json", encoding="utf-8"))
    wines = {w["id"]: w for w in json.load(io.open(ROOT / "data" / "wines.json", encoding="utf-8"))}
    out: dict[tuple[int, int], list[dict]] = {}
    exam = next((e for e in exams if e["year"] == year), None)
    if exam is None:
        raise SystemExit(f"FAIL: {year} not in data/exams.json")
    for paper in exam["papers"]:
        pn = paper["paper"]
        for q in paper["questions"]:
            rows = []
            for slot in q["wines"]:
                w = wines.get(f"{year}_p{pn}_w{slot}")
                if not w:
                    continue
                ft = w["full_text"]
                rows.append({
                    "slot": slot,
                    "full_text": ft,
                    "variety": extract_variety_from_text(ft),
                    "country": extract_country_from_text(ft),
                })
            out[(pn, q["n"])] = rows
    return out


def score_matrix(body: str, rows: list[dict]) -> dict:
    hay = norm(body)

    varieties, countries = [], []
    for r in rows:
        for comp in variety_terms(r["variety"]):
            if comp not in varieties:
                varieties.append(comp)
        c = r["country"]
        if c and c != "Unknown" and c not in countries:
            countries.append(c)

    v_hits = [sorted(c)[0] for c in varieties if any(t in hay for t in c)]
    v_miss = [sorted(c)[0] for c in varieties if not any(t in hay for t in c)]
    c_hits = [c for c in countries if norm(c) in hay]
    c_miss = [c for c in countries if norm(c) not in hay]
    flagged = [p for p in SUSPICIOUS_PRODUCERS
               if norm(p) in hay and any(norm(p) in norm(r["full_text"]) for r in rows)]

    return {
        "variety_hits": v_hits, "variety_misses": v_miss,
        "country_hits": c_hits, "country_misses": c_miss,
        "variety_recall": len(v_hits) / len(varieties) if varieties else None,
        "country_recall": len(c_hits) / len(countries) if countries else None,
        "flagged_producers": flagged,
    }


def render(rows: list[dict], s: dict) -> str:
    L = ["", MARKER, "",
         "*Appended by `scripts/append_matrix_reality_check.py` — NOT written by the",
         "question-analyst. The prediction above was made blind: the agent received only the",
         "question stem and was barred from reading the corpus.*", "",
         "*Actual wines:*", ""]
    L.append("| Slot | Wine | Variety | Country |")
    L.append("| --- | --- | --- | --- |")
    for r in rows:
        L.append(f"| {r['slot']} | {r['full_text']} | {r['variety']} | {r['country']} |")
    L += ["", "*Prediction accuracy (did the blind forecast name it?):*", ""]
    vr = s["variety_recall"]
    cr = s["country_recall"]
    L.append(f"- **Varieties named: {len(s['variety_hits'])}/{len(s['variety_hits']) + len(s['variety_misses'])}"
             + (f" ({vr:.0%})**" if vr is not None else "**"))
    L.append(f"  - hit: {', '.join(s['variety_hits']) or '_none_'}")
    L.append(f"  - missed: {', '.join(s['variety_misses']) or '_none_'}")
    L.append(f"- **Countries named: {len(s['country_hits'])}/{len(s['country_hits']) + len(s['country_misses'])}"
             + (f" ({cr:.0%})**" if cr is not None else "**"))
    L.append(f"  - hit: {', '.join(s['country_hits']) or '_none_'}")
    L.append(f"  - missed: {', '.join(s['country_misses']) or '_none_'}")
    L.append("")
    L.append("*How to read these numbers:* the check is a literal string search over the")
    L.append("prediction text. It rewards naming a grape and is blind to style-level reasoning —")
    L.append("a forecast that correctly calls a pair \"20-year Tawny vs LBV Port\" scores **zero**")
    L.append("on variety because it never types \"Touriga Nacional\". For Paper 3 fortified and")
    L.append("sweet flights, style *is* the right level of reasoning, so read the country row and")
    L.append("the prose above as the real signal there. Blend components inflate the variety")
    L.append("denominator for the same reason they do in `outputs/backtest_reports/2026_holdout.md`.")
    if vr is not None and cr is not None and vr <= 0.25 < cr:
        L.append("")
        L.append("> **Note:** this matrix scores low on variety but high on country. Check the")
        L.append("> prediction prose before concluding it was wrong — that pattern usually means")
        L.append("> it reasoned in styles/appellations rather than grape names.")
    if s["flagged_producers"]:
        L.append("")
        L.append(f"> ⚠️ **Blindness advisory:** this matrix names {', '.join(s['flagged_producers'])}, "
                 "which appear in the actual wine list and are obscure enough that naming them "
                 "unprompted is unlikely. Review before trusting this matrix's accuracy score.")
    L.append("")
    return "\n".join(L)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--year", type=int, default=2026)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force", action="store_true", help="replace an existing reality check")
    args = ap.parse_args()

    actuals = load_actuals(args.year)
    tot_v_hit = tot_v = tot_c_hit = tot_c = 0
    flagged_any = []

    for (pn, qn), rows in sorted(actuals.items()):
        path = MATRIX_DIR / f"{args.year}_p{pn}_q{qn}.md"
        if not path.exists():
            print(f"  MISSING {path.name}")
            continue
        body = path.read_text(encoding="utf-8")
        if MARKER in body:
            if not args.force:
                print(f"  skip {path.name} (already has a reality check)")
                continue
            body = body[:body.index(MARKER)].rstrip("\n") + "\n"
        s = score_matrix(body, rows)
        tot_v_hit += len(s["variety_hits"]); tot_v += len(s["variety_hits"]) + len(s["variety_misses"])
        tot_c_hit += len(s["country_hits"]); tot_c += len(s["country_hits"]) + len(s["country_misses"])
        if s["flagged_producers"]:
            flagged_any.append((path.name, s["flagged_producers"]))
        if not args.dry_run:
            path.write_text(body.rstrip("\n") + "\n" + render(rows, s), encoding="utf-8")
        vr = f"{s['variety_recall']:.0%}" if s["variety_recall"] is not None else "n/a"
        cr = f"{s['country_recall']:.0%}" if s["country_recall"] is not None else "n/a"
        print(f"  {path.name}: variety {len(s['variety_hits'])}/{len(s['variety_hits'])+len(s['variety_misses'])} ({vr})"
              f" | country {len(s['country_hits'])}/{len(s['country_hits'])+len(s['country_misses'])} ({cr})")

    print()
    if tot_v:
        print(f"TOTAL variety recall: {tot_v_hit}/{tot_v} = {tot_v_hit/tot_v:.0%}")
    if tot_c:
        print(f"TOTAL country recall: {tot_c_hit}/{tot_c} = {tot_c_hit/tot_c:.0%}")
    if flagged_any:
        print("\nBLINDNESS ADVISORIES:")
        for name, ps in flagged_any:
            print(f"  {name}: {', '.join(ps)}")
    else:
        print("\nNo blindness advisories — no matrix named an obscure actual producer.")


if __name__ == "__main__":
    main()
