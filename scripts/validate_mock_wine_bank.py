from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
BANK_PATH = ROOT / "data" / "mock_wine_bank.json"
OUT_PATH = ROOT / "outputs" / "mock_exams" / "mock_wine_bank_report.md"

REQUIRED = [
    "id",
    "producer",
    "wine_name",
    "country",
    "region",
    "grape_varieties",
    "style_category",
    "price_band",
    "quality_tier",
    "useful_families",
    "cooldown_motifs",
    "sources",
]

STYLE_VALUES = {"still_dry", "still_off_dry", "still_sweet", "sparkling", "fortified", "oxidative", "orange", "rose"}
PRICE_VALUES = {"value", "mainstream", "premium", "super_premium", "luxury", "unknown"}
QUALITY_VALUES = {"commercial", "regional", "premium", "benchmark", "iconic", "unknown"}
FAMILY_VALUES = {"F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8"}
COOLDOWN_HEAVY = {"vouvray", "huet", "foreau", "savennières", "savennieres", "tokaji", "rutherglen", "vin santo", "etna", "madeira"}


def load_bank() -> dict:
    if not BANK_PATH.exists():
        return {"entries": []}
    return json.loads(BANK_PATH.read_text(encoding="utf-8"))


def looks_like_url(value: str) -> bool:
    return bool(re.match(r"https?://", value or ""))


def validate_entry(entry: dict) -> tuple[list[str], list[str]]:
    errors = []
    warnings = []
    eid = entry.get("id", "<missing-id>")
    for field in REQUIRED:
        if field not in entry or entry[field] in ["", [], None]:
            errors.append(f"{eid}: missing required field `{field}`")
    if entry.get("style_category") and entry["style_category"] not in STYLE_VALUES:
        errors.append(f"{eid}: invalid style_category `{entry['style_category']}`")
    if entry.get("price_band") and entry["price_band"] not in PRICE_VALUES:
        errors.append(f"{eid}: invalid price_band `{entry['price_band']}`")
    if entry.get("quality_tier") and entry["quality_tier"] not in QUALITY_VALUES:
        errors.append(f"{eid}: invalid quality_tier `{entry['quality_tier']}`")
    for fam in entry.get("useful_families", []):
        if fam not in FAMILY_VALUES:
            errors.append(f"{eid}: invalid useful family `{fam}`")
    sources = entry.get("sources", [])
    if not sources or not all(looks_like_url(src) for src in sources):
        errors.append(f"{eid}: all sources must be URLs")
    if entry.get("source_confidence") == "low":
        warnings.append(f"{eid}: low source confidence")
    motifs = {m.lower() for m in entry.get("cooldown_motifs", [])}
    heavy = sorted(motifs & COOLDOWN_HEAVY)
    if heavy:
        warnings.append(f"{eid}: uses cooldown-heavy motifs {heavy}")
    if entry.get("price_band") == "unknown":
        warnings.append(f"{eid}: unknown price band")
    if entry.get("quality_tier") == "unknown":
        warnings.append(f"{eid}: unknown quality tier")
    return errors, warnings


def render_report(bank: dict, errors: list[str], warnings: list[str]) -> str:
    entries = bank.get("entries", [])
    by_family = Counter(f for e in entries for f in e.get("useful_families", []))
    by_style = Counter(e.get("style_category", "unknown") for e in entries)
    by_price = Counter(e.get("price_band", "unknown") for e in entries)
    by_country = Counter(e.get("country", "unknown") for e in entries)
    by_quality = Counter(e.get("quality_tier", "unknown") for e in entries)
    motifs = Counter(m for e in entries for m in e.get("cooldown_motifs", []))

    lines = [
        "# Mock Wine Bank Report",
        "",
        f"- Entries: `{len(entries)}`",
        f"- Validation errors: `{len(errors)}`",
        f"- Warnings: `{len(warnings)}`",
        "",
        "## Coverage",
        "",
        "### Families",
        "",
    ]
    for key, count in sorted(by_family.items()):
        lines.append(f"- `{key}`: `{count}`")
    lines.extend(["", "### Styles", ""])
    for key, count in by_style.most_common():
        lines.append(f"- `{key}`: `{count}`")
    lines.extend(["", "### Price Bands", ""])
    for key, count in by_price.most_common():
        lines.append(f"- `{key}`: `{count}`")
    lines.extend(["", "### Quality Tiers", ""])
    for key, count in by_quality.most_common():
        lines.append(f"- `{key}`: `{count}`")
    lines.extend(["", "### Top Countries", ""])
    for key, count in by_country.most_common(15):
        lines.append(f"- `{key}`: `{count}`")
    lines.extend(["", "### Top Cooldown Motifs", ""])
    for key, count in motifs.most_common(20):
        lines.append(f"- `{key}`: `{count}`")

    if errors:
        lines.extend(["", "## Errors", ""])
        lines.extend(f"- {err}" for err in errors)
    if warnings:
        lines.extend(["", "## Warnings", ""])
        lines.extend(f"- {warn}" for warn in warnings)

    lines.extend(
        [
            "",
            "## Selection Rule",
            "",
            "The mock writer should select from this bank only after applying cooldown, source confidence, question-family fit, and diversity scorecard checks.",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    bank = load_bank()
    ids = [e.get("id", "") for e in bank.get("entries", [])]
    errors = []
    warnings = []
    for dup, count in Counter(ids).items():
        if dup and count > 1:
            errors.append(f"duplicate id `{dup}`")
    for entry in bank.get("entries", []):
        e, w = validate_entry(entry)
        errors.extend(e)
        warnings.extend(w)
    OUT_PATH.write_text(render_report(bank, errors, warnings), encoding="utf-8")
    for err in errors:
        print(f"FAIL: {err}")
    for warn in warnings:
        print(f"WARN: {warn}")
    print(f"OK: wrote {OUT_PATH}")
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
