"""Phase 1 verification — structural checks on the parsed JSON.

Expectations are derived from the corpus wherever the corpus is allowed to grow
(years, question counts). Only the genuinely fixed facts of the MW practical are
hard-coded: 3 papers per exam, 12 wines per paper, wine slots 1..12, and the
2020 cancellation. `MIN_EXAM_YEARS` / `MIN_QUESTIONS` are floors — they guard
against the corpus silently shrinking, and should be raised (never lowered) as
more years are parsed.
"""

import json
from pathlib import Path

EXAMS = json.loads(Path("data/exams.json").read_text(encoding="utf-8"))
WINES = json.loads(Path("data/wines.json").read_text(encoding="utf-8"))
ANNOS = json.loads(Path("data/annotations.json").read_text(encoding="utf-8"))

PAPERS_PER_EXAM = 3
WINES_PER_PAPER = 12
CANCELLED_YEARS = {2020}  # no MW practical was sat (COVID)

# Floors, not equalities — the corpus grows as older/newer papers are added.
MIN_EXAM_YEARS = 15  # 2011-2026 excluding 2020, as of the current corpus
MIN_QUESTIONS = 162  # ditto

errors = []

# 1. Exam-level structure
if len(EXAMS) < MIN_EXAM_YEARS:
    errors.append(f"Expected at least {MIN_EXAM_YEARS} exams, found {len(EXAMS)}")

actual_years = sorted(e["year"] for e in EXAMS)
if len(actual_years) != len(set(actual_years)):
    dupes = sorted({y for y in actual_years if actual_years.count(y) > 1})
    errors.append(f"Duplicate exam years: {dupes}")

# The corpus must be a contiguous run of years with only the cancelled ones missing.
year_set = set(actual_years)
expected_years = set(range(min(year_set), max(year_set) + 1)) - CANCELLED_YEARS
if year_set != expected_years:
    missing = sorted(expected_years - year_set)
    unexpected = sorted(year_set - expected_years)
    errors.append(
        f"Year coverage is not contiguous over {min(year_set)}-{max(year_set)} "
        f"(excluding {sorted(CANCELLED_YEARS)}). Missing: {missing}, unexpected: {unexpected}"
    )

# 2. Each exam has papers 1/2/3, each paper has exactly 12 wines in slots 1..12
for e in EXAMS:
    paper_nums = sorted(p["paper"] for p in e["papers"])
    if paper_nums != list(range(1, PAPERS_PER_EXAM + 1)):
        errors.append(
            f"Exam {e['year']} has papers {paper_nums} (expected 1..{PAPERS_PER_EXAM})"
        )
    for p in e["papers"]:
        if len(p["wines"]) != WINES_PER_PAPER:
            errors.append(
                f"Exam {e['year']} Paper {p['paper']} has {len(p['wines'])} wines "
                f"(expected {WINES_PER_PAPER})"
            )
        # Wine slots must be 1..12
        slots = sorted(w["slot"] for w in p["wines"])
        if slots != list(range(1, WINES_PER_PAPER + 1)):
            errors.append(
                f"Exam {e['year']} Paper {p['paper']} wine slots = {slots}, "
                f"expected 1..{WINES_PER_PAPER}"
            )
        # Each wine must have non-empty full_text
        for w in p["wines"]:
            if not w["full_text"].strip():
                errors.append(
                    f"Exam {e['year']} Paper {p['paper']} Wine {w['slot']} has empty full_text"
                )
        # Every paper must carry at least one question, numbered 1..N
        q_nums = sorted(q["n"] for q in p["questions"])
        if q_nums != list(range(1, len(q_nums) + 1)) or not q_nums:
            errors.append(
                f"Exam {e['year']} Paper {p['paper']} question numbers = {q_nums}, "
                f"expected a contiguous 1..N"
            )

# 3. Total counts — derived from the exams, cross-checked against wines.json
total_q = sum(len(p["questions"]) for e in EXAMS for p in e["papers"])
if total_q < MIN_QUESTIONS:
    errors.append(f"Expected at least {MIN_QUESTIONS} questions total, found {total_q}")

expected_wines = len(EXAMS) * PAPERS_PER_EXAM * WINES_PER_PAPER
if len(WINES) != expected_wines:
    errors.append(
        f"Expected {expected_wines} wine entries "
        f"({len(EXAMS)} exams x {PAPERS_PER_EXAM} papers x {WINES_PER_PAPER} wines), "
        f"found {len(WINES)}"
    )

# The flat wine list must be exactly the wines in exams.json, keyed YYYY_pN_wM.
exam_wine_ids = {
    f"{e['year']}_p{p['paper']}_w{w['slot']}"
    for e in EXAMS
    for p in e["papers"]
    for w in p["wines"]
}
flat_wine_ids = {w["id"] for w in WINES}
if exam_wine_ids != flat_wine_ids:
    only_exams = sorted(exam_wine_ids - flat_wine_ids)
    only_flat = sorted(flat_wine_ids - exam_wine_ids)
    errors.append(
        f"wines.json does not match exams.json: {len(only_exams)} missing "
        f"(first 3 = {only_exams[:3]}), {len(only_flat)} extra (first 3 = {only_flat[:3]})"
    )

# 4. Annotation file aligns 1:1 with questions
if len(ANNOS) != total_q:
    errors.append(f"Annotation count {len(ANNOS)} does not match question count {total_q}")

question_keys = {
    (e["year"], p["paper"], q["n"])
    for e in EXAMS
    for p in e["papers"]
    for q in p["questions"]
}
anno_keys = {(a["year"], a["paper"], a["question"]) for a in ANNOS}
if question_keys != anno_keys:
    unannotated = sorted(question_keys - anno_keys)
    orphaned = sorted(anno_keys - question_keys)
    errors.append(
        f"Annotations misaligned: {len(unannotated)} questions without an annotation "
        f"(first 3 = {unannotated[:3]}), {len(orphaned)} annotations without a question "
        f"(first 3 = {orphaned[:3]})"
    )

# 5. Question text is non-empty
empty_q = [
    (e["year"], p["paper"], q["n"])
    for e in EXAMS
    for p in e["papers"]
    for q in p["questions"]
    if not q["text"].strip()
]
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
print(f"  - {len(EXAMS)} exams ({actual_years})")
print(f"  - {len(EXAMS) * PAPERS_PER_EXAM} papers ({PAPERS_PER_EXAM} per exam)")
print(f"  - {total_q} questions across all exams")
print(f"  - {len(WINES)} wines parsed")
print(f"  - {filled} annotations filled, {len(ANNOS) - filled} empty (annotation proposer target)")
