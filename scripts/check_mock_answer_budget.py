"""
Check mock answers against the mark-proportional word budget.

Mirrors `countAnswerBodyWords` in study-app/src/lib/answer-length.ts exactly — strip YAML
frontmatter, drop the appended citation block, drop header lines and horizontal rules, then
count whitespace-delimited tokens. Only prose counts, so an answer cannot buy room with
headers or lose it by trimming them.

Budget (answer-length.ts): 6.5 words/mark target, hard band 4.5-8.5 words/mark. The band is
the historical corpus's own dispersion (cv 0.241), so it admits the natural spread of good
answers and flags the rest. A flat word count would starve a 150-mark flight and pad a 50-mark
one — which is exactly what the pre-2026-08 answers did.

Marks are read from each answer's `total_marks` frontmatter, falling back to summing the
question's mark tokens from data/exams.json.

Usage:
    python scripts/check_mock_answer_budget.py --year 2026
    python scripts/check_mock_answer_budget.py            # whole corpus
"""

from __future__ import annotations

import argparse
import io
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ANS_DIR = ROOT / "outputs" / "mock_answers"
EXAMS = ROOT / "data" / "exams.json"

TARGET, LO, HI = 6.5, 4.5, 8.5
CITATION_MARKER = "Sources consulted"  # matches answer-length.ts's marker in spirit

FM_RE = re.compile(r"^﻿?\s*---\r?\n[\s\S]*?\r?\n---\r?\n?")
HEADER_RE = re.compile(r"^\s*#{1,6}\s")
HR_RE = re.compile(r"^\s*(?:-{3,}|\*{3,}|_{3,})\s*$")
MARK_RE = re.compile(r"\((?:(\d+)\s*x\s*)?(\d+)\s*marks?\)", re.I)


def count_body_words(text: str) -> int:
    text = FM_RE.sub("", text, count=1)
    cite = text.find(CITATION_MARKER)
    if cite != -1:
        hr = text.rfind("\n---", 0, cite)
        text = text[:cite] if hr == -1 else text[:hr]
    prose = "\n".join(
        ln for ln in text.splitlines()
        if not HEADER_RE.match(ln) and not HR_RE.match(ln)
    )
    return len(prose.split())


def frontmatter_marks(text: str) -> int | None:
    m = re.search(r"^total_marks:\s*(\d+)", text, re.M)
    return int(m.group(1)) if m else None


def exam_marks() -> dict[str, int]:
    out: dict[str, int] = {}
    for e in json.load(io.open(EXAMS, encoding="utf-8")):
        for p in e["papers"]:
            for q in p["questions"]:
                total = sum((int(a) if a else 1) * int(b) for a, b in MARK_RE.findall(q["text"]))
                out[f"{e['year']}_p{p['paper']}_q{q['n']}"] = total
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--year", type=int)
    ap.add_argument("--strict", action="store_true", help="exit non-zero if any answer is outside the band")
    args = ap.parse_args()

    marks_by_q = exam_marks()
    files = sorted(ANS_DIR.glob("*.md"))
    if args.year:
        files = [f for f in files if f.name.startswith(str(args.year))]
    if not files:
        raise SystemExit("FAIL: no mock answers matched")

    bad, rows = [], []
    for f in files:
        text = f.read_text(encoding="utf-8")
        words = count_body_words(text)
        marks = frontmatter_marks(text) or marks_by_q.get(f.stem)
        if not marks:
            bad.append(f"{f.stem}: cannot determine marks"); continue
        lo, hi, tgt = round(marks * LO), round(marks * HI), round(marks * TARGET)
        rate = words / marks
        ok = lo <= words <= hi
        if not ok:
            bad.append(f"{f.stem}: {words}w on {marks} marks = {rate:.1f} w/mark "
                       f"({'UNDER' if words < lo else 'OVER'}, band {lo}-{hi})")
        rows.append((f.stem, marks, words, tgt, lo, hi, rate, ok))

    print(f"{'question':16}{'marks':>6}{'words':>7}{'target':>8}{'band':>12}{'w/mark':>8}  ")
    for qid, marks, words, tgt, lo, hi, rate, ok in rows:
        print(f"{qid:16}{marks:>6}{words:>7}{tgt:>8}{f'{lo}-{hi}':>12}{rate:>8.1f}  {'ok' if ok else 'OUT OF BAND'}")

    print(f"\n{len(rows)} answers, {len(rows)-len(bad)} in band, {len(bad)} out")
    for b in bad:
        print(f"  {b}")
    if bad and args.strict:
        sys.exit(1)


if __name__ == "__main__":
    main()
