"""
Segment IMW examiners' reports into per-question commentary blocks.

This is stage 1 of the theory rubric extractor. It is DETERMINISTIC: no LLM. Its job
is to find, inside a 20-40 page examiners' report, the exact stretch of prose that
discusses each theory question, so that stage 2 (the `rubric-extractor` subagent) is
handed a small, correct, already-attributed segment instead of a whole PDF.

Why anchor on question TEXT rather than on headings
---------------------------------------------------
Each theory paper's section is written by a different Panel Chair and they do not
share a format. Observed in the seven public reports:

    "Question 1: <text>"          (2018 papers 1-4)
    "1. <text>"                   (2016, and 2018 paper 5 from Q3 onward)
    "<text>" with no number       (some 2010-2014 sections)

Formats change *within a single report*, so a heading regex is unreliable. Instead we
already hold the authoritative question text in data/theory/theory_questions.json, so
we fuzzy-match each known question against the report body and use the match position
as the segment boundary. Fuzzy, not exact, because report authors retype the questions
and introduce small drifts — e.g. 2018 p1q1 says "produce wine at a wide range" where
the exam paper says "produce wines"; 2018 p5q3 says "a global wine disease" for the
paper's "a global disease".

Coverage is partial by design and is reported honestly
------------------------------------------------------
Reports do not comment on every question — a chair may skip questions that almost
nobody attempted. Anything not confidently located is emitted with
`"coverage": "none"` rather than being silently dropped or padded, so stage 2 can
never mistake absence of commentary for absence of requirements.

Era note: only 2016 and 2018 of the seven public reports fall inside the five-paper
theory corpus (2015-2026). The 2010-2014 reports cover four-paper-era questions that
are not in data/theory/, so they cannot be anchored per question; they are still
written out as whole-report text for the cross-cutting principles pass.

Outputs:
  data/theory/report_segments.json   — one row per (question, report) with its prose
  data/theory/report_coverage.json   — which questions have commentary, which do not

Usage:
    python scripts/segment_examiner_reports.py
    python scripts/segment_examiner_reports.py --report 2018   # single year
"""

from __future__ import annotations

import json
import re
import sys
from difflib import SequenceMatcher
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PDF_DIR = ROOT / "source" / "imw_pdfs"
QUESTIONS = ROOT / "data" / "theory" / "theory_questions.json"
OUT_SEGMENTS = ROOT / "data" / "theory" / "report_segments.json"
OUT_COVERAGE = ROOT / "data" / "theory" / "report_coverage.json"

# Where each year's examiners' report lives. Two sources, because the reports arrived by
# two routes: `source/imw_pdfs/` is populated by scripts/fetch_imw_pdfs.py from the public
# IMW site (gitignored, copyrighted), while `docs/examiners reports/` holds the
# student-area reports the user downloaded manually — these are the only source for 2017,
# 2019 and 2021-2025, which the IMW does not publish openly. Paths are listed rather than
# copied so neither store is duplicated.
#
# From 2019 on the IMW splits theory and practical into separate report files; 2016-2018
# are combined documents. The segmenter handles both, since it bounds the theory section
# by question anchors rather than by assuming a practical section exists.
REPORT_SOURCES: dict[int, list[str]] = {
    2016: ["source/imw_pdfs/examiners_report_2016.pdf",
           "docs/examiners reports/imw_2016_examiners_report.pdf"],
    2017: ["docs/examiners reports/imw_2017_theory_examiners_report.pdf"],
    2018: ["source/imw_pdfs/examiners_report_2018.pdf",
           "docs/examiners reports/imw_2018_examiners_report.pdf"],
    2019: ["docs/examiners reports/imw_theory_exam_report_2019.pdf"],
    2023: ["docs/examiners reports/2023-Theory-Examiners-Report.pdf"],
    2024: ["docs/examiners reports/2024-Theory-Examiners-Report.pdf"],
    2025: ["docs/examiners reports/Theory-Examiners-Report-2025.pdf"],
}

# Reports whose questions live in the five-paper theory corpus and can be anchored.
ANCHORABLE_YEARS = [2016, 2017, 2018, 2019, 2023, 2024, 2025]

# 2021 and 2022 theory reports exist in docs/examiners reports/ but are IMAGE SCANS with
# no text layer (75 and 48 extractable characters across 24 and 23 pages). They need OCR,
# or page-render transcription like the 2021-2023 exam papers, before they can be
# segmented. Listing them here so their absence is a recorded decision, not an oversight.
IMAGE_SCAN_YEARS = {
    2021: "docs/examiners reports/2021-Theory-Exam-Report.pdf",
    2022: "docs/examiners reports/Theory-Examiners-Report-2022-1.pdf",
}

# Reports covering the four-paper era: no corpus questions to anchor, principles only.
PRINCIPLES_ONLY_YEARS = [2010, 2011, 2012, 2013, 2014]

# A question is considered located only above this similarity. Set high enough that a
# merely topical paragraph cannot masquerade as the question restatement, low enough to
# absorb the retyping drift documented above.
MATCH_THRESHOLD = 0.72
# Commentary blocks longer than this are almost certainly a missed boundary.
MAX_SEGMENT_CHARS = 12000
MIN_SEGMENT_CHARS = 120

# Headings that end the theory part of a report. Needed because the last theory
# question has no following question to bound it, and theory sits before the practical
# section in some years (2016) and after it in others (2018) — so the tail must be cut
# at whichever non-theory panel report comes next, not at the end of the document.
# Without this, 2016 p5q5 ran 12,000 chars into the practical chair's wine-by-wine notes.
SECTION_TERMINATORS = [
    r"(?:Practical|Research\s+Paper)s?\s+(?:Panel\s+)?Chair\s+Report",
    r"\d+[ivx]*[.)]\s*(?:Practical|Research\s+Paper)s?\s+(?:Panel|Paper|Chair)",
    r"Research\s+Paper\s+Chair",
]


def resolve_report(year: int) -> Path:
    """First existing candidate path for a year's examiners' report."""
    if year in IMAGE_SCAN_YEARS:
        raise SystemExit(
            f"FAIL: the {year} theory report ({IMAGE_SCAN_YEARS[year]}) is an image scan "
            f"with no text layer. It needs OCR or page-render transcription before it can "
            f"be segmented."
        )
    for cand in REPORT_SOURCES.get(year, [f"source/imw_pdfs/examiners_report_{year}.pdf"]):
        p = ROOT / cand
        if p.exists():
            return p
    raise SystemExit(
        f"FAIL: no examiners' report found for {year}. Tried: "
        f"{', '.join(REPORT_SOURCES.get(year, []))}. Public reports come from "
        f"scripts/fetch_imw_pdfs.py; 2017, 2019 and 2021-2025 are IMW student-area only "
        f"and must be added to 'docs/examiners reports/' by hand."
    )


def read_pdf_text(path: Path) -> str:
    from pypdf import PdfReader

    reader = PdfReader(str(path))
    return "\n".join((p.extract_text() or "") for p in reader.pages)


def normalise(s: str) -> str:
    """Fold typography so retyped questions still match."""
    s = (s.replace("’", "'").replace("‘", "'")
          .replace("“", '"').replace("”", '"')
          .replace("–", "-").replace("—", "-").replace("‑", "-"))
    return re.sub(r"\s+", " ", s).strip()


def tokens(s: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", s.lower())


def find_question(report: str, question_text: str) -> tuple[int, float] | tuple[None, float]:
    """Locate a question's restatement in the report.

    Returns (char offset of the match, similarity). Strategy: pick rare seed words from
    the question, look only at windows around their occurrences, and score each window
    with SequenceMatcher. This keeps the comparison local instead of O(report x question).
    """
    probe = normalise(question_text.split("\n")[0])
    probe_toks = tokens(probe)
    if len(probe_toks) < 5:
        return None, 0.0

    report_toks = tokens(report)
    if not report_toks:
        return None, 0.0

    # Seed on the question's rarest words: distinctive, and cheap to locate.
    freq: dict[str, int] = {}
    for t in report_toks:
        freq[t] = freq.get(t, 0) + 1
    seeds = sorted(
        (t for t in set(probe_toks) if len(t) > 4),
        key=lambda t: (freq.get(t, 0), -len(t)),
    )[:6]
    if not seeds:
        seeds = [max(probe_toks, key=len)]

    # Map token index -> char offset so a token hit can be turned back into a position.
    offsets: list[int] = []
    pos = 0
    low = report.lower()
    for t in report_toks:
        idx = low.find(t, pos)
        if idx < 0:
            idx = pos
        offsets.append(idx)
        pos = idx + len(t)

    seed_positions: set[int] = set()
    for s in seeds:
        seed_positions.update(i for i, t in enumerate(report_toks) if t == s)
    if not seed_positions:
        return None, 0.0

    win = len(probe_toks)
    best_score, best_off = 0.0, None
    seen_starts: set[int] = set()
    for i in sorted(seed_positions):
        # The seed may sit anywhere inside the restatement, so try a few alignments.
        for back in (0, win // 4, win // 2, (3 * win) // 4, win - 1):
            start = max(0, i - back)
            if start in seen_starts:
                continue
            seen_starts.add(start)
            window = " ".join(report_toks[start:start + win])
            score = SequenceMatcher(None, " ".join(probe_toks), window).ratio()
            if score > best_score:
                best_score, best_off = score, offsets[start]

    if best_score < MATCH_THRESHOLD or best_off is None:
        return None, best_score
    return best_off, best_score


def find_marker_fallback(report: str, number: int, lo: int, hi: int) -> int | None:
    """Locate a question by its NUMBER within a known span.

    Used when the fuzzy match fails because the chair abbreviated the restatement
    instead of retyping it — 2018 paper 3 q2 appears literally as "Question 2: each
    option?", which shares almost no text with the real question. The span is bounded by
    the neighbouring located questions, so a number this specific is unambiguous.
    """
    if lo >= hi:
        return None
    window = report[lo:hi]
    for pat in (
        rf"Question\s+{number}\s*[:.]",
        rf"\bQ\s*{number}\s*[.:)]",              # 2019 paper 5 writes "Q5. What makes wine..."
        rf"(?<![\d.]){number}[.)]\s+[A-Z(]",
    ):
        m = re.search(pat, window)
        if m:
            return lo + m.start()
    return None


WORD_NUM = {1: "One", 2: "Two", 3: "Three", 4: "Four", 5: "Five"}


def find_paper_heading(report: str, paper: int, lo: int, hi: int,
                       prefer_last: bool = False) -> int | None:
    """Find the section heading for a theory paper within a span.

    Each paper's section opens with a heading and a "General comments" passage from that
    paper's Chair. That passage states paper-level expectations (depth, use of examples,
    definitions) and is rubric-relevant, but it sits BEFORE the first question anchor —
    so without this it would be swallowed by the previous paper's last question segment.

    `prefer_last` takes the RIGHTMOST match and drops the bare "Paper N" pattern. It is
    used for the first theory paper of a report, whose search span begins at char 0 and so
    crosses the whole practical section in years where practical is printed first (2018).
    Taking the leftmost bare match there matched "Practical Paper 1" and handed Theory
    Paper 1 a 15,000-character preamble of wine-by-wine tasting commentary.
    """
    if lo >= hi:
        return None
    window = report[lo:hi]
    word = WORD_NUM.get(paper, str(paper))
    # Theory-qualified forms only, unless we are scanning a span already known to sit
    # inside the theory section (prefer_last=False), where a bare "Paper N" is safe.
    patterns = [
        rf"\d+[ivx]*[.)]\s*Theory\s+Paper\s+(?:{word}|{paper})\b",
        rf"Theory\s+(?:Exam\s+)?Paper\s+(?:{word}|{paper})\b",
        rf"\d{{4}}\s+MW\s+Theory\s+Exam\s+Paper\s+(?:{word}|{paper})\b",
        # 2019-onward theory-only reports title their sections "Paper one report 2024:
        # Paper chair, Rhys Pender MW" / "Paper One Report: Paper Chair, ...". Specific
        # enough to stay safe in prefer_last mode: the practical sections of the combined
        # 2016-2018 reports say "Practical Panel Chair report", never "Paper N report".
        rf"Paper\s+(?:{word}|{paper})\s+[Rr]eport\b",
    ]
    if not prefer_last:
        patterns.append(rf"(?:Theory\s+)?Paper\s+(?:{word}|{paper})\b")
    best = None
    for pat in patterns:
        hits = [m.start() for m in re.finditer(pat, window, re.I)]
        if not hits:
            continue
        cand = hits[-1] if prefer_last else hits[0]
        if best is None or (cand > best if prefer_last else cand < best):
            best = cand
    if best is None:
        return None
    # Back up over the section enumerator and page number that precede the heading
    # ("... 13 3ii. Theory Exam Paper Two"), so they land in the new paper's preamble
    # rather than trailing the previous question's commentary.
    prefix = window[:best]
    m = re.search(r"(?:\d{1,3}\s+)?\d+[ivx]*[.)]\s*$", prefix)
    if m:
        best = m.start()
    return lo + best


def find_theory_chair_report(report: str, before: int) -> str:
    """The Theory Panel Chair's cross-paper report, if present.

    Evidence sits at three levels: this question's commentary, its paper Chair's General
    Comments, and above both the Theory Panel Chair's report on the theory exam as a
    whole. The top level is genuinely question-relevant — the 2018 Theory Chair names
    Paper 2's over-reliance on one example ("21 out of 56 papers using the same reference
    to Domaine Dujac") — so it must travel with the segments or a valid extracted quote
    will fail the quote gate for lack of a haystack.
    """
    # Naming drifts by year: "Theory Chair Report" (2016), "Theory Panel Chair Report"
    # (2018), "Theory Exam Chair Report, Beverley Blanning MW" (2024), and a bare
    # "Theory Chair: Beverley Blanning MW" under an Introduction heading (2025).
    pat = r"Theory\s+(?:Panel\s+|Exam\s+)?Chair(?:'s)?(?:\s+Report|\s*:)"
    starts = [m.start() for m in re.finditer(pat, report, re.I) if m.start() < before]
    if not starts:
        return ""
    # `before` is already the first paper's section heading, so it is the correct end.
    # Do NOT re-scan for paper headings inside this span: the Chair discusses the papers
    # by name ("On theory paper 2, one examiner noted..."), and treating such a mention
    # as a section heading truncated the 2018 Chair report mid-sentence, losing exactly
    # the Paper 2 criticism the extractor had legitimately quoted.
    return report[starts[-1]:before].strip()


def find_theory_end(report: str, after: int) -> int:
    """First non-theory section heading after `after`, or end of report."""
    end = len(report)
    for pat in SECTION_TERMINATORS:
        for m in re.finditer(pat, report, re.I):
            if m.start() > after:
                end = min(end, m.start())
                break
    return end


def segment_report(year: int, questions: list[dict]) -> tuple[list[dict], dict]:
    pdf = resolve_report(year)
    raw = read_pdf_text(pdf)
    report = normalise(raw)
    if len(report) < 5000:
        raise SystemExit(
            f"FAIL: {pdf.name} yielded only {len(report)} chars of text — it is probably "
            f"an image scan and needs OCR before segmentation"
        )

    yq = sorted(
        (q for q in questions if q["year"] == year),
        key=lambda q: (q["paper"], q["question"]),
    )

    # Locate every question first; boundaries come from the sorted match positions.
    located: list[tuple[dict, int, float]] = []
    unlocated: list[dict] = []
    for q in yq:
        off, score = find_question(report, q["text"])
        if off is None:
            unlocated.append({"id": q["id"], "best_score": round(score, 3)})
        else:
            located.append((q, off, score))

    # Second pass: recover questions the fuzzy match missed by looking for their number
    # between the neighbours that WERE located.
    if unlocated:
        located.sort(key=lambda r: (r[0]["paper"], r[0]["question"]))
        by_key = {(q["paper"], q["question"]): off for q, off, _ in located}
        recovered: list[dict] = []
        for u in list(unlocated):
            q = next(x for x in yq if x["id"] == u["id"])
            lo = by_key.get((q["paper"], q["question"] - 1))
            if lo is None:
                continue
            # The upper bound is the next question in this paper; when there is none —
            # i.e. this is the LAST question of its paper, which is exactly where the
            # recovery is most needed (2017 p3q4, 2019 p5q5) — fall back to the first
            # anchor of any later paper, then to the end of the report.
            hi = by_key.get((q["paper"], q["question"] + 1))
            if hi is None:
                later = [off for (p, _), off in by_key.items() if p > q["paper"]]
                hi = min(later) if later else len(report)
            off = find_marker_fallback(report, q["question"], lo + 1, hi)
            if off is not None:
                located.append((q, off, -1.0))  # -1 marks a number-marker recovery
                recovered.append(u)
        for u in recovered:
            unlocated.remove(u)

    located.sort(key=lambda r: r[1])
    # The last theory question is bounded by the next non-theory section, not by EOF.
    theory_end = find_theory_end(report, located[-1][1]) if located else len(report)
    boundaries = [off for _, off, _ in located] + [theory_end]

    # Where a paper boundary falls between two consecutive question anchors, cut the
    # earlier segment at the heading and keep the heading..next-anchor text as the new
    # paper's preamble (its Chair's "General comments").
    paper_preambles: dict[int, str] = {}
    for i, (q, off, _) in enumerate(located):
        nxt = located[i + 1][0] if i + 1 < len(located) else None
        if nxt is not None and nxt["paper"] != q["paper"]:
            h = find_paper_heading(report, nxt["paper"], off, boundaries[i + 1])
            if h is not None:
                paper_preambles[nxt["paper"]] = report[h:boundaries[i + 1]].strip()
                boundaries[i + 1] = h
    # The first located paper's preamble runs from the theory section start we can see.
    first_q, first_off, _ = located[0]
    h = find_paper_heading(report, first_q["paper"], 0, first_off, prefer_last=True)
    if h is not None:
        paper_preambles[first_q["paper"]] = report[h:first_off].strip()
    theory_chair_report = find_theory_chair_report(report, h if h is not None else first_off)

    segments: list[dict] = []
    for i, (q, off, score) in enumerate(located):
        end = boundaries[i + 1]
        body = report[off:end].strip()
        flags = []
        if len(body) > MAX_SEGMENT_CHARS:
            body = body[:MAX_SEGMENT_CHARS]
            flags.append("truncated: segment exceeded MAX_SEGMENT_CHARS")
        if len(body) < MIN_SEGMENT_CHARS:
            flags.append("very short: little or no commentary after the restatement")
        if score < 0:
            flags.append(
                "anchored by question number, not text — the report abbreviated the "
                "restatement; verify the commentary belongs to this question"
            )
        segments.append({
            "id": q["id"],
            "year": q["year"],
            "paper": q["paper"],
            "question": q["question"],
            "domain": q["domain"],
            "section": q["section"],
            "question_text": q["text"],
            "source_report": pdf.name,
            "coverage": "full",
            "paper_preamble": paper_preambles.get(q["paper"], ""),
            "theory_chair_report": theory_chair_report,
            "anchor": "question_number" if score < 0 else "question_text",
            "match_score": None if score < 0 else round(score, 3),
            "char_offset": off,
            "commentary": body,
            "flags": flags,
        })

    for u in unlocated:
        q = next(x for x in yq if x["id"] == u["id"])
        segments.append({
            "id": q["id"],
            "year": q["year"],
            "paper": q["paper"],
            "question": q["question"],
            "domain": q["domain"],
            "section": q["section"],
            "question_text": q["text"],
            "source_report": pdf.name,
            "coverage": "none",
            "paper_preamble": paper_preambles.get(q["paper"], ""),
            "theory_chair_report": theory_chair_report,
            "anchor": None,
            "match_score": u["best_score"],
            "char_offset": None,
            "commentary": "",
            "flags": ["not located in report — the chair may not have covered this question"],
        })

    segments.sort(key=lambda s: (s["paper"], s["question"]))
    coverage = {
        "year": year,
        "source_report": pdf.name,
        "report_chars": len(report),
        "questions_total": len(yq),
        "questions_covered": sum(1 for s in segments if s["coverage"] == "full"),
        "questions_uncovered": [s["id"] for s in segments if s["coverage"] == "none"],
        "paper_preambles_found": sorted(paper_preambles),
        "theory_chair_report_chars": len(theory_chair_report),
        "flagged": [{"id": s["id"], "flags": s["flags"]} for s in segments if s["flags"]],
    }
    return segments, coverage


def main() -> None:
    if not QUESTIONS.exists():
        raise SystemExit(f"FAIL: {QUESTIONS} not found — run scripts/parse_theory_source.py")
    questions = json.loads(QUESTIONS.read_text(encoding="utf-8"))

    years = ANCHORABLE_YEARS
    if "--report" in sys.argv:
        years = [int(sys.argv[sys.argv.index("--report") + 1])]

    all_segments: list[dict] = []
    coverages: list[dict] = []
    for y in years:
        segs, cov = segment_report(y, questions)
        all_segments.extend(segs)
        coverages.append(cov)
        print(f"{y}: located {cov['questions_covered']}/{cov['questions_total']} questions "
              f"in {cov['source_report']}")
        if cov["questions_uncovered"]:
            print(f"     no commentary found for: {', '.join(cov['questions_uncovered'])}")
        for f in cov["flagged"]:
            print(f"     FLAG {f['id']}: {'; '.join(f['flags'])}")

    summary = {
        "anchorable_years": years,
        "principles_only_years": PRINCIPLES_ONLY_YEARS,
        "note": (
            "Reports for 2010-2014 cover four-paper-era questions that are not in the "
            "five-paper theory corpus, so they cannot be anchored per question. They are "
            "read whole by the cross-cutting principles pass instead."
        ),
        "per_year": coverages,
    }

    OUT_SEGMENTS.parent.mkdir(parents=True, exist_ok=True)
    OUT_SEGMENTS.write_text(json.dumps(all_segments, indent=2, ensure_ascii=False), encoding="utf-8")
    OUT_COVERAGE.write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")

    total = len(all_segments)
    covered = sum(1 for s in all_segments if s["coverage"] == "full")
    print(f"\nOK: {total} segments, {covered} with commentary, {total - covered} without")
    print(f"OK: wrote {OUT_SEGMENTS.relative_to(ROOT)}, {OUT_COVERAGE.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
