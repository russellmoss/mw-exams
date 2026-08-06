"""
Validate and index the theory model answers in outputs/theory_answers/.

Companion to the rubric extractor. Where that pipeline's gate is the QUOTE GATE (no
requirement without examiner backing), this one's gate is the COVERAGE GATE: no model
answer may claim to be a passing answer unless it demonstrably addresses every `core`
requirement of its question's rubric, inside the real exam word budget.

What it can and cannot check
----------------------------
It CAN check: word count against the paper's time budget, that every core requirement has a
`covers_core` entry quoting a real requirement from that rubric, identity agreement with the
corpus, structural sanity, and that every claim listed in `claims_to_verify` actually appears
in the body.

It CANNOT check that the wine facts are true. That is precisely why `claims_to_verify` is
mandatory: it converts the fabrication risk from something invisible into a review list. An
answer with an empty `claims_to_verify` is making no checkable factual assertions, which is
often the better-judged answer.

Outputs:
  data/theory/theory_answers_index.json   — one row per answer, for the app and for tests

Usage:
    python scripts/build_theory_answers.py
    python scripts/build_theory_answers.py --report   # per-answer summary
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ANSWER_DIR = ROOT / "outputs" / "theory_answers"
RUBRICS = ROOT / "data" / "theory" / "theory_rubrics.json"
QUESTIONS = ROOT / "data" / "theory" / "theory_questions.json"
OUT = ROOT / "data" / "theory" / "theory_answers_index.json"

# Per-question writing time, from the IMW Student Guide's paper durations:
# papers 1/2/4 are 3 hours for 3 answers, paper 3 is 2 hours for 2, paper 5 is 3 hours
# for 2 -- so paper 5 alone gets 90 minutes per question.
TIME_MINUTES = {1: 60, 2: 60, 3: 60, 4: 60, 5: 90}
# Word bands: ~15 min planning + 45 min writing yields 750-900 words for a 60-minute
# question (Jennifer Docherty MW on her own technique); paper 5 scales with its extra time.
WORD_BANDS = {60: (700, 1000), 90: (1050, 1450)}


def parse_frontmatter(text: str) -> tuple[dict, str]:
    """Minimal YAML-subset frontmatter parser: scalars, and lists of scalars or of maps.

    Deliberately not a YAML dependency — the shape is fixed by ANSWER_SPEC.md and a strict
    small parser gives better error messages than a permissive general one.
    """
    if not text.startswith("---"):
        raise ValueError("file does not begin with '---' frontmatter")
    end = text.find("\n---", 3)
    if end < 0:
        raise ValueError("frontmatter is not terminated by '---'")
    raw = text[3:end].strip("\n")
    body = text[end + 4:].lstrip("\n")

    data: dict = {}
    key = None
    for line in raw.split("\n"):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if re.match(r"^\s*-\s", line):
            if key is None:
                raise ValueError(f"list item outside any key: {line!r}")
            item = line.lstrip()[1:].strip()
            m = re.match(r"^(\w+)\s*:\s*(.*)$", item)
            if m:  # list of maps — start a new map
                data[key].append({m.group(1): _scalar(m.group(2))})
            else:
                data[key].append(_scalar(item))
            continue
        m = re.match(r"^\s{2,}(\w+)\s*:\s*(.*)$", line)
        if m and key and data.get(key) and isinstance(data[key][-1], dict):
            data[key][-1][m.group(1)] = _scalar(m.group(2))
            continue
        m = re.match(r"^(\w+)\s*:\s*(.*)$", line)
        if not m:
            raise ValueError(f"unparseable frontmatter line: {line!r}")
        key, val = m.group(1), m.group(2).strip()
        if val in ("", "[]"):
            data[key] = [] if val == "[]" else None
            if val == "":
                data[key] = []
        else:
            data[key] = _scalar(val)
    return data, body


def _scalar(v: str):
    v = v.strip()
    if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
        return v[1:-1]
    if re.fullmatch(r"-?\d+", v):
        return int(v)
    return v


def normalise(s: str) -> str:
    s = (s.replace("’", "'").replace("‘", "'")
          .replace("“", '"').replace("”", '"')
          .replace("–", "-").replace("—", "-"))
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def count_words(body: str) -> int:
    """Words in the prose, excluding markdown heading markers and list bullets."""
    text = re.sub(r"^#{1,6}\s*", "", body, flags=re.M)
    text = re.sub(r"^\s*[-*]\s+", "", text, flags=re.M)
    return len(re.findall(r"\b[\w'-]+\b", text))


def main() -> None:
    if not ANSWER_DIR.exists():
        raise SystemExit(f"FAIL: {ANSWER_DIR} not found — run the theory-answer-writer first")
    rubrics = {r["id"]: r for r in json.loads(RUBRICS.read_text(encoding="utf-8"))}
    questions = {q["id"]: q for q in json.loads(QUESTIONS.read_text(encoding="utf-8"))}

    files = sorted(ANSWER_DIR.glob("*.md"))
    if not files:
        raise SystemExit(f"FAIL: no answer files in {ANSWER_DIR}")

    rows: list[dict] = []
    errors: list[str] = []
    warnings: list[str] = []
    seen: set[str] = set()

    for f in files:
        try:
            fm, body = parse_frontmatter(f.read_text(encoding="utf-8"))
        except ValueError as exc:
            errors.append(f"{f.name}: {exc}")
            continue

        aid = fm.get("id")
        if not aid:
            errors.append(f"{f.name}: no id in frontmatter")
            continue
        if aid in seen:
            errors.append(f"{aid}: duplicate answer")
            continue
        seen.add(aid)

        rub = rubrics.get(aid)
        q = questions.get(aid)
        if rub is None or q is None:
            errors.append(f"{aid} ({f.name}): no matching rubric/question")
            continue
        expected_name = f"{q['year']}_p{q['paper']}_q{q['question']}.md"
        if f.name != expected_name:
            errors.append(f"{f.name}: should be named {expected_name}")

        for field in ("year", "paper", "question", "domain"):
            if fm.get(field) != q[field]:
                errors.append(f"{aid}: {field}={fm.get(field)!r}, corpus says {q[field]!r}")
        if normalise(str(fm.get("question_text", ""))) != normalise(q["text"].split("\n")[0]):
            warnings.append(f"{aid}: question_text differs from the corpus first line")

        # --- word budget, derived from the paper's real exam duration ---
        mins = TIME_MINUTES[q["paper"]]
        lo, hi = WORD_BANDS[mins]
        wc = count_words(body)
        if not (lo <= wc <= hi):
            errors.append(
                f"{aid}: {wc} words, outside the {lo}-{hi} band for a {mins}-minute question "
                f"(paper {q['paper']})"
            )
        if fm.get("time_minutes") != mins:
            errors.append(f"{aid}: time_minutes={fm.get('time_minutes')!r}, expected {mins}")
        if isinstance(fm.get("word_count"), int) and abs(fm["word_count"] - wc) > 40:
            warnings.append(f"{aid}: frontmatter word_count={fm['word_count']}, actual {wc}")

        # --- THE COVERAGE GATE ---
        core = [e for e in (rub.get("required_elements") or []) if e.get("weight") == "core"]
        covers = fm.get("covers_core") or []
        if not isinstance(covers, list):
            errors.append(f"{aid}: covers_core is not a list")
            covers = []
        if len(covers) != len(core):
            errors.append(
                f"{aid}: {len(covers)} covers_core entries for {len(core)} core requirements"
            )
        core_norm = [normalise(e.get("element", "")) for e in core]
        for i, c in enumerate(covers):
            if not isinstance(c, dict):
                errors.append(f"{aid}: covers_core[{i}] is not a mapping")
                continue
            req = normalise(str(c.get("requirement", "")))
            if not req:
                errors.append(f"{aid}: covers_core[{i}] has no requirement")
                continue
            # The quoted requirement must correspond to one the rubric actually contains,
            # so an answer cannot invent a requirement and claim to have covered it.
            if not any(req in cn or cn in req for cn in core_norm):
                errors.append(
                    f"{aid}: covers_core[{i}] does not match any core requirement — "
                    f"{str(c.get('requirement'))[:70]!r}"
                )
            if not str(c.get("where", "")).strip():
                errors.append(f"{aid}: covers_core[{i}] has no 'where'")

        # --- factual-claim register ---
        if "claims_to_verify" not in fm:
            errors.append(f"{aid}: claims_to_verify missing (use [] if the answer makes none)")
        else:
            body_norm = normalise(body)
            for c in fm["claims_to_verify"] or []:
                frag = normalise(str(c))[:60]
                if len(frag) > 15 and frag not in body_norm:
                    warnings.append(
                        f"{aid}: claims_to_verify entry not found in the body — {str(c)[:60]!r}"
                    )

        # --- structural sanity ---
        if not re.search(r"^#{2,3}\s+\S", body, flags=re.M):
            errors.append(f"{aid}: no section headings — the examiners expect visible structure")
        if normalise(q["text"].split("\n")[0])[:80] in normalise(body)[:400]:
            warnings.append(f"{aid}: opens by restating the question rather than defining terms")

        rows.append({
            "id": aid,
            "year": q["year"], "paper": q["paper"], "question": q["question"],
            "domain": q["domain"], "section": q["section"],
            "path": str(f.relative_to(ROOT)).replace("\\", "/"),
            "time_minutes": mins,
            "word_count": wc,
            "core_requirements": len(core),
            "claims_to_verify": len(fm.get("claims_to_verify") or []),
            "rubric_source": rub.get("source_report"),
            "text_source": rub.get("text_source", "pdf_text_layer"),
            "evidence_quality": rub.get("evidence_quality"),
        })

    if errors:
        print(f"FAIL: {len(errors)} error(s)")
        for e in errors:
            print("  -", e)
        if warnings:
            print(f"\n{len(warnings)} warning(s):")
            for w in warnings:
                print("  -", w)
        raise SystemExit(1)

    rows.sort(key=lambda r: (r["year"], r["paper"], r["question"]))
    OUT.write_text(json.dumps(rows, indent=2, ensure_ascii=False), encoding="utf-8")

    total_claims = sum(r["claims_to_verify"] for r in rows)
    avg = sum(r["word_count"] for r in rows) / len(rows)
    print(f"OK: {len(rows)} answers validated")
    print(f"OK: every core requirement has a covers_core entry "
          f"({sum(r['core_requirements'] for r in rows)} requirements total)")
    print(f"OK: all word counts inside their paper's time-derived band (mean {avg:.0f} words)")
    print(f"OK: {total_claims} factual claims registered for verification")
    if warnings:
        print(f"\n{len(warnings)} warning(s):")
        for w in warnings:
            print("  -", w)
    print(f"\nOK: wrote {OUT.relative_to(ROOT)}")

    if "--report" in sys.argv:
        print("\n--- per answer ---")
        for r in rows:
            print(f"{r['id']:>16}  {r['word_count']:>5}w  core={r['core_requirements']:<2} "
                  f"verify={r['claims_to_verify']:<2} {r['evidence_quality']}")


if __name__ == "__main__":
    main()
