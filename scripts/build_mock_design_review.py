from __future__ import annotations

import argparse
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
SELECTION_PATH = ROOT / "data" / "wine_selection_logic_analysis.json"
MOCK_RESEARCH_DIR = ROOT / "data" / "mock_wine_research"
OUT_DIR = ROOT / "outputs" / "mock_exams"


def load_json(path: Path) -> dict:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def mock_id_from_exam(path: Path) -> str:
    text = path.read_text(encoding="utf-8", errors="replace")
    if text.startswith("---"):
        parts = text.split("---", 2)
        for line in parts[1].splitlines():
            if line.startswith("mock_exam_id:"):
                return line.split(":", 1)[1].strip()
    return path.stem


def research_coverage(mock_id: str, mock_rows: list[dict]) -> tuple[list[str], list[str]]:
    research = load_json(MOCK_RESEARCH_DIR / f"{mock_id}.json")
    wines = research.get("wines", {}) if research else {}
    required = []
    for question in mock_rows:
        for wine in question.get("wines", []):
            required.append(f"p{question['paper']}_w{wine['slot']}")
    required = sorted(set(required))
    missing = [wine_id for wine_id in required if wine_id not in wines]
    no_sources = [wine_id for wine_id, row in wines.items() if not row.get("sources")]
    return missing, no_sources


def render_review(mock_id: str, exam_path: Path, answers_path: Path) -> str:
    selection = load_json(SELECTION_PATH)
    mock_rows = selection.get("mock_v6_questions", [])
    diagnostics = selection.get("mock_v6_diagnostics", [])
    missing_research, no_sources = research_coverage(mock_id, mock_rows)

    hard_failures = []
    soft_warnings = []
    per_question = []

    if missing_research:
        hard_failures.append(
            {
                "check": "Source-backed research present",
                "evidence": f"{len(missing_research)} named wines missing research entries",
                "action": "Add entries in data/mock_wine_research/{mock_exam_id}.json before final answer acceptance.",
            }
        )
    if no_sources:
        hard_failures.append(
            {
                "check": "Research entries have sources",
                "evidence": ", ".join(no_sources[:12]),
                "action": "Add at least one source URL per research entry.",
            }
        )

    for diag in diagnostics:
        row = next((r for r in mock_rows if r["qid"] == diag["qid"]), None)
        if not row:
            continue
        flags = diag.get("critical_flags", [])
        if flags:
            hard_failures.append(
                {
                    "check": f"{diag['qid']} design critical flag",
                    "evidence": "; ".join(flags),
                    "action": "Revise the stem or change the wine selection so the expected contrast axis is delivered.",
                }
            )
        below = diag.get("below_historical_norm_axes", [])
        if below:
            soft_warnings.append(
                {
                    "warning": f"{diag['qid']} below historical norm",
                    "evidence": ", ".join(below),
                    "recommendation": "Confirm this is intentional, or adjust wines/stem to activate the expected axes.",
                }
            )
        per_question.append(
            {
                "qid": diag["qid"],
                "fit": diag["fit_status"],
                "family": f"{diag['family']}/{diag['subtype']}",
                "active": ", ".join(diag.get("active_axes", [])) or "none",
                "below": ", ".join(below) or "none",
            }
        )

    result = "FAIL" if hard_failures else ("PASS WITH WARNINGS" if soft_warnings else "PASS")

    lines = [
        "# Diversity Scorecard Review",
        "",
        "## Summary",
        "",
        f"- Result: `{result}`",
        f"- Mock: `{mock_id}`",
        f"- Checked exam: `{exam_path}`",
        f"- Checked answers: `{answers_path}`",
        "",
        "## Hard Fail Checks",
        "",
        "| Check | Result | Evidence | Action |",
        "|---|---:|---|---|",
    ]
    if hard_failures:
        for item in hard_failures:
            lines.append(f"| {item['check']} | FAIL | {item['evidence']} | {item['action']} |")
    else:
        lines.append("| Design and research hard gates | PASS | No hard failures | None |")

    lines.extend(["", "## Soft Warnings", "", "| Warning | Evidence | Recommendation |", "|---|---|---|"])
    if soft_warnings:
        for item in soft_warnings:
            lines.append(f"| {item['warning']} | {item['evidence']} | {item['recommendation']} |")
    else:
        lines.append("| None | No soft warnings | None |")

    lines.extend(["", "## Per-Question Notes", ""])
    for item in per_question:
        lines.append(f"- `{item['qid']}` `{item['family']}`: fit=`{item['fit']}`; active axes={item['active']}; below norm={item['below']}")

    lines.extend(
        [
            "",
            "## Use",
            "",
            "A mock should not be treated as final until this review is PASS or PASS WITH WARNINGS and `scripts/validate_mock_wine_facts.py --strict-research` passes.",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a per-mock diversity scorecard review.")
    parser.add_argument("--exam", type=Path, default=OUT_DIR / "mock_full_2026_05_26_v6.md")
    parser.add_argument("--answers", type=Path, default=OUT_DIR / "mock_full_2026_05_26_v6_answers.md")
    parser.add_argument("--out", type=Path, default=None)
    args = parser.parse_args()

    mock_id = mock_id_from_exam(args.exam)
    out = args.out or OUT_DIR / f"{mock_id}_diversity_review.md"
    out.write_text(render_review(mock_id, args.exam, args.answers), encoding="utf-8")
    print(f"OK: wrote {out}")


if __name__ == "__main__":
    main()
