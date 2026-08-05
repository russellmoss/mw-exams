"""Long-horizon comparison of the MW practical: Era 1 (2000-2010) vs Era 2 (2011-2026).

Reads data/past_exams_2000_2010.json (Era 1, structured from docs/past_papers_2000s/)
and data/exams.json (Era 2) and reports, per era and per year:

  * whether mark allocations are printed, and the per-paper mark total
  * questions per paper and flight sizes (wines per question)
  * the mix of assessed sub-question types (variety / origin / quality / maturity /
    winemaking / commercial / style / numeric)
  * stem constraint types ("same variety", "different countries", ...)
  * wine-origin distribution and Old-World : New-World balance

Run:  python scripts/analyze_long_horizon.py [--json]
"""

import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ERA1 = ROOT / "data" / "past_exams_2000_2010.json"
ERA2 = ROOT / "data" / "exams.json"

# Mark annotations, tolerant of every notation seen across 26 years:
#   (15 marks) | (4 x 10 marks) | (4 x 10\) | (3 x 5) | (8 marks per pair) | (20)
#
# The bare "(20)" form is genuinely ambiguous: 2008 and 2012 use it for marks, while 2007
# uses the same shape to cross-reference a wine ("Taking this wine (12) in isolation"). The
# disambiguator is POSITION — a mark annotation closes its sub-part, so it sits at end of
# line; a wine reference sits mid-sentence. Bare numbers are therefore only counted at EOL.
BACKSLASH = chr(92)
MARK_RE = re.compile(
    r"\(\s*(?:(?P<mult>\d+)\s*[xX*]\s*)?(?P<val>\d+)\s*"
    r"(?:marks?\b[^)]*|" + re.escape(BACKSLASH) + r")\s*\)"
    r"|\(\s*(?P<mult2>\d+)\s*[xX*]\s*(?P<val2>\d+)\s*\)"
    r"|\(\s*(?P<val3>\d+)\s*\)\s*(?=$)",
    re.I | re.M,
)


def _mark_pairs(text):
    """Yield (multiplier, value) for every mark annotation, across both regex alternatives."""
    for m in MARK_RE.finditer(text or ""):
        if m.group("val"):
            mult, val = m.group("mult"), m.group("val")
        elif m.group("val2"):
            mult, val = m.group("mult2"), m.group("val2")
        else:
            mult, val = None, m.group("val3")
        if val:
            yield (int(mult) if mult else None), int(val)


def marks_in(text):
    return sum((mult or 1) * val for mult, val in _mark_pairs(text))


# Some years (notably 2013) print per-wine tariffs WITHOUT the "N x" prefix, relying on the
# "For each wine" scope header instead. Reconciled marks re-apply that implied multiplier so
# papers are comparable across the whole corpus.
SCOPE_EACH = re.compile(r"for each (wine|pair)|then for each", re.I)
SCOPE_ALL = re.compile(r"for (all|both)|with reference to (all|both)|for the (pair|group)", re.I)


def marks_reconciled(text, n_wines):
    """Mark total with implied per-wine multipliers applied under 'For each wine' headings.

    DIAGNOSTIC ONLY — `marks_total` is the primary figure. This over-counts when a paper
    prints explicit "N x" multipliers *inside* a per-each block on some sub-parts but not
    others (e.g. 2022 P2 -> 375). Use it to test whether a paper that misses 300 does so
    because the transcription dropped an implied multiplier (2013 P3: 91 raw -> 300 here).
    """
    total, scope = 0, 1
    for line in (text or "").splitlines():
        if SCOPE_ALL.search(line):
            scope = 1
        elif SCOPE_EACH.search(line):
            # "for each pair" / "N marks per pair" scopes to pairs, not wines (2011 P3)
            pair = re.search(r"\bpairs?\b", line, re.I)
            scope = max(1, n_wines // 2 if pair else n_wines)
        if re.search(r"\bper pair\b", line, re.I):
            scope = max(1, n_wines // 2)
        for mult, val in _mark_pairs(line):
            # an explicit "N x" prefix already encodes the multiplier — never double-count it
            total += val * (mult if mult else scope)
    return total


# --- sub-question type classifier (keyword-based, deliberately transparent) ---
TYPE_PATTERNS = [
    ("variety_id", r"identify.{0,40}(grape|variet)|(grape|variet).{0,30}identify"),
    ("origin_id", r"identify.{0,40}(origin|region|country|commune|appellation)"),
    ("quality", r"\bquality\b"),
    ("maturity", r"maturity|capacity to (age|mature)|state of maturity|potential for.{0,20}develop|age and develop|drinking window|how (old|long)"),
    ("winemaking", r"winemaking|method of production|methods of production|production method|vinif|use of oak|malolactic"),
    ("commercial", r"commercial|market|price|retail|consumer|sell"),
    ("style", r"\bstyle\b"),
    ("numeric", r"state the (level of )?(alcohol|residual sugar)|abv|g/l|grams per litre|quantify"),
    ("structure", r"acidit|tannin"),
]


def classify(text):
    t = (text or "").lower()
    return {name for name, pat in TYPE_PATTERNS if re.search(pat, t)}


STEM_PATTERNS = [
    ("same_variety", r"same (single )?(predominant )?grape variety|same variet"),
    ("same_country", r"same country"),
    ("same_region", r"same region|same (region of )?origin"),
    ("same_producer", r"same producer"),
    ("different_countries", r"different countr"),
    ("different_varieties", r"different (single )?(grape )?variet"),
    ("blend", r"blend"),
    ("named_region_given", r"classic \w+( \w+)? origins?|classic french|from europe|european origins|in the americas|north and south america|from bordeaux|associated with bordeaux"),
    ("mixed_bag", r"mixed bag"),
    ("sparkling_flight", r"are (all )?sparkling|sparkling wines"),
    ("fortified_flight", r"are fortified|fortified wines"),
    ("sweet_flight", r"botrytis|sweet wines|residual sugar in gram"),
]


def stem_kinds(text):
    t = (text or "").lower()
    return {name for name, pat in STEM_PATTERNS if re.search(pat, t)}


OLD_WORLD = [
    "france", "italy", "spain", "germany", "portugal", "austria", "hungary", "greece",
    "slovenia", "croatia", "romania", "bulgaria", "switzerland", "england", "uk",
    "georgia", "lebanon", "israel", "turkey", "moldova", "czech", "slovakia",
]
NEW_WORLD = [
    "australia", "new zealand", "usa", "united states", "california", "chile",
    "argentina", "south africa", "canada", "uruguay", "brazil", "mexico", "china", "india",
]


def country_of(full_text):
    t = (full_text or "").lower()
    for c in NEW_WORLD:
        if re.search(r"\b" + re.escape(c) + r"\b", t):
            return ("NW", "USA" if c in ("california", "united states") else c.title())
    for c in OLD_WORLD:
        if re.search(r"\b" + re.escape(c) + r"\b", t):
            return ("OW", "UK" if c == "england" else c.title())
    return (None, None)


def load(path, label):
    if not path.exists():
        print(f"[warn] {label} corpus missing: {path}", file=sys.stderr)
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    return data.get("years", data) if isinstance(data, dict) else data


def analyse(entry):
    """Per-year rollup shared by both corpora (schemas are compatible)."""
    out = {"year": entry["year"], "papers": []}
    for p in entry.get("papers", []):
        qs = p.get("questions", [])
        # Era-1 papers carry per-subpart mark values transcribed straight from the paper; those are
        # authoritative. Regex over the stem is the fallback (and the only option for exams.json,
        # which has no subparts). Era-1 also writes bare "(20)" for marks while ALSO using "(12)" to
        # cross-reference a wine, so text-scraping alone cannot disambiguate that year.
        explicit = [s.get("marks") for q in qs for s in q.get("subparts", []) if s.get("marks") is not None]
        if explicit:
            total = sum(explicit)
            recon = total
        else:
            total = sum(marks_in(q.get("text", "")) for q in qs)
            recon = sum(marks_reconciled(q.get("text", ""), len(q.get("wines", []))) for q in qs)
        types, stems = Counter(), Counter()
        for q in qs:
            for t in classify(q.get("text", "")):
                types[t] += 1
            for s in stem_kinds(q.get("text", "")):
                stems[s] += 1
        wines = p.get("wines", [])
        hemis = Counter()
        countries = Counter()
        for w in wines:
            h, c = country_of(w.get("full_text", ""))
            if h:
                hemis[h] += 1
                countries[c] += 1
        out["papers"].append({
            "paper": p.get("paper"),
            "marks_printed": p.get("marks_printed", total > 0),
            "marks_total": total,
            "marks_reconciled": recon,
            "n_questions": len(qs),
            "flight_sizes": [len(q.get("wines", [])) for q in qs],
            "n_wines": len(wines),
            "types": dict(types),
            "stems": dict(stems),
            "hemis": dict(hemis),
            "countries": dict(countries),
        })
    return out


def rollup(era):
    """Aggregate one era into the figures used for the era-vs-era comparison."""
    r = {"papers": 0, "questions": 0, "wines": 0, "marked": 0, "at_300": 0,
         "flights": Counter(), "types": Counter(), "stems": Counter(),
         "countries": Counter(), "ow": 0, "nw": 0}
    for y in era:
        for p in y["papers"]:
            r["papers"] += 1
            r["questions"] += p["n_questions"]
            r["wines"] += p["n_wines"]
            r["marked"] += bool(p["marks_printed"])
            r["at_300"] += p["marks_total"] == 300
            for f in p["flight_sizes"]:
                r["flights"][f] += 1
            r["types"].update(p["types"])
            r["stems"].update(p["stems"])
            r["countries"].update(p["countries"])
            r["ow"] += p["hemis"].get("OW", 0)
            r["nw"] += p["hemis"].get("NW", 0)
    return r


def compare(era1, era2):
    a, b = rollup(era1), rollup(era2)
    pct = lambda n, d: (100.0 * n / d) if d else 0.0

    print(f"\n{'':<24}{'ERA 1 (2000-2010)':>20}{'ERA 2 (2011-2026)':>20}   delta")
    print("-" * 88)
    for label, key in (("papers", "papers"), ("questions", "questions"), ("wines", "wines")):
        print(f"{label:<24}{a[key]:>20}{b[key]:>20}")
    print(f"{'papers printing marks':<24}{a['marked']:>20}{b['marked']:>20}")
    at300_a = f"{a['at_300']}/{a['marked']} marked"
    at300_b = f"{b['at_300']}/{b['marked']} marked"
    print(f"{'papers totalling 300':<24}{at300_a:>20}{at300_b:>20}")
    print(f"{'questions per paper':<24}{a['questions']/a['papers']:>20.2f}{b['questions']/b['papers']:>20.2f}")
    print(f"{'mean flight size':<24}{a['wines']/a['questions']:>20.2f}{b['wines']/b['questions']:>20.2f}")

    print(f"\nASSESSED SUB-QUESTION TYPES (share of that era's questions)")
    print("-" * 88)
    for t in sorted(set(a["types"]) | set(b["types"]),
                    key=lambda k: -pct(b["types"].get(k, 0), b["questions"])):
        pa, pb = pct(a["types"].get(t, 0), a["questions"]), pct(b["types"].get(t, 0), b["questions"])
        print(f"{t:<24}{pa:>19.1f}%{pb:>19.1f}%   {pb-pa:+6.1f} pts")

    print(f"\nWINE ORIGIN (share of that era's wines)")
    print("-" * 88)
    print(f"{'Old World':<24}{pct(a['ow'], a['wines']):>19.1f}%{pct(b['ow'], b['wines']):>19.1f}%"
          f"   {pct(b['ow'], b['wines'])-pct(a['ow'], a['wines']):+6.1f} pts")
    for c in sorted(set(a["countries"]) | set(b["countries"]),
                    key=lambda k: -(a["countries"].get(k, 0) + b["countries"].get(k, 0)))[:12]:
        pa, pb = pct(a["countries"].get(c, 0), a["wines"]), pct(b["countries"].get(c, 0), b["wines"])
        print(f"{c:<24}{pa:>19.1f}%{pb:>19.1f}%   {pb-pa:+6.1f} pts")

    print(f"\nFLIGHT SIZES (share of that era's questions)")
    print("-" * 88)
    for f in sorted(set(a["flights"]) | set(b["flights"])):
        pa, pb = pct(a["flights"].get(f, 0), a["questions"]), pct(b["flights"].get(f, 0), b["questions"])
        print(f"{f}-wine{'':<18}{pa:>19.1f}%{pb:>19.1f}%   {pb-pa:+6.1f} pts")
    return 0


def main():
    era1 = [analyse(e) for e in sorted(load(ERA1, "Era 1"), key=lambda x: x["year"])]
    era2 = [analyse(e) for e in sorted(load(ERA2, "Era 2"), key=lambda x: x["year"])]

    if "--json" in sys.argv:
        print(json.dumps({"era1": era1, "era2": era2}, indent=2))
        return 0

    if "--compare" in sys.argv:
        return compare(era1, era2)

    for label, era in (("ERA 1 (2000-2010)", era1), ("ERA 2 (2011-2026)", era2)):
        print(f"\n{'='*78}\n{label}\n{'='*78}")
        print(f"{'year':<6}{'paper':>6}{'marks?':>8}{'total':>7}{'recon*':>8}{'Qs':>4}  "
              f"{'flights':<14}{'wines':>6}  OW:NW")
        for y in era:
            for p in y["papers"]:
                fl = ",".join(str(x) for x in p["flight_sizes"])
                ow, nw = p["hemis"].get("OW", 0), p["hemis"].get("NW", 0)
                flag = "" if p["marks_total"] in (0, 300) else "  <-"
                print(f"{y['year']:<6}{p['paper']:>6}{str(p['marks_printed']):>8}"
                      f"{p['marks_total']:>7}{p['marks_reconciled']:>8}{p['n_questions']:>4}  "
                      f"{fl:<14}{p['n_wines']:>6}  {ow}:{nw}{flag}")
        print("  * recon = diagnostic only (implied per-wine multipliers restored); see docstring")

        # aggregate
        flights, types, stems, countries = Counter(), Counter(), Counter(), Counter()
        ow = nw = papers = marked = 0
        for y in era:
            for p in y["papers"]:
                papers += 1
                marked += bool(p["marks_printed"])
                for f in p["flight_sizes"]:
                    flights[f] += 1
                types.update(p["types"])
                stems.update(p["stems"])
                countries.update(p["countries"])
                ow += p["hemis"].get("OW", 0)
                nw += p["hemis"].get("NW", 0)
        nq = sum(flights.values())
        print(f"\n  papers: {papers} ({marked} print marks, {papers-marked} do not)")
        print(f"  flight sizes: {dict(sorted(flights.items()))}")
        print(f"  sub-question types (share of {nq} questions):")
        for t, c in types.most_common():
            print(f"    {t:<14}{c:>4}  {100*c/nq:5.1f}%")
        print(f"  stem constraints:")
        for s, c in stems.most_common():
            print(f"    {s:<22}{c:>4}")
        tot = ow + nw
        print(f"  Old World : New World = {ow}:{nw}" + (f"  ({100*ow/tot:.0f}% OW)" if tot else ""))
        print(f"  top countries: {', '.join(f'{c} {n}' for c, n in countries.most_common(12))}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
