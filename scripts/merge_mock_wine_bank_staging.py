"""Merge staging wine-bank JSON files into the canonical mock_wine_bank.json.

Each staging file under data/mock_wine_bank_staging/*.json may contain either
- a JSON array of entry objects, or
- a JSON object with an `entries` key whose value is an array.

This script:
1. Loads the existing mock_wine_bank.json.
2. Iterates staging files, validates each candidate entry has the required
   schema fields, rejects entries whose `id` is already used in the bank or
   duplicated across staging files.
3. Appends accepted entries, updates `last_updated`, and writes back.
4. Prints a concise summary of accepted/rejected counts per staging file.
"""
from __future__ import annotations

import datetime as _dt
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BANK_PATH = ROOT / "data" / "mock_wine_bank.json"
STAGING_DIR = ROOT / "data" / "mock_wine_bank_staging"

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


def load_bank() -> dict:
    return json.loads(BANK_PATH.read_text(encoding="utf-8"))


def parse_staging_payload(payload):
    """Return list of entry dicts from a staging file's loaded JSON."""
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        if isinstance(payload.get("entries"), list):
            return payload["entries"]
    raise ValueError("staging file must be a JSON array or {entries: [...]}")


def validate_entry(entry: dict) -> list[str]:
    missing = []
    for field in REQUIRED:
        if field not in entry or entry[field] in ["", [], None]:
            missing.append(field)
    return missing


def main() -> None:
    bank = load_bank()
    existing_ids = {e.get("id") for e in bank.get("entries", []) if e.get("id")}
    staging_files = sorted(STAGING_DIR.glob("*.json"))
    if not staging_files:
        print("No staging files found.")
        return

    accepted: list[dict] = []
    per_file_stats: list[tuple[str, int, int, list[str]]] = []
    seen_in_run = set(existing_ids)

    for sf in staging_files:
        text = sf.read_text(encoding="utf-8")
        try:
            payload = json.loads(text)
            entries = parse_staging_payload(payload)
        except Exception as exc:
            per_file_stats.append((sf.name, 0, 0, [f"parse error: {exc}"]))
            continue

        ok = 0
        skip = 0
        notes: list[str] = []
        for entry in entries:
            eid = entry.get("id")
            if not eid:
                skip += 1
                notes.append("entry missing id")
                continue
            if eid in seen_in_run:
                skip += 1
                notes.append(f"id collision: {eid}")
                continue
            missing = validate_entry(entry)
            if missing:
                skip += 1
                notes.append(f"{eid}: missing fields {missing}")
                continue
            accepted.append(entry)
            seen_in_run.add(eid)
            ok += 1
        per_file_stats.append((sf.name, ok, skip, notes))

    if not accepted:
        print("No new entries accepted.")
    else:
        bank["entries"].extend(accepted)
        bank["last_updated"] = _dt.date.today().isoformat()
        BANK_PATH.write_text(json.dumps(bank, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"Appended {len(accepted)} new entries. Bank now has {len(bank['entries'])} entries.")

    print("\nPer-file summary:")
    for name, ok, skip, notes in per_file_stats:
        print(f"  {name}: accepted={ok} skipped={skip}")
        for note in notes[:10]:
            print(f"    - {note}")
        if len(notes) > 10:
            print(f"    ... +{len(notes)-10} more notes")

    # Quick coverage tally
    by_style = Counter(e.get("style_category", "?") for e in bank["entries"])
    by_price = Counter(e.get("price_band", "?") for e in bank["entries"])
    by_quality = Counter(e.get("quality_tier", "?") for e in bank["entries"])
    by_country = Counter(e.get("country", "?") for e in bank["entries"])

    print("\nBank style mix:", dict(by_style))
    print("Bank price mix:", dict(by_price))
    print("Bank quality mix:", dict(by_quality))
    print("Bank top countries:", dict(by_country.most_common(12)))


if __name__ == "__main__":
    main()
