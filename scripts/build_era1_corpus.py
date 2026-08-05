"""Merge the per-year Era-1 (2000-2010) practical JSONs into data/past_exams_2000_2010.json.

Input:  one YYYY.json per year (schema mirrors data/exams.json, plus `marks_printed`
        and `duration_as_printed` per paper), produced from docs/past_papers_2000s/.
Output: data/past_exams_2000_2010.json

Validates, per paper: slots are 1..N in order, question wine-ranges cover every slot
exactly once, and — where marks are printed — reports the paper total so the
25-marks-per-wine convention can be checked against the modern corpus.

Run:  python scripts/build_era1_corpus.py <input_dir>
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "past_exams_2000_2010.json"
sys.path.insert(0, str(ROOT / "scripts"))
from analyze_long_horizon import marks_in  # noqa: E402


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    src = Path(sys.argv[1])
    years, problems = [], []

    for path in sorted(src.glob("*.json")):
        entry = json.loads(path.read_text(encoding="utf-8"))
        yr = entry["year"]
        for p in entry.get("papers", []):
            tag = f"{yr} P{p.get('paper')}"
            wines = p.get("wines", [])
            slots = [w["slot"] for w in wines]
            if slots != sorted(slots):
                problems.append(f"{tag}: wine slots not in order: {slots}")
            if len(set(slots)) != len(slots):
                problems.append(f"{tag}: duplicate wine slots: {slots}")
            if slots and slots != list(range(1, len(slots) + 1)):
                problems.append(f"{tag}: slots are {slots[:3]}..{slots[-1]}, expected 1..{len(slots)}")
            if len(wines) != 12:
                problems.append(f"{tag}: {len(wines)} wines (expected 12) — note: {p.get('notes', 'none')}")

            covered = sorted(s for q in p.get("questions", []) for s in q.get("wines", []))
            if covered != slots:
                problems.append(f"{tag}: question coverage {covered} != wine slots {slots}")
        years.append(entry)

    years.sort(key=lambda e: e["year"])
    doc = {
        "_meta": {
            "description": "IMW practical papers 2000-2010 ('Era 1'), structured from the "
                           "PDFs published on mastersofwine.org. Schema mirrors data/exams.json "
                           "(papers -> questions -> wines) with two Era-1 additions: "
                           "`marks_printed` and `duration_as_printed` per paper.",
            "source": "docs/past_papers_2000s/ (see outputs/imw_website_crawl_2026-08-05.md for URLs). "
                      "The 2010 PDF is a scan; its text was transcribed by hand, wine list from the "
                      "printed Crib Sheet.",
            "wine_id_format": "YYYY_pN_wM",
            "caveat": "Question text and wine lists are verbatim; printed misprints are preserved "
                      "and flagged in per-paper `notes`.",
        },
        "years": years,
    }
    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    n_papers = sum(len(e["papers"]) for e in years)
    n_q = sum(len(p["questions"]) for e in years for p in e["papers"])
    n_w = sum(len(p["wines"]) for e in years for p in e["papers"])
    print(f"Wrote {OUT.relative_to(ROOT)}: {len(years)} years, {n_papers} papers, {n_q} questions, {n_w} wines")

    print("\nmarks printed / paper total:")
    for e in years:
        cells = []
        for p in e["papers"]:
            tot = sum(marks_in(q.get("text", "")) for q in p["questions"])
            cells.append(f"P{p['paper']}:{'Y' if p.get('marks_printed') else 'n'}{tot if tot else ''}")
        print(f"  {e['year']}  " + "  ".join(cells))

    if problems:
        print(f"\n{len(problems)} STRUCTURAL PROBLEM(S):")
        for p in problems:
            print("  -", p)
        return 1
    print("\nall structural checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
