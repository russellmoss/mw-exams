"""Build and validate the Theory rubric temporal classification.

Every examiner-derived required element is classified before it can reach the live grader:

* evergreen   -- structural or stable-science demand; applies unchanged
* year_bound  -- tied to the exam-year world; applies, with a current-reality substitute allowed
* superseded  -- reality has removed the demand; excused only with a tier-1 source

The conservative seed uses the already-reviewed time-sensitive claim ledger and explicit temporal
language in the question/requirement. Six-month system decisions live in
rubric_temporal_overrides.json. The
builder is intentionally the only route to rubric_temporal.json: it verifies full requirement
coverage and hard-fails an uncited `superseded` classification.

Usage:
    python scripts/build_rubric_temporal.py
    python scripts/build_rubric_temporal.py --check
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
THEORY_DIR = ROOT / "data" / "theory"
RUBRICS_PATH = THEORY_DIR / "theory_rubrics.json"
CLAIMS_PATH = THEORY_DIR / "claim_verification.json"
OVERRIDES_PATH = THEORY_DIR / "rubric_temporal_overrides.json"
OUT_PATH = THEORY_DIR / "rubric_temporal.json"

VALID_CLASSES = {"evergreen", "year_bound", "superseded"}
OFFICIAL_HOSTS = {
    "oiv.int",
    "ec.europa.eu",
    "eur-lex.europa.eu",
    "ttb.gov",
    "gov.uk",
    "who.int",
    "iarc.who.int",
    "inao.gouv.fr",
    "champagne.fr",
    "sherry.wine",
    "ivdp.pt",
    "riojawine.com",
    "wineaustralia.com",
    "nzwine.com",
    "wosa.co.za",
    "awri.com.au",
    "ives-openscience.eu",
    "inrae.fr",
    "eurostat.ec.europa.eu",
    "usda.gov",
}

# These words make a requirement or its question materially dependent on the world at the time.
# The time-sensitive claim ledger remains the stronger seed; this catches forecast/current-market
# questions whose model answer happens not to contain a registered figure.
TEMPORAL_LANGUAGE = re.compile(
    r"\b(?:current(?:ly)?|today(?:'s)?|recent|future|next\s+(?:five|ten|\d+)|coming\s+decades?|"
    r"long[- ]term\s+outlook|trend|market\s+share|sales|consumption|ownership|regulat(?:ion|ory)|"
    r"legislation|government\s+guidelines?|policy|social\s+media|artificial\s+intelligence|AI|"
    r"profit(?:ability)?|operating\s+margin|price|costs?|technology|mandatory|growth|decline)\b",
    re.IGNORECASE,
)


class TemporalBuildError(ValueError):
    """Raised when temporal data could silently change the grading standard."""


def _read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def _host_is_tier_one(host: str) -> bool:
    host = host.lower().split(":", 1)[0]
    return (
        host in OFFICIAL_HOSTS
        or any(host.endswith("." + allowed) for allowed in OFFICIAL_HOSTS)
        or host.endswith(".gov")
        or host.endswith(".gov.au")
        or host.endswith(".govt.nz")
        or host.endswith(".edu")
        or host.endswith(".ac.uk")
    )


def validate_superseded_source(source: object, label: str) -> None:
    if not isinstance(source, dict):
        raise TemporalBuildError(f"{label}: superseded requires a tier-1 source")
    if source.get("tier") != 1:
        raise TemporalBuildError(f"{label}: superseded source tier must be 1")
    for field in ("publisher", "title", "url", "published_at", "quote"):
        if not isinstance(source.get(field), str) or not source[field].strip():
            raise TemporalBuildError(f"{label}: superseded source missing {field}")
    parsed = urlparse(source["url"])
    if parsed.scheme != "https" or not parsed.hostname or not _host_is_tier_one(parsed.hostname):
        raise TemporalBuildError(
            f"{label}: superseded source must use an allowlisted tier-1 HTTPS domain"
        )


def validate_temporal_data(rubrics: list[dict], data: dict) -> None:
    questions = data.get("questions")
    if not isinstance(questions, list):
        raise TemporalBuildError("questions must be a list")
    by_id = {q.get("id"): q for q in questions if isinstance(q, dict)}
    if len(by_id) != len(questions):
        raise TemporalBuildError("duplicate or missing question id in temporal data")
    if set(by_id) != {r["id"] for r in rubrics}:
        missing = sorted({r["id"] for r in rubrics} - set(by_id))
        extra = sorted(set(by_id) - {r["id"] for r in rubrics})
        raise TemporalBuildError(
            f"temporal question coverage mismatch; missing={missing[:5]}, extra={extra[:5]}"
        )

    for rubric in rubrics:
        qid = rubric["id"]
        temporal = by_id[qid]
        if not isinstance(temporal.get("ex_ante"), bool):
            raise TemporalBuildError(f"{qid}: ex_ante must be boolean")
        requirements = temporal.get("requirements")
        expected = rubric.get("required_elements") or []
        if not isinstance(requirements, list) or len(requirements) != len(expected):
            raise TemporalBuildError(
                f"{qid}: {len(requirements or [])} temporal requirements for {len(expected)} rubric requirements"
            )
        for index, (actual, rubric_req) in enumerate(zip(requirements, expected)):
            label = f"{qid} requirement {index}"
            if actual.get("index") != index or actual.get("element") != rubric_req.get("element"):
                raise TemporalBuildError(f"{label}: identity drifted from theory_rubrics.json")
            if actual.get("weight") != rubric_req.get("weight"):
                raise TemporalBuildError(f"{label}: weight drifted from theory_rubrics.json")
            temporal_class = actual.get("temporal_class")
            if temporal_class not in VALID_CLASSES:
                raise TemporalBuildError(f"{label}: invalid class {temporal_class!r}")
            if temporal_class == "superseded":
                validate_superseded_source(actual.get("source"), label)


def requirement_id(question_id: str, index: int, element: str) -> str:
    digest = hashlib.sha256(element.encode("utf-8")).hexdigest()[:10]
    return f"{question_id}#r{index}-{digest}"


def build_temporal_data(
    rubrics: list[dict], claim_ledger: dict, overrides: dict
) -> dict:
    time_sensitive_by_answer: dict[str, list[str]] = {}
    for claim in claim_ledger.get("rows", []):
        if claim.get("time_sensitive"):
            time_sensitive_by_answer.setdefault(claim["answer_id"], []).append(claim["claim_id"])

    ex_ante_ids = set(overrides.get("ex_ante", []))
    unknown_ex_ante = ex_ante_ids - {r["id"] for r in rubrics}
    if unknown_ex_ante:
        raise TemporalBuildError(f"unknown ex_ante ids: {sorted(unknown_ex_ante)}")
    requirement_overrides = overrides.get("requirements", {})
    if not isinstance(requirement_overrides, dict):
        raise TemporalBuildError("requirements overrides must be an object")

    used_overrides: set[str] = set()
    questions: list[dict] = []
    for rubric in rubrics:
        qid = rubric["id"]
        claim_ids = sorted(time_sensitive_by_answer.get(qid, []))
        ex_ante = qid in ex_ante_ids
        rows = []
        for index, req in enumerate(rubric.get("required_elements") or []):
            key = f"{qid}#r{index}"
            override = requirement_overrides.get(key)
            if override is not None:
                if not isinstance(override, dict):
                    raise TemporalBuildError(f"{key}: override must be an object")
                used_overrides.add(key)
                temporal_class = override.get("temporal_class")
                rationale = override.get("rationale", "Automated six-month temporal review.")
            elif ex_ante:
                temporal_class = "year_bound"
                rationale = "Forecast demand: judge the candidate's exam-year reasoning, not hindsight."
            elif claim_ids:
                temporal_class = "year_bound"
                rationale = (
                    "The linked model answer contains pre-verified time-sensitive claims; the demand "
                    "still applies, but current-reality evidence may discharge it."
                )
            elif TEMPORAL_LANGUAGE.search(f"{rubric.get('question_text', '')} {req.get('element', '')}"):
                temporal_class = "year_bound"
                rationale = (
                    "The question or requirement explicitly depends on a changing market, policy, "
                    "technology, or future state."
                )
            else:
                temporal_class = "evergreen"
                rationale = "Structural or stable subject-matter demand; applies unchanged."

            row = {
                "id": requirement_id(qid, index, req["element"]),
                "index": index,
                "element": req["element"],
                "weight": req["weight"],
                "temporal_class": temporal_class,
                "rationale": rationale,
            }
            if override and override.get("source") is not None:
                row["source"] = override["source"]
            rows.append(row)

        questions.append(
            {
                "id": qid,
                "year": rubric["year"],
                "paper": rubric["paper"],
                "question": rubric["question"],
                "ex_ante": ex_ante,
                "time_sensitive_claims": claim_ids,
                "requirements": rows,
            }
        )

    unused = set(requirement_overrides) - used_overrides
    if unused:
        raise TemporalBuildError(f"unused requirement override(s): {sorted(unused)}")

    return {
        "schema_version": 1,
        "as_of": overrides.get("as_of"),
        "refresh": overrides.get(
            "refresh",
            {
                "owner": "automated_system",
                "cadence": "P6M",
                "status": "scheduled",
            },
        ),
        "classes": {
            "evergreen": "applies in full",
            "year_bound": "applies; a current-reality substitute is accepted",
            "superseded": "excused only because a cited tier-1 source proves the world changed",
        },
        "questions": questions,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="validate the committed output only")
    args = parser.parse_args()

    rubrics = _read_json(RUBRICS_PATH)
    if args.check:
        data = _read_json(OUT_PATH)
    else:
        data = build_temporal_data(rubrics, _read_json(CLAIMS_PATH), _read_json(OVERRIDES_PATH))
    validate_temporal_data(rubrics, data)

    if not args.check:
        OUT_PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    counts = {name: 0 for name in sorted(VALID_CLASSES)}
    for question in data["questions"]:
        for requirement in question["requirements"]:
            counts[requirement["temporal_class"]] += 1
    ex_ante = sum(1 for q in data["questions"] if q["ex_ante"])
    print(
        f"PASS: {len(data['questions'])} rubrics / {sum(counts.values())} requirements classified "
        f"({', '.join(f'{k}={v}' for k, v in counts.items())}); ex_ante={ex_ante}"
    )


if __name__ == "__main__":
    main()
