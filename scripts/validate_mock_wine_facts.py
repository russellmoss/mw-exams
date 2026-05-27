from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_EXAM = ROOT / "outputs" / "mock_exams" / "mock_full_2026_05_26_v6.md"
DEFAULT_ANSWERS = ROOT / "outputs" / "mock_exams" / "mock_full_2026_05_26_v6_answers.md"
RESEARCH_DIR = ROOT / "data" / "mock_wine_research"

GENERIC_TOKENS = {
    "wine",
    "wines",
    "riesling",
    "chardonnay",
    "sauvignon",
    "blanc",
    "syrah",
    "shiraz",
    "pinot",
    "noir",
    "france",
    "italy",
    "australia",
    "spain",
    "germany",
    "austria",
    "england",
    "south",
    "valley",
    "grand",
    "cru",
    "classic",
    "cuvee",
    "brut",
    "nature",
    "nv",
    "docg",
    "aoc",
}

COMPARISON_CUES = {
    "than",
    "versus",
    "vs",
    "compared",
    "contrast",
    "contrasts",
    "ranking",
    "rank",
    "alternative",
    "eliminate",
    "eliminates",
    "rather",
    "whereas",
    "while",
    "between",
    "against",
    ">",
    "<",
    "=",
    "would",
    "could",
    "if ",
}


def parse_frontmatter(text: str) -> tuple[dict[str, str], str]:
    if not text.startswith("---"):
        return {}, text
    parts = text.split("---", 2)
    if len(parts) < 3:
        return {}, text
    fm = {}
    for line in parts[1].splitlines():
        if ":" in line:
            key, value = line.split(":", 1)
            fm[key.strip()] = value.strip()
    return fm, parts[2]


def mock_id_from_path(path: Path, text: str) -> str:
    fm, _ = parse_frontmatter(text)
    return fm.get("mock_exam_id") or path.stem


def parse_exam(exam_text: str) -> tuple[dict[tuple[int, int], str], dict[tuple[int, int], list[int]]]:
    wines: dict[tuple[int, int], str] = {}
    questions: dict[tuple[int, int], list[int]] = {}
    paper_blocks = re.split(r"\n## Paper\s+", exam_text)
    for block in paper_blocks[1:]:
        paper_match = re.match(r"(\d+)", block)
        if not paper_match:
            continue
        paper = int(paper_match.group(1))
        wine_section = re.search(r"\n### Wines\s*\n(.*?)(?:\n---\n|\Z)", block, re.S)
        if wine_section:
            for line in wine_section.group(1).splitlines():
                m = re.match(r"\s*(\d+)\.\s+(.+)", line)
                if m:
                    wines[(paper, int(m.group(1)))] = m.group(2).strip()
        for q_match in re.finditer(r"\n### Question\s+(\d+)\s*\n(.*?)(?=\n---\n\n### Question|\n---\n\n### Wines|\Z)", block, re.S):
            qn = int(q_match.group(1))
            body = q_match.group(2)
            slots: list[int] = []
            for range_match in re.finditer(r"Wines?\s+(\d+)(?:\s*(?:to|-)\s*(\d+))?", body, re.I):
                start = int(range_match.group(1))
                end = int(range_match.group(2) or start)
                slots.extend(range(start, end + 1))
            if slots:
                questions[(paper, qn)] = sorted(set(slots))
    return wines, questions


def parse_answer_sections(answer_text: str) -> dict[tuple[int, int], str]:
    sections: dict[tuple[int, int], str] = {}
    paper_parts = re.split(r"\n## Paper\s+", answer_text)
    for block in paper_parts[1:]:
        paper_match = re.match(r"(\d+)", block)
        if not paper_match:
            continue
        paper = int(paper_match.group(1))
        for q_match in re.finditer(r"\n### Question\s+(\d+)\s*(.*?)(?=\n---\n\n### Question|\n---\n\n## Paper|\Z)", block, re.S):
            body = q_match.group(2).split("\n## Proposed annotation", 1)[0]
            sections[(paper, int(q_match.group(1)))] = body
    return sections


def distinctive_tokens(wine_text: str) -> set[str]:
    raw = re.findall(r"[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’.-]{2,}(?:\s+[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’.-]{2,})*", wine_text)
    tokens: set[str] = set()
    for item in raw:
        words = [w.strip(".,;:()'’").lower() for w in item.split()]
        clean = [w for w in words if len(w) >= 4 and w not in GENERIC_TOKENS and not re.fullmatch(r"\d+", w)]
        if not clean:
            continue
        tokens.update(clean)
        if len(clean) >= 2:
            tokens.add(" ".join(clean))
    return tokens


def extract_wine_paragraph(section: str, slot: int) -> str:
    pattern = re.compile(
        rf"(?:(?:\*+)?Wine\s+{slot}\b.*?)(?=(?:\n\n\*+Wine\s+\d+\b)|(?:\n\n---)|\Z)",
        re.S | re.I,
    )
    matches = pattern.findall(section)
    return "\n\n".join(matches)


def sentence_has_comparison_cue(sentence: str) -> bool:
    low = sentence.lower()
    return any(cue in low for cue in COMPARISON_CUES)


def load_research(mock_id: str) -> dict:
    path = RESEARCH_DIR / f"{mock_id}.json"
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def validate(exam_path: Path, answers_path: Path, strict_cross_contamination: bool = False) -> tuple[list[str], list[str]]:
    exam_text = exam_path.read_text(encoding="utf-8", errors="replace")
    answer_text = answers_path.read_text(encoding="utf-8", errors="replace")
    mock_id = mock_id_from_path(exam_path, exam_text)
    wines, questions = parse_exam(exam_text)
    answer_sections = parse_answer_sections(answer_text)
    research = load_research(mock_id)
    research_wines = research.get("wines", {}) if research else {}

    errors: list[str] = []
    warnings: list[str] = []

    for key, wine_text in sorted(wines.items()):
        wine_key = f"p{key[0]}_w{key[1]}"
        row = research_wines.get(wine_key)
        if not row:
            warnings.append(f"{wine_key}: missing source-backed mock wine research entry")
            continue
        sources = row.get("sources") or []
        if not sources:
            errors.append(f"{wine_key}: research entry has no sources")
        for field in ["producer", "country", "region"]:
            value = str(row.get(field, "")).strip()
            if value and value.lower() not in wine_text.lower():
                errors.append(f"{wine_key}: research {field}={value!r} is not present in wine line {wine_text!r}")

    token_cache = {key: distinctive_tokens(text) for key, text in wines.items()}
    for qkey, slots in sorted(questions.items()):
        section = answer_sections.get(qkey, "")
        if not section:
            warnings.append(f"p{qkey[0]}_q{qkey[1]}: missing answer section")
            continue
        for slot in slots:
            paragraph = extract_wine_paragraph(section, slot)
            if not paragraph:
                continue
            own_tokens = token_cache.get((qkey[0], slot), set())
            para_low = paragraph.lower()
            for other_slot in slots:
                if other_slot == slot:
                    continue
                for token in token_cache.get((qkey[0], other_slot), set()):
                    if token in own_tokens or len(token) < 5:
                        continue
                    hit_sentences = [
                        s.strip()
                        for s in re.split(r"(?<=[.!?])\s+", paragraph)
                        if token in s.lower()
                    ]
                    bad_sentences = [s for s in hit_sentences if not sentence_has_comparison_cue(s)]
                    if bad_sentences:
                        target = errors if strict_cross_contamination else warnings
                        target.append(
                            f"p{qkey[0]}_q{qkey[1]} Wine {slot}: non-comparative mention of `{token}` from Wine {other_slot}"
                        )

    return errors, warnings


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate mock exam wine facts against source-backed research and answer text.")
    parser.add_argument("--exam", type=Path, default=DEFAULT_EXAM)
    parser.add_argument("--answers", type=Path, default=DEFAULT_ANSWERS)
    parser.add_argument("--strict-research", action="store_true", help="Treat missing mock research entries as errors.")
    parser.add_argument("--strict-cross-contamination", action="store_true", help="Treat cross-wine proper-noun mentions as errors.")
    args = parser.parse_args()

    errors, warnings = validate(args.exam, args.answers, args.strict_cross_contamination)
    if args.strict_research:
        remaining_warnings = []
        for warning in warnings:
            if "missing source-backed mock wine research entry" in warning:
                errors.append(warning)
            else:
                remaining_warnings.append(warning)
        warnings = remaining_warnings

    for warning in warnings:
        print(f"WARN: {warning}")
    for error in errors:
        print(f"FAIL: {error}")
    if errors:
        raise SystemExit(1)
    print("OK: mock wine fact validation passed")


if __name__ == "__main__":
    main()
