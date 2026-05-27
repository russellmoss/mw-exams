from __future__ import annotations

import json
import re
from pathlib import Path


SOURCE = Path("source/MW_Practical_Papers_Compilation V2.md")
OUT_DIR = Path("data/tmp_v2_parse")
OUT_EXAMS = OUT_DIR / "exams_v2_temp.json"
OUT_WINES = OUT_DIR / "wines_v2_temp.json"
OUT_ANNOS = OUT_DIR / "annotations_v2_temp.json"

YEAR_RE = re.compile(r"^#\s+\*\*Master of Wine Exam (\d{4})\*\*\s*$")
PAPER_RE = re.compile(r"^##\s+\*\*Paper (\d+)\*\*\s*$")
QUESTION_RE = re.compile(r"^###\s+\*\*Question\s+(\d+)\s+\(Wines\s+([^)]+)\)\*\*\s*$")
WINES_HEADER_RE = re.compile(r"^###\s+\*\*Wines for Paper (\d+)\*\*\s*$")
WINE_LINE_RE = re.compile(r"^(\d+)\\?\.\s+(.+?)\s*$")
ANNOTATION_MARKER = "*Notes / Examiner intent:*"


def normalize_wine_range(text: str) -> list[int]:
    value = text.replace("\\", "").strip()
    value = value.replace("â€“", "-").replace("–", "-").strip()
    if "-" in value:
        start, end = value.split("-", 1)
        return list(range(int(start.strip()), int(end.strip()) + 1))
    return [int(value.strip())]


def clean_md_escapes(text: str) -> str:
    return (
        text.replace("\\.", ".")
        .replace("\\)", ")")
        .replace("\\&", "&")
        .replace("\\-", "-")
        .replace("\\(", "(")
    )


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"FAIL: {SOURCE} not found")

    lines = SOURCE.read_text(encoding="utf-8").splitlines()
    exams = []
    wines_flat = []
    annotations = []

    current_year = None
    current_paper = None
    current_question = None
    current_q_text_lines: list[str] = []
    current_anno_lines: list[str] = []
    capturing_question_text = False
    capturing_annotation = False

    def flush_question() -> None:
        nonlocal current_question
        if current_question is None:
            return
        q_text = "\n".join(line.rstrip() for line in current_q_text_lines).strip()
        anno_text = "\n".join(line.rstrip() for line in current_anno_lines).strip()
        year_obj = next(e for e in exams if e["year"] == current_year)
        paper_obj = next(p for p in year_obj["papers"] if p["paper"] == current_paper)
        paper_obj["questions"].append(
            {
                "n": current_question["n"],
                "wines": current_question["wines"],
                "text": q_text,
            }
        )
        annotations.append(
            {
                "year": current_year,
                "paper": current_paper,
                "question": current_question["n"],
                "wines": current_question["wines"],
                "annotation": anno_text,
                "is_filled": bool(anno_text),
            }
        )
        current_question = None
        current_q_text_lines.clear()
        current_anno_lines.clear()

    i = 0
    while i < len(lines):
        line = lines[i]

        match = YEAR_RE.match(line)
        if match:
            flush_question()
            current_year = int(match.group(1))
            current_paper = None
            exams.append({"year": current_year, "papers": []})
            capturing_question_text = False
            capturing_annotation = False
            i += 1
            continue

        match = PAPER_RE.match(line)
        if match:
            flush_question()
            current_paper = int(match.group(1))
            year_obj = next(e for e in exams if e["year"] == current_year)
            year_obj["papers"].append({"paper": current_paper, "questions": [], "wines": []})
            capturing_question_text = False
            capturing_annotation = False
            i += 1
            continue

        match = QUESTION_RE.match(line)
        if match:
            flush_question()
            current_question = {
                "n": int(match.group(1)),
                "wines": normalize_wine_range(match.group(2)),
            }
            capturing_question_text = True
            capturing_annotation = False
            i += 1
            continue

        match = WINES_HEADER_RE.match(line)
        if match:
            flush_question()
            paper_num = int(match.group(1))
            capturing_question_text = False
            capturing_annotation = False
            year_obj = next(e for e in exams if e["year"] == current_year)
            paper_obj = next(p for p in year_obj["papers"] if p["paper"] == paper_num)
            j = i + 1
            while j < len(lines) and len(paper_obj["wines"]) < 12:
                stripped = lines[j].strip()
                wine_match = WINE_LINE_RE.match(stripped)
                if wine_match:
                    slot = int(wine_match.group(1))
                    full_text = clean_md_escapes(wine_match.group(2).strip())
                    paper_obj["wines"].append({"slot": slot, "full_text": full_text})
                    wines_flat.append(
                        {
                            "id": f"{current_year}_p{paper_num}_w{slot}",
                            "year": current_year,
                            "paper": paper_num,
                            "slot": slot,
                            "full_text": full_text,
                        }
                    )
                if lines[j].startswith("#"):
                    break
                j += 1
            i = j
            continue

        if line.strip() == ANNOTATION_MARKER and current_question is not None:
            capturing_question_text = False
            capturing_annotation = True
            i += 1
            continue

        if capturing_question_text and current_question is not None:
            current_q_text_lines.append(line)
            i += 1
            continue

        if capturing_annotation and current_question is not None:
            current_anno_lines.append(line)
            i += 1
            continue

        i += 1

    flush_question()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    OUT_EXAMS.write_text(json.dumps(exams, indent=2, ensure_ascii=False), encoding="utf-8")
    OUT_WINES.write_text(json.dumps(wines_flat, indent=2, ensure_ascii=False), encoding="utf-8")
    OUT_ANNOS.write_text(json.dumps(annotations, indent=2, ensure_ascii=False), encoding="utf-8")

    total_questions = sum(len(p["questions"]) for e in exams for p in e["papers"])
    print(f"OK: parsed {len(exams)} exams")
    print(f"OK: parsed {sum(len(e['papers']) for e in exams)} papers")
    print(f"OK: parsed {total_questions} questions")
    print(f"OK: parsed {len(wines_flat)} wines")
    print(f"OK: wrote {OUT_DIR}")


if __name__ == "__main__":
    main()
