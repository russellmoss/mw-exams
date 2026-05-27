from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
SOURCE_PATH = ROOT / "source" / "MW_Practical_Papers_Compilation.md"
MOCK_DIR = ROOT / "outputs" / "mock_answers"
ANNOTATION_DIR = ROOT / "outputs" / "proposed_annotations"
OUTPUT_PATH = ROOT / "outputs" / "MW_Practical_Papers_Compilation_with_answers.md"

YEAR_RE = re.compile(r"^# \*\*Master of Wine Exam (\d{4})\*\*")
PAPER_RE = re.compile(r"^## \*\*Paper (\d+)\*\*")
QUESTION_RE = re.compile(r"^### \*\*Question (\d+)")
NOTES_RE = re.compile(r"^\*Notes / Examiner intent:\*")
BOUNDARY_RE = re.compile(
    r"^(# \*\*Master of Wine Exam \d{4}\*\*|## \*\*Paper \d+\*\*|### \*\*Question \d+|### \*\*Wines for Paper \d+\*\*)"
)
HEADING_RE = re.compile(r"^(#{1,6})\s+(.*)$")


def strip_frontmatter(text: str) -> str:
    if not text.startswith("---"):
        return text
    parts = text.split("---", 2)
    if len(parts) < 3:
        return text
    return parts[2].lstrip("\r\n")


def extract_section(markdown: str, heading: str) -> str:
    pattern = re.compile(
        rf"^##\s+{re.escape(heading)}\s*$\n(.*?)(?=^##\s+|\Z)",
        re.MULTILINE | re.DOTALL,
    )
    match = pattern.search(markdown)
    return match.group(1).strip() if match else ""


def shift_headings(markdown: str, increase_by: int) -> str:
    adjusted: list[str] = []
    for line in markdown.splitlines():
        match = HEADING_RE.match(line)
        if not match:
            adjusted.append(line)
            continue
        hashes, text = match.groups()
        new_level = min(6, len(hashes) + increase_by)
        adjusted.append(f"{'#' * new_level} {text}")
    return "\n".join(adjusted).strip()


def load_mock_answers() -> dict[str, str]:
    answers: dict[str, str] = {}
    for path in sorted(MOCK_DIR.glob("*.md")):
        body = strip_frontmatter(path.read_text(encoding="utf-8")).strip()
        lines = body.splitlines()
        if lines and lines[0].startswith("# "):
            lines = lines[1:]
        lines = [
            line
            for line in lines
            if line.strip()
            != "> Internal examiner-intent note used for weighting only; not part of the candidate script."
        ]
        body = "\n".join(lines).strip()
        answers[path.stem] = shift_headings(body, 2)
    return answers


def load_annotations() -> dict[str, dict[str, str]]:
    annotations: dict[str, dict[str, str]] = {}
    for path in sorted(ANNOTATION_DIR.glob("*.md")):
        body = strip_frontmatter(path.read_text(encoding="utf-8")).strip()
        proposed = extract_section(body, "Proposed annotation")
        reasoning = extract_section(
            body,
            "Reasoning trace (for the user's reference — DO NOT include in final annotation)",
        ) or extract_section(
            body,
            "Reasoning trace (for the user's reference -- DO NOT include in final annotation)",
        )
        annotations[path.stem] = {
            "proposed": proposed,
            "reasoning": reasoning,
        }
    return annotations


def build_note_fill(annotation: dict[str, str]) -> list[str]:
    lines: list[str] = []
    proposed = annotation.get("proposed", "").strip()
    reasoning = annotation.get("reasoning", "").strip()
    if proposed:
        lines.extend(
            [
                "",
                "**Proposed annotation:**",
                "",
                proposed,
            ]
        )
    if reasoning:
        lines.extend(
            [
                "",
                "**Reasoning trace (for the user's reference):**",
                "",
                reasoning,
            ]
        )
    if lines and lines[-1] != "":
        lines.append("")
    return lines


def build_mock_block(mock_answer: str) -> list[str]:
    return [
        "",
        "#### Mock answer",
        "",
        mock_answer.strip(),
        "",
    ]


def merge_compilation() -> tuple[str, dict[str, int]]:
    source_lines = SOURCE_PATH.read_text(encoding="utf-8").splitlines()
    mock_answers = load_mock_answers()
    annotations = load_annotations()

    out: list[str] = []
    current_year: str | None = None
    current_paper: str | None = None
    current_question: str | None = None

    filled_notes = 0
    inserted_mock_answers = 0
    skipped_note_fills = 0

    i = 0
    while i < len(source_lines):
        line = source_lines[i]

        year_match = YEAR_RE.match(line)
        if year_match:
            current_year = year_match.group(1)

        paper_match = PAPER_RE.match(line)
        if paper_match:
            current_paper = paper_match.group(1)

        question_match = QUESTION_RE.match(line)
        if question_match:
            current_question = question_match.group(1)

        if NOTES_RE.match(line):
            out.append(line)
            j = i + 1
            note_body: list[str] = []
            while j < len(source_lines) and not BOUNDARY_RE.match(source_lines[j]):
                note_body.append(source_lines[j])
                j += 1

            key = None
            if current_year and current_paper and current_question:
                key = f"{current_year}_p{current_paper}_q{current_question}"

            note_body_is_empty = "".join(part.strip() for part in note_body) == ""
            if note_body_is_empty and key and key in annotations:
                out.extend(build_note_fill(annotations[key]))
                filled_notes += 1
            else:
                out.extend(note_body)
                if note_body_is_empty and key:
                    skipped_note_fills += 1

            if key and key in mock_answers:
                out.extend(build_mock_block(mock_answers[key]))
                inserted_mock_answers += 1

            i = j
            continue

        out.append(line)
        i += 1

    # Preserve trailing newline.
    merged = "\n".join(out).rstrip() + "\n"
    stats = {
        "filled_notes": filled_notes,
        "inserted_mock_answers": inserted_mock_answers,
        "skipped_note_fills": skipped_note_fills,
    }
    return merged, stats


def main() -> None:
    merged, stats = merge_compilation()
    OUTPUT_PATH.write_text(merged, encoding="utf-8")
    print(f"Wrote {OUTPUT_PATH}")
    print(
        "filled_notes={filled_notes} inserted_mock_answers={inserted_mock_answers} skipped_note_fills={skipped_note_fills}".format(
            **stats
        )
    )


if __name__ == "__main__":
    main()
