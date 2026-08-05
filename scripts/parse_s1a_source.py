"""
Parse MW_S1A_Papers_Compilation.md (Stage 1 Assessment) into structured JSON.

Deliberately separate from scripts/parse_source.py. The Stage 1 Assessment is a
DIFFERENT exam from the Stage 2 MW practical: one practical paper of 12 wines
mixing sparkling / white / red / sweet / fortified, with its own question count
and mark split. Every Stage 2 artifact in this repo (master trees, taxonomy
families, wine-distribution-by-paper, the exam-structure predictor) keys off
Paper 1 = whites, Paper 2 = reds, Paper 3 = special. Folding S1A into those would
skew all of them, so it gets its own namespace.

Two hard guarantees:
  1. Outputs go to data/s1a/, never to data/exams.json or data/wines.json.
  2. Wine IDs are prefixed `s1a_` (e.g. s1a_2026_p1_w1) so an S1A row can never
     silently join against a Stage 2 wine ID of the same year/paper/slot.

Outputs:
  data/s1a/s1a_exams.json
  data/s1a/s1a_wines.json
  data/s1a/s1a_annotations.json

Usage:
    python scripts/parse_s1a_source.py
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

# Reuse the Stage 2 grammar helpers so escaping/range rules stay in one place.
from parse_source import (  # noqa: E402
    PAPER_RE,
    QUESTION_RE,
    WINES_HEADER_RE,
    WINE_LINE_RE,
    ANNOTATION_MARKER,
    normalize_wine_range,
    clean_md_escapes,
)

SOURCE = ROOT / "source" / "MW_S1A_Papers_Compilation.md"
OUT_DIR = ROOT / "data" / "s1a"
OUT_EXAMS = OUT_DIR / "s1a_exams.json"
OUT_WINES = OUT_DIR / "s1a_wines.json"
OUT_ANNOS = OUT_DIR / "s1a_annotations.json"

EXAM_TYPE = "S1A"
ID_PREFIX = "s1a_"
# S1A's own year heading — intentionally NOT the Stage 2 "Master of Wine Exam YYYY".
YEAR_RE = re.compile(r"^#\s+\*\*Stage 1 Assessment (\d{4})\*\*\s*$")


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"FAIL: {SOURCE} not found")

    lines = SOURCE.read_text(encoding="utf-8").splitlines()

    exams: list[dict] = []
    wines_flat: list[dict] = []
    annotations: list[dict] = []

    current_year = None
    current_paper = None
    current_question = None
    q_text_lines: list[str] = []
    anno_lines: list[str] = []
    capturing_q = False
    capturing_anno = False

    def flush_question() -> None:
        nonlocal current_question, capturing_q, capturing_anno
        if current_question is None:
            return
        q_text = "\n".join(l.rstrip() for l in q_text_lines).strip()
        anno_text = "\n".join(l.rstrip() for l in anno_lines).strip()
        year_obj = next(e for e in exams if e["year"] == current_year)
        paper_obj = next(p for p in year_obj["papers"] if p["paper"] == current_paper)
        paper_obj["questions"].append({
            "n": current_question["n"],
            "wines": current_question["wines"],
            "text": q_text,
        })
        annotations.append({
            "exam_type": EXAM_TYPE,
            "year": current_year,
            "paper": current_paper,
            "question": current_question["n"],
            "wines": current_question["wines"],
            "annotation": anno_text,
            "is_filled": bool(anno_text),
        })
        current_question = None
        q_text_lines.clear()
        anno_lines.clear()

    i = 0
    while i < len(lines):
        line = lines[i]

        m = YEAR_RE.match(line)
        if m:
            flush_question()
            current_year = int(m.group(1))
            current_paper = None
            exams.append({"exam_type": EXAM_TYPE, "year": current_year, "papers": []})
            capturing_q = capturing_anno = False
            i += 1
            continue

        # Only treat structural headings as meaningful once inside an S1A year block,
        # so the explanatory preamble above the first year heading is ignored.
        if current_year is None:
            i += 1
            continue

        m = PAPER_RE.match(line)
        if m:
            flush_question()
            current_paper = int(m.group(1))
            year_obj = next(e for e in exams if e["year"] == current_year)
            year_obj["papers"].append({"paper": current_paper, "questions": [], "wines": []})
            capturing_q = capturing_anno = False
            i += 1
            continue

        m = QUESTION_RE.match(line)
        if m:
            flush_question()
            current_question = {"n": int(m.group(1)), "wines": normalize_wine_range(m.group(2))}
            capturing_q, capturing_anno = True, False
            i += 1
            continue

        m = WINES_HEADER_RE.match(line)
        if m:
            flush_question()
            paper_num = int(m.group(1))
            capturing_q = capturing_anno = False
            year_obj = next(e for e in exams if e["year"] == current_year)
            paper_obj = next(p for p in year_obj["papers"] if p["paper"] == paper_num)
            j = i + 1
            while j < len(lines) and len(paper_obj["wines"]) < 12:
                wm = WINE_LINE_RE.match(lines[j].strip())
                if wm:
                    slot = int(wm.group(1))
                    full_text = clean_md_escapes(wm.group(2).strip())
                    paper_obj["wines"].append({"slot": slot, "full_text": full_text})
                    wines_flat.append({
                        "id": f"{ID_PREFIX}{current_year}_p{paper_num}_w{slot}",
                        "exam_type": EXAM_TYPE,
                        "year": current_year,
                        "paper": paper_num,
                        "slot": slot,
                        "full_text": full_text,
                    })
                if lines[j].startswith("#"):
                    break
                j += 1
            i = j
            continue

        if line.strip() == ANNOTATION_MARKER and current_question is not None:
            capturing_q, capturing_anno = False, True
            i += 1
            continue

        if capturing_q and current_question is not None:
            q_text_lines.append(line)
        elif capturing_anno and current_question is not None:
            anno_lines.append(line)
        i += 1

    flush_question()

    if not exams:
        raise SystemExit("FAIL: no S1A year blocks parsed — check the heading grammar")

    # Guarantee 2: no S1A id may collide with a Stage 2 id.
    stage2_path = ROOT / "data" / "wines.json"
    if stage2_path.exists():
        stage2_ids = {w["id"] for w in json.loads(stage2_path.read_text(encoding="utf-8"))}
        clash = {w["id"] for w in wines_flat} & stage2_ids
        if clash:
            raise SystemExit(f"FAIL: S1A wine ids collide with Stage 2 ids: {sorted(clash)}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    OUT_EXAMS.write_text(json.dumps(exams, indent=2, ensure_ascii=False), encoding="utf-8")
    OUT_WINES.write_text(json.dumps(wines_flat, indent=2, ensure_ascii=False), encoding="utf-8")
    OUT_ANNOS.write_text(json.dumps(annotations, indent=2, ensure_ascii=False), encoding="utf-8")

    total_q = sum(len(p["questions"]) for e in exams for p in e["papers"])
    print(f"OK: parsed {len(exams)} S1A year(s): {[e['year'] for e in exams]}")
    print(f"OK: {total_q} questions, {len(wines_flat)} wines")
    print(f"OK: no id collision with data/wines.json")
    print(f"OK: wrote {OUT_EXAMS.relative_to(ROOT)}, {OUT_WINES.relative_to(ROOT)}, {OUT_ANNOS.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
