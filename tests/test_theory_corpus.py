"""Theory corpus verification — structural checks on data/theory/*.json.

Run after scripts/parse_theory_source.py:
    python tests/test_theory_corpus.py
"""

import json
import re
from pathlib import Path

EXAMS = json.loads(Path("data/theory/theory_exams.json").read_text(encoding="utf-8"))
QUESTIONS = json.loads(Path("data/theory/theory_questions.json").read_text(encoding="utf-8"))
ANNOS = json.loads(Path("data/theory/theory_annotations.json").read_text(encoding="utf-8"))

# 2020 is absent: no exam was held (COVID-19).
EXPECTED_YEARS = {2015, 2016, 2017, 2018, 2019, 2021, 2022, 2023, 2024, 2025, 2026}
# Question count per paper has been identical in every five-paper-era year:
# A2+B4 / A2+B4 / flat 4 / A2+B4 / A2+B3.
EXPECTED_PER_PAPER = {1: 6, 2: 6, 3: 4, 4: 6, 5: 5}
EXPECTED_DOMAINS = {
    1: "viticulture",
    2: "vinification_and_pre_bottling",
    3: "handling_of_wine",
    4: "business_of_wine",
    5: "contemporary_issues",
}

errors = []

# 1. Year coverage — five-paper era only, no 2020.
actual_years = {e["year"] for e in EXAMS}
if actual_years != EXPECTED_YEARS:
    errors.append(f"Year mismatch. Expected {sorted(EXPECTED_YEARS)}, got {sorted(actual_years)}")
if 2020 in actual_years:
    errors.append("2020 present — no MW exam was held that year")
for y in actual_years:
    if not 2015 <= y <= 2026:
        errors.append(f"{y} is outside the five-paper era (2015-2026)")

# 2. Every year has papers 1-5 with the canonical domain and expected question count.
for e in EXAMS:
    papers = sorted(p["paper"] for p in e["papers"])
    if papers != [1, 2, 3, 4, 5]:
        errors.append(f"{e['year']}: papers = {papers}, expected [1,2,3,4,5]")
    for p in e["papers"]:
        n = p["paper"]
        if p["domain"] != EXPECTED_DOMAINS.get(n):
            errors.append(f"{e['year']} p{n}: domain '{p['domain']}' != '{EXPECTED_DOMAINS.get(n)}'")
        if len(p["questions"]) != EXPECTED_PER_PAPER.get(n):
            errors.append(
                f"{e['year']} p{n}: {len(p['questions'])} questions, "
                f"expected {EXPECTED_PER_PAPER.get(n)}"
            )
        if not p["rubric"].strip():
            errors.append(f"{e['year']} p{n}: empty rubric")
        ns = [q["n"] for q in p["questions"]]
        if ns != list(range(1, len(ns) + 1)):
            errors.append(f"{e['year']} p{n}: question numbers {ns} not contiguous from 1")
        # Papers 1/2/4/5 are split Section A / Section B; paper 3 is a flat list.
        sections = [q["section"] for q in p["questions"]]
        if n == 3:
            if set(sections) != {None}:
                errors.append(f"{e['year']} p3: expected no sections, got {sorted(set(map(str, sections)))}")
        else:
            if set(sections) != {"A", "B"}:
                errors.append(
                    f"{e['year']} p{n}: expected sections A and B, got {sorted(set(map(str, sections)))}"
                )
            # Section A always precedes Section B.
            if sections != sorted(sections):
                errors.append(f"{e['year']} p{n}: Section B questions appear before Section A")

# 3. Flat index agrees with the nested structure.
nested_total = sum(len(p["questions"]) for e in EXAMS for p in e["papers"])
if len(QUESTIONS) != nested_total:
    errors.append(f"flat index has {len(QUESTIONS)} rows, nested has {nested_total} questions")
if len(QUESTIONS) != len(ANNOS):
    errors.append(f"{len(QUESTIONS)} questions but {len(ANNOS)} annotations")

# 4. IDs: th_-prefixed, unique, well-formed, and consistent with their fields.
ID_RE = re.compile(r"^th_(\d{4})_p([1-5])_q(\d+)$")
ids = [q["id"] for q in QUESTIONS]
if len(ids) != len(set(ids)):
    dupes = sorted({i for i in ids if ids.count(i) > 1})
    errors.append(f"duplicate question ids: {dupes}")
for q in QUESTIONS:
    m = ID_RE.match(q["id"])
    if not m:
        errors.append(f"malformed id: {q['id']}")
        continue
    if (int(m.group(1)), int(m.group(2)), int(m.group(3))) != (q["year"], q["paper"], q["question"]):
        errors.append(f"id {q['id']} disagrees with its year/paper/question fields")
    if q["exam_type"] != "THEORY":
        errors.append(f"{q['id']}: exam_type = {q['exam_type']}, expected THEORY")
    if not q["text"].strip():
        errors.append(f"{q['id']}: empty question text")

# 5. Theory ids must never collide with the practical or S1A corpora.
for other in (Path("data/wines.json"), Path("data/s1a/s1a_wines.json")):
    if other.exists():
        other_ids = {w["id"] for w in json.loads(other.read_text(encoding="utf-8"))}
        clash = set(ids) & other_ids
        if clash:
            errors.append(f"theory ids collide with {other.name}: {sorted(clash)}")

# 6. Theory publishes no per-question marks. A "(N marks)" string means practical
#    text leaked into the theory corpus.
MARKS_RE = re.compile(r"\(\s*\d+\s*(x\s*\d+\s*)?marks?\s*\)", re.I)
for q in QUESTIONS:
    if MARKS_RE.search(q["text"]):
        errors.append(f"{q['id']}: contains a marks allocation — theory publishes no marks")
    # Practical stems reference wine slots; theory never should.
    if re.search(r"\bWines?\s+\d+\s*[-–]\s*\d+\b", q["text"]):
        errors.append(f"{q['id']}: references numbered wines — looks like practical text")

# 7. Annotations line up with questions and start empty (targets for the proposer).
anno_ids = {a["id"] for a in ANNOS}
if anno_ids != set(ids):
    errors.append("annotation ids do not match question ids")
for a in ANNOS:
    if a["is_filled"] != bool(a["annotation"].strip()):
        errors.append(f"{a['id']}: is_filled disagrees with annotation content")

if errors:
    print(f"FAIL: {len(errors)} problem(s)")
    for e in errors:
        print("  -", e)
    raise SystemExit(1)

filled = sum(1 for a in ANNOS if a["is_filled"])
print(f"PASS: {len(EXAMS)} years, {len(QUESTIONS)} questions, 5 papers each")
print(f"PASS: ids unique, th_-prefixed, no collision with practical/S1A")
print(f"PASS: no marks allocations or wine references leaked into theory text")
print(f"PASS: annotations {filled} filled / {len(ANNOS)} total")
