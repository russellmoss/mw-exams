"""
Score the FROZEN pre-2026 master trees against the real 2026 papers.

This is the clean per-wine variety measurement — the one directly comparable to the
89.2% top-3 headline in EK-0082, and the last uncontaminated use of 2026 available.

Why it is clean:
  - The predictions were produced by tree-backtester agents reading ONLY
    outputs/master_trees/_frozen_pre2026/, which never saw 2026.
  - Those agents were barred from the 2026 wine lists; they predicted from stem + tree.
  - Scoring here reuses run_loyo.score_question and run_loyo.get_actual_wines verbatim,
    so the numbers sit on the same scale as the 10-fold LOYO report rather than a
    lookalike metric invented for this run.

Contrast with outputs/backtest_reports/2026_holdout.md: that scores the exam-STRUCTURE
predictor (which archetypes/countries a paper will contain). This scores the TREES
(which variety each wine is) — the thing a candidate actually leans on in the room.

Inputs:  data/loyo_2026_predictions_p{1,2,3}.json
Outputs: data/loyo_2026_tree_holdout.json
         outputs/backtest_reports/2026_tree_holdout.md

Usage:
    python scripts/score_2026_tree_holdout.py
"""

from __future__ import annotations

import io
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

import run_loyo as R  # noqa: E402

R._load_appellation_lookup()

PRED_FILES = [ROOT / "data" / f"loyo_2026_predictions_p{p}.json" for p in (1, 2, 3)]
OUT_JSON = ROOT / "data" / "loyo_2026_tree_holdout.json"
OUT_MD = ROOT / "outputs" / "backtest_reports" / "2026_tree_holdout.md"

# Headline figures from outputs/backtest_reports/loyo_postfix_audit.md (2015-2025).
BASELINE = {"top1_variety": 0.728, "top3_variety": 0.892, "candidate_set": 0.956}


def load_predictions() -> list[dict]:
    preds = []
    for f in PRED_FILES:
        if not f.exists():
            raise SystemExit(f"FAIL: missing {f.relative_to(ROOT)} — has the agent finished?")
        data = json.load(io.open(f, encoding="utf-8"))
        if not isinstance(data, list):
            raise SystemExit(f"FAIL: {f.name} is not a JSON array")
        preds.extend(data)
    return sorted(preds, key=lambda p: (p["paper"], p["question"]))


def main() -> None:
    exams = json.load(io.open(ROOT / "data" / "exams.json", encoding="utf-8"))
    wines = json.load(io.open(ROOT / "data" / "wines.json", encoding="utf-8"))
    preds = load_predictions()

    rows, confusion = [], []
    tot = Counter()
    n_wines = 0

    for p in preds:
        actual = R.get_actual_wines(exams, wines, 2026, p["paper"], p["question"], p["wine_slots"])
        s = R.score_question(p, actual)
        if not s:
            continue
        n = s["n"]
        n_wines += n
        for k in ("top1_variety", "top3_variety", "candidate_set", "top1_region_country", "top3_region"):
            tot[k] += s[k] * n           # weight by wines so the aggregate is per-wine
        confusion.extend(s["confusion"])
        rows.append({
            "qid": f"2026_p{p['paper']}_q{p['question']}",
            "paper": p["paper"], "question": p["question"], "n_wines": n,
            "tree_path": p.get("tree_path", ""),
            "variety_ranking": p.get("variety_ranking", []),
            "top1_variety": s["top1_variety"], "top3_variety": s["top3_variety"],
            "candidate_set": s["candidate_set"],
            "top1_region_country": s["top1_region_country"], "top3_region": s["top3_region"],
            "actual": [{"slot": w["slot"], "variety": w["variety"], "country": w["country"]} for w in actual],
        })

    agg = {k: tot[k] / n_wines for k in tot} if n_wines else {}
    result = {
        "target_year": 2026, "n_questions": len(rows), "n_wines": n_wines,
        "trees": "outputs/master_trees/_frozen_pre2026/ (never saw 2026)",
        "aggregate": agg, "baseline_2015_2025_postfix": BASELINE, "questions": rows,
    }
    OUT_JSON.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")

    L = ["# 2026 Tree Holdout — the frozen pre-2026 trees vs the real papers\n",
         "**The clean per-wine variety measurement.** Predictions came from tree-backtester agents",
         "reading only `outputs/master_trees/_frozen_pre2026/`, which never saw 2026, and barred from",
         "the 2026 wine lists. Scoring reuses `run_loyo.score_question` verbatim, so these numbers sit",
         "on the same scale as the 10-fold LOYO report.\n",
         f"Scored **{n_wines} wines** across **{len(rows)} questions**.\n",
         "## Headline\n",
         "| Metric | 2015-2025 LOYO (post-fix) | 2026 holdout | Delta |",
         "| --- | --- | --- | --- |"]
    for k, label in [("top1_variety", "Top-1 variety"), ("top3_variety", "**Top-3 variety**"),
                     ("candidate_set", "Candidate-set hit")]:
        b, a = BASELINE[k], agg.get(k, 0.0)
        L.append(f"| {label} | {b:.1%} | **{a:.1%}** | {a - b:+.1f}pp |")
    L.append(f"| Top-1 country | — | {agg.get('top1_region_country', 0):.1%} | — |")
    L.append(f"| Top-3 country | — | {agg.get('top3_region', 0):.1%} | — |")

    L.append("\n## Per question\n")
    L.append("| Question | Wines | Top-1 var | Top-3 var | Cand-set | Top-1 country |")
    L.append("| --- | --- | --- | --- | --- | --- |")
    for r in rows:
        L.append(f"| `{r['qid']}` | {r['n_wines']} | {r['top1_variety']:.0%} | {r['top3_variety']:.0%} "
                 f"| {r['candidate_set']:.0%} | {r['top1_region_country']:.0%} |")

    L.append("\n## What each question actually held\n")
    for r in rows:
        L.append(f"**`{r['qid']}`** — predicted ranking: {', '.join(r['variety_ranking'][:6]) or '—'}")
        L.append("")
        L.append("| Slot | Actual variety | Country |")
        L.append("| --- | --- | --- |")
        for a in r["actual"]:
            L.append(f"| {a['slot']} | {a['variety']} | {a['country']} |")
        L.append("")

    miss = Counter(f"{act} -> {pred}" for act, pred in confusion if act != pred)
    if miss:
        L.append("## Most common mispredictions\n")
        for k, v in miss.most_common(10):
            L.append(f"- {k} ({v})")

    L.append("\n## How to read this\n")
    L.append("- This measures the **trees** (which variety is each wine), not the exam-structure")
    L.append("  predictor. For that, see `outputs/backtest_reports/2026_holdout.md`.")
    L.append("- The baseline column is the post-fix LOYO figure, which was itself measured after tree")
    L.append("  edits made in response to the 2024/2025 misses — so it is optimistic. This 2026 column")
    L.append("  had no such opportunity, which is the entire point of the comparison.")
    L.append("- Per EK-0083 the trees score 0% top-1 on multi-grape labels, so blend-heavy flights will")
    L.append("  drag top-1 while candidate-set holds up. Read the two together.")
    OUT_MD.parent.mkdir(parents=True, exist_ok=True)
    OUT_MD.write_text("\n".join(L) + "\n", encoding="utf-8")

    print(f"scored {n_wines} wines / {len(rows)} questions (frozen pre-2026 trees)")
    for k in ("top1_variety", "top3_variety", "candidate_set"):
        print(f"  {k:20} {agg.get(k,0):.1%}   (2015-2025 baseline {BASELINE[k]:.1%})")
    print(f"  {'top1_country':20} {agg.get('top1_region_country',0):.1%}")
    print(f"wrote {OUT_MD.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
