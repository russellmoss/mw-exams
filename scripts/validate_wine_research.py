"""
Validate data/wine_research/*.md frontmatter against what the corpus build consumes.

The wine-researcher subagent writes these files free-hand from a template. When a
batch of agents runs in parallel, template drift is the realistic failure mode: a
missing key or an out-of-enum value does not error anywhere — it silently lands as
a blank column in data/structured/corpus_wines.json and then in Neon.

This is the guard. Pure stdlib, no YAML dependency (the frontmatter is flat).

Usage:
    python scripts/validate_wine_research.py              # whole directory
    python scripts/validate_wine_research.py --year 2026  # one exam year
    python scripts/validate_wine_research.py --strict     # warnings become failures

Exit code is non-zero if any error (or, with --strict, any warning) is found.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RESEARCH_DIR = ROOT / "data" / "wine_research"
WINES_PATH = ROOT / "data" / "wines.json"

# Keys build_structured_corpus.py / build_predictive_exam_analyzer.py actually read.
REQUIRED = ["wine_id", "producer", "vintage", "country", "region"]
RECOMMENDED = ["wine_name", "sub_region", "appellation", "abv", "sources", "last_updated"]

# The only four computational fields, per .claude/agents/wine-researcher.md.
ENUMS = {
    "style_category": {"still_dry", "still_sweet", "sparkling", "fortified", "oxidative", "rose", "orange"},
    "oak_signature": {"none", "neutral_old", "new_french", "new_american", "mixed", "unclear"},
    "rs_level": {"bone_dry", "dry", "off_dry", "medium", "sweet", "very_sweet"},
    "structural_profile": {"light_crisp", "medium_balanced", "full_rich", "tannic_structured", "dessert"},
}

FM_RE = re.compile(r"\A---\r?\n(.*?)\r?\n---\r?\n", re.DOTALL)


def parse_frontmatter(path: Path) -> dict[str, str]:
    m = FM_RE.match(path.read_text(encoding="utf-8"))
    if not m:
        return {}
    fm: dict[str, str] = {}
    key = None
    for raw in m.group(1).splitlines():
        if not raw.strip():
            continue
        if raw.lstrip().startswith("-") and key:          # YAML list continuation
            fm[key] = (fm.get(key, "") + " " + raw.lstrip()[1:].strip()).strip()
            continue
        if ":" in raw and not raw.startswith((" ", "\t")):
            key, _, val = raw.partition(":")
            key = key.strip()
            fm[key] = val.strip()
    return fm


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--year", type=int, help="only check this exam year")
    ap.add_argument("--strict", action="store_true", help="treat warnings as failures")
    args = ap.parse_args()

    wines = json.loads(WINES_PATH.read_text(encoding="utf-8"))
    if args.year:
        wines = [w for w in wines if w["year"] == args.year]
    if not wines:
        raise SystemExit(f"FAIL: no wines found{f' for {args.year}' if args.year else ''}")

    errors: list[str] = []
    warnings: list[str] = []
    present = 0

    for w in wines:
        wid = w["id"]
        path = RESEARCH_DIR / f"{wid}.md"
        if not path.exists():
            errors.append(f"{wid}: MISSING {path.relative_to(ROOT)}")
            continue
        present += 1

        fm = parse_frontmatter(path)
        if not fm:
            errors.append(f"{wid}: no parseable YAML frontmatter")
            continue

        if fm.get("wine_id") != wid:
            errors.append(f"{wid}: frontmatter wine_id is {fm.get('wine_id')!r}, expected {wid!r}")

        for key in REQUIRED:
            if not fm.get(key):
                errors.append(f"{wid}: required key '{key}' missing or empty")

        for key in RECOMMENDED:
            if not fm.get(key):
                warnings.append(f"{wid}: recommended key '{key}' missing or empty")

        for key, allowed in ENUMS.items():
            val = fm.get(key)
            if val and val not in allowed:
                errors.append(f"{wid}: {key}={val!r} not in {sorted(allowed)}")
            if not val:
                warnings.append(f"{wid}: computational field '{key}' not set")

        body = path.read_text(encoding="utf-8")
        if "## Sources" not in body:
            warnings.append(f"{wid}: no '## Sources' section")
        if "http" not in body:
            errors.append(f"{wid}: no URL anywhere in the brief — unsourced")

    scope = f"{args.year} " if args.year else ""
    print(f"{scope}research files: {present}/{len(wines)} present")
    for e in errors:
        print(f"  ERROR   {e}")
    for w in warnings:
        print(f"  warning {w}")
    print(f"\n{len(errors)} error(s), {len(warnings)} warning(s)")

    if errors or (args.strict and warnings):
        sys.exit(1)
    print("OK")


if __name__ == "__main__":
    main()
