"""Unit 0 gates for Theory temporal classification."""

import copy
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SPEC = importlib.util.spec_from_file_location(
    "build_rubric_temporal", ROOT / "scripts" / "build_rubric_temporal.py"
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(MODULE)


def fixture(temporal_class, source_marker="omit"):
    rubric = {
        "id": "th_2024_p1_q1",
        "year": 2024,
        "paper": 1,
        "question": 1,
        "required_elements": [{"element": "Assess the options", "weight": "core"}],
    }
    requirement = {
        "index": 0,
        "element": "Assess the options",
        "weight": "core",
        "temporal_class": temporal_class,
    }
    if source_marker != "omit":
        requirement["source"] = source_marker
    data = {
        "questions": [
            {
                "id": rubric["id"],
                "ex_ante": False,
                "requirements": [requirement],
            }
        ]
    }
    return [rubric], data


errors = []

# CRITICAL: superseded is the only class that removes a requirement, so no source must fail.
rubrics, data = fixture("superseded")
try:
    MODULE.validate_temporal_data(rubrics, data)
    errors.append("uncited superseded classification passed")
except MODULE.TemporalBuildError:
    pass

# A complete tier-1 source builds.
tier_one = {
    "tier": 1,
    "publisher": "World Health Organization",
    "title": "Alcohol and cancer",
    "url": "https://www.who.int/news-room/fact-sheets/detail/alcohol",
    "published_at": "2025-01-01",
    "quote": "Alcohol consumption is causally linked to cancer.",
}
rubrics, data = fixture("superseded", tier_one)
try:
    MODULE.validate_temporal_data(rubrics, data)
except MODULE.TemporalBuildError as exc:
    errors.append(f"cited superseded classification failed: {exc}")

# evergreen and year_bound need no source.
for temporal_class in ("evergreen", "year_bound"):
    rubrics, data = fixture(temporal_class)
    try:
        MODULE.validate_temporal_data(rubrics, data)
    except MODULE.TemporalBuildError as exc:
        errors.append(f"{temporal_class} without source failed: {exc}")

# Unknown enum values always fail.
rubrics, data = fixture("plausibly_stale")
try:
    MODULE.validate_temporal_data(rubrics, data)
    errors.append("unknown temporal class passed")
except MODULE.TemporalBuildError:
    pass

# Independently validate the committed full classification so hand edits cannot bypass the builder.
real_rubrics = json.loads((ROOT / "data/theory/theory_rubrics.json").read_text(encoding="utf-8"))
real_temporal_path = ROOT / "data/theory/rubric_temporal.json"
if not real_temporal_path.exists():
    errors.append("data/theory/rubric_temporal.json is missing")
else:
    real_temporal = json.loads(real_temporal_path.read_text(encoding="utf-8"))
    try:
        MODULE.validate_temporal_data(real_rubrics, real_temporal)
    except MODULE.TemporalBuildError as exc:
        errors.append(f"committed temporal data invalid: {exc}")

if errors:
    print(f"FAIL: {len(errors)} problem(s)")
    for error in errors:
        print("  -", error)
    raise SystemExit(1)

classified = sum(len(q["requirements"]) for q in real_temporal["questions"])
print(f"PASS: all {classified} rubric requirements carry a valid temporal class")
print("PASS: uncited superseded fails; cited tier-1 superseded builds")
print("PASS: evergreen/year_bound need no source; invalid enum fails")
