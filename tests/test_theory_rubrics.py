"""Theory rubric verification — structural and provenance checks on data/theory/theory_rubrics.json.

Run after scripts/build_theory_rubrics.py:
    python tests/test_theory_rubrics.py

The build script already enforces the quote gate at merge time. This test re-asserts it
independently, so a hand-edited theory_rubrics.json cannot bypass the gate by never being
rebuilt.
"""

import json
import re
from pathlib import Path

RUBRICS = json.loads(Path("data/theory/theory_rubrics.json").read_text(encoding="utf-8"))
SEGMENTS = {s["id"]: s for s in
            json.loads(Path("data/theory/report_segments.json").read_text(encoding="utf-8"))}
QUESTIONS = {q["id"]: q for q in
             json.loads(Path("data/theory/theory_questions.json").read_text(encoding="utf-8"))}

# Years with a text-extractable theory examiners' report inside the five-paper corpus.
# 2016/2018 come from the public IMW site; 2017, 2019, 2023, 2024, 2025 are student-area
# reports held in docs/examiners reports/. 2021 and 2022 exist but are image scans with no
# text layer, and 2015/2026 have no report available at all.
EXPECTED_YEARS = {2016, 2017, 2018, 2019, 2023, 2024, 2025}
VALID_COVERAGE = {"full", "none"}
VALID_QUALITY = {"rich", "moderate", "thin"}
VALID_WEIGHT = {"core", "differentiator"}
QUOTED_LIST_FIELDS = ["definitions_required", "required_elements",
                      "credit_signals", "penalty_signals", "scope_traps"]

errors = []


def normalise(s: str) -> str:
    s = (s.replace("’", "'").replace("‘", "'")
          .replace("“", '"').replace("”", '"')
          .replace("–", "-").replace("—", "-").replace("‑", "-"))
    s = re.sub(r"\s+\d{1,3}\s+", " ", s)
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def quote_found(quote: str, haystack: str) -> bool:
    for frag in re.split(r"\s*(?:…|\.\.\.)\s*", quote):
        frag = normalise(frag)
        if len(frag) < 12:
            continue
        if frag not in haystack:
            return False
    return True


# 1. Every rubric corresponds to a real corpus question and a real report segment.
ids = [r["id"] for r in RUBRICS]
if len(ids) != len(set(ids)):
    errors.append("duplicate rubric ids")
for r in RUBRICS:
    if r["id"] not in QUESTIONS:
        errors.append(f"{r['id']}: not a corpus question")
    if r["id"] not in SEGMENTS:
        errors.append(f"{r['id']}: no report segment")

# 2. Rubrics exist only for years whose examiners' report is available.
years = {r["year"] for r in RUBRICS}
if years != EXPECTED_YEARS:
    errors.append(f"rubric years {sorted(years)}, expected {sorted(EXPECTED_YEARS)}")

# 3. Identity fields agree with the corpus — a drifted paper/section would grade a
#    candidate against the wrong question.
for r in RUBRICS:
    q = QUESTIONS.get(r["id"])
    if not q:
        continue
    for field in ("year", "paper", "question", "domain", "section"):
        if r.get(field) != q[field]:
            errors.append(f"{r['id']}: {field}={r.get(field)!r}, corpus says {q[field]!r}")
    if normalise(r.get("question_text", "")) != normalise(q["text"]):
        errors.append(f"{r['id']}: question_text differs from the corpus")

# 4. Enum fields are legal.
for r in RUBRICS:
    if r.get("coverage") not in VALID_COVERAGE:
        errors.append(f"{r['id']}: coverage={r.get('coverage')!r}")
    if r.get("evidence_quality") not in VALID_QUALITY:
        errors.append(f"{r['id']}: evidence_quality={r.get('evidence_quality')!r}")
    for i, e in enumerate(r.get("required_elements") or []):
        if e.get("weight") not in VALID_WEIGHT:
            errors.append(f"{r['id']}: required_elements[{i}].weight={e.get('weight')!r}")

# 5. THE QUOTE GATE — every claim traces to verbatim report text. This is the check that
#    stops a fabricated requirement from silently failing a candidate for omitting
#    something the examiners never asked for.
total_quotes = 0
for r in RUBRICS:
    seg = SEGMENTS.get(r["id"])
    if not seg:
        continue
    haystack = normalise(" ".join([
        seg.get("commentary") or "",
        seg.get("paper_preamble") or "",
        seg.get("theory_chair_report") or "",
    ]))
    for field in QUOTED_LIST_FIELDS:
        for i, item in enumerate(r.get(field) or []):
            quote = (item or {}).get("quote", "")
            total_quotes += 1
            if not quote.strip():
                errors.append(f"{r['id']}: {field}[{i}] has no quote")
            elif not quote_found(quote, haystack):
                errors.append(f"{r['id']}: {field}[{i}] quote not in report — {quote[:70]!r}")
    ex = r.get("examples_expected") or {}
    if ex.get("quote") and not quote_found(ex["quote"], haystack):
        errors.append(f"{r['id']}: examples_expected.quote not in report")
    for name in ex.get("named_in_report") or []:
        if normalise(name) and normalise(name) not in haystack:
            errors.append(f"{r['id']}: named_in_report {name!r} not in report")

# 6. Coverage and content must agree.
for r in RUBRICS:
    n = len(r.get("required_elements") or [])
    if r.get("coverage") == "none" and n:
        errors.append(f"{r['id']}: coverage 'none' but has {n} required_elements")
    if r.get("coverage") == "full" and n == 0:
        errors.append(f"{r['id']}: coverage 'full' but no required_elements")

# 7. A rubric must be question-specific. If a required element's text is identical across
#    many questions, the extractor generated a generic checklist instead of extracting.
from collections import Counter
elem_counts = Counter(
    normalise(e.get("element", ""))
    for r in RUBRICS for e in (r.get("required_elements") or [])
)
for text, n in elem_counts.items():
    if n > 6 and len(text) > 25:
        errors.append(f"required element repeated across {n} rubrics — generic, not extracted: {text[:70]!r}")

if errors:
    print(f"FAIL: {len(errors)} problem(s)")
    for e in errors:
        print("  -", e)
    raise SystemExit(1)

core = sum(len([e for e in (r.get("required_elements") or []) if e["weight"] == "core"])
           for r in RUBRICS)
print(f"PASS: {len(RUBRICS)} rubrics for years {sorted(years)}")
print(f"PASS: all {total_quotes} quotes verified verbatim against their report segment")
print(f"PASS: identity fields agree with the corpus; {core} core requirements")
print(f"PASS: no generic requirement repeated across rubrics")
