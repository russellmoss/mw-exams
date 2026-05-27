from __future__ import annotations

import importlib.util
import json
import re
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
MOCK_DIR = ROOT / "outputs" / "mock_exams"
FORECAST_JSON_PATH = ROOT / "data" / "predicted_2026_exam_profile.json"
OUT_JSON_PATH = ROOT / "data" / "mock_exam_coverage.json"
OUT_MD_PATH = ROOT / "outputs" / "mock_exams" / "mock_exam_coverage.md"
PREDICTOR_PATH = ROOT / "scripts" / "build_predictive_exam_analyzer.py"


PAPER_RE = re.compile(r"^## Paper (\d+)\s*$", re.MULTILINE)
QUESTION_RE = re.compile(r"^### Question (\d+)\s*$", re.MULTILINE)


def load_question_features():
    spec = importlib.util.spec_from_file_location("predictor_module", PREDICTOR_PATH)
    if spec is None or spec.loader is None:
        raise SystemExit(f"FAIL: could not load predictor module from {PREDICTOR_PATH}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.question_features


def extract_papers(text: str) -> dict[int, str]:
    matches = list(PAPER_RE.finditer(text))
    papers: dict[int, str] = {}
    for idx, match in enumerate(matches):
        paper = int(match.group(1))
        start = match.end()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(text)
        papers[paper] = text[start:end]
    return papers


def extract_questions(paper_text: str) -> list[dict]:
    q_matches = list(QUESTION_RE.finditer(paper_text))
    questions = []
    for idx, match in enumerate(q_matches):
        qn = int(match.group(1))
        start = match.end()
        end = q_matches[idx + 1].start() if idx + 1 < len(q_matches) else paper_text.find("### Wines")
        if end == -1:
            end = len(paper_text)
        block = paper_text[start:end].strip()
        lines = [line.rstrip() for line in block.splitlines()]
        text = "\n".join(line for line in lines if line.strip())
        wine_nums = sorted({int(n) for n in re.findall(r"\b(\d+)(?:-\d+)?\b", text.split("\n", 1)[0]) if int(n) <= 12})
        if not wine_nums:
            range_match = re.search(r"Wines?\s+(\d+)(?:\s*(?:to|-)\s*(\d+))?", text, re.IGNORECASE)
            if range_match:
                start_n = int(range_match.group(1))
                end_n = int(range_match.group(2) or start_n)
                wine_nums = list(range(start_n, end_n + 1))
        questions.append({"n": qn, "text": text, "wine_count": len(wine_nums) if wine_nums else 0})
    return questions


def classify_mock_questions() -> tuple[list[dict], dict]:
    question_features = load_question_features()
    rows: list[dict] = []
    mocks: dict[str, dict] = {}
    for path in sorted(MOCK_DIR.glob("mock_full_*.md")):
        if path.name.endswith("_answers.md"):
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        papers = extract_papers(text)
        mock_info = {"papers": {}}
        for paper, paper_text in papers.items():
            qrows = []
            for q in extract_questions(paper_text):
                features = question_features(q["text"], paper, q["wine_count"])
                row = {
                    "mock_file": path.name,
                    "paper": paper,
                    "question": q["n"],
                    "text": q["text"],
                    "archetype": features["archetype"],
                    "family": features["family"],
                    "subcategory": features["subcategory"],
                }
                rows.append(row)
                qrows.append(row)
            mock_info["papers"][str(paper)] = qrows
        mocks[path.name] = mock_info
    return rows, mocks


def build_coverage(rows: list[dict]) -> dict:
    forecast = json.loads(FORECAST_JSON_PATH.read_text(encoding="utf-8"))
    by_paper_arch: dict[str, Counter] = defaultdict(Counter)
    by_paper_slot_arch: dict[str, Counter] = defaultdict(Counter)
    by_paper_family: dict[str, Counter] = defaultdict(Counter)
    for row in rows:
        paper = str(row["paper"])
        by_paper_arch[paper][row["archetype"]] += 1
        by_paper_slot_arch[paper][f"Q{row['question']}::{row['archetype']}"] += 1
        by_paper_family[paper][row["family"]] += 1

    gaps: dict[str, list[dict]] = {}
    for paper, payload in forecast["papers"].items():
        paper_gaps = []
        for item in payload["predicted_sequence"]:
            slot_key = f"Q{item['slot']}::{item['archetype']}"
            seen_same_slot = by_paper_slot_arch[paper][slot_key]
            seen_anywhere = by_paper_arch[paper][item["archetype"]]
            paper_gaps.append(
                {
                    "slot": item["slot"],
                    "archetype": item["archetype"],
                    "family": item["family"],
                    "seen_same_slot": seen_same_slot,
                    "seen_anywhere_in_paper": seen_anywhere,
                    "coverage_status": (
                        "missing_same_slot" if seen_same_slot == 0 and seen_anywhere > 0
                        else "unseen_in_paper" if seen_anywhere == 0
                        else "covered"
                    ),
                }
            )
        gaps[paper] = paper_gaps

    return {
        "mock_count": len({row["mock_file"] for row in rows}),
        "question_count": len(rows),
        "by_paper_archetype_counts": {paper: dict(counter) for paper, counter in by_paper_arch.items()},
        "by_paper_family_counts": {paper: dict(counter) for paper, counter in by_paper_family.items()},
        "forecast_gap_analysis": gaps,
    }


def render_md(coverage: dict, rows: list[dict]) -> str:
    lines = [
        "# Mock Exam Coverage",
        "",
        "This report summarizes what the existing generated mocks have already covered and what the 2026 forecast still suggests is under-covered.",
        "",
        f"- Full mock suites analyzed: `{coverage['mock_count']}`",
        f"- Total mock questions analyzed: `{coverage['question_count']}`",
        "",
    ]
    for paper in ["1", "2", "3"]:
        lines.append(f"## Paper {paper}")
        lines.append("")
        lines.append(f"- Archetype counts: `{coverage['by_paper_archetype_counts'].get(paper, {})}`")
        lines.append(f"- Family counts: `{coverage['by_paper_family_counts'].get(paper, {})}`")
        lines.append("")
        lines.append("### Forecast gap analysis")
        lines.append("")
        for gap in coverage["forecast_gap_analysis"].get(paper, []):
            lines.append(
                f"- Q{gap['slot']} `{gap['archetype']}`: status=`{gap['coverage_status']}`, "
                f"same-slot seen=`{gap['seen_same_slot']}`, paper-wide seen=`{gap['seen_anywhere_in_paper']}`"
            )
        lines.append("")
    lines.extend(
        [
            "## How to use this",
            "",
            "- Prefer generating new mocks that cover forecasted slot/archetype combinations marked `unseen_in_paper` first.",
            "- Next prefer `missing_same_slot` combinations, where the archetype exists in the paper historically but not yet in that slot in your mock set.",
            "- Once high-value gaps are covered, vary wine roles, tiers and regions within those structures rather than repeating the same wines.",
        ]
    )
    return "\n".join(lines) + "\n"


def main() -> None:
    rows, _ = classify_mock_questions()
    coverage = build_coverage(rows)
    OUT_JSON_PATH.write_text(json.dumps(coverage, indent=2, ensure_ascii=False), encoding="utf-8")
    OUT_MD_PATH.write_text(render_md(coverage, rows), encoding="utf-8")
    print(f"OK: wrote {OUT_JSON_PATH}")
    print(f"OK: wrote {OUT_MD_PATH}")


if __name__ == "__main__":
    main()
