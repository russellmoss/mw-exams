"""
Score the frozen, pre-exam 2026 forecast against the real 2026 papers.

This is the system's only genuine out-of-sample test. Everything in
outputs/master_trees/, outputs/decision_matrices*/ and the predictive analyzer
was built from 2011-2025 with no knowledge of 2026, and the forecast being
scored here was committed on 2026-05-27, before the exam was sat.

Inputs
  data/frozen_predictions/predicted_2026_exam_profile.PRE-EXAM-FROZEN.json
      the forecast exactly as it stood before the exam
  data/exams.json / data/wines.json
      the real 2026 papers

What is scored
  structure  per paper: predicted question count, and the predicted archetype
             multiset vs the actual one (precision / recall / overlap)
  variety    per paper: did the forecast's union of per-slot top-3 variety
             guesses contain the varieties that actually showed up
  country    same, for countries

Why paper-level for the labels: the forecast is a *sequence of slots* with a
top-3 per slot, and those slots do not align 1:1 with the actual question
numbers (the forecast predicted 4 questions in Paper 1; there were 3). Pooling
to the paper is the only comparison that does not require inventing an
alignment. Actual varieties/countries come from the canonical run_loyo
extractors — the same ones build_structured_corpus and the LOYO backtest trust
— because the 2026 wines have no data/wine_research/ files yet.

Usage:
    python scripts/score_2026_holdout.py
"""

from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

import build_predictive_exam_analyzer as A  # noqa: E402
from run_loyo import (  # noqa: E402
    extract_variety_from_text,
    extract_country_from_text,
    _load_appellation_lookup,
)

_load_appellation_lookup()

TARGET_YEAR = 2026
FROZEN = ROOT / "data" / "frozen_predictions" / "predicted_2026_exam_profile.PRE-EXAM-FROZEN.json"
FROZEN_BACKTEST = ROOT / "data" / "frozen_predictions" / "exam_predictor_backtest.PRE-2026.json"
OUT_JSON = ROOT / "data" / "holdout_2026_score.json"
OUT_MD = ROOT / "outputs" / "backtest_reports" / "2026_holdout.md"


def variety_tokens(raw: str) -> list[str]:
    """Map a run_loyo variety string onto the forecast's variety-family space.

    The forecast emits lowercase family names ('chardonnay', 'sauvignon blanc').
    run_loyo emits title case and joins blends with '/'.
    """
    if not raw or raw == "Unknown":
        return []
    out = []
    for part in raw.split("/"):
        token = A.canonical_variety_token(part.strip().lower())
        if token:
            out.append(token)
    return out


def actual_rows() -> list[dict]:
    exams = json.loads((ROOT / "data" / "exams.json").read_text(encoding="utf-8"))
    wines = json.loads((ROOT / "data" / "wines.json").read_text(encoding="utf-8"))
    wine_by_id = {w["id"]: w for w in wines}

    exam = next((e for e in exams if e["year"] == TARGET_YEAR), None)
    if exam is None:
        raise SystemExit(f"FAIL: {TARGET_YEAR} not present in data/exams.json")

    rows = []
    for paper in exam["papers"]:
        pn = paper["paper"]
        for q in paper["questions"]:
            feats = A.question_features(q["text"], pn, len(q["wines"]))
            texts = [
                wine_by_id[f"{TARGET_YEAR}_p{pn}_w{s}"]["full_text"]
                for s in q["wines"]
                if f"{TARGET_YEAR}_p{pn}_w{s}" in wine_by_id
            ]
            varieties, countries = set(), set()
            for t in texts:
                varieties.update(variety_tokens(extract_variety_from_text(t)))
                c = extract_country_from_text(t)
                if c and c != "Unknown":
                    countries.add(c)
            rows.append({
                "paper": pn,
                "question": q["n"],
                "archetype": feats["archetype"],
                "family": feats["family"],
                "subcategory": feats["subcategory"],
                "flight_size": len(q["wines"]),
                "varieties": sorted(varieties),
                "countries": sorted(countries),
            })
    return rows


def score() -> dict:
    forecast = json.loads(FROZEN.read_text(encoding="utf-8"))
    rows = actual_rows()
    result = {"target_year": TARGET_YEAR, "papers": {}, "summary": {}}

    tot_overlap = tot_pred = tot_actual = 0
    var_hits = var_total = 0
    cty_hits = cty_total = 0

    for pn in (1, 2, 3):
        p_rows = [r for r in rows if r["paper"] == pn]
        pred = forecast["papers"][str(pn)]
        seq = pred["predicted_sequence"]

        actual_c = Counter(r["archetype"] for r in p_rows)
        pred_c = Counter(item["archetype"] for item in seq)
        overlap = sum(min(actual_c[k], pred_c[k]) for k in set(actual_c) | set(pred_c))
        precision = overlap / sum(pred_c.values()) if pred_c else 0.0
        recall = overlap / sum(actual_c.values()) if actual_c else 0.0

        tot_overlap += overlap
        tot_pred += sum(pred_c.values())
        tot_actual += sum(actual_c.values())

        pred_vars = {v for it in seq for v in it.get("likely_varieties_top3", [])}
        pred_ctys = {c for it in seq for c in it.get("likely_countries_top3", [])}
        actual_vars = {v for r in p_rows for v in r["varieties"]}
        actual_ctys = {c for r in p_rows for c in r["countries"]}

        var_hits += len(actual_vars & pred_vars)
        var_total += len(actual_vars)
        cty_hits += len(actual_ctys & pred_ctys)
        cty_total += len(actual_ctys)

        result["papers"][str(pn)] = {
            "predicted_question_count": pred.get("predicted_question_count"),
            "actual_question_count": len(p_rows),
            "count_exact": pred.get("predicted_question_count") == len(p_rows),
            "predicted_structures": dict(pred_c),
            "actual_structures": dict(actual_c),
            "archetypes_hit": sorted((actual_c & pred_c).elements()),
            "archetypes_missed": sorted((actual_c - pred_c).elements()),
            "archetypes_spurious": sorted((pred_c - actual_c).elements()),
            "precision": round(precision, 3),
            "recall": round(recall, 3),
            "predicted_varieties": sorted(pred_vars),
            "actual_varieties": sorted(actual_vars),
            "varieties_hit": sorted(actual_vars & pred_vars),
            "varieties_missed": sorted(actual_vars - pred_vars),
            "predicted_countries": sorted(pred_ctys),
            "actual_countries": sorted(actual_ctys),
            "countries_hit": sorted(actual_ctys & pred_ctys),
            "countries_missed": sorted(actual_ctys - pred_ctys),
            "questions": p_rows,
        }

    result["summary"] = {
        "archetype_recall": round(tot_overlap / tot_actual, 3) if tot_actual else 0.0,
        "archetype_precision": round(tot_overlap / tot_pred, 3) if tot_pred else 0.0,
        "archetypes_matched": tot_overlap,
        "actual_questions": tot_actual,
        "predicted_questions": tot_pred,
        "papers_with_exact_count": sum(1 for p in result["papers"].values() if p["count_exact"]),
        "variety_recall": round(var_hits / var_total, 3) if var_total else 0.0,
        "country_recall": round(cty_hits / cty_total, 3) if cty_total else 0.0,
    }

    if FROZEN_BACKTEST.exists():
        prior = json.loads(FROZEN_BACKTEST.read_text(encoding="utf-8")).get("summary", {})
        result["baseline_2022_2025"] = {
            "structure_mean_f1_proxy": prior.get("structure_mean_f1_proxy"),
            "variety_top3_hit_rate": prior.get("variety_top3_hit_rate"),
            "country_top3_hit_rate": prior.get("country_top3_hit_rate"),
        }
    return result


def render_md(r: dict) -> str:
    s = r["summary"]
    L = []
    L.append("# 2026 Holdout — scoring the pre-exam forecast against the real papers\n")
    L.append("**This is the only true out-of-sample test the system has.** The forecast scored")
    L.append("here (`data/frozen_predictions/predicted_2026_exam_profile.PRE-EXAM-FROZEN.json`)")
    L.append("was committed 2026-05-27, before the exam. Nothing in it saw a 2026 paper.\n")
    L.append("## Headline\n")
    L.append("| Metric | Result |")
    L.append("| --- | --- |")
    L.append(f"| Question archetypes correctly anticipated | **{s['archetypes_matched']} of {s['actual_questions']}** ({s['archetype_recall']:.0%} recall) |")
    L.append(f"| Archetype precision | {s['archetype_precision']:.0%} ({s['predicted_questions']} predicted) |")
    L.append(f"| Papers with exact question count | {s['papers_with_exact_count']} of 3 |")
    L.append(f"| Grape varieties present that were forecast | {s['variety_recall']:.0%} |")
    L.append(f"| Countries present that were forecast | {s['country_recall']:.0%} |")
    if r.get("baseline_2022_2025"):
        b = r["baseline_2022_2025"]
        L.append("\n### Against the 2022-2025 in-sample baseline\n")
        L.append("| Metric | 2022-25 backtest | 2026 holdout |")
        L.append("| --- | --- | --- |")
        if b.get("structure_mean_f1_proxy") is not None:
            L.append(f"| Structure (F1 proxy / recall) | {b['structure_mean_f1_proxy']:.0%} | {s['archetype_recall']:.0%} |")
        if b.get("variety_top3_hit_rate") is not None:
            L.append(f"| Variety | {b['variety_top3_hit_rate']:.0%} | {s['variety_recall']:.0%} |")
        if b.get("country_top3_hit_rate") is not None:
            L.append(f"| Country | {b['country_top3_hit_rate']:.0%} | {s['country_recall']:.0%} |")
        L.append("\nThe baseline rows are question-level top-3 hit rates on years the model was")
        L.append("tuned against; the holdout column is paper-level recall on a year it had never")
        L.append("seen. They are indicative of the same thing but are not computed identically —")
        L.append("do not read small gaps as signal.")

    for pn in ("1", "2", "3"):
        p = r["papers"][pn]
        label = {"1": "Paper 1 (whites)", "2": "Paper 2 (reds)", "3": "Paper 3 (special)"}[pn]
        L.append(f"\n## {label}\n")
        L.append(f"Predicted {p['predicted_question_count']} questions, actual {p['actual_question_count']} "
                 f"— {'match' if p['count_exact'] else 'MISS'}. "
                 f"Archetype recall {p['recall']:.0%}, precision {p['precision']:.0%}.\n")
        L.append("**Anticipated:** " + (", ".join(f"`{a}`" for a in p["archetypes_hit"]) or "_none_"))
        L.append("\n**Missed:** " + (", ".join(f"`{a}`" for a in p["archetypes_missed"]) or "_none_"))
        L.append("\n**Predicted but absent:** " + (", ".join(f"`{a}`" for a in p["archetypes_spurious"]) or "_none_"))
        L.append(f"\n**Varieties** — hit: {', '.join(p['varieties_hit']) or '_none_'}"
                 f" · missed: {', '.join(p['varieties_missed']) or '_none_'}")
        L.append(f"\n**Countries** — hit: {', '.join(p['countries_hit']) or '_none_'}"
                 f" · missed: {', '.join(p['countries_missed']) or '_none_'}\n")
        L.append("| Q | Archetype | Flight | Varieties | Countries |")
        L.append("| --- | --- | --- | --- | --- |")
        for q in p["questions"]:
            L.append(f"| {q['question']} | `{q['archetype']}` | {q['flight_size']} | "
                     f"{', '.join(q['varieties']) or '—'} | {', '.join(q['countries']) or '—'} |")

    L.append("\n## Caveats\n")
    L.append("- **Variety recall is pessimistic by construction and is the weakest number here.**")
    L.append("  The denominator counts every variety in the paper including individual blend")
    L.append("  components (corvinone, touriga franca, macabeo), while the forecast only ever")
    L.append("  offered three guesses per slot. It was never going to name a Valpolicella")
    L.append("  component grape. Read the archetype and country rows as the real signal.")
    L.append("- Actual varieties/countries are derived from wine names by the canonical")
    L.append("  `run_loyo` extractors, not from `data/wine_research/` (the 2026 wines have no")
    L.append("  research files yet). Three 2026 wines resolve to an unknown variety and are")
    L.append("  therefore absent from the variety row.")
    L.append("- Label recall is pooled per paper, not per question — see the module docstring.")
    L.append("- Structure scoring is unaffected by both caveats: it derives from question text only.")
    return "\n".join(L) + "\n"


def main() -> None:
    r = score()
    OUT_JSON.write_text(json.dumps(r, indent=2, ensure_ascii=False), encoding="utf-8")
    OUT_MD.parent.mkdir(parents=True, exist_ok=True)
    OUT_MD.write_text(render_md(r), encoding="utf-8")
    s = r["summary"]
    print(f"archetype recall  : {s['archetypes_matched']}/{s['actual_questions']} = {s['archetype_recall']:.0%}")
    print(f"archetype precision: {s['archetype_precision']:.0%}")
    print(f"exact counts      : {s['papers_with_exact_count']}/3 papers")
    print(f"variety recall    : {s['variety_recall']:.0%}")
    print(f"country recall    : {s['country_recall']:.0%}")
    print(f"wrote {OUT_MD}")


if __name__ == "__main__":
    main()
