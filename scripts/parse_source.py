"""
Parse MW_Practical_Papers_Compilation.md into structured JSON.

Outputs:
  data/exams.json        — questions per year/paper, with wine number ranges
  data/wines.json        — one row per wine slot, with full unparsed text
  data/annotations.json  — examiner-intent notes per question (filled or empty)

The source MD is treated as authoritative. This parser does not infer or
transform wine names; it captures full_text strings for downstream agents
to parse.
"""

import json
import re
from pathlib import Path

SOURCE = Path("source/MW_Practical_Papers_Compilation.md")
OUT_EXAMS = Path("data/exams.json")
OUT_WINES = Path("data/wines.json")
OUT_ANNOS = Path("data/annotations.json")

# Heading patterns — note: source uses Markdown bold inside headings
YEAR_RE = re.compile(r"^#\s+\*\*Master of Wine Exam (\d{4})\*\*\s*$")
PAPER_RE = re.compile(r"^##\s+\*\*Paper (\d+)\*\*\s*$")
QUESTION_RE = re.compile(
    r"^###\s+\*\*Question\s+(\d+)\s+\*\(Wines\s+([^)]+)\)\*\*\*\s*$"
)
WINES_HEADER_RE = re.compile(r"^(?:###\s+)?\*\*Wines for Paper (\d+)\*\*\s*$")
# Wine line: "1\. Producer, year. Region, Country. (12.5%)"
WINE_LINE_RE = re.compile(r"^(\d+)\\\.\s+(.+?)\s*$")
ANNOTATION_MARKER = "*Notes / Examiner intent:*"


def normalize_wine_range(s):
    """Convert '1–2' or '1-2' or '4\\' (single-wine MD-escaped) to a list of ints."""
    # Strip backslashes (MD auto-escapes ')' as '\)' so the trailing '\' leaks in)
    s = s.replace("\\", "").strip()
    # Normalize en-dash to ASCII hyphen
    s = s.replace("–", "-").replace("–", "-").strip()
    if "-" in s:
        a, b = s.split("-", 1)
        return list(range(int(a.strip()), int(b.strip()) + 1))
    return [int(s.strip())]


def clean_md_escapes(text):
    """Remove Markdown auto-escape backslashes from extracted text.

    Numbered-list export adds '\\.' to periods, '\\&' to ampersands, '\\)' to
    parens — we want plain text.
    """
    return (text
            .replace("\\.", ".")
            .replace("\\)", ")")
            .replace("\\&", "&")
            .replace("\\-", "-")
            .replace("\\(", "("))


def main():
    if not SOURCE.exists():
        raise SystemExit(f"FAIL: {SOURCE} not found")

    lines = SOURCE.read_text(encoding="utf-8").splitlines()

    exams = []        # full structure: years -> papers -> questions
    wines_flat = []   # flat list, one entry per wine slot
    annotations = []  # one entry per question, with annotation text (may be empty)

    current_year = None
    current_paper = None  # 1, 2, or 3
    current_question = None
    current_q_text_lines = []
    current_anno_lines = []
    capturing_question_text = False
    capturing_annotation = False

    def flush_question():
        """Finalize the current question to exams + annotations."""
        nonlocal current_question
        if current_question is None:
            return
        q_text = "\n".join(l.rstrip() for l in current_q_text_lines).strip()
        anno_text = "\n".join(l.rstrip() for l in current_anno_lines).strip()
        # find the paper dict
        year_obj = next(e for e in exams if e["year"] == current_year)
        paper_obj = next(p for p in year_obj["papers"] if p["paper"] == current_paper)
        question_obj = {
            "n": current_question["n"],
            "wines": current_question["wines"],
            "text": q_text,
        }
        paper_obj["questions"].append(question_obj)
        annotations.append({
            "year": current_year,
            "paper": current_paper,
            "question": current_question["n"],
            "wines": current_question["wines"],
            "annotation": anno_text,
            "is_filled": bool(anno_text),
        })
        current_question = None
        current_q_text_lines.clear()
        current_anno_lines.clear()

    i = 0
    while i < len(lines):
        line = lines[i]

        m = YEAR_RE.match(line)
        if m:
            flush_question()
            current_year = int(m.group(1))
            current_paper = None
            exams.append({"year": current_year, "papers": []})
            capturing_question_text = False
            capturing_annotation = False
            i += 1
            continue

        m = PAPER_RE.match(line)
        if m:
            flush_question()
            current_paper = int(m.group(1))
            year_obj = next(e for e in exams if e["year"] == current_year)
            year_obj["papers"].append({
                "paper": current_paper,
                "questions": [],
                "wines": [],
            })
            capturing_question_text = False
            capturing_annotation = False
            i += 1
            continue

        m = QUESTION_RE.match(line)
        if m:
            flush_question()
            current_question = {
                "n": int(m.group(1)),
                "wines": normalize_wine_range(m.group(2)),
            }
            capturing_question_text = True
            capturing_annotation = False
            i += 1
            continue

        m = WINES_HEADER_RE.match(line)
        if m:
            flush_question()
            paper_num = int(m.group(1))
            capturing_question_text = False
            capturing_annotation = False
            # advance and capture up to 12 wine lines
            year_obj = next(e for e in exams if e["year"] == current_year)
            paper_obj = next(p for p in year_obj["papers"] if p["paper"] == paper_num)
            j = i + 1
            while j < len(lines) and len(paper_obj["wines"]) < 12:
                wm = WINE_LINE_RE.match(lines[j].strip())
                if wm:
                    slot = int(wm.group(1))
                    full_text = clean_md_escapes(wm.group(2).strip())
                    paper_obj["wines"].append({
                        "slot": slot,
                        "full_text": full_text,
                    })
                    wines_flat.append({
                        "id": f"{current_year}_p{paper_num}_w{slot}",
                        "year": current_year,
                        "paper": paper_num,
                        "slot": slot,
                        "full_text": full_text,
                    })
                # Stop if we hit a new heading
                if lines[j].startswith("#"):
                    break
                j += 1
            i = j
            continue

        # Annotation marker
        if line.strip() == ANNOTATION_MARKER and current_question is not None:
            capturing_question_text = False
            capturing_annotation = True
            i += 1
            continue

        # In question body
        if capturing_question_text and current_question is not None:
            current_q_text_lines.append(line)
            i += 1
            continue

        # In annotation body
        if capturing_annotation and current_question is not None:
            current_anno_lines.append(line)
            i += 1
            continue

        i += 1

    # Final flush
    flush_question()

    # Write outputs
    OUT_EXAMS.parent.mkdir(parents=True, exist_ok=True)
    OUT_EXAMS.write_text(json.dumps(exams, indent=2, ensure_ascii=False), encoding="utf-8")
    OUT_WINES.write_text(json.dumps(wines_flat, indent=2, ensure_ascii=False), encoding="utf-8")
    OUT_ANNOS.write_text(json.dumps(annotations, indent=2, ensure_ascii=False), encoding="utf-8")

    # Summary
    total_questions = sum(len(p["questions"]) for e in exams for p in e["papers"])
    total_wines = len(wines_flat)
    filled_annos = sum(1 for a in annotations if a["is_filled"])
    print(f"OK: parsed {len(exams)} exams")
    print(f"OK: parsed {sum(len(e['papers']) for e in exams)} papers")
    print(f"OK: parsed {total_questions} questions")
    print(f"OK: parsed {total_wines} wines")
    print(f"OK: {filled_annos} of {len(annotations)} annotations are filled")


if __name__ == "__main__":
    main()
