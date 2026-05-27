from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path


TMP_DIR = Path("data/tmp_v2_parse")
WINES_PATH = TMP_DIR / "missing_wines_v2.json"
OUT_DIR = TMP_DIR / "research_batches_v2"
MANIFEST_PATH = OUT_DIR / "manifest.json"
README_PATH = OUT_DIR / "README.md"


def main() -> None:
    if not WINES_PATH.exists():
        raise SystemExit(f"FAIL: {WINES_PATH} not found")

    wines = json.loads(WINES_PATH.read_text(encoding="utf-8"))
    grouped: dict[tuple[int, int], list[dict]] = defaultdict(list)
    for row in wines:
        grouped[(row["year"], row["paper"])].append(row)

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    manifest = {"batches": []}
    readme_lines = [
        "# V2 Research Batches",
        "",
        "These batches cover the newly added `2011-2014` wines from `MW_Practical_Papers_Compilation V2.md`.",
        "",
        "Recommended parallelization:",
        "- one batch per paper",
        "- `12` batches total",
        "- `12` wines per batch",
        "",
        "Each batch JSON includes the wine IDs, full text, and ready-to-run `/research-wine` commands.",
        "",
    ]

    for year, paper in sorted(grouped):
        items = sorted(grouped[(year, paper)], key=lambda row: row["slot"])
        batch_name = f"{year}_p{paper}"
        batch_path = OUT_DIR / f"{batch_name}.json"
        batch_payload = {
            "batch_id": batch_name,
            "year": year,
            "paper": paper,
            "wine_count": len(items),
            "commands": [f"/research-wine {year} p{paper} w{row['slot']}" for row in items],
            "wines": items,
        }
        batch_path.write_text(json.dumps(batch_payload, indent=2, ensure_ascii=False), encoding="utf-8")
        manifest["batches"].append(
            {
                "batch_id": batch_name,
                "year": year,
                "paper": paper,
                "wine_count": len(items),
                "path": str(batch_path).replace("\\", "/"),
            }
        )
        readme_lines.append(f"## {batch_name}")
        readme_lines.append("")
        readme_lines.append(f"- file: `{str(batch_path).replace(chr(92), '/')}`")
        readme_lines.append(f"- wines: `{len(items)}`")
        readme_lines.append(f"- first command: `{batch_payload['commands'][0]}`")
        readme_lines.append("")

    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    README_PATH.write_text("\n".join(readme_lines) + "\n", encoding="utf-8")

    print(f"OK: wrote {MANIFEST_PATH}")
    print(f"OK: wrote {README_PATH}")
    print(f"OK: wrote {len(manifest['batches'])} batch files to {OUT_DIR}")


if __name__ == "__main__":
    main()
