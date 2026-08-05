"""
Verify the 2026 tree re-synthesis preserved what it was told to preserve.

The re-synthesis was an UPDATE IN PLACE, not a rewrite: the master trees carry
hand-refined content that outranks anything a fresh pass would produce — the
`**Practical rule:**` lines from the LOYO post-fix pass (EK-0082), P3's visual-triage
order-of-operations trunk (commit e0175e0), and accumulated `**Evidence:**` citations.

An agent told to "preserve X" can still drop X. This script checks, by diffing each
live tree against its frozen pre-2026 snapshot in outputs/master_trees/_frozen_pre2026/.

Checks per tree:
  - every `**Practical rule:**` line in the frozen copy still appears in the live one
  - `**Evidence:**` citation lines did not shrink in number
  - the frozen `questions_analyzed` ids are all still listed, plus the new 2026 ones
  - the file did not shrink dramatically (a rewrite tell)
  - P3 only: the "order of operations" section and its LOOK-first step survived

Exit code is non-zero if any required content was lost.

Usage:
    python scripts/verify_tree_resynthesis.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LIVE = ROOT / "outputs" / "master_trees"
FROZEN = LIVE / "_frozen_pre2026"

TREES = [
    "p1_whites_tree.md", "p2_reds_tree.md", "p3_special_tree.md",
    "p1_family_tree_pack.md", "p2_family_tree_pack.md", "p3_family_tree_pack.md",
]
EXPECTED_2026 = {
    "p1_whites_tree.md": ["2026_p1_q1", "2026_p1_q2", "2026_p1_q3"],
    "p2_reds_tree.md": ["2026_p2_q1", "2026_p2_q2", "2026_p2_q3"],
    "p3_special_tree.md": ["2026_p3_q1", "2026_p3_q2"],
    "p1_family_tree_pack.md": ["2026_p1_q1", "2026_p1_q2", "2026_p1_q3"],
    "p2_family_tree_pack.md": ["2026_p2_q1", "2026_p2_q2", "2026_p2_q3"],
    "p3_family_tree_pack.md": ["2026_p3_q1", "2026_p3_q2"],
}
# The family packs cite questions in prose form ("2026 P1 Q1") as well as by id.
PROSE_QID_RE = re.compile(r"\b(20\d{2})\s+P([123])\s+Q(\d+)\b")

# Family sections that must survive in each pack — losing one means a rewrite dropped a family.
PACK_FAMILIES = {
    "p1_family_tree_pack.md": ["F1", "F2", "F3", "F4", "F5", "F7"],
    "p2_family_tree_pack.md": ["F1", "F2", "F3", "F4", "F7"],
    "p3_family_tree_pack.md": ["F1", "F2", "F4", "F5", "F6", "F7"],
}

PRACTICAL_RE = re.compile(r"^\s*[-*]?\s*\*\*Practical rule:\*\*\s*(.+)$", re.M)
EVIDENCE_RE = re.compile(r"\*\*Evidence:\*\*", re.M)
QIDS_RE = re.compile(r"\b(20\d{2}_p[123]_q\d+)\b")


def norm_rule(s: str) -> str:
    return re.sub(r"\s+", " ", s.strip().lower())[:90]


def main() -> None:
    errors: list[str] = []
    warnings: list[str] = []

    for name in TREES:
        live_p, frozen_p = LIVE / name, FROZEN / name
        if not frozen_p.exists():
            errors.append(f"{name}: no frozen snapshot at {frozen_p.relative_to(ROOT)}")
            continue
        if not live_p.exists():
            errors.append(f"{name}: live tree missing")
            continue

        live, frozen = live_p.read_text(encoding="utf-8"), frozen_p.read_text(encoding="utf-8")
        live_norm = re.sub(r"\s+", " ", live.lower())

        # 1. practical rules survived
        frozen_rules = [norm_rule(m) for m in PRACTICAL_RE.findall(frozen)]
        lost = [r for r in frozen_rules if r not in live_norm]
        if lost:
            errors.append(f"{name}: {len(lost)}/{len(frozen_rules)} Practical rule line(s) LOST:")
            for r in lost[:5]:
                errors.append(f"      - {r[:80]}...")
        else:
            print(f"  {name}: all {len(frozen_rules)} Practical rule lines preserved")

        # 2. evidence blocks did not shrink
        fe, le = len(EVIDENCE_RE.findall(frozen)), len(EVIDENCE_RE.findall(live))
        if le < fe:
            errors.append(f"{name}: Evidence blocks shrank {fe} -> {le}")
        else:
            print(f"  {name}: Evidence blocks {fe} -> {le}")

        # 3. no historical question id was dropped, and 2026 was added.
        # Packs cite both "2026_p1_q1" and "2026 P1 Q1" forms — normalise both.
        def qids(text: str) -> set[str]:
            ids = set(QIDS_RE.findall(text))
            ids |= {f"{y}_p{p}_q{q}" for y, p, q in PROSE_QID_RE.findall(text)}
            return ids

        frozen_qids = qids(frozen)
        live_qids = qids(live)
        dropped = sorted(frozen_qids - live_qids)
        if dropped:
            errors.append(f"{name}: {len(dropped)} historical question id(s) dropped: {dropped[:8]}")
        missing_new = [q for q in EXPECTED_2026[name] if q not in live_qids]
        if missing_new:
            errors.append(f"{name}: 2026 ids not incorporated: {missing_new}")
        else:
            print(f"  {name}: 2026 ids present ({', '.join(EXPECTED_2026[name])})")

        # 4. size sanity — a big shrink means it was rewritten, not updated
        ratio = len(live) / max(len(frozen), 1)
        if ratio < 0.85:
            errors.append(f"{name}: shrank to {ratio:.0%} of frozen size — likely rewritten, not updated")
        else:
            print(f"  {name}: size {len(frozen)} -> {len(live)} chars ({ratio:.0%})")

        # 5a. family packs must keep every family section
        if name in PACK_FAMILIES:
            lost_fams = [f for f in PACK_FAMILIES[name]
                         if not re.search(rf"^##\s+{f}\b", live, re.M)]
            if lost_fams:
                errors.append(f"{name}: family section(s) LOST: {lost_fams}")
            else:
                print(f"  {name}: all {len(PACK_FAMILIES[name])} family sections intact")

        # 5. P3 structural trunk
        if name == "p3_special_tree.md":
            for needle, label in [
                ("order of operations", "P3 order-of-operations section"),
                ("look first", "LOOK-first step"),
                ("last_refactored", "last_refactored frontmatter"),
            ]:
                if needle not in live_norm:
                    errors.append(f"{name}: {label} MISSING — the visual trunk was flattened")
                else:
                    print(f"  {name}: {label} intact")

        if "last_resynthesized" not in live_norm:
            warnings.append(f"{name}: no last_resynthesized frontmatter stamp")

    print()
    for w in warnings:
        print(f"  warning {w}")
    if errors:
        print("\nFAILED:")
        for e in errors:
            print(f"  {e}")
        sys.exit(1)
    print("OK — all protected content survived the re-synthesis.")


if __name__ == "__main__":
    main()
