"""
Validate Phase 5B family-aware v2 decision matrices.

The v2 matrices are the tree-aware artifact the candidate actually studies from, and each
one links into a section of its paper's family tree pack. Those links are GitHub-style
anchor slugs derived from heading text — easy to get subtly wrong, and a wrong one is a
dead link in the study material that nothing else would catch.

Checks per file:
  - required frontmatter keys present
  - `family` agrees with outputs/taxonomy_tags/{qid}.md (the canonical tagging)
  - family_tree_pack_section points at a real file AND its anchor resolves to a real heading
  - the three universal sections are present

Calibrated against the 112 pre-2026 matrices, which pass clean. The corpus has real
format variation and the thresholds reflect it rather than an idealised template:
`subcategory` is usually folded into `family` (family: F4a) rather than split out; the
in-glass half is titled several different ways; and per-wine `### Wine N` blocks are a
newer convention, so they are only checked for completeness when a file uses them.

Usage:
    python scripts/validate_v2_matrices.py            # all v2 matrices
    python scripts/validate_v2_matrices.py --year 2026
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
V2_DIR = ROOT / "outputs" / "decision_matrices_v2"
TAG_DIR = ROOT / "outputs" / "taxonomy_tags"

# Keys every v2 file carries. `subcategory` is NOT required: most files encode the
# sub-form in `family` itself (family: F4a) rather than splitting it out.
REQUIRED_KEYS = ["year", "paper", "question", "wines", "generated", "phase",
                 "family", "family_tree_pack_section"]
# Only these three headings are universal across the existing corpus.
REQUIRED_SECTIONS = ["## Question (verbatim)", "## Pre-taste matrix", "## Reality check"]
# The in-glass half is titled several ways; any one of these satisfies it.
IN_GLASS_MARKERS = ["## In-taste matrix", "## What to focus on in the glass"]

FM_RE = re.compile(r"\A---\r?\n(.*?)\r?\n---\r?\n", re.DOTALL)


def slugify(heading: str) -> str:
    """GitHub's heading-anchor algorithm: lowercase, drop punctuation, spaces -> hyphens."""
    s = heading.strip().lower()
    s = re.sub(r"[^\w\s-]", "", s)      # strip punctuation, keep word chars/space/hyphen
    s = re.sub(r"\s", "-", s)
    return s


def frontmatter(text: str) -> dict[str, str]:
    m = FM_RE.match(text)
    if not m:
        return {}
    out = {}
    for line in m.group(1).splitlines():
        if ":" in line and not line.startswith((" ", "\t", "-")):
            k, _, v = line.partition(":")
            out[k.strip()] = v.strip().strip('"')
    return out


def tag_family(qid: str) -> tuple[str | None, str | None]:
    p = TAG_DIR / f"{qid}.md"
    if not p.exists():
        return None, None
    t = p.read_text(encoding="utf-8")
    f = re.search(r"^family:\s*(\S+)", t, re.M)
    s = re.search(r"^subcategory:\s*(\S+)", t, re.M)
    return (f.group(1) if f else None), (s.group(1) if s else None)


def heading_slugs(path: Path) -> set[str]:
    if not path.exists():
        return set()
    return {slugify(h) for h in re.findall(r"^#{1,6}\s+(.+?)\s*$",
                                           path.read_text(encoding="utf-8"), re.M)}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--year", type=int)
    args = ap.parse_args()

    files = sorted(V2_DIR.glob("*.md"))
    files = [f for f in files if not f.name.startswith("README")]
    if args.year:
        files = [f for f in files if f.name.startswith(str(args.year))]
    if not files:
        raise SystemExit("FAIL: no v2 matrices matched")

    errors, warnings = [], []
    slug_cache: dict[Path, set[str]] = {}

    for path in files:
        qid = path.stem
        text = path.read_text(encoding="utf-8")
        fm = frontmatter(text)
        if not fm:
            errors.append(f"{qid}: no parseable frontmatter")
            continue

        for k in REQUIRED_KEYS:
            if not fm.get(k):
                errors.append(f"{qid}: missing frontmatter key '{k}'")

        # family/subcategory must agree with the canonical taxonomy tag
        # `family` may be either the bare family (F4) or the sub-form (F4a); both are
        # correct so long as the family letter+digit agree with the canonical tag.
        tf, _ts = tag_family(qid)
        fam = fm.get("family", "")
        if tf and fam and not fam.startswith(tf):
            errors.append(f"{qid}: family {fam!r} disagrees with taxonomy tag {tf!r}")

        # pack link must resolve, anchor included
        ref = fm.get("family_tree_pack_section", "")
        if ref:
            rel, _, anchor = ref.partition("#")
            rel = rel.strip()
            anchor = anchor.split(" ")[0].strip()  # allow "…#anchor — Branch X" form
            pack = ROOT / rel
            if not pack.exists():
                errors.append(f"{qid}: family_tree_pack_section file not found: {rel}")
            elif anchor:
                if pack not in slug_cache:
                    slug_cache[pack] = heading_slugs(pack)
                if anchor not in slug_cache[pack]:
                    errors.append(f"{qid}: anchor '#{anchor}' does not match any heading in {rel}")

        for sec in REQUIRED_SECTIONS:
            if sec not in text:
                errors.append(f"{qid}: missing section '{sec}'")
        if not any(m in text for m in IN_GLASS_MARKERS):
            warnings.append(f"{qid}: no in-glass section (expected one of {IN_GLASS_MARKERS})")

        # one in-taste block per wine
        # Per-wine in-taste blocks are a convention of the newer files, not universal.
        # Only flag when a file uses the block form but skips some of its wines.
        wines = re.findall(r"\d+", fm.get("wines", ""))
        blocks = re.findall(r"^###\s+Wine\s+(\d+)", text, re.M)
        if blocks:
            missing = [w for w in wines if w not in blocks]
            if missing:
                warnings.append(f"{qid}: uses per-wine blocks but omits wine(s) {missing}")

    print(f"v2 matrices checked: {len(files)}")
    for e in errors:
        print(f"  ERROR   {e}")
    for w in warnings:
        print(f"  warning {w}")
    print(f"\n{len(errors)} error(s), {len(warnings)} warning(s)")
    if errors:
        sys.exit(1)
    print("OK")


if __name__ == "__main__":
    main()
