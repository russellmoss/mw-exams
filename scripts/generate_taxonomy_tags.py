from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
EXAMS_PATH = ROOT / "data" / "exams.json"
OUT_DIR = ROOT / "outputs" / "taxonomy_tags"
INDEX_PATH = ROOT / "outputs" / "heuristics" / "question_taxonomy_index.md"
GENERATED_DATE = "2026-05-25"


FAMILY_NAMES = {
    "F1": "Same Variety Comparative Set",
    "F2": "Same Origin Comparative Set",
    "F3": "Blend / Composition Logic Set",
    "F4": "Mixed Identification Breadth Set",
    "F5": "Method / Production Dominant Set",
    "F6": "Style Mechanism Comparative Set",
    "F7": "Hierarchy / Quality Calibration Set",
    "F8": "Examiner Curveball / Boundary Set",
}


SUBCATEGORY_NAMES = {
    "F1a": "same variety, same country",
    "F1b": "same variety, different countries",
    "F1c": "same variety, same region or producer context",
    "F1d": "same variety across different styles/categories",
    "F2a": "same country, different varieties",
    "F2b": "same region, different varieties or styles",
    "F2c": "same producer / hierarchy / classification within one origin",
    "F2d": "same origin, different sweetness / age / elevage expressions",
    "F3a": "same blend family, different origins",
    "F3b": "same origin, different blend composition",
    "F3c": "compare varietal roles within blends",
    "F3d": "blend vs varietal-expression contrast",
    "F4a": "all wines independent",
    "F4b": "partly linked set with one local pair",
    "F4c": "broad survey with one hidden organizing theme",
    "F5a": "sparkling-method comparison",
    "F5b": "oxidative vs reductive / elevage comparison",
    "F5c": "fortification / maturation mechanism comparison",
    "F5d": "sweetness-production mechanism comparison",
    "F5e": "human inputs vs natural factors",
    "F5f": "general winemaking / style-commercial analysis",
    "F6a": "sweetness / residual sugar axis",
    "F6b": "alcohol / ripeness axis",
    "F6c": "tannin / extraction / body axis",
    "F6d": "maturity / development axis",
    "F6e": "quality / commercial position axis",
    "F6f": "climate / site expression axis",
    "F7a": "classification ladder",
    "F7b": "producer / cuvee hierarchy",
    "F7c": "premium vs commercial tier",
    "F7d": "age / maturity hierarchy",
    "F8a": "atypical style within paper",
    "F8b": "obscure variety / origin",
    "F8c": "classic wine in non-classic expression",
    "F8d": "deceptive analogue / masquerader",
}


PAPER_LABELS = {1: "P1", 2: "P2", 3: "P3"}


@dataclass
class Tag:
    question_id: str
    year: int
    paper: int
    question: int
    family: str
    subcategory: str
    secondary_tags: list[str]
    stem_signals: list[str]
    wine_count: int
    linked_groups: str
    mark_emphasis: str
    curveball_risk: str
    why: str
    rejected: list[str]
    text: str


OVERRIDES = {
    "2025_p1_q4": ("F5", "F5e"),
    "2025_p2_q3": ("F4", "F4c"),
    "2025_p3_q3": ("F7", "F7a"),
    "2024_p3_q1": ("F5", "F5a"),
    "2024_p3_q4": ("F6", "F6a"),
    "2023_p3_q1": ("F5", "F5a"),
    "2023_p3_q2": ("F5", "F5d"),
    "2023_p3_q4": ("F1", "F1d"),
    "2022_p2_q1": ("F3", "F3d"),
    "2022_p3_q2": ("F5", "F5d"),
    "2021_p2_q1": ("F7", "F7d"),
    "2021_p3_q2": ("F5", "F5d"),
    "2019_p2_q1": ("F3", "F3c"),
    "2019_p2_q3": ("F4", "F4c"),
    "2019_p3_q4": ("F5", "F5c"),
    "2019_p3_q5": ("F6", "F6a"),
    "2018_p3_q1": ("F7", "F7b"),
    "2018_p3_q3": ("F4", "F4c"),
    "2017_p3_q3": ("F6", "F6a"),
    "2017_p3_q6": ("F5", "F5c"),
    "2016_p3_q1": ("F1", "F1d"),
    "2016_p3_q2": ("F5", "F5c"),
    "2016_p3_q4": ("F7", "F7b"),
    "2015_p3_q1": ("F5", "F5b"),
    "2015_p3_q3": ("F6", "F6a"),
}


def normalize(text: str) -> str:
    return " ".join(text.lower().replace("’", "'").replace("–", "-").split())


def extract_mark_emphasis(text: str) -> str:
    scores = Counter()
    lowered = text.lower()
    mark_patterns = {
        "origin": r"identify (?:the )?(?:origin|region|country|sub-region|sub-region|specific origin)",
        "variety": r"identify (?:the )?(?:grape variety|grape variety/ies|primary grape variety|predominant grape variety|varieties)",
        "method": r"(?:method of production|winemaking|production methods|key winemaking techniques|human inputs versus natural factors)",
        "quality": r"(?:quality|commercial position|commercial appeal|market position|market potential)",
        "maturity": r"(?:maturity|capacity to age|potential to improve|drinking window|vintage|ageing potential)",
        "structure": r"(?:residual sugar|alcohol level|acidity|texture|style)",
    }
    for key, pattern in mark_patterns.items():
        scores[key] = len(re.findall(pattern, lowered))
    ordered = [k for k, v in scores.most_common() if v > 0]
    return ", ".join(ordered[:3]) if ordered else "mixed"


def linked_groups(text: str) -> str:
    lowered = text.lower()
    if "pair" in lowered or "pairs" in lowered:
        return "paired structure"
    if "same producer" in lowered:
        return "producer-linked set"
    if "same country" in lowered or "same region" in lowered:
        return "shared-origin set"
    if "mixed bag" in lowered:
        return "independent set"
    return "no explicit grouping beyond question stem"


def secondary_tags(text: str, paper: int, family: str, subcategory: str) -> list[str]:
    lowered = text.lower()
    tags: list[str] = []
    if "grape variety" in lowered or "varieties" in lowered:
        tags.append("variety-led")
    if "origin" in lowered or "region" in lowered or "country" in lowered:
        tags.append("origin-led")
    if any(k in lowered for k in ["winemaking", "method of production", "production methods", "oak", "yeast"]):
        tags.append("method-led")
    if any(k in lowered for k in ["residual sugar", "alcohol level", "acidity", "texture", "style"]):
        tags.append("structure-led")
    if any(k in lowered for k in ["quality", "commercial", "market"]):
        tags.append("quality-led")
    if any(k in lowered for k in ["maturity", "vintage", "ageing", "drinking window", "capacity to age"]):
        tags.append("maturity-led")
    if "same country" in lowered:
        tags.append("same-country")
    if "same region" in lowered:
        tags.append("same-region")
    if "same producer" in lowered:
        tags.append("same-producer")
    if "same vintage" in lowered:
        tags.append("same-vintage")
    if "single grape variety" in lowered or "same grape variety" in lowered or "common grape variety" in lowered:
        tags.append("single-variety")
    if "blend" in lowered or "bordeaux varieties" in lowered:
        tags.append("blend")
    if paper == 3:
        tags.append("mixed-styles")
    if "sparkling" in lowered:
        tags.append("sparkling")
    if "residual sugar" in lowered:
        tags.append("sweet")
    if "fortified" in lowered:
        tags.append("fortified")
    if "oak" in lowered:
        tags.append("oak-driven")
    if "climate" in lowered:
        tags.append("climate-comparison")
    if "human inputs versus natural factors" in lowered:
        tags.append("human-vs-natural")
    if "mixed bag" in lowered:
        tags.append("breadth-test")
    if family == "F4":
        tags.append("breadth-test")
    if family == "F8" or "neither of the wines are from champagne" in lowered or "unknown origin" in lowered:
        tags.append("curveball")
    if paper == 3 and any(k in lowered for k in ["same single grape variety", "same grape variety"]) and "sparkling" not in lowered:
        tags.append("trap-on-paper-context")
    deduped = []
    for tag in tags:
        if tag not in deduped:
            deduped.append(tag)
    return deduped


def build_stem_signals(text: str, paper: int) -> list[str]:
    lowered = text.lower()
    signals = [f"Paper context = {PAPER_LABELS[paper]}"]
    patterns = [
        ("same single grape variety", "shared single-variety constraint"),
        ("same grape variety", "shared same-variety constraint"),
        ("common grape variety", "one common grape family across the set"),
        ("same country", "shared country anchor"),
        ("same region", "shared region anchor"),
        ("same producer", "shared producer anchor"),
        ("same vintage", "shared vintage anchor"),
        ("blends", "blend composition is explicit"),
        ("bordeaux varieties", "blend-family logic rather than one exact variety"),
        ("mixed bag", "no strong linking stem constraint"),
        ("different methods of production", "production method is the main comparative axis"),
        ("residual sugar", "sweetness/alcohol measurement is explicit"),
        ("fortified", "fortification is explicit"),
        ("sparkling", "sparkling category is explicit"),
        ("human inputs versus natural factors", "human-vs-natural framing dominates"),
        ("commercial", "commercial positioning is explicitly examined"),
        ("maturity", "maturity / ageability is explicitly examined"),
    ]
    for needle, label in patterns:
        if needle in lowered:
            signals.append(label)
    return signals


def classify(text: str, question_id: str, paper: int) -> tuple[str, str]:
    lowered = normalize(text)
    if question_id in OVERRIDES:
        return OVERRIDES[question_id]

    # Stem-driven guardrails:
    # - Do not use F8 unless the stem itself explicitly frames the task as a trap/boundary case.
    # - Do not use narrow F5 subtypes unless the stem names that axis directly.
    if any(k in lowered for k in [
        "neither of the wines are from champagne",
        "not from champagne",
        "atypical style",
        "unusual style",
        "obscure variety",
        "unknown to most consumers",
    ]):
        return "F8", "F8d"
    if "human inputs versus natural factors" in lowered:
        return "F5", "F5e"
    if "residual sugar" in lowered and "alcohol" in lowered:
        return "F6", "F6a"
    if "different methods of production" in lowered:
        return "F5", "F5d"
    if "fortified" in lowered:
        return "F5", "F5c"
    if "sparkling wines, neither" in lowered or "traditional method sparkling" in lowered:
        return "F5", "F5a"
    if "blend" in lowered or "bordeaux varieties" in lowered:
        if "same country" in lowered or "same region" in lowered:
            return "F3", "F3b"
        if "wine 4 is a blend" in lowered:
            return "F3", "F3d"
        return "F3", "F3a"
    if "same producer" in lowered or ("same vintage" in lowered and "same region" in lowered):
        if "different vintage" in lowered or "vintage" in lowered:
            return "F7", "F7d"
        return "F7", "F7b"
    if ("same single grape variety" in lowered or "same grape variety" in lowered or "common grape variety" in lowered
            or "made from pinot noir" in lowered or "same single variety" in lowered):
        if paper == 3:
            return "F1", "F1d"
        if "same region" in lowered or "same producer" in lowered:
            return "F1", "F1c"
        if "different countries" in lowered or "different country" in lowered:
            return "F1", "F1b"
        if "same country" in lowered:
            return "F1", "F1a"
        return "F1", "F1b"
    if "same country" in lowered:
        if "same region" in lowered or "same producer" in lowered:
            return "F2", "F2c"
        return "F2", "F2a"
    if "same region" in lowered:
        if any(k in lowered for k in ["residual sugar", "oxidative", "style", "maturity"]):
            return "F2", "F2d"
        return "F2", "F2b"
    if any(k in lowered for k in ["classic western european origins", "classic european origins"]):
        return "F4", "F4c"
    if "mixed bag" in lowered:
        return "F4", "F4a"
    if any(k in lowered for k in ["different countries", "different country", "different grape varieties", "different single grape varieties"]):
        if "rhone valley" in lowered or "closely associated with their origin" in lowered:
            return "F4", "F4c"
        if "pair" in lowered or "pairs" in lowered:
            return "F4", "F4b"
        return "F4", "F4a"
    if (
        (
            "do not spend time thinking about" in lowered
            or "unknown origin" in lowered
            or "highlight the key winemaking techniques" in lowered
        )
        and any(k in lowered for k in [
            "winemaking",
            "method of production",
            "production methods",
            "key winemaking techniques",
        ])
        and any(k in lowered for k in [
            "style",
            "quality",
            "commercial",
            "market",
        ])
    ):
        return "F5", "F5f"
    return "F4", "F4a"


def build_why(family: str, subcategory: str, signals: list[str], text: str) -> str:
    main = FAMILY_NAMES[family]
    sub = SUBCATEGORY_NAMES[subcategory]
    sig = "; ".join(signals[1:4]) if len(signals) > 1 else "paper context only"
    return (
        f"The dominant strategic problem here is `{main}` because the stem primarily sets up "
        f"`{sub}` rather than a free-form identification task. The strongest cues are: {sig}."
    )


def build_rejected(family: str, text: str) -> list[str]:
    lowered = text.lower()
    candidates = []
    if family != "F1" and "grape variety" in lowered:
        candidates.append("`F1 Same Variety Comparative Set`: rejected because variety ID is present, but not the main organizing constraint.")
    if family != "F2" and ("same country" in lowered or "same region" in lowered):
        candidates.append("`F2 Same Origin Comparative Set`: rejected because shared origin exists, but another logic dominates the task.")
    if family != "F3" and "blend" in lowered:
        candidates.append("`F3 Blend / Composition Logic Set`: rejected because blend language is present, but composition is not the main comparative problem.")
    if family != "F4" and any(k in lowered for k in ["different countries", "mixed bag", "different grape varieties"]):
        candidates.append("`F4 Mixed Identification Breadth Set`: rejected because the set has breadth, but a stronger organizing axis is stated.")
    if family != "F5" and any(k in lowered for k in ["winemaking", "method of production", "human inputs versus natural factors"]):
        candidates.append("`F5 Method / Production Dominant Set`: rejected because production matters, but it does not define the whole question.")
    if family != "F6" and "residual sugar" in lowered:
        candidates.append("`F6 Style Mechanism Comparative Set`: rejected because structure is tested, but not as the primary strategic frame.")
    if family != "F7" and any(k in lowered for k in ["same producer", "vintage", "classification"]):
        candidates.append("`F7 Hierarchy / Quality Calibration Set`: rejected because hierarchy signals exist, but do not dominate.")
    if family != "F8" and any(k in lowered for k in ["unknown origin", "neither of the wines are from champagne"]):
        candidates.append("`F8 Examiner Curveball / Boundary Set`: rejected because the question is unusual, but still has a clearer main family.")
    return candidates[:3]


def curveball_risk(text: str, family: str, paper: int) -> str:
    lowered = text.lower()
    if family == "F8":
        return "high"
    if any(k in lowered for k in ["unknown origin", "mixed bag", "neither of the wines are from champagne"]):
        return "high"
    if paper == 3 and family in {"F1", "F2"}:
        return "medium-high"
    if family in {"F4", "F5", "F6"}:
        return "medium"
    return "low-medium"


def load_questions() -> list[tuple[str, int, int, int, dict]]:
    data = json.loads(EXAMS_PATH.read_text(encoding="utf-8"))
    rows = []
    for year_block in data:
        year = year_block["year"]
        for paper_block in year_block["papers"]:
            paper = paper_block["paper"]
            for qnum, question in enumerate(paper_block["questions"], start=1):
                qid = f"{year}_p{paper}_q{qnum}"
                rows.append((qid, year, paper, qnum, question))
    return rows


def render_tag(tag: Tag) -> str:
    rejected_lines = "\n".join(f"- {item}" for item in tag.rejected) if tag.rejected else "- None."
    signal_lines = "\n".join(f"- {item}" for item in tag.stem_signals)
    secondary = ", ".join(f"`{t}`" for t in tag.secondary_tags)
    return f"""---
year: {tag.year}
paper: {tag.paper}
question: {tag.question}
family: {tag.family}
subcategory: {tag.subcategory}
secondary_tags: [{", ".join(tag.secondary_tags)}]
generated: {GENERATED_DATE}
---

# Taxonomy tag - {tag.year} Paper {tag.paper} Question {tag.question}

## Question (verbatim)
{tag.text}

## Classification
- Paper: `{PAPER_LABELS[tag.paper]}`
- Family: `{tag.family} {FAMILY_NAMES[tag.family]}`
- Subcategory: `{tag.subcategory} {SUBCATEGORY_NAMES[tag.subcategory]}`
- Secondary tags: {secondary}

## Stem signals
{signal_lines}

## Structural features
- Wine count: {tag.wine_count}
- Linked pairs/groups: {tag.linked_groups}
- Mark emphasis: {tag.mark_emphasis}
- Curveball risk: {tag.curveball_risk}

## Why this family
{tag.why}

## Rejected alternatives
{rejected_lines}
"""


def render_index(tags: list[Tag]) -> str:
    by_family: dict[str, list[Tag]] = defaultdict(list)
    by_bucket: dict[tuple[int, str], list[Tag]] = defaultdict(list)
    for tag in tags:
        by_family[tag.family].append(tag)
        by_bucket[(tag.paper, tag.family)].append(tag)

    lines = [
        "---",
        f"generated: {GENERATED_DATE}",
        f"questions_tagged: {len(tags)}",
        f"years_covered: {[2015, 2016, 2017, 2018, 2019, 2021, 2022, 2023, 2024, 2025]}",
        "---",
        "",
        "# Question Taxonomy Index",
        "",
        "This index applies the canonical taxonomy in `outputs/heuristics/question_taxonomy.md` to the full historical MW practical corpus.",
        "",
        "## Family totals",
        "",
    ]
    for family in sorted(by_family):
        lines.append(f"- `{family} {FAMILY_NAMES[family]}`: {len(by_family[family])} questions")

    lines += ["", "## Paper x family counts", ""]
    for paper in [1, 2, 3]:
        lines.append(f"### {PAPER_LABELS[paper]}")
        for family in sorted(FAMILY_NAMES):
            count = len(by_bucket.get((paper, family), []))
            if count:
                lines.append(f"- `{family}`: {count}")
        lines.append("")

    lines.append("## Tagged questions")
    lines.append("")
    for paper in [1, 2, 3]:
        lines.append(f"### {PAPER_LABELS[paper]}")
        for family in sorted(FAMILY_NAMES):
            bucket = sorted(by_bucket.get((paper, family), []), key=lambda t: (t.year, t.question))
            if not bucket:
                continue
            lines.append(f"#### {family} {FAMILY_NAMES[family]}")
            for tag in bucket:
                lines.append(
                    f"- `{tag.question_id}` -> `{tag.subcategory}`; "
                    f"{', '.join(tag.secondary_tags[:4])}"
                )
            lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    tags: list[Tag] = []
    for qid, year, paper, qnum, question in load_questions():
        text = question["text"].strip()
        family, subcategory = classify(text, qid, paper)
        signals = build_stem_signals(text, paper)
        tag = Tag(
            question_id=qid,
            year=year,
            paper=paper,
            question=qnum,
            family=family,
            subcategory=subcategory,
            secondary_tags=secondary_tags(text, paper, family, subcategory),
            stem_signals=signals,
            wine_count=len(question.get("wines", [])),
            linked_groups=linked_groups(text),
            mark_emphasis=extract_mark_emphasis(text),
            curveball_risk=curveball_risk(text, family, paper),
            why=build_why(family, subcategory, signals, text),
            rejected=build_rejected(family, text),
            text=text,
        )
        tags.append(tag)
        (OUT_DIR / f"{qid}.md").write_text(render_tag(tag), encoding="utf-8")

    INDEX_PATH.write_text(render_index(sorted(tags, key=lambda t: (t.year, t.paper, t.question))), encoding="utf-8")
    print(f"Wrote {len(tags)} taxonomy tags to {OUT_DIR}")
    print(f"Wrote taxonomy index to {INDEX_PATH}")


if __name__ == "__main__":
    main()
