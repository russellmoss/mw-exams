"""Phase 1 verification — structural checks on the parsed JSON."""

import json
from pathlib import Path

EXAMS = json.loads(Path("data/exams.json").read_text(encoding="utf-8"))
WINES = json.loads(Path("data/wines.json").read_text(encoding="utf-8"))
ANNOS = json.loads(Path("data/annotations.json").read_text(encoding="utf-8"))

errors = []

# 1. Exam-level structure
if len(EXAMS) != 10:
    errors.append(f"Expected 10 exams, found {len(EXAMS)}")

expected_years = {2015, 2016, 2017, 2018, 2019, 2021, 2022, 2023, 2024, 2025}
actual_years = {e["year"] for e in EXAMS}
if actual_years != expected_years:
    errors.append(f"Year mismatch. Expected {expected_years}, got {actual_years}")

# 2. Each exam has exactly 3 papers, each paper has exactly 12 wines
for e in EXAMS:
    if len(e["papers"]) != 3:
        errors.append(f"Exam {e['year']} has {len(e['papers'])} papers (expected 3)")
    for p in e["papers"]:
        if len(p["wines"]) != 12:
            errors.append(
                f"Exam {e['year']} Paper {p['paper']} has {len(p['wines'])} wines (expected 12)"
            )
        # Wine slots must be 1..12
        slots = sorted(w["slot"] for w in p["wines"])
        if slots != list(range(1, 13)):
            errors.append(
                f"Exam {e['year']} Paper {p['paper']} wine slots = {slots}, expected 1..12"
            )
        # Each wine must have non-empty full_text
        for w in p["wines"]:
            if not w["full_text"].strip():
                errors.append(
                    f"Exam {e['year']} Paper {p['paper']} Wine {w['slot']} has empty full_text"
                )

# 3. Total counts
total_q = sum(len(p["questions"]) for e in EXAMS for p in e["papers"])
if total_q != 112:
    errors.append(f"Expected 112 questions total, found {total_q}")

if len(WINES) != 360:
    errors.append(f"Expected 360 wine entries, found {len(WINES)}")

# 4. Annotation file aligns with questions
if len(ANNOS) != total_q:
    errors.append(f"Annotation count {len(ANNOS)} does not match question count {total_q}")

# 5. Question text is non-empty
empty_q = [(a["year"], a["paper"], a["question"]) for a in ANNOS
           if not any(q["text"] for e in EXAMS if e["year"] == a["year"]
                      for p in e["papers"] if p["paper"] == a["paper"]
                      for q in p["questions"] if q["n"] == a["question"])]
if empty_q:
    errors.append(f"{len(empty_q)} questions have empty text: first 3 = {empty_q[:3]}")

# 6. Wine IDs are unique
ids = [w["id"] for w in WINES]
if len(ids) != len(set(ids)):
    errors.append(f"Duplicate wine IDs found: {len(ids) - len(set(ids))} duplicates")

# 7. Filled annotations exist (we expect at least ~25)
filled = sum(1 for a in ANNOS if a["is_filled"])
if filled < 20:
    errors.append(f"Only {filled} filled annotations — expected at least 20. Did the marker parsing work?")

if errors:
    print("PHASE 1 VERIFICATION FAILED:")
    for e in errors:
        print(f"  - {e}")
    raise SystemExit(1)

print(f"PHASE 1 VERIFICATION PASSED:")
print(f"  - 10 exams ({sorted(actual_years)})")
print(f"  - 30 papers (3 per exam)")
print(f"  - {total_q} questions across all exams")
print(f"  - {len(WINES)} wines parsed")
print(f"  - {filled} annotations filled, {len(ANNOS) - filled} empty (annotation proposer target)")
