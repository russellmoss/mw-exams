"""
Apply claim-verification verdicts to the theory model answers and build the ledger.

Stage 3 of the claim-verification pipeline:

    scripts/extract_theory_claims.py   -> data/theory/claims_queue.json
    .claude/agents/claim-verifier.md   -> data/theory/_claims_work/*.json
    scripts/apply_claim_verdicts.py    -> corrected answers + claim_verification.json   (this file)

What it does, and what it refuses to do
---------------------------------------
For a WRONG or VERIFIED_IMPRECISE verdict the verifier supplies `corrected_sentence`. This
script swaps that sentence into the answer body and updates the matching
`claims_to_verify` entry. It applies a correction ONLY when the original sentence is found
verbatim in the body: a fuzzy replacement in a 900-word essay risks corrupting prose that
nobody will re-read, so a near-miss is reported for a human instead of guessed at.

It never edits on an UNVERIFIED verdict. An unsourced claim is not a wrong claim, and
silently rewriting one would trade a documented uncertainty for an undocumented invention.
Those are recorded in the ledger with `recommend: hedge` so they can be softened
deliberately.

Every answer gains a `claims_verified` frontmatter block, so the provenance of each figure
travels with the answer rather than living only in a side file.

Usage:
    python scripts/apply_claim_verdicts.py            # apply
    python scripts/apply_claim_verdicts.py --dry-run  # report only
"""

from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORK = ROOT / "data" / "theory" / "_claims_work"
QUEUE = ROOT / "data" / "theory" / "claims_queue.json"
LEDGER = ROOT / "data" / "theory" / "claim_verification.json"

VERDICTS = {"VERIFIED", "VERIFIED_IMPRECISE", "WRONG", "UNVERIFIED", "HEDGED", "NOT_A_CLAIM"}
# HEDGED is the deliberate counterpart to UNVERIFIED. UNVERIFIED means "could not source, left
# alone" and is never rewritten, because swapping a documented uncertainty for an undocumented
# invention is a worse trade. HEDGED means "could not source, and the sentence has been
# explicitly rewritten to stop asserting the unsupportable precision" — an intentional edit
# with a recorded reason, which is why it IS applied.
CORRECTABLE = {"VERIFIED_IMPRECISE", "WRONG", "HEDGED"}


def norm(s: str) -> str:
    s = (s.replace("’", "'").replace("‘", "'")
          .replace("“", '"').replace("”", '"')
          .replace("–", "-").replace("—", "-"))
    return re.sub(r"\s+", " ", s).strip()


def split_fm(text: str) -> tuple[str, str]:
    end = text.find("\n---", 3)
    return text[3:end], text[end + 4:]


def find_sentence_containing(body: str, target_norm: str) -> tuple[int, int] | None:
    """Character span of the sentence in `body` containing the normalised `target_norm`.

    Sentence splitting is deliberately conservative — it breaks on `. ! ?` followed by
    whitespace and a capital, which keeps decimals ("0.45 micron"), abbreviations and
    "mg/L." intact. Returns None rather than guessing when the target spans a boundary or
    is absent, so the caller can report it for a human instead of corrupting the prose.
    """
    spans: list[tuple[int, int]] = []
    start = 0
    for m in re.finditer(r"(?<=[.!?])\s+(?=[A-Z\"'*])", body):
        spans.append((start, m.start()))
        start = m.end()
    spans.append((start, len(body)))

    for a, b in spans:
        if target_norm in norm(body[a:b]):
            # Trim trailing whitespace/newlines out of the replaced span.
            end = b
            while end > a and body[end - 1].isspace():
                end -= 1
            return (a, end)
    return None


def main() -> None:
    dry = "--dry-run" in sys.argv
    downgrade = "--downgrade-malformed" in sys.argv
    downgraded: list[tuple[str, str]] = []
    if not WORK.exists():
        raise SystemExit(f"FAIL: {WORK} not found — run the claim-verifier batches first")

    queue = {c["claim_id"]: c for c in json.loads(QUEUE.read_text(encoding="utf-8"))}

    verdicts: dict[str, dict] = {}
    errors: list[str] = []
    for bf in sorted(WORK.glob("*.json")):
        try:
            rows = json.loads(bf.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            errors.append(f"{bf.name}: invalid JSON — {exc}")
            continue
        for r in rows:
            cid = r.get("claim_id")
            if not cid:
                errors.append(f"{bf.name}: row with no claim_id")
                continue
            if cid not in queue:
                errors.append(f"{cid}: not in the claims queue (stale or mistyped id)")
                continue
            if cid in verdicts:
                errors.append(f"{cid}: duplicate verdict in {bf.name}")
                continue
            if r.get("verdict") not in VERDICTS:
                errors.append(f"{cid}: bad verdict {r.get('verdict')!r}")
                continue
            # Two structural requirements, both load-bearing:
            #   * a correction must carry the sentence that replaces the old one;
            #   * a VERIFIED verdict must cite something — an uncited "verified" is just an
            #     assertion, the same failure the rubric quote gate exists to stop.
            # Malformed rows hard-fail by default. With --downgrade-malformed they are
            # demoted to UNVERIFIED instead, which is the honest reading: by our own
            # standard a claim with no source has not been verified. The demotion is
            # recorded in the ledger so it is never mistaken for a real UNVERIFIED.
            malformed = None
            if r["verdict"] in CORRECTABLE and not r.get("corrected_sentence"):
                malformed = f"{r['verdict']} with no corrected_sentence"
            elif r["verdict"] in ("VERIFIED", "VERIFIED_IMPRECISE", "WRONG"):
                src = r.get("source") or {}
                if not (src.get("publisher") or src.get("ref")):
                    malformed = f"{r['verdict']} with no source"
            if malformed:
                if not downgrade:
                    errors.append(f"{cid}: {malformed}")
                    continue
                downgraded.append((cid, malformed))
                r = {**r, "verdict": "UNVERIFIED", "recommend": "hedge",
                     "note": f"downgraded from {r['verdict']}: {malformed}. "
                             f"{r.get('note', '')}".strip()}
            verdicts[cid] = r

    if errors:
        print(f"FAIL: {len(errors)} problem(s) in the verdict files")
        for e in errors[:25]:
            print("  -", e)
        raise SystemExit(1)

    # --- apply corrections, grouped by answer file ---
    by_answer: dict[str, list[dict]] = {}
    for cid, v in verdicts.items():
        by_answer.setdefault(queue[cid]["answer_id"], []).append({**v, "_q": queue[cid]})

    applied = skipped = already = 0
    unmatched: list[str] = []
    collided: list[tuple[str, str]] = []
    touched: list[str] = []

    for aid, rows in sorted(by_answer.items()):
        path = ROOT / rows[0]["_q"]["path"]
        text = path.read_text(encoding="utf-8")
        head, body = split_fm(text)
        orig_body = body
        changed = False

        # Resolve every correction against the ORIGINAL body first, then apply them in
        # reverse document order so earlier edits cannot shift later offsets.
        #
        # Two claims frequently live in one sentence (an SO2 target and its pH pairing, say).
        # Applying both blindly would let the second correction overwrite the first, or fail
        # to find its anchor because the first already rewrote it — which is how nine
        # corrections silently vanished on the first run. Overlaps are reported for a human
        # to merge instead.
        edits: list[tuple[int, int, str, str]] = []
        for r in rows:
            if r["verdict"] not in CORRECTABLE:
                continue
            # Idempotence: once a correction has been applied and committed, its original
            # claim text no longer exists in the body. That is success, not failure — so
            # check for the REPLACEMENT before reporting a miss, or every re-run floods the
            # output with false alarms for work already done.
            if norm(r["corrected_sentence"]) in norm(body):
                already += 1
                continue
            target = norm(r["_q"]["claim"])
            sent = find_sentence_containing(body, target) if target else None
            if sent is None:
                unmatched.append(r["claim_id"])
                skipped += 1
                continue
            edits.append((sent[0], sent[1], norm(r["corrected_sentence"]), r["claim_id"]))

        edits.sort(key=lambda e: e[0])
        keep: list[tuple[int, int, str, str]] = []
        subsumed: dict[str, str] = {}   # collided claim_id -> the replacement covering it
        for e in edits:
            if keep and e[0] < keep[-1][1]:
                # Same sentence as the previous correction. Only the first is applied, but
                # the loser's register entry must still be re-pointed at the sentence that
                # now stands, or it will reference text that no longer exists in the body.
                collided.append((keep[-1][3], e[3]))
                subsumed[e[3]] = keep[-1][2]
                skipped += 1
                continue
            keep.append(e)

        # Record where EVERY registered claim of this answer sits before any edit. A rewritten
        # sentence orphans every claim registered from it — not only the ones being corrected
        # — and an orphaned register entry breaks the answer gate's check that each claim
        # actually appears in the body.
        pre_spans: dict[str, tuple[int, int]] = {}
        for r in rows:
            t = norm(r["_q"]["claim"])
            sp = find_sentence_containing(body, t) if t else None
            if sp:
                pre_spans[r["claim_id"]] = sp

        for a, b, new, _cid in sorted(keep, key=lambda e: -e[0]):
            body = body[:a] + new + body[b:]
            changed = True
            applied += 1

        # Re-point any claim whose sentence was replaced by a correction.
        for r in rows:
            cid = r["claim_id"]
            sp = pre_spans.get(cid)
            if not sp:
                continue
            covering = next((e for e in keep if e[0] <= sp[0] < e[1]), None)
            if covering and cid not in {c for _, _, _, c in keep}:
                sent = norm(covering[2])
                repl = sent[:120].rsplit(" ", 1)[0] if len(sent) > 130 else sent
                head = head.replace(r["_q"]["claim"], repl)

        # Update the claims_to_verify entries that were corrected.
        #
        # The register must keep pointing at text that is actually IN the answer, because
        # build_theory_answers.py checks exactly that. The verifier's `corrected_claim` is
        # written independently of `corrected_sentence` and the two do not always align
        # verbatim, so prefer it only when it survived into the rewritten body; otherwise
        # derive the register entry from the sentence that was actually inserted.
        applied_ids = {c for _, _, _, c in keep}
        for r in rows:
            if r["verdict"] not in CORRECTABLE:
                continue
            if r["claim_id"] not in applied_ids and r["claim_id"] not in subsumed:
                continue
            cc = (r.get("corrected_claim") or "").strip()
            replacement = cc if cc and norm(cc) in norm(body) else None
            if replacement is None:
                sent = norm(subsumed.get(r["claim_id"]) or r["corrected_sentence"])
                # A register entry is a fragment, not a whole sentence; take a middle slice
                # long enough to be distinctive and short enough to stay a claim.
                replacement = sent[:120].rsplit(" ", 1)[0] if len(sent) > 130 else sent
            head = head.replace(r["_q"]["claim"], replacement)

        # Stamp the verification record into frontmatter.
        head = re.sub(r"\nclaims_verified:.*?(?=\n\w+:)", "\n", head, flags=re.S)
        lines = ["claims_verified:"]
        for r in sorted(rows, key=lambda x: x["claim_id"]):
            src = r.get("source") or {}
            lines.append(f"  - claim_id: {r['claim_id']}")
            lines.append(f"    verdict: {r['verdict']}")
            if src.get("publisher"):
                lines.append(f"    source: {json.dumps(src.get('publisher'))}")
            if src.get("tier"):
                lines.append(f"    tier: {src['tier']}")
            if r.get("time_sensitive"):
                lines.append("    time_sensitive: true")
        block = "\n".join(lines)
        head = head.rstrip("\n") + "\n" + block + "\n"

        if changed:
            # The frontmatter word_count must track the edited body — a corrected sentence
            # is rarely the same length as the one it replaced, and the answer gate checks
            # the count against the paper's time-derived band.
            stripped = re.sub(r"^#{1,6}\s*", "", body, flags=re.M)
            stripped = re.sub(r"^\s*[-*]\s+", "", stripped, flags=re.M)
            wc = len(re.findall(r"\b[\w'-]+\b", stripped))
            head = re.sub(r"^word_count:.*$", f"word_count: {wc}", head, flags=re.M)

        # head must end on a newline, or the closing fence fuses to the last field
        # ("tier: 1---") and the frontmatter no longer parses.
        new_text = "---" + head.rstrip("\n") + "\n---\n" + body
        if True:
            if not dry:
                path.write_text(new_text, encoding="utf-8")
            if body != orig_body:
                touched.append(aid)

    counts = Counter(v["verdict"] for v in verdicts.values())
    ledger = {
        "claims_total_registered": len(queue),
        "claims_verified_so_far": len(verdicts),
        "coverage_pct": round(100 * len(verdicts) / max(len(queue), 1), 1),
        "verdicts": dict(counts),
        "corrections_applied": applied,
        "corrections_already_present": already,
        "corrections_unmatched": unmatched,
        "corrections_collided": [list(c) for c in collided],
        "downgraded_malformed": [list(d) for d in downgraded],
        "answers_edited": sorted(touched),
        "rows": [
            {
                "claim_id": cid,
                "answer_id": queue[cid]["answer_id"],
                "paper": queue[cid]["paper"],
                "claim": queue[cid]["claim"],
                "verdict": v["verdict"],
                "confidence": v.get("confidence"),
                "source": v.get("source"),
                "corrected_claim": v.get("corrected_claim"),
                "time_sensitive": bool(v.get("time_sensitive")),
                "recommend": v.get("recommend"),
                "note": v.get("note", ""),
            }
            for cid, v in sorted(verdicts.items())
        ],
    }
    if not dry:
        LEDGER.write_text(json.dumps(ledger, indent=1, ensure_ascii=False), encoding="utf-8")

    print(f"{'DRY RUN — ' if dry else ''}OK: {len(verdicts)} of {len(queue)} claims verified "
          f"({ledger['coverage_pct']}%)")
    for k in ("VERIFIED", "VERIFIED_IMPRECISE", "WRONG", "UNVERIFIED", "NOT_A_CLAIM"):
        if counts.get(k):
            print(f"     {counts[k]:4d}  {k}")
    print(f"OK: {applied} correction(s) applied to {len(touched)} answer(s)")
    if already:
        print(f"OK: {already} correction(s) already present from an earlier run (idempotent)")
    if unmatched:
        print(f"WARN: {len(unmatched)} correction(s) could not be located verbatim and were "
              f"NOT applied — fix by hand: {', '.join(unmatched[:8])}")
    if collided:
        print(f"WARN: {len(collided)} correction(s) target a sentence another correction already "
              f"rewrote, so only the first was applied. Merge these by hand:")
        for a, b in collided[:10]:
            print(f"       {a}  collides with  {b}")
    if downgraded:
        print(f"NOTE: {len(downgraded)} verdict(s) demoted to UNVERIFIED for missing a source or "
              f"correction — by our own standard they were never verified.")
    ts = sum(1 for r in ledger["rows"] if r["time_sensitive"])
    print(f"OK: {ts} claim(s) flagged time-sensitive")
    if not dry:
        print(f"OK: wrote {LEDGER.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
