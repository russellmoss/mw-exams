from __future__ import annotations

import json
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
TMP_DIR = ROOT / "data" / "tmp_v2_parse"
MISSING_RESEARCH_PATH = TMP_DIR / "missing_research_v2_ids.json"
MISSING_WINES_PATH = TMP_DIR / "missing_wines_v2.json"
RESEARCH_DIR = ROOT / "data" / "wine_research"


def load_json(path: Path):
    if not path.exists():
        raise SystemExit(f"FAIL: missing required file {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def check_research_coverage() -> tuple[int, list[str]]:
    missing_ids = load_json(MISSING_RESEARCH_PATH)
    unresolved = [wine_id for wine_id in missing_ids if not (RESEARCH_DIR / f"{wine_id}.md").exists()]
    return len(missing_ids), unresolved


def check_temp_inputs() -> dict[str, bool]:
    required = [
        TMP_DIR / "exams_v2_temp.json",
        TMP_DIR / "wines_v2_temp.json",
        TMP_DIR / "annotations_v2_temp.json",
        TMP_DIR / "coverage_summary_v2.json",
        MISSING_RESEARCH_PATH,
        MISSING_WINES_PATH,
    ]
    return {str(path.relative_to(ROOT)): path.exists() for path in required}


def run_command(args: list[str]) -> None:
    result = subprocess.run(args, cwd=ROOT, check=False)
    if result.returncode != 0:
        raise SystemExit(f"FAIL: command exited non-zero: {' '.join(args)}")


def main() -> None:
    with ThreadPoolExecutor(max_workers=2) as executor:
        coverage_future = executor.submit(check_research_coverage)
        inputs_future = executor.submit(check_temp_inputs)
        total_expected, unresolved = coverage_future.result()
        input_status = inputs_future.result()

    missing_inputs = [path for path, exists in input_status.items() if not exists]
    if missing_inputs:
        raise SystemExit(f"FAIL: missing temp inputs: {missing_inputs}")

    if unresolved:
        sample = unresolved[:20]
        raise SystemExit(
            f"FAIL: research coverage incomplete for {len(unresolved)} of {total_expected} new wines. Sample: {sample}"
        )

    print(f"OK: research coverage complete for all {total_expected} V2 wines")

    # Canonical merge must remain serialized.
    run_command([sys.executable, "scripts/merge_v2_into_canonical.py"])

    # Downstream analyses depend on the refreshed historical wine classification.
    run_command([sys.executable, "scripts/build_historical_wine_classification.py"])

    parallel_rebuilds = [
        [sys.executable, "scripts/analyze_quality_price_tiers.py"],
        [sys.executable, "scripts/analyze_winemaking_diversity_quality_questions.py"],
        [sys.executable, "scripts/analyze_wine_selection_logic.py"],
        [sys.executable, "scripts/analyze_mock_rotation.py"],
        [sys.executable, "scripts/build_mock_exam_sourcing_guide.py"],
        [sys.executable, "scripts/build_predictive_exam_analyzer.py"],
    ]
    with ThreadPoolExecutor(max_workers=len(parallel_rebuilds)) as executor:
        futures = [executor.submit(run_command, cmd) for cmd in parallel_rebuilds]
        for future in futures:
            future.result()

    print("OK: completed post-research merge and rebuild pipeline")


if __name__ == "__main__":
    main()
