"""
Parse MW_Theory_Papers_Compilation.md (Stage 2 THEORY, five-paper era) into structured JSON.

Deliberately separate from scripts/parse_source.py (Stage 2 practical) and
scripts/parse_s1a_source.py (Stage 1 Assessment). The theory exam is a different
assessment with a different shape:

  * No wines. Theory questions are essay prompts; there is nothing to join to
    data/wines.json.
  * No published per-question marks. The practical publishes "(3 x 10 marks)";
    the theory publishes only an answer-count rubric per paper ("Three questions
    to be answered, one from Section A and two from Section B"). Never synthesise
    theory marks.
  * "Paper" means a SUBJECT DOMAIN (1 viticulture, 2 vinification, 3 handling,
    4 business, 5 contemporary issues), NOT a wine colour. Practical Paper 1 is
    whites; theory Paper 1 is viticulture. Folding these together would corrupt
    every paper-keyed artifact in the repo.

Two hard guarantees:
  1. Outputs go to data/theory/, never to data/exams.json, data/wines.json or data/s1a/.
  2. Question IDs are prefixed `th_` (e.g. th_2024_p1_q3) so a theory row can never
     silently join against a practical or S1A row of the same year/paper/number.

Outputs:
  data/theory/theory_exams.json        — nested year -> paper -> questions
  data/theory/theory_questions.json    — flat one-row-per-question index
  data/theory/theory_annotations.json  — examiner-intent notes per question

Usage:
    python scripts/parse_theory_source.py
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

# Reuse the Stage 2 escape helper so markdown-escaping rules stay in one place.
from parse_source import clean_md_escapes  # noqa: E402

SOURCE = ROOT / "source" / "MW_Theory_Papers_Compilation.md"
OUT_DIR = ROOT / "data" / "theory"
OUT_EXAMS = OUT_DIR / "theory_exams.json"
OUT_QUESTIONS = OUT_DIR / "theory_questions.json"
OUT_ANNOS = OUT_DIR / "theory_annotations.json"

EXAM_TYPE = "THEORY"
ID_PREFIX = "th_"

# The five-paper era only. A year outside this range in the source is an error:
# the 4-paper era (2000-2014) has a different paper->domain mapping and must not
# be parsed with this grammar. 2020 is absent (no exam held, COVID-19).
ERA_START, ERA_END = 2015, 2026
NO_EXAM_YEARS = {2020}

# Canonical domain per paper number, for the five-paper era.
PAPER_DOMAINS = {
    1: "viticulture",
    2: "vinification_and_pre_bottling",
    3: "handling_of_wine",
    4: "business_of_wine",
    5: "contemporary_issues",
}

YEAR_RE = re.compile(r"^#\s+\*\*Master of Wine Theory Exam (\d{4})\*\*\s*$")
PAPER_RE = re.compile(r"^##\s+\*\*Theory Paper (\d+)\s+[—-]\s+(.+?)\*\*\s*$")
SECTION_RE = re.compile(r"^###\s+\*\*Section ([AB])\*\*\s*$")
QUESTION_RE = re.compile(r"^####\s+\*\*Question\s+(\d+)\*\*\s*$")
RUBRIC_RE = re.compile(r"^\*Rubric:\s*(.+?)\*\s*$")
SOURCE_HEADING_RE = re.compile(r"^\*Source heading:\s*(.+)$")
ANNOTATION_MARKER = "*Notes / Examiner intent:*"
HR_RE = re.compile(r"^---\s*$")


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"FAIL: {SOURCE} not found")

    lines = SOURCE.read_text(encoding="utf-8").splitlines()

    exams: list[dict] = []
    questions_flat: list[dict] = []
    annotations: list[dict] = []

    current_year = None
    current_paper = None       # dict for the paper currently being filled
    current_section = None     # "A" / "B" / None (paper 3 has no sections)
    current_question = None    # {"n": int, "section": str|None}
    q_text_lines: list[str] = []
    anno_lines: list[str] = []
    capturing_q = False
    capturing_anno = False
    # Multi-line *Source heading:* continuation.
    capturing_source_heading = False

    def flush_question() -> None:
        nonlocal current_question, capturing_q, capturing_anno
        if current_question is None:
            return
        q_text = "\n".join(l.rstrip() for l in q_text_lines).strip()
        anno_text = "\n".join(l.rstrip() for l in anno_lines).strip()
        if not q_text:
            raise SystemExit(
                f"FAIL: empty question text at {current_year} p{current_paper['paper']} "
                f"q{current_question['n']}"
            )
        qid = f"{ID_PREFIX}{current_year}_p{current_paper['paper']}_q{current_question['n']}"
        row = {
            "id": qid,
            "exam_type": EXAM_TYPE,
            "year": current_year,
            "paper": current_paper["paper"],
            "paper_title": current_paper["title"],
            "domain": current_paper["domain"],
            "question": current_question["n"],
            "section": current_question["section"],
            "text": clean_md_escapes(q_text),
        }
        current_paper["questions"].append({
            "n": row["question"],
            "section": row["section"],
            "text": row["text"],
        })
        questions_flat.append(row)
        annotations.append({
            "id": qid,
            "exam_type": EXAM_TYPE,
            "year": current_year,
            "paper": current_paper["paper"],
            "question": current_question["n"],
            "annotation": clean_md_escapes(anno_text),
            "is_filled": bool(anno_text),
        })
        current_question = None
        q_text_lines.clear()
        anno_lines.clear()
        capturing_q = capturing_anno = False

    for line in lines:
        m = YEAR_RE.match(line)
        if m:
            flush_question()
            current_year = int(m.group(1))
            if not (ERA_START <= current_year <= ERA_END):
                raise SystemExit(
                    f"FAIL: year {current_year} is outside the five-paper era "
                    f"({ERA_START}-{ERA_END}). The 4-paper era uses a different "
                    f"paper->domain mapping and needs its own grammar."
                )
            if current_year in NO_EXAM_YEARS:
                raise SystemExit(f"FAIL: {current_year} has a year block but no exam was held")
            if any(e["year"] == current_year for e in exams):
                raise SystemExit(f"FAIL: duplicate year block for {current_year}")
            exams.append({"exam_type": EXAM_TYPE, "year": current_year, "papers": []})
            current_paper = None
            current_section = None
            capturing_source_heading = False
            continue

        # Ignore the explanatory preamble above the first year heading.
        if current_year is None:
            continue

        m = PAPER_RE.match(line)
        if m:
            flush_question()
            paper_num = int(m.group(1))
            if paper_num not in PAPER_DOMAINS:
                raise SystemExit(f"FAIL: {current_year} has theory paper {paper_num}; expected 1-5")
            year_obj = next(e for e in exams if e["year"] == current_year)
            if any(p["paper"] == paper_num for p in year_obj["papers"]):
                raise SystemExit(f"FAIL: duplicate paper {paper_num} in {current_year}")
            current_paper = {
                "paper": paper_num,
                "title": m.group(2).strip(),
                "domain": PAPER_DOMAINS[paper_num],
                "rubric": "",
                "source_heading": "",
                "questions": [],
            }
            year_obj["papers"].append(current_paper)
            current_section = None
            capturing_source_heading = False
            continue

        if current_paper is None:
            continue

        m = RUBRIC_RE.match(line)
        if m:
            current_paper["rubric"] = clean_md_escapes(m.group(1).strip())
            capturing_source_heading = False
            continue

        m = SOURCE_HEADING_RE.match(line)
        if m:
            current_paper["source_heading"] = clean_md_escapes(m.group(1).strip().rstrip("*"))
            capturing_source_heading = True
            continue

        m = SECTION_RE.match(line)
        if m:
            flush_question()
            current_section = m.group(1)
            capturing_source_heading = False
            continue

        m = QUESTION_RE.match(line)
        if m:
            flush_question()
            current_question = {"n": int(m.group(1)), "section": current_section}
            capturing_q, capturing_anno = True, False
            capturing_source_heading = False
            continue

        if line.strip() == ANNOTATION_MARKER and current_question is not None:
            capturing_q, capturing_anno = False, True
            continue

        if HR_RE.match(line):
            flush_question()
            capturing_source_heading = False
            continue

        # A wrapped *Source heading:* note spills onto following lines until a blank line.
        if capturing_source_heading:
            if line.strip():
                current_paper["source_heading"] += " " + clean_md_escapes(line.strip().rstrip("*"))
            else:
                capturing_source_heading = False
            continue

        if capturing_q and current_question is not None:
            q_text_lines.append(line)
        elif capturing_anno and current_question is not None:
            anno_lines.append(line)

    flush_question()

    if not exams:
        raise SystemExit("FAIL: no theory year blocks parsed — check the heading grammar")

    # --- Structural validation -------------------------------------------------
    problems: list[str] = []
    for e in exams:
        papers = sorted(p["paper"] for p in e["papers"])
        if papers != [1, 2, 3, 4, 5]:
            problems.append(f"{e['year']}: expected papers 1-5, got {papers}")
        for p in e["papers"]:
            if not p["rubric"]:
                problems.append(f"{e['year']} p{p['paper']}: missing *Rubric:* line")
            ns = [q["n"] for q in p["questions"]]
            if ns != list(range(1, len(ns) + 1)):
                problems.append(
                    f"{e['year']} p{p['paper']}: question numbers not contiguous from 1: {ns}"
                )
            if len(ns) != len(set(ns)):
                problems.append(f"{e['year']} p{p['paper']}: duplicate question numbers {ns}")
            # Papers 1/2/4/5 are sectioned A/B; paper 3 is a flat list.
            sections = {q["section"] for q in p["questions"]}
            if p["paper"] == 3:
                if sections != {None}:
                    problems.append(f"{e['year']} p3: handling paper should have no sections")
            else:
                if sections != {"A", "B"}:
                    problems.append(
                        f"{e['year']} p{p['paper']}: expected Section A and B, got {sorted(s or '-' for s in sections)}"
                    )
    if problems:
        raise SystemExit("FAIL: structural problems:\n  " + "\n  ".join(problems))

    # Guarantee 2: theory ids may not collide with practical or S1A wine/question ids.
    theory_ids = {q["id"] for q in questions_flat}
    if len(theory_ids) != len(questions_flat):
        raise SystemExit("FAIL: duplicate theory question ids")
    for other in (ROOT / "data" / "wines.json", ROOT / "data" / "s1a" / "s1a_wines.json"):
        if other.exists():
            other_ids = {w["id"] for w in json.loads(other.read_text(encoding="utf-8"))}
            clash = theory_ids & other_ids
            if clash:
                raise SystemExit(f"FAIL: theory ids collide with {other.name}: {sorted(clash)}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    OUT_EXAMS.write_text(json.dumps(exams, indent=2, ensure_ascii=False), encoding="utf-8")
    OUT_QUESTIONS.write_text(json.dumps(questions_flat, indent=2, ensure_ascii=False), encoding="utf-8")
    OUT_ANNOS.write_text(json.dumps(annotations, indent=2, ensure_ascii=False), encoding="utf-8")

    years = [e["year"] for e in exams]
    filled = sum(1 for a in annotations if a["is_filled"])
    print(f"OK: parsed {len(exams)} theory year(s): {years}")
    print(f"OK: {len(questions_flat)} questions across {sum(len(e['papers']) for e in exams)} papers")
    print(f"OK: annotations {filled} filled / {len(annotations)} total")
    print("OK: papers 1-5 present in every year; question numbering contiguous")
    print("OK: no id collision with data/wines.json or data/s1a/s1a_wines.json")
    for out in (OUT_EXAMS, OUT_QUESTIONS, OUT_ANNOS):
        print(f"OK: wrote {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
