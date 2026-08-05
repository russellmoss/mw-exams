r"""One-time reconciliation of the two MW practical source compilations.

Background. The repo carried two compilations that were DISJOINT, not divergent:

  * source/MW_Practical_Papers_Compilation.md      2015-2026, 120 annotations  (the file
    scripts/parse_source.py reads, and the only one CLAUDE.md names authoritative)
  * source/MW_Practical_Papers_Compilation V2.md   2011-2014, 0 annotations

parse_source.py papered over the split with a merge step that carried 2011-2014 forward from
whatever was already in data/exams.json ("an earlier source that is no longer in the repo" —
it was in the repo, under the V2 name). That preserved-from-JSON path is how the 2011 Paper 3
question came to be missing while its 12 wines survived (EK-0143).

Three format defects in V2 blocked a straight concatenation, each of which fails SILENTLY
(the parser simply captures nothing rather than erroring):
  1. line 551 `### **Question (Wines 1-12)**` has no question NUMBER, so QUESTION_RE never
     matched it — this is precisely the lost 2011 P3 question.
  2. wine lines are written `1. Wine...` where the main file writes `1\. Wine...`; the
     parser's WINE_LINE_RE requires the escaped form, so all 144 V2 wine lines would have
     been dropped silently.
  3. question headings are written `### **Question 1 (Wines 1-4)**` where the main file
     writes `### **Question 1   *(Wines 1-4)***`; QUESTION_RE requires the inner emphasis,
     so all 41 V2 questions would have been dropped silently.

Because these fail silently, this script asserts its own post-conditions: after transforming,
every appended question and wine line must match the parser's own regexes (imported from
parse_source, not re-declared) before anything is written.

This script fixes both and appends V2's years to the main file, which is ordered descending
(2026 -> 2015), so 2014 -> 2011 continues that order naturally. Idempotent: it refuses to run
if the main file already contains the V2 years.

Run:  python scripts/reconcile_sources.py [--apply]
Then: python scripts/parse_source.py --strict
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MAIN = ROOT / "source" / "MW_Practical_Papers_Compilation.md"
V2 = ROOT / "source" / "MW_Practical_Papers_Compilation V2.md"

sys.path.insert(0, str(ROOT / "scripts"))
from parse_source import QUESTION_RE, WINE_LINE_RE, WINES_HEADER_RE  # noqa: E402

BARE_WINE_LINE = re.compile(r"^(\d+)\.\s+(?=\S)")
MALFORMED_Q = "### **Question (Wines 1-12)**"
FIXED_Q = "### **Question 1 (Wines 1-12)**"
# V2:   ### **Question 1 (Wines 1-4)**
# main: ### **Question 1   *(Wines 1-4)***
PLAIN_Q_HEADING = re.compile(r"^###\s+\*\*Question\s+(\d+)\s+\(Wines\s+([^)]+)\)\*\*\s*$")


def main():
    apply = "--apply" in sys.argv
    if not MAIN.exists() or not V2.exists():
        raise SystemExit("FAIL: expected both source compilations to exist")

    main_text = MAIN.read_text(encoding="utf-8")
    v2_text = V2.read_text(encoding="utf-8")

    v2_years = sorted(set(re.findall(r"# \*\*Master of Wine Exam (\d{4})\*\*", v2_text)))
    main_years = sorted(set(re.findall(r"# \*\*Master of Wine Exam (\d{4})\*\*", main_text)))
    overlap = sorted(set(v2_years) & set(main_years))
    print(f"main: {len(main_years)} years {main_years[0]}-{main_years[-1]}")
    print(f"V2:   {len(v2_years)} years {v2_years[0]}-{v2_years[-1]}")
    if overlap:
        raise SystemExit(f"REFUSING: years already present in main: {overlap}. "
                         "Reconciliation appears to have run already.")

    # --- fix 1: the unnumbered question heading (2011 Paper 3) ---
    n_q = v2_text.count(MALFORMED_Q)
    v2_fixed = v2_text.replace(MALFORMED_Q, FIXED_Q)

    # --- fixes 2 & 3: match the main file's wine-line escaping and question-heading emphasis ---
    out_lines, n_wines, n_headings = [], 0, 0
    for line in v2_fixed.splitlines():
        hm = PLAIN_Q_HEADING.match(line)
        if hm:
            line = f"### **Question {hm.group(1)}   *(Wines {hm.group(2)})***"
            n_headings += 1
        else:
            new = BARE_WINE_LINE.sub(lambda m: f"{m.group(1)}\\. ", line)
            if new != line:
                n_wines += 1
                line = new
        out_lines.append(line)
    v2_fixed = "\n".join(out_lines)

    print(f"fixes: {n_q} unnumbered question heading(s), "
          f"{n_headings} question headings re-emphasised, {n_wines} wine lines re-escaped")

    # --- post-conditions: the parser's own regexes must now accept everything we appended ---
    errs = []
    if n_wines != 144:
        errs.append(f"expected 144 wine lines (12 papers x 12), got {n_wines}")
    seen_q = seen_w = seen_hdr = 0
    for line in v2_fixed.splitlines():
        if line.startswith("### **Question"):
            seen_q += 1
            if not QUESTION_RE.match(line):
                errs.append(f"question heading not parseable: {line!r}")
        elif WINES_HEADER_RE.match(line):
            seen_hdr += 1
        elif re.match(r"^\d+\\?\.\s", line):
            seen_w += 1
            if not WINE_LINE_RE.match(line.strip()):
                errs.append(f"wine line not parseable: {line!r}")
    print(f"post-check: {seen_q} question headings, {seen_hdr} wine-list headers, "
          f"{seen_w} wine lines — all matched by the parser's regexes"
          if not errs else f"post-check FAILED")
    if errs:
        for e in errs[:10]:
            print("  -", e)
        raise SystemExit("REFUSING to write: transformed V2 would not parse cleanly")

    merged = main_text.rstrip("\n") + "\n\n" + v2_fixed.lstrip("\n").rstrip("\n") + "\n"

    if not apply:
        print("\n[dry-run] no files written. Re-run with --apply, then:")
        print("          python scripts/parse_source.py --strict")
        return 0

    MAIN.write_text(merged, encoding="utf-8")
    print(f"\nwrote {MAIN.relative_to(ROOT)} "
          f"({len(main_text.splitlines())} -> {len(merged.splitlines())} lines, "
          f"now covering {v2_years[0]}-{main_years[-1]})")
    print("next: python scripts/parse_source.py --strict")
    return 0


if __name__ == "__main__":
    sys.exit(main())
