from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from pathlib import Path

from analyze_wine_selection_logic import infer_family_from_text, normalize


ROOT = Path(__file__).resolve().parent.parent
MOCK_DIR = ROOT / "outputs" / "mock_exams"
EXAMS_PATH = ROOT / "data" / "exams.json"
TAXONOMY_INDEX_PATH = ROOT / "outputs" / "heuristics" / "question_taxonomy_index.md"
OUT_JSON_PATH = ROOT / "data" / "mock_rotation_analysis.json"
OUT_MD_PATH = ROOT / "outputs" / "mock_exams" / "mock_rotation_analysis.md"


def parse_taxonomy_index() -> dict[str, dict]:
    out = {}
    if not TAXONOMY_INDEX_PATH.exists():
        return out
    pattern = re.compile(r"- `(\d{4}_p\d_q\d+)` -> `(F\d+[a-z]?)`; (.+)")
    for line in TAXONOMY_INDEX_PATH.read_text(encoding="utf-8", errors="replace").splitlines():
        m = pattern.match(line.strip())
        if not m:
            continue
        qid, subtype, tags = m.groups()
        out[qid] = {
            "family": subtype[:2],
            "subtype": subtype,
            "tags": [tag.strip() for tag in tags.split(",")],
        }
    return out


def mock_id_from_text(path: Path, text: str) -> str:
    if text.startswith("---"):
        parts = text.split("---", 2)
        for line in parts[1].splitlines():
            if line.startswith("mock_exam_id:"):
                return line.split(":", 1)[1].strip()
    return path.stem


def motif_tokens(wine_text: str) -> set[str]:
    text = normalize(wine_text)
    motifs = set()
    known = [
        "vouvray",
        "savennières",
        "savennieres",
        "huet",
        "foreau",
        "sancerre",
        "pouilly-fume",
        "menetou-salon",
        "champagne",
        "cava",
        "prosecco",
        "cartizze",
        "tokaji",
        "sauternes",
        "icewine",
        "mosel",
        "rutherglen",
        "madeira",
        "sherry",
        "jerez",
        "barolo",
        "barbaresco",
        "bordeaux",
        "pauillac",
        "saint-julien",
        "chianti",
        "etna",
        "vouvray demi-sec",
        "chenin",
        "cabernet franc",
        "sauvignon blanc",
        "riesling",
        "nebbiolo",
    ]
    for token in known:
        if token in text:
            motifs.add(token.replace("savennieres", "savennières"))
    # Add first appellation-like phrase before producer comma.
    head = text.split(".", 1)[0]
    first = head.split(",", 1)[0].strip()
    if first and len(first) >= 5:
        motifs.add(first)
    return motifs


def canonical_stem(text: str) -> str:
    q = normalize(text)
    q = re.sub(r"\([^)]*marks?\)", "", q)
    q = re.sub(r"\b\d+\b", "#", q)
    q = q.replace("wines #-#", "wines")
    q = q.replace("wines # to #", "wines")
    q = re.sub(r"\s+", " ", q)
    return q[:260]


def parse_mock_file(path: Path) -> dict:
    text = path.read_text(encoding="utf-8", errors="replace")
    mock_id = mock_id_from_text(path, text)
    questions = []
    wines = []
    paper_blocks = re.split(r"\n## Paper\s+", text)
    for block in paper_blocks[1:]:
        pm = re.match(r"(\d+)", block)
        if not pm:
            continue
        paper = int(pm.group(1))
        wine_section = re.search(r"\n### (?:Paper \d+ )?Wines\s*\n(.*?)(?:\n---\n|\Z)", block, re.S)
        wine_lookup = {}
        if wine_section:
            for line in wine_section.group(1).splitlines():
                m = re.match(r"\s*(\d+)\.\s+(.+)", line)
                if m:
                    slot = int(m.group(1))
                    wine_lookup[slot] = m.group(2).strip()
                    wines.append(
                        {
                            "mock_id": mock_id,
                            "paper": paper,
                            "slot": slot,
                            "wine_text": m.group(2).strip(),
                            "motifs": sorted(motif_tokens(m.group(2))),
                        }
                    )
        for qm in re.finditer(r"\n### Question\s+(\d+)\s*\n(.*?)(?=\n---\n\n### Question|\n---\n\n### (?:Paper \d+ )?Wines|\Z)", block, re.S):
            qn = int(qm.group(1))
            qtext = qm.group(2).strip()
            family, subtype, tags = infer_family_from_text(qtext, paper)
            slots = []
            for range_m in re.finditer(r"Wines?\s+(\d+)(?:\s*(?:to|-|–)\s*(\d+))?", qtext, re.I):
                start = int(range_m.group(1))
                end = int(range_m.group(2) or start)
                slots.extend(range(start, end + 1))
            questions.append(
                {
                    "mock_id": mock_id,
                    "paper": paper,
                    "question": qn,
                    "position": f"p{paper}_q{qn}",
                    "family": family,
                    "subtype": subtype,
                    "tags": tags,
                    "stem": qtext,
                    "canonical_stem": canonical_stem(qtext),
                    "slots": sorted(set(slots)),
                }
            )
    return {"mock_id": mock_id, "path": str(path), "questions": questions, "wines": wines}


def historical_position_distribution() -> dict:
    taxonomy = parse_taxonomy_index()
    exams = json.loads(EXAMS_PATH.read_text(encoding="utf-8"))
    positions = defaultdict(Counter)
    p3_q1_stems = []
    for exam in exams:
        year = exam["year"]
        for paper in exam["papers"]:
            p = paper["paper"]
            for q in paper["questions"]:
                qid = f"{year}_p{p}_q{q['n']}"
                tax = taxonomy.get(qid)
                if tax:
                    family = tax["family"]
                    subtype = tax["subtype"]
                else:
                    family, subtype, _ = infer_family_from_text(q["text"], p)
                positions[f"p{p}_q{q['n']}"][f"{family}/{subtype}"] += 1
                if p == 3 and q["n"] == 1:
                    p3_q1_stems.append({"year": year, "family": family, "subtype": subtype, "text": q["text"]})
    return {"positions": {k: dict(v) for k, v in positions.items()}, "p3_q1_stems": p3_q1_stems}


def historical_motif_counts() -> Counter:
    exams = json.loads(EXAMS_PATH.read_text(encoding="utf-8"))
    counts = Counter()
    total = 0
    for exam in exams:
        for paper in exam["papers"]:
            for wine in paper["wines"]:
                total += 1
                for motif in motif_tokens(wine["full_text"]):
                    counts[motif] += 1
    counts["__total_wines__"] = total
    return counts


def analyze() -> dict:
    mock_paths = sorted(MOCK_DIR.glob("mock_full_*.md"))
    mock_paths = [p for p in mock_paths if not p.name.endswith("_answers.md") and "diversity_review" not in p.name]
    mocks = [parse_mock_file(path) for path in mock_paths]
    all_questions = [q for m in mocks for q in m["questions"]]
    all_wines = [w for m in mocks for w in m["wines"]]

    by_position = defaultdict(list)
    for q in all_questions:
        by_position[q["position"]].append(q)

    repeated_positions = []
    for position, qs in sorted(by_position.items()):
        fams = Counter(f"{q['family']}/{q['subtype']}" for q in qs)
        stems = Counter(q["canonical_stem"] for q in qs)
        if fams and fams.most_common(1)[0][1] >= 2:
            repeated_positions.append(
                {
                    "position": position,
                    "n_mocks": len(qs),
                    "dominant_family": fams.most_common(1)[0][0],
                    "dominant_count": fams.most_common(1)[0][1],
                    "exact_or_near_stem_repeats": stems.most_common(3),
                    "mock_ids": [q["mock_id"] for q in qs],
                }
            )

    motif_by_mock = defaultdict(Counter)
    motif_total = Counter()
    for wine in all_wines:
        for motif in wine["motifs"]:
            motif_by_mock[wine["mock_id"]][motif] += 1
            motif_total[motif] += 1
    repeated_motifs = [
        {
            "motif": motif,
            "total_mock_count": count,
            "mock_count": sum(1 for c in motif_by_mock.values() if c[motif]),
            "by_mock": {mock: c[motif] for mock, c in motif_by_mock.items() if c[motif]},
        }
        for motif, count in motif_total.most_common()
        if count >= 2 and motif != ""
    ]

    hist_positions = historical_position_distribution()
    hist_motifs = historical_motif_counts()
    return {
        "mocks": mocks,
        "question_count": len(all_questions),
        "wine_count": len(all_wines),
        "repeated_positions": repeated_positions,
        "repeated_motifs": repeated_motifs,
        "historical_positions": hist_positions,
        "historical_motifs": dict(hist_motifs),
    }


def pct(n: int, d: int) -> str:
    return "0%" if d == 0 else f"{n / d:.0%}"


def render_md(data: dict) -> str:
    mocks = data["mocks"]
    hist_total = data["historical_motifs"].get("__total_wines__", 0)
    vouvray_hist = data["historical_motifs"].get("vouvray", 0)
    sparkling_p3q1 = []
    for row in data["historical_positions"]["p3_q1_stems"]:
        text = normalize(row["text"])
        if "sparkling" in text:
            sparkling_p3q1.append(row)
    p3q1_total = len(data["historical_positions"]["p3_q1_stems"])

    lines = [
        "# Mock Rotation Analysis",
        "",
        "This report checks whether generated mock exams are repeating question positions, question families, stems, and wine motifs across mock versions.",
        "",
        "## Headline",
        "",
        f"- Mock full exams analysed: `{len(mocks)}`",
        f"- Mock questions analysed: `{data['question_count']}`",
        f"- Mock wines analysed: `{data['wine_count']}`",
        f"- Historical Vouvray appearances: `{vouvray_hist}` / `{hist_total}` wines ({pct(vouvray_hist, hist_total)})",
        f"- Historical P3 Q1 sparkling stems: `{len(sparkling_p3q1)}` / `{p3q1_total}` P3 Q1 questions ({pct(len(sparkling_p3q1), p3q1_total)})",
        "",
        "Conclusion: P3 Q1 does not always have to be three sparkling wines from three countries. Sparkling is a real recurring P3 opening pattern, but repeating it in consecutive full mocks is a rotation failure unless the whole point is targeted drilling.",
        "",
        "Vouvray is historically important but not common enough to appear casually in repeated mocks. It should be treated as a cooldown-limited motif, especially Huet/Foreau demi-sec Loire Chenin.",
        "",
        "## Repeated Question Positions",
        "",
    ]
    for item in data["repeated_positions"]:
        if item["dominant_count"] < 2:
            continue
        lines.append(
            f"- `{item['position']}`: dominant `{item['dominant_family']}` appears `{item['dominant_count']}` / `{item['n_mocks']}` mocks; mocks={', '.join(item['mock_ids'])}"
        )

    lines.extend(["", "## Repeated Wine Motifs", ""])
    for item in data["repeated_motifs"][:40]:
        lines.append(
            f"- `{item['motif']}`: `{item['total_mock_count']}` uses across `{item['mock_count']}` mocks; {item['by_mock']}"
        )

    lines.extend(
        [
            "",
            "## Rotation Rules For Future Mocks",
            "",
            "- Do not repeat the same `paper/question -> family/subtype` position in consecutive full mocks unless explicitly running a targeted drill.",
            "- Do not repeat a near-identical stem in the same position across vN and vN+1.",
            "- For each paper, rotate the opening question family. Example: P3 Q1 can be sparkling, same-variety multi-style, fortified/oxidative, residual-sugar mechanism, or mixed category/commercial analysis. It should not default to sparkling every time.",
            "- Put forecast families into different positions across versions. If P3 F5 sparkling is Q1 in v6, then in v7 move F5 to Q2/Q3 or choose a different F5 subtype.",
            "- Apply motif cooldowns. A named appellation/producer/style motif used in one full mock should normally be unavailable for the next two full mocks unless historical frequency justifies it.",
            "- High-frequency classics get shorter cooldowns: Chardonnay, Riesling, Sauvignon Blanc, Bordeaux, Burgundy, Champagne. Lower-frequency motifs get longer cooldowns: Vouvray, Huet/Foreau, Savennières, Etna, Tokaji, Rutherglen, Vin Santo.",
            "- The mock writer must consult `mock_rotation_analysis.md` plus `mock_exam_coverage.md` before selecting wines.",
            "",
            "## Need For More Wine Research",
            "",
            "Yes, but only after the rotation logic is fixed. More wines will not solve repeated exams if the writer keeps choosing the same question skeleton. Add new researched wines to fill underused family/subtype needs: P3 non-sparkling method questions, P1 non-Loire Chenin alternatives, P2 non-Bordeaux/non-Italy hierarchy ladders, and commercial-position flights outside obvious prestige categories.",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    data = analyze()
    OUT_JSON_PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    OUT_MD_PATH.write_text(render_md(data), encoding="utf-8")
    print(f"OK: wrote {OUT_JSON_PATH}")
    print(f"OK: wrote {OUT_MD_PATH}")


if __name__ == "__main__":
    main()
