"""
Extract every registered factual claim from the theory model answers into a work queue.

Stage 1 of the claim-verification pipeline:

    scripts/extract_theory_claims.py   -> data/theory/claims_queue.json      deterministic
    .claude/agents/claim-verifier.md   -> data/theory/_claims_work/*.json    LLM + KB + tier-1 web
    scripts/apply_claim_verdicts.py    -> corrected answers + ledger         deterministic

Why this exists: `claims_to_verify` in each answer's frontmatter records every specific
figure, date, statistic or named-producer assertion the writer made. 1,300 of them were
registered and none had been checked against a source. A candidate who memorises a
fabricated figure and reproduces it in the exam is penalised for it — the examiners hit
factual error by name — so an unverified claim register is a liability, not a safeguard.

Claim IDs are stable (`{answer_id}#{index}`) so a verdict can be applied back to the exact
line it came from even after other claims in the same answer are corrected.

Usage:
    python scripts/extract_theory_claims.py
    python scripts/extract_theory_claims.py --paper 3     # one paper's queue
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ANSWER_DIR = ROOT / "outputs" / "theory_answers"
RUBRICS = ROOT / "data" / "theory" / "theory_rubrics.json"
OUT = ROOT / "data" / "theory" / "claims_queue.json"

# Routing hint only — the verifier makes the final call per claim, because surface patterns
# misfile constantly (a regex put "vine shoot growth stops below about 10C" under market
# statistics). The hint just orders the batch so related lookups cluster.
KB_DOMAINS = {"viticulture", "vinification_and_pre_bottling", "handling_of_wine"}


def parse_claims(text: str) -> tuple[dict, list[str], str]:
    """Returns (frontmatter-ish head fields, claims, body)."""
    if not text.startswith("---"):
        raise ValueError("no frontmatter")
    end = text.find("\n---", 3)
    head, body = text[3:end], text[end + 4:]

    fields = {}
    for key in ("id", "year", "paper", "question", "domain", "word_count"):
        m = re.search(rf"^{key}:\s*(.+)$", head, re.M)
        if m:
            v = m.group(1).strip().strip('"').strip("'")
            fields[key] = int(v) if re.fullmatch(r"-?\d+", v) else v

    claims: list[str] = []
    m = re.search(r"^claims_to_verify:\s*(\[\])?\s*$(.*?)(?=^\w+:)", head, re.M | re.S)
    if m and m.group(1) != "[]":
        for line in m.group(2).split("\n"):
            s = line.strip()
            if s.startswith("- "):
                c = s[2:].strip()
                if len(c) >= 2 and c[0] == c[-1] and c[0] in "\"'":
                    c = c[1:-1]
                if c:
                    claims.append(c)
    return fields, claims, body


def sentence_around(body: str, claim: str) -> str:
    """The sentence the claim sits in — the verifier needs the claim IN CONTEXT.

    A bare fragment like "held at 12-15" is unverifiable; the surrounding sentence says
    what is held at 12-15 and in what units.
    """
    def norm(s: str) -> str:
        return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()

    target = norm(claim)[:50]
    if not target:
        return ""
    # Split on sentence ends but keep decimals and abbreviations intact enough.
    for sent in re.split(r"(?<=[.!?])\s+(?=[A-Z])", body):
        if target and target in norm(sent):
            return re.sub(r"\s+", " ", sent).strip()
    # Fall back to a character window around the first fuzzy hit.
    nb = norm(body)
    i = nb.find(target)
    if i < 0:
        return ""
    ratio = len(body) / max(len(nb), 1)
    j = int(i * ratio)
    return re.sub(r"\s+", " ", body[max(0, j - 220): j + 320]).strip()


def main() -> None:
    only_paper = None
    if "--paper" in sys.argv:
        only_paper = int(sys.argv[sys.argv.index("--paper") + 1])

    rubrics = {r["id"]: r for r in json.loads(RUBRICS.read_text(encoding="utf-8"))}
    queue: list[dict] = []
    files = sorted(ANSWER_DIR.glob("*.md"))
    if not files:
        raise SystemExit(f"FAIL: no answers in {ANSWER_DIR}")

    for f in files:
        fields, claims, body = parse_claims(f.read_text(encoding="utf-8"))
        aid = fields.get("id")
        if not aid:
            raise SystemExit(f"FAIL: {f.name} has no id")
        if only_paper and fields.get("paper") != only_paper:
            continue
        rub = rubrics.get(aid)
        for i, claim in enumerate(claims):
            queue.append({
                "claim_id": f"{aid}#{i}",
                "answer_id": aid,
                "path": str(f.relative_to(ROOT)).replace("\\", "/"),
                "year": fields.get("year"),
                "paper": fields.get("paper"),
                "question": fields.get("question"),
                "domain": fields.get("domain"),
                "question_text": (rub or {}).get("question_text", ""),
                "claim": claim,
                "context": sentence_around(body, claim),
                # Hint only. Production/appellation topics are what the KB actually holds;
                # business and contemporary issues are not in it at all and must go to
                # tier-1 web or be judged unverifiable.
                "route_hint": "kb_first" if fields.get("domain") in KB_DOMAINS else "web_first",
            })

    missing_ctx = [c["claim_id"] for c in queue if not c["context"]]
    OUT.write_text(json.dumps(queue, indent=1, ensure_ascii=False), encoding="utf-8")

    from collections import Counter
    print(f"OK: {len(queue)} claims queued from {len(files)} answers")
    print(f"OK: route hint — {Counter(c['route_hint'] for c in queue)}")
    print(f"OK: by paper — {dict(sorted(Counter(c['paper'] for c in queue).items()))}")
    if missing_ctx:
        print(f"WARN: {len(missing_ctx)} claim(s) could not be located in their answer body "
              f"(they will be verified on the claim text alone): {', '.join(missing_ctx[:5])}")
    print(f"OK: wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
