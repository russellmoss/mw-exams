"""
Merge and validate the rubric-extractor's batch output into data/theory/theory_rubrics.json.

Stage 3 of the theory rubric extractor:

    scripts/segment_examiner_reports.py   -> data/theory/report_segments.json   (deterministic)
    .claude/agents/rubric-extractor.md    -> data/theory/_rubrics_work/*.json   (LLM, per batch)
    scripts/build_theory_rubrics.py       -> data/theory/theory_rubrics.json    (this file)

The point of this stage is the QUOTE GATE. The extractor is instructed to support every
requirement with a verbatim quote from the examiners' report, because a fabricated
requirement would silently fail candidates for omitting something the examiners never
asked for. Instructions alone are not a guarantee, so every quote is re-checked here
against the segment it claims to come from. A quote that cannot be found is a hard
failure, not a warning.

Matching is whitespace- and typography-normalised, and a quote containing an ellipsis is
split on it and each fragment checked separately, so legitimate trimming still passes
while invented text cannot.

Usage:
    python scripts/build_theory_rubrics.py
    python scripts/build_theory_rubrics.py --report   # print a human-readable summary
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORK_DIR = ROOT / "data" / "theory" / "_rubrics_work"
SEGMENTS = ROOT / "data" / "theory" / "report_segments.json"
QUESTIONS = ROOT / "data" / "theory" / "theory_questions.json"
OUT = ROOT / "data" / "theory" / "theory_rubrics.json"

VALID_COVERAGE = {"full", "none"}
VALID_QUALITY = {"rich", "moderate", "thin"}
VALID_WEIGHT = {"core", "differentiator"}

# Fields whose entries must each carry a verifiable `quote`.
QUOTED_LIST_FIELDS = [
    "definitions_required",
    "required_elements",
    "credit_signals",
    "penalty_signals",
    "scope_traps",
]


def normalise(s: str) -> str:
    s = (s.replace("’", "'").replace("‘", "'")
          .replace("“", '"').replace("”", '"')
          .replace("–", "-").replace("—", "-").replace("‑", "-"))
    # Drop PDF page numbers that sit mid-sentence in the extracted text, so a quote
    # trimmed around one still matches.
    s = re.sub(r"\s+\d{1,3}\s+", " ", s)
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def quote_found(quote: str, haystack: str) -> bool:
    """True if every ellipsis-separated fragment of `quote` appears in `haystack`."""
    for frag in re.split(r"\s*(?:…|\.\.\.)\s*", quote):
        frag = normalise(frag)
        # Very short fragments carry no evidential weight; ignore rather than fail.
        if len(frag) < 12:
            continue
        if frag not in haystack:
            return False
    return True


def main() -> None:
    if not WORK_DIR.exists():
        raise SystemExit(f"FAIL: {WORK_DIR} not found — run the rubric-extractor batches first")

    segments = {s["id"]: s for s in json.loads(SEGMENTS.read_text(encoding="utf-8"))}
    questions = {q["id"]: q for q in json.loads(QUESTIONS.read_text(encoding="utf-8"))}

    rubrics: list[dict] = []
    seen: dict[str, str] = {}
    errors: list[str] = []
    warnings: list[str] = []

    batch_files = sorted(WORK_DIR.glob("*.json"))
    if not batch_files:
        raise SystemExit(f"FAIL: no batch files in {WORK_DIR}")

    for bf in batch_files:
        try:
            rows = json.loads(bf.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            errors.append(f"{bf.name}: invalid JSON — {exc}")
            continue
        if not isinstance(rows, list):
            errors.append(f"{bf.name}: expected a JSON array")
            continue
        for r in rows:
            rid = r.get("id", "<missing id>")
            if rid in seen:
                errors.append(f"{rid}: duplicate — in both {seen[rid]} and {bf.name}")
                continue
            seen[rid] = bf.name
            r["_batch"] = bf.name
            rubrics.append(r)

    for r in rubrics:
        rid = r.get("id", "<missing id>")
        seg = segments.get(rid)
        q = questions.get(rid)
        if seg is None or q is None:
            errors.append(f"{rid}: no matching segment/question — is the id correct?")
            continue

        # Identity must agree with the corpus; a drifted paper/section would misfile the
        # rubric and silently grade a candidate against the wrong question.
        for field in ("year", "paper", "question", "domain", "section"):
            if r.get(field) != q[field]:
                errors.append(f"{rid}: {field} = {r.get(field)!r}, corpus says {q[field]!r}")
        if normalise(r.get("question_text", "")) != normalise(q["text"]):
            errors.append(f"{rid}: question_text does not match the corpus")

        if r.get("coverage") not in VALID_COVERAGE:
            errors.append(f"{rid}: coverage = {r.get('coverage')!r}, expected one of {VALID_COVERAGE}")
        if r.get("evidence_quality") not in VALID_QUALITY:
            errors.append(f"{rid}: evidence_quality = {r.get('evidence_quality')!r}")

        # Evidence hierarchy: this question's commentary, its paper Chair's General
        # Comments, and the Theory Panel Chair's cross-paper report. All three are
        # legitimate backing for a requirement, so all three form the haystack.
        haystack = normalise(" ".join([
            seg.get("commentary") or "",
            seg.get("paper_preamble") or "",
            seg.get("theory_chair_report") or "",
        ]))

        # THE QUOTE GATE.
        for field in QUOTED_LIST_FIELDS:
            items = r.get(field) or []
            if not isinstance(items, list):
                errors.append(f"{rid}: {field} is not a list")
                continue
            for i, item in enumerate(items):
                quote = (item or {}).get("quote", "")
                if not quote.strip():
                    errors.append(f"{rid}: {field}[{i}] has no quote")
                    continue
                if not quote_found(quote, haystack):
                    errors.append(
                        f"{rid}: {field}[{i}] quote not found in the report segment — "
                        f"{quote[:90]!r}"
                    )
                if field == "required_elements":
                    w = (item or {}).get("weight")
                    if w not in VALID_WEIGHT:
                        errors.append(f"{rid}: required_elements[{i}].weight = {w!r}")

        ex = r.get("examples_expected") or {}
        if ex.get("quote"):
            if not quote_found(ex["quote"], haystack):
                errors.append(f"{rid}: examples_expected.quote not found — {ex['quote'][:90]!r}")
        for name in ex.get("named_in_report") or []:
            if normalise(name) and normalise(name) not in haystack:
                warnings.append(
                    f"{rid}: examples_expected.named_in_report contains {name!r}, which does "
                    f"not appear in the report segment"
                )

        # A "full" rubric with no requirements at all is suspicious; a "none" rubric with
        # requirements is a contradiction.
        n_req = len(r.get("required_elements") or [])
        if r.get("coverage") == "full" and n_req == 0:
            warnings.append(f"{rid}: coverage 'full' but no required_elements extracted")
        if r.get("coverage") == "none" and n_req > 0:
            errors.append(f"{rid}: coverage 'none' but {n_req} required_elements present")

    missing = sorted(set(segments) - set(seen))
    if missing:
        errors.append(f"no rubric for {len(missing)} segment(s): {', '.join(missing[:8])}")

    if errors:
        print(f"FAIL: {len(errors)} error(s)")
        for e in errors:
            print("  -", e)
        if warnings:
            print(f"\n{len(warnings)} warning(s):")
            for w in warnings:
                print("  -", w)
        raise SystemExit(1)

    for r in rubrics:
        r.pop("_batch", None)
    rubrics.sort(key=lambda r: (r["year"], r["paper"], r["question"]))
    OUT.write_text(json.dumps(rubrics, indent=2, ensure_ascii=False), encoding="utf-8")

    quality = {q: sum(1 for r in rubrics if r["evidence_quality"] == q) for q in VALID_QUALITY}
    core = sum(len([e for e in (r.get("required_elements") or []) if e.get("weight") == "core"])
               for r in rubrics)
    diff = sum(len([e for e in (r.get("required_elements") or []) if e.get("weight") == "differentiator"])
               for r in rubrics)
    quotes = sum(len(r.get(f) or []) for r in rubrics for f in QUOTED_LIST_FIELDS)

    print(f"OK: {len(rubrics)} rubrics from {len(batch_files)} batch file(s)")
    print(f"OK: every one of {quotes} quotes verified verbatim against its report segment")
    print(f"OK: coverage full={sum(1 for r in rubrics if r['coverage']=='full')} "
          f"none={sum(1 for r in rubrics if r['coverage']=='none')}")
    print(f"OK: evidence quality {quality}")
    print(f"OK: {core} core requirements, {diff} differentiators")
    if warnings:
        print(f"\n{len(warnings)} warning(s) — not fatal, but worth a look:")
        for w in warnings:
            print("  -", w)
    print(f"\nOK: wrote {OUT.relative_to(ROOT)}")

    if "--report" in sys.argv:
        print("\n--- per question ---")
        for r in rubrics:
            print(f"{r['id']:>16}  {r['evidence_quality']:<8} "
                  f"core={len([e for e in r.get('required_elements') or [] if e.get('weight')=='core']):<2} "
                  f"pen={len(r.get('penalty_signals') or []):<2} "
                  f"traps={len(r.get('scope_traps') or []):<2} {r.get('command_word','')[:40]}")


if __name__ == "__main__":
    main()
