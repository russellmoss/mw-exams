"""Split the Era-1 corpus into a BLIND question file and a separate answer key.

The trees were synthesised from the 2011-2025 corpus, so the 2000-2010 papers are a genuine
out-of-sample test. To keep it honest the predicting agents must never see the wines, so this
writes two files:

  <out>/era1_questions_blind.json  — year / paper / question / stem / wine slots. NO wine names.
  <out>/era1_answer_key.json       — the actual wines, held back for scoring.

Run:  python scripts/build_backtest_input.py <out_dir>
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ERA1 = ROOT / "data" / "past_exams_2000_2010.json"


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)

    corpus = json.loads(ERA1.read_text(encoding="utf-8"))
    blind, key = [], []

    for entry in corpus["years"]:
        year = entry["year"]
        for p in entry["papers"]:
            wines = {w["slot"]: w["full_text"] for w in p["wines"]}
            for q in p["questions"]:
                qid = f"{year}_p{p['paper']}_q{q['n']}"
                blind.append({
                    "id": qid,
                    "year": year,
                    "paper": p["paper"],
                    "question": q["n"],
                    "wine_slots": q["wines"],
                    "n_wines": len(q["wines"]),
                    "question_text": q["text"],
                })
                key.append({
                    "id": qid,
                    "year": year,
                    "paper": p["paper"],
                    "question": q["n"],
                    "wines": [{"slot": s, "full_text": wines.get(s, "")} for s in q["wines"]],
                })

    (out / "era1_questions_blind.json").write_text(
        json.dumps(blind, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (out / "era1_answer_key.json").write_text(
        json.dumps(key, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    # guard: the blind file must not leak any wine text
    blob = json.dumps(blind, ensure_ascii=False)
    leaks = [k["wines"][0]["full_text"][:30] for k in key
             if k["wines"] and k["wines"][0]["full_text"][:30] and k["wines"][0]["full_text"][:30] in blob]
    print(f"blind questions: {len(blind)} | answer-key entries: {len(key)} | "
          f"wines held back: {sum(len(k['wines']) for k in key)}")
    print("leak check:", "FAILED — wine text found in blind file" if leaks else "clean")
    by_paper = {}
    for b in blind:
        by_paper[b["paper"]] = by_paper.get(b["paper"], 0) + 1
    print("questions per paper:", dict(sorted(by_paper.items())))
    return 1 if leaks else 0


if __name__ == "__main__":
    sys.exit(main())
