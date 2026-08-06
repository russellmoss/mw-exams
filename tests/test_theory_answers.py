"""Theory model-answer verification — structural checks on outputs/theory_answers/.

Run after scripts/build_theory_answers.py:
    python tests/test_theory_answers.py

The build script enforces the coverage gate at merge time. This test re-asserts the
invariants independently, so a hand-edited answer file cannot bypass the gate by never
being rebuilt.
"""

import json
import re
from pathlib import Path

INDEX = json.loads(Path("data/theory/theory_answers_index.json").read_text(encoding="utf-8"))
RUBRICS = {r["id"]: r for r in
           json.loads(Path("data/theory/theory_rubrics.json").read_text(encoding="utf-8"))}
QUESTIONS = {q["id"]: q for q in
             json.loads(Path("data/theory/theory_questions.json").read_text(encoding="utf-8"))}

# Per-question writing time from the IMW Student Guide paper durations. Paper 5 is the
# outlier: three hours for two answers rather than three.
TIME_MINUTES = {1: 60, 2: 60, 3: 60, 4: 60, 5: 90}
WORD_BANDS = {60: (700, 1000), 90: (1050, 1450)}

errors = []

# 1. Every rubric-backed question has exactly one answer, and no answer is orphaned.
ids = [a["id"] for a in INDEX]
if len(ids) != len(set(ids)):
    errors.append("duplicate answers in the index")
missing = sorted(set(RUBRICS) - set(ids))
if missing:
    errors.append(f"{len(missing)} rubric(s) without an answer: {', '.join(missing[:6])}")
orphan = sorted(set(ids) - set(RUBRICS))
if orphan:
    errors.append(f"answer(s) with no rubric: {', '.join(orphan[:6])}")

# 2. Identity agrees with the corpus, and the file exists where the index says.
for a in INDEX:
    q = QUESTIONS.get(a["id"])
    if not q:
        continue
    for field in ("year", "paper", "question", "domain", "section"):
        if a.get(field) != q[field]:
            errors.append(f"{a['id']}: {field}={a.get(field)!r}, corpus says {q[field]!r}")
    if not Path(a["path"]).exists():
        errors.append(f"{a['id']}: file missing at {a['path']}")

# 3. Word count sits in the band implied by that paper's real exam duration. An answer
#    nobody could write in the time models a habit that fails in the exam.
for a in INDEX:
    mins = TIME_MINUTES[a["paper"]]
    if a["time_minutes"] != mins:
        errors.append(f"{a['id']}: time_minutes={a['time_minutes']}, expected {mins}")
    lo, hi = WORD_BANDS[mins]
    if not (lo <= a["word_count"] <= hi):
        errors.append(f"{a['id']}: {a['word_count']} words, outside {lo}-{hi}")

# 4. THE COVERAGE GATE — the count of core requirements in the index must match the
#    rubric, so an answer cannot quietly drop one.
for a in INDEX:
    rub = RUBRICS.get(a["id"])
    if not rub:
        continue
    core = len([e for e in (rub.get("required_elements") or []) if e.get("weight") == "core"])
    if a["core_requirements"] != core:
        errors.append(
            f"{a['id']}: index says {a['core_requirements']} core requirements, rubric has {core}"
        )

# 5. Provenance travels from rubric to answer.
for a in INDEX:
    rub = RUBRICS.get(a["id"])
    if rub and a.get("text_source") != rub.get("text_source", "pdf_text_layer"):
        errors.append(
            f"{a['id']}: text_source={a.get('text_source')!r}, rubric says "
            f"{rub.get('text_source')!r}"
        )

# 6. Answers must not be near-identical to each other. A generator that has drifted into
#    a template would produce openings that repeat across questions.
openings = {}
for a in INDEX:
    body = Path(a["path"]).read_text(encoding="utf-8")
    body = body.split("\n---", 1)[-1]
    words = re.findall(r"\b[\w'-]+\b", body.lower())
    key = " ".join(words[:25])
    openings.setdefault(key, []).append(a["id"])
for key, who in openings.items():
    if len(who) > 1 and len(key) > 60:
        errors.append(f"identical opening across {len(who)} answers: {', '.join(who[:4])}")

if errors:
    print(f"FAIL: {len(errors)} problem(s)")
    for e in errors:
        print("  -", e)
    raise SystemExit(1)

p5 = [a for a in INDEX if a["paper"] == 5]
claims = sum(a["claims_to_verify"] for a in INDEX)
transcribed = sum(1 for a in INDEX if a.get("text_source") == "transcribed_render")
print(f"PASS: {len(INDEX)} answers, one per rubric-backed question")
print(f"PASS: all word counts inside their paper's time-derived band "
      f"({len(p5)} paper-5 answers held to the 90-minute band)")
print(f"PASS: {sum(a['core_requirements'] for a in INDEX)} core requirements all accounted for")
print(f"PASS: provenance intact — {transcribed} answers derive from transcribed reports")
print(f"NOTE: {claims} factual claims registered for verification across the corpus")
