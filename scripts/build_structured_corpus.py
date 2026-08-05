"""
Build a structured analysis corpus from the MW exam source + existing research JSON.

Joins (on wine_id / question id):
  - data/exams.json            (questions: text, wine slots; wines: full_text)
  - data/historical_wine_classification.json (benchmark/role/curveball/maturity/tier)
  - data/quality_price_tier_analysis.json    (price_band, price_band_source)
  - data/wine_research/*.md frontmatter      (vintage, sub_region, appellation, abv,
                                              classification, oak_signature, rs_level,
                                              structural_profile, style_category)
  - outputs/taxonomy_tags/*.md frontmatter   (family, subcategory, secondary_tags)

Derives:
  - variety / country via the canonical run_loyo extractors (same logic the backtest trusts)
  - old_world / new_world from country
  - age_at_exam = exam_year - vintage
  - parsed mark tokens, flight size, total marks, per-sub-question marks + heuristic type

Emits (data/structured/):
  - corpus_wines.json
  - corpus_questions.json
  - corpus_subquestions.json
  - corpus_summary.json   (quick distributions for sanity-checking)

No LLM calls. Pure deterministic aggregation. Re-run any time the source changes.
"""

import io
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

# Reuse the canonical, backtest-trusted extractors.
from run_loyo import (
    extract_variety_from_text,
    extract_country_from_text,
    extract_subregion_from_text,
)
from score_predictions import _load_appellation_lookup

_load_appellation_lookup()

OUT_DIR = ROOT / "data" / "structured"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Years the exam was actually sat. 2020 was not held.
SAT_YEARS = [2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2021, 2022, 2023, 2024, 2025, 2026]
# The primary analysis window: every sat year from 2015 on. Was the 10 most-recent
# papers (2015-2025); adding 2026 widened it to 11 rather than dropping 2015, so
# earlier backtest/LOYO/taxonomy artifacts stay directly comparable.
RECENT_YEARS = [2015, 2016, 2017, 2018, 2019, 2021, 2022, 2023, 2024, 2025, 2026]

OLD_WORLD = {
    "France", "Italy", "Spain", "Germany", "Portugal", "Austria", "Hungary",
    "Greece", "England", "Georgia", "Switzerland", "Slovenia", "Croatia",
    "Romania", "Bulgaria", "Moldova", "Lebanon",
}
NEW_WORLD = {
    "Australia", "New Zealand", "USA", "South Africa", "Argentina", "Chile",
    "Canada", "Uruguay", "Brazil", "Mexico", "China", "India", "Japan",
}


def load_json(rel):
    return json.load(io.open(ROOT / rel, encoding="utf-8"))


# ---------------------------------------------------------------------------
# Minimal YAML-frontmatter parser (scalars + simple [a, b] lists only).
# ---------------------------------------------------------------------------
def parse_frontmatter(path):
    text = io.open(path, encoding="utf-8").read()
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n", text, re.DOTALL)
    if not m:
        return {}
    out = {}
    for line in m.group(1).splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if ":" not in line:
            continue
        key, _, val = line.partition(":")
        key = key.strip()
        val = val.strip()
        if val.startswith("[") and val.endswith("]"):
            inner = val[1:-1].strip()
            out[key] = [v.strip() for v in inner.split(",") if v.strip()] if inner else []
        else:
            out[key] = val.strip().strip('"').strip("'") or None
    return out


def to_int(v):
    if v is None:
        return None
    m = re.search(r"\d{4}", str(v))
    return int(m.group(0)) if m else None


def to_float(v):
    if v is None:
        return None
    m = re.search(r"\d+(?:\.\d+)?", str(v))
    return float(m.group(0)) if m else None


def world_of(country):
    if country in OLD_WORLD:
        return "old_world"
    if country in NEW_WORLD:
        return "new_world"
    return "unknown"


# ---------------------------------------------------------------------------
# Mark + sub-question parsing.
# ---------------------------------------------------------------------------
MARK_TOKEN = re.compile(r"\(\s*(?:(\d+)\s*[x×]\s*)?(\d+)\s*marks?\s*\)", re.IGNORECASE)
SUBQ_SPLIT = re.compile(r"(?m)^\s*([a-h])\)\s*")


def parse_mark_tokens(text):
    """Return (total_marks, [{'count':n,'each':m,'sum':n*m}, ...])."""
    tokens = []
    total = 0
    for mtch in MARK_TOKEN.finditer(text):
        count = int(mtch.group(1)) if mtch.group(1) else 1
        each = int(mtch.group(2))
        tokens.append({"count": count, "each": each, "sum": count * each})
        total += count * each
    return total, tokens


# Heuristic sub-question type classifier (keyword priority order).
# NB: patterns are word-START stems (\b prefix only); no trailing \b, so inflected
# forms like "winemaking"/"maturity"/"acidity" still match.
TYPE_RULES = [
    ("variety_id", r"\bgrape\b|\bvariet(y|ies)|\bgrapes\b"),
    ("vintage_id", r"\bvintage"),
    ("origin_id", r"\borigin|\bregion|\bcountr|\bappellation|\bprovenance|\bgeograph"),
    ("maturity", r"\bmaturit|\bageing|\baging|\bcellar|\bdrink|\bdevelopmen|\bevolv|\bhow (much )?longer|\bhold\b|\bready\b"),
    ("commercial", r"\bcommercial|\bmarket|\bprice|\bsell|\bpositioning|\bconsumer|\bretail|\bwho would buy|\bbuy this|\bbuy these|\bsales\b"),
    ("quality", r"\bquality|\bstandard|\bfinesse|\bmerit"),
    ("winemaking", r"\bwinemak|\bvinif|\bproduction\b|\bproduced\b|\bmade\b|\bmethod|\boak\b|\bmaturation|\bfermentat|\belevage|\blees\b|\bmalolactic|\btechnique"),
    ("style", r"\bstyle|\btypicity"),
    ("sweetness_rs", r"\bresidual sugar|\bsweetness|\brs\b|\bsugar"),
    ("structure", r"\bstructure|\btannin|\bacidit|\balcohol|\bbody\b|\bbalance"),
    ("comparative", r"\bcompare|\bcontrast|\bdiffer|\bsimilar"),
]


def classify_subq(text):
    low = text.lower()
    hits = [name for name, pat in TYPE_RULES if re.search(pat, low)]
    primary = hits[0] if hits else "other"
    return primary, hits


def split_subquestions(text):
    """Split a question's text into labelled sub-parts with their mark tokens."""
    parts = []
    matches = list(SUBQ_SPLIT.finditer(text))
    if not matches:
        # No a)/b) structure: treat whole stem as one part.
        total, tokens = parse_mark_tokens(text)
        ptype, hits = classify_subq(text)
        return [{
            "label": None, "text": text.strip(), "marks_each": None,
            "marks_count": None, "marks_sum": total, "type": ptype, "type_hits": hits,
        }]
    for i, mtch in enumerate(matches):
        label = mtch.group(1)
        start = mtch.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        body = text[start:end].strip()
        total, tokens = parse_mark_tokens(body)
        # Prefer the LAST mark token on the sub-question line as "its" tariff.
        each = tokens[-1]["each"] if tokens else None
        count = tokens[-1]["count"] if tokens else None
        ptype, hits = classify_subq(body)
        parts.append({
            "label": label, "text": body, "marks_each": each,
            "marks_count": count, "marks_sum": total, "type": ptype, "type_hits": hits,
        })
    return parts


# ---------------------------------------------------------------------------
# Build.
# ---------------------------------------------------------------------------
def main():
    exams = load_json("data/exams.json")
    classif = {r["wine_id"]: r for r in load_json("data/historical_wine_classification.json")}
    price = {r["wine_id"]: r for r in load_json("data/quality_price_tier_analysis.json")["records"]}

    # taxonomy tags by (year,paper,question)
    tax = {}
    for p in (ROOT / "outputs" / "taxonomy_tags").glob("*.md"):
        fm = parse_frontmatter(p)
        if fm.get("year") and fm.get("paper") and fm.get("question"):
            key = (int(to_int(fm["year"])), int(to_float(fm["paper"])), int(to_float(fm["question"])))
            tax[key] = {
                "family": fm.get("family"),
                "subcategory": fm.get("subcategory"),
                "secondary_tags": fm.get("secondary_tags") or [],
            }

    # wine_research frontmatter by wine_id
    research = {}
    for p in (ROOT / "data" / "wine_research").glob("*.md"):
        fm = parse_frontmatter(p)
        wid = fm.get("wine_id") or p.stem
        research[wid] = fm

    wines_out = []
    questions_out = []
    subq_out = []

    for yblock in exams:
        year = yblock["year"]
        for pblock in yblock["papers"]:
            paper = pblock["paper"]
            wine_lookup = {w["slot"]: w for w in pblock["wines"]}

            # --- wines ---
            for w in pblock["wines"]:
                slot = w["slot"]
                ft = w["full_text"]
                wid = f"{year}_p{paper}_w{slot}"
                c = classif.get(wid, {})
                rs = research.get(wid, {})
                country = c.get("country") or extract_country_from_text(ft)
                vintage = to_int(rs.get("vintage")) or to_int(ft)
                wines_out.append({
                    "wine_id": wid,
                    "year": year, "paper": paper, "slot": slot,
                    "is_recent_window": year in RECENT_YEARS,
                    "full_text": ft,
                    "producer": c.get("producer"),
                    "wine_name": c.get("wine_name"),
                    "variety": extract_variety_from_text(ft),
                    "country": country,
                    "world": world_of(country),
                    "region": c.get("region") or extract_subregion_from_text(ft),
                    "sub_region": rs.get("sub_region"),
                    "appellation": rs.get("appellation"),
                    "vintage": vintage,
                    "age_at_exam": (year - vintage) if vintage else None,
                    "abv": to_float(rs.get("abv")),
                    "classification": rs.get("classification"),
                    "style_category": c.get("style_category") or rs.get("style_category"),
                    "oak_signature": rs.get("oak_signature"),
                    "rs_level": rs.get("rs_level"),
                    "structural_profile": rs.get("structural_profile"),
                    "benchmark_status": c.get("benchmark_status"),
                    "question_role": c.get("question_role"),
                    "curveball_level": c.get("curveball_level"),
                    "commercial_tier": c.get("commercial_tier"),
                    "maturity_role": c.get("maturity_role"),
                    "price_band": price.get(wid, {}).get("price_band"),
                    "price_band_source": price.get(wid, {}).get("price_band_source"),
                })

            # --- questions + sub-questions ---
            for q in pblock["questions"]:
                n = q["n"]
                qid = f"{year}_p{paper}_q{n}"
                slots = q["wines"]
                flight = len(slots)
                text = q["text"]
                total, tokens = parse_mark_tokens(text)
                t = tax.get((year, paper, n), {})
                subs = split_subquestions(text)
                questions_out.append({
                    "qid": qid,
                    "year": year, "paper": paper, "n": n,
                    "is_recent_window": year in RECENT_YEARS,
                    "flight_size": flight,
                    "wine_slots": slots,
                    "wine_ids": [f"{year}_p{paper}_w{s}" for s in slots],
                    "total_marks": total,
                    "expected_marks": flight * 25,
                    "marks_ok": total == flight * 25,
                    "mark_tokens": tokens,
                    "n_subquestions": len(subs),
                    "family": t.get("family"),
                    "subcategory": t.get("subcategory"),
                    "secondary_tags": t.get("secondary_tags", []),
                    "text": text,
                })
                # A question can restart its lettering: 2026 P3 Q2 runs "For each pair:
                # a) b) c)" and then "For each wine: a) b)", so the raw label is not
                # unique within the question and {qid}_{label} collides. corpus.subquestions
                # keys on subq_id, so a collision is a hard primary-key failure on sync.
                # Suffix the 2nd+ occurrence of a label (a, a2, a3 ...) — this leaves every
                # already-unique id byte-identical and only disambiguates real repeats.
                seen_labels = Counter()
                for idx, s in enumerate(subs):
                    base = s["label"] or str(idx)
                    seen_labels[base] += 1
                    suffix = "" if seen_labels[base] == 1 else str(seen_labels[base])
                    subq_out.append({
                        "subq_id": f"{qid}_{base}{suffix}",
                        "qid": qid,
                        "year": year, "paper": paper, "n": n,
                        "is_recent_window": year in RECENT_YEARS,
                        "flight_size": flight,
                        "label": s["label"],
                        "type": s["type"],
                        "type_hits": s["type_hits"],
                        "marks_each": s["marks_each"],
                        "marks_count": s["marks_count"],
                        "marks_sum": s["marks_sum"],
                        "marks_pct_of_question": round(100 * s["marks_sum"] / total, 1) if total else None,
                        "text": s["text"],
                    })

    # --- write ---
    (OUT_DIR / "corpus_wines.json").write_text(
        json.dumps(wines_out, ensure_ascii=False, indent=2), encoding="utf-8")
    (OUT_DIR / "corpus_questions.json").write_text(
        json.dumps(questions_out, ensure_ascii=False, indent=2), encoding="utf-8")
    (OUT_DIR / "corpus_subquestions.json").write_text(
        json.dumps(subq_out, ensure_ascii=False, indent=2), encoding="utf-8")

    # --- summary for sanity-checking ---
    def dist(rows, key, filt=None):
        return dict(Counter(r[key] for r in rows if (filt is None or filt(r)) and r.get(key) is not None).most_common())

    recent_w = [w for w in wines_out if w["is_recent_window"]]
    recent_q = [q for q in questions_out if q["is_recent_window"]]
    recent_s = [s for s in subq_out if s["is_recent_window"]]
    summary = {
        "counts": {
            "wines_total": len(wines_out), "wines_recent": len(recent_w),
            "questions_total": len(questions_out), "questions_recent": len(recent_q),
            "subquestions_total": len(subq_out), "subquestions_recent": len(recent_s),
        },
        "marks_ok_rate_all": round(sum(q["marks_ok"] for q in questions_out) / len(questions_out), 3),
        "marks_ok_rate_recent": round(sum(q["marks_ok"] for q in recent_q) / len(recent_q), 3),
        "marks_not_ok_questions": [q["qid"] for q in questions_out if not q["marks_ok"]],
        "world_dist_recent": dist(recent_w, "world"),
        "variety_unknown_recent": sum(1 for w in recent_w if w["variety"] == "Unknown"),
        "vintage_missing_recent": sum(1 for w in recent_w if w["vintage"] is None),
        "price_band_dist_recent": dist(recent_w, "price_band"),
        "curveball_dist_recent": dist(recent_w, "curveball_level"),
        "flight_size_dist_recent": dist(recent_q, "flight_size"),
        "family_dist_recent": dist(recent_q, "family"),
        "subq_type_dist_recent": dist(recent_s, "type"),
        "subq_type_other_examples": [s["text"][:90] for s in recent_s if s["type"] == "other"][:8],
        "subq_multilabel_recent": dict(
            Counter(h for s in recent_s for h in s["type_hits"]).most_common()),
    }

    # Identification's share of marks per year (focus #5: the post-2014 shift).
    ID_TYPES = {"variety_id", "origin_id", "vintage_id"}
    id_share = {}
    for yr in SAT_YEARS:
        yr_subs = [s for s in subq_out if s["year"] == yr and s["marks_sum"]]
        tot = sum(s["marks_sum"] for s in yr_subs)
        idm = sum(s["marks_sum"] for s in yr_subs if set(s["type_hits"]) & ID_TYPES)
        qual = sum(s["marks_sum"] for s in yr_subs if "quality" in s["type_hits"])
        comm = sum(s["marks_sum"] for s in yr_subs if "commercial" in s["type_hits"])
        if tot:
            id_share[yr] = {
                "id_pct": round(100 * idm / tot, 1),
                "quality_pct": round(100 * qual / tot, 1),
                "commercial_pct": round(100 * comm / tot, 1),
                "total_marks": tot,
            }
    summary["id_share_by_year"] = id_share
    (OUT_DIR / "corpus_summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
