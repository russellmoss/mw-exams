from __future__ import annotations

import json
from pathlib import Path


TMP_DIR = Path("data/tmp_v2_parse")
TMP_EXAMS = TMP_DIR / "exams_v2_temp.json"
TMP_WINES = TMP_DIR / "wines_v2_temp.json"
TMP_ANNOS = TMP_DIR / "annotations_v2_temp.json"

CANONICAL_EXAMS = Path("data/exams.json")
CANONICAL_WINES = Path("data/wines.json")
CANONICAL_ANNOS = Path("data/annotations.json")


def load_json(path: Path):
    if not path.exists():
        raise SystemExit(f"FAIL: missing required file {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def ensure_no_overlap(current_exams: list[dict], new_exams: list[dict]) -> None:
    current_years = {row["year"] for row in current_exams}
    new_years = {row["year"] for row in new_exams}
    overlap = sorted(current_years & new_years)
    if overlap:
        raise SystemExit(f"FAIL: overlapping years detected, refusing to merge: {overlap}")


def ensure_no_duplicate_ids(current_rows: list[dict], new_rows: list[dict], key: str) -> None:
    current_ids = {row[key] for row in current_rows}
    new_ids = [row[key] for row in new_rows]
    overlap = sorted(current_ids & set(new_ids))
    if overlap:
        sample = overlap[:10]
        raise SystemExit(f"FAIL: duplicate {key} values detected, refusing to merge. Sample: {sample}")


def main() -> None:
    current_exams = load_json(CANONICAL_EXAMS)
    current_wines = load_json(CANONICAL_WINES)
    current_annos = load_json(CANONICAL_ANNOS)

    new_exams = load_json(TMP_EXAMS)
    new_wines = load_json(TMP_WINES)
    new_annos = load_json(TMP_ANNOS)

    ensure_no_overlap(current_exams, new_exams)
    ensure_no_duplicate_ids(current_wines, new_wines, "id")

    merged_exams = sorted(current_exams + new_exams, key=lambda row: row["year"])
    merged_wines = sorted(current_wines + new_wines, key=lambda row: (row["year"], row["paper"], row["slot"]))
    merged_annos = sorted(current_annos + new_annos, key=lambda row: (row["year"], row["paper"], row["question"]))

    CANONICAL_EXAMS.write_text(json.dumps(merged_exams, indent=2, ensure_ascii=False), encoding="utf-8")
    CANONICAL_WINES.write_text(json.dumps(merged_wines, indent=2, ensure_ascii=False), encoding="utf-8")
    CANONICAL_ANNOS.write_text(json.dumps(merged_annos, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"OK: merged exams into {CANONICAL_EXAMS}")
    print(f"OK: merged wines into {CANONICAL_WINES}")
    print(f"OK: merged annotations into {CANONICAL_ANNOS}")
    print(f"OK: canonical exams now cover {merged_exams[0]['year']}–{merged_exams[-1]['year']}")
    print(f"OK: canonical wine rows = {len(merged_wines)}")


if __name__ == "__main__":
    main()
