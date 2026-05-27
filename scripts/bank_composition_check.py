"""Print final mock_wine_bank composition vs historical-corpus targets."""
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
bank = json.loads((ROOT / "data" / "mock_wine_bank.json").read_text(encoding="utf-8"))["entries"]
n = len(bank)

OLD_WORLD = {"France", "Italy", "Spain", "Portugal", "Germany", "Austria", "Greece", "United Kingdom", "Hungary", "Switzerland", "Lebanon", "Georgia"}
ow = sum(1 for e in bank if e["country"] in OLD_WORLD)

print(f"Final bank: {n} entries")
print(f"Old / New World: {ow} ({ow*100/n:.1f}%) / {n-ow} ({(n-ow)*100/n:.1f}%)  [target 67% / 30%]")
print()

target = {"still_dry": 73.4, "sparkling": 7.3, "fortified": 8.1, "still_sweet": 7.3, "oxidative": 1.2, "orange": 0.6}
print("Style mix:")
for s, c in Counter(e["style_category"] for e in bank).most_common():
    pct = c * 100 / n
    tgt = target.get(s, 0)
    diff = pct - tgt
    flag = "on target" if abs(diff) < 1.5 else ("slight over" if diff > 0 else "slight under")
    print(f"  {s:18} {c:3} ({pct:5.1f}%)  [target {tgt:>4}%]  {flag}")

print()
print("Quality tiers:")
for q, c in Counter(e["quality_tier"] for e in bank).most_common():
    print(f"  {q:12} {c}")

print()
print("Price bands:")
for p, c in Counter(e["price_band"] for e in bank).most_common():
    print(f"  {p:14} {c}")

print()
src = Counter(e.get("source_confidence", "unknown") for e in bank)
print(f"Source confidence: {dict(src)}")
