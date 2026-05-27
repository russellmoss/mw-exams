"""Report which wines have been researched and which are pending."""
import json
from pathlib import Path

WINES = json.loads(Path("data/wines.json").read_text(encoding="utf-8"))
RESEARCH_DIR = Path("data/wine_research")

researched = {p.stem for p in RESEARCH_DIR.glob("*.md")}
pending = [w for w in WINES if w["id"] not in researched]

print(f"Total wines: {len(WINES)}")
print(f"Researched:  {len(researched)}")
print(f"Pending:     {len(pending)}")
print()

if pending:
    print("Next 10 pending:")
    for w in pending[:10]:
        print(f"  - {w['id']}: {w['full_text']}")
