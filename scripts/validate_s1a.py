"""Validate data/s1a_exams.json — the structured S1A practical corpus.

Checks, per year:
  1. exactly 12 wines, slots 1..12 in order
  2. the questions' wine ranges cover slots 1..12 exactly once (no gap, no overlap)
  3. every "(N marks)" / "(A x B marks)" annotation parses, and the paper sums to 300
     (the same 25-marks-per-wine invariant as the stage-two exam, EK-0001)

Run:  python scripts/validate_s1a.py
"""

import json
import re
import sys
from pathlib import Path

DOC = Path(__file__).resolve().parent.parent / "data" / "s1a_exams.json"

# "(50 marks)" | "(2x10 marks)" | "(3 x 12 marks)" | "(3 x12 marks)" | "(2 x 8 marks)"
MARK_RE = re.compile(r"\((?:(\d+)\s*x\s*)?(\d+)\s*marks\)", re.IGNORECASE)


def question_marks(text: str) -> int:
    return sum(int(mult or 1) * int(val) for mult, val in MARK_RE.findall(text))


def main() -> int:
    data = json.loads(DOC.read_text(encoding="utf-8"))
    failures = []

    for entry in data["years"]:
        year = entry["year"]

        slots = [w["slot"] for w in entry["wines"]]
        if slots != list(range(1, 13)):
            failures.append(f"{year}: wine slots are {slots}, expected 1..12")

        covered = [s for q in entry["questions"] for s in q["wines"]]
        if sorted(covered) != list(range(1, 13)):
            failures.append(f"{year}: question coverage {sorted(covered)}, expected 1..12 exactly once")

        total = sum(question_marks(q["text"]) for q in entry["questions"])
        if total != 300:
            per_q = {q["n"]: question_marks(q["text"]) for q in entry["questions"]}
            failures.append(f"{year}: marks sum to {total}, expected 300 (per question: {per_q})")

    years = [e["year"] for e in data["years"]]
    print(f"s1a: {len(years)} years ({min(years)}-{max(years)}), "
          f"{sum(len(e['questions']) for e in data['years'])} questions, "
          f"{sum(len(e['wines']) for e in data['years'])} wines")

    if failures:
        print("\nFAILURES:")
        for f in failures:
            print(" -", f)
        return 1
    print("all checks passed: slots 1-12, exact coverage, 300 marks per paper")
    return 0


if __name__ == "__main__":
    sys.exit(main())
