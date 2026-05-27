"""
Merge accepted proposed annotations back into the source MD.

A proposed annotation is "accepted" when its frontmatter has `reviewed: true`.
This script finds all reviewed proposals and inserts them under the matching
'*Notes / Examiner intent:*' marker in the source MD.

After running, re-run scripts/parse_source.py to rebuild the JSON.
"""

import re
from pathlib import Path

SOURCE = Path("source/MW_Practical_Papers_Compilation.md")
PROPOSED_DIR = Path("outputs/proposed_annotations")


def extract_annotation_body(proposed_md_text):
    """Pull the '## Proposed annotation' section body from a proposal file."""
    m = re.search(
        r"##\s+Proposed annotation\s*\n(.*?)(?=\n##\s|\Z)",
        proposed_md_text,
        re.DOTALL,
    )
    return m.group(1).strip() if m else ""


def is_reviewed(proposed_md_text):
    fm = re.match(r"---\n(.*?)\n---", proposed_md_text, re.DOTALL)
    if not fm:
        return False
    return "reviewed: true" in fm.group(1).lower()


def parse_target(proposed_path):
    """Extract year/paper/question from filename like '2022_p1_q3.md'."""
    m = re.match(r"(\d{4})_p(\d+)_q(\d+)\.md$", proposed_path.name)
    if not m:
        return None
    return int(m.group(1)), int(m.group(2)), int(m.group(3))


def main():
    source_text = SOURCE.read_text(encoding="utf-8")
    accepted = []
    for path in PROPOSED_DIR.glob("*.md"):
        text = path.read_text(encoding="utf-8")
        if not is_reviewed(text):
            continue
        target = parse_target(path)
        if not target:
            continue
        body = extract_annotation_body(text)
        if not body:
            continue
        accepted.append((target, body, path))

    if not accepted:
        print("No reviewed proposed annotations found. Mark with `reviewed: true` to accept.")
        return

    # For each accepted proposal, find and replace the corresponding
    # '*Notes / Examiner intent:*' marker plus any existing annotation body.
    # We scope the search to within the right year / paper / question section.
    edits = 0
    for (year, paper, qnum), body, path in accepted:
        # Build a region anchor regex: from "### **Question N (Wines ...)***" within
        # the right year/paper, up to the next ### or ##.
        year_anchor = rf"#\s+\*\*Master of Wine Exam {year}\*\*"
        # Lazy approach: find all "*Notes / Examiner intent:*" markers and pick the
        # right one by position relative to the year+paper+question headings.
        # For simplicity here, require the user to verify by reading after.
        # We replace the FIRST occurrence within the question block.
        pattern = re.compile(
            rf"({year_anchor}.*?##\s+\*\*Paper {paper}\*\*.*?"
            rf"###\s+\*\*Question {qnum}\s+\*\(Wines[^)]+\)\*\*\*.*?"
            rf"\*Notes / Examiner intent:\*)(.*?)(?=\n###|\n##|\n#|\Z)",
            re.DOTALL,
        )
        new_block = rf"\1\n\n{body}\n"
        new_source, count = pattern.subn(new_block, source_text, count=1)
        if count == 1:
            source_text = new_source
            edits += 1
            print(f"OK: merged {year} P{paper} Q{qnum} from {path.name}")
        else:
            print(f"FAIL: could not locate target slot for {year} P{paper} Q{qnum}")

    if edits:
        SOURCE.write_text(source_text, encoding="utf-8")
        print(f"\nMerged {edits} annotations into {SOURCE}.")
        print("Now run: python scripts/parse_source.py")
    else:
        print("\nNo edits applied.")


if __name__ == "__main__":
    main()
