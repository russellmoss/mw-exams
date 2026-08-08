import { describe, it, expect } from "vitest";
import {
  parseBugReferences,
  matchReports,
  readCommits,
  touchesApp,
  buildNote,
} from "../scripts/close-fixed-bug-reports.mjs";

/**
 * The write-back that closes app bug reports when their fix lands. A WRONG close is the failure that
 * matters — it tells a candidate their bug is fixed when it is not — so most of this file is
 * false-positive pressure rather than happy path.
 *
 * The two real reports this mechanism was built for are used as fixtures: 407 (footer printed
 * "Total: 44 marks" over sub-parts summing to 50) and 413 (a Paper 1 Live Tasting brief specifying
 * Paper 3 dessert wines). Neither of their fixing commits carried a trailer — 413's names the bug in
 * prose, 407's does not name it at all — which is why prose is PARSED (to report a candidate) but
 * never closes a row.
 */

const FILED_407 = "2026-08-07T19:12:32.985Z";
const FILED_413 = "2026-08-07T22:09:16.637Z";

// The real commit that fixed 407, abridged.
const COMMIT_407 = {
  sha: "98075a1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  isoDate: "2026-08-07T19:50:36.000Z",
  subject: "fix(stems): stop inventing mark totals in Stem Detail variants",
  message: `fix(stems): stop inventing mark totals in Stem Detail variants

The footer scraped an LLM-authored "Total: N marks" line out of the stem.
Reported from the Coach, attempt 407.`,
};

// The real commit that fixed 413, abridged.
const COMMIT_413 = {
  sha: "c4f4f14bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  isoDate: "2026-08-08T00:24:00.000Z",
  subject: "fix(live-tasting): hold the shopping brief to its paper's scope",
  message: `fix(live-tasting): hold the shopping brief to its paper's scope

Coach bug 413: a brief headed "Paper 1" told the candidate to buy dessert wines.

Fixes-Bug: 413`,
};

const always = () => true;
const never = () => false;

describe("parseBugReferences — the canonical trailer", () => {
  it("reads a single id", () => {
    expect(parseBugReferences("subject\n\nFixes-Bug: 413").trailer).toEqual([413]);
  });

  it("reads several ids, comma or space separated, with or without #", () => {
    expect(parseBugReferences("s\n\nFixes-Bug: 407, 413").trailer).toEqual([407, 413]);
    expect(parseBugReferences("s\n\nFixes-Bug: 407 413").trailer).toEqual([407, 413]);
    expect(parseBugReferences("s\n\nFixes-Bug: #407, #413").trailer).toEqual([407, 413]);
  });

  it("reads several trailer lines and is case-insensitive", () => {
    const r = parseBugReferences("s\n\nfixes-bug: 1\nFIXES-BUG: 2");
    expect(r.trailer.sort((a, b) => a - b)).toEqual([1, 2]);
  });

  it("does not double-count a trailer id as prose", () => {
    const r = parseBugReferences("s\n\nFixes-Bug: 413");
    expect(r.prose.map((p) => p.id)).not.toContain(413);
  });
});

describe("parseBugReferences — prose", () => {
  it("reads the two phrasings this repo's real fixes used", () => {
    expect(parseBugReferences(COMMIT_407.message).prose.map((p) => p.id)).toContain(407);
    expect(parseBugReferences("Coach bug 413: a brief").prose.map((p) => p.id)).toContain(413);
  });

  it("reads 'bug report N' and 'feedback row N'", () => {
    expect(parseBugReferences("closes bug report 391").prose.map((p) => p.id)).toContain(391);
    expect(parseBugReferences("from feedback row 391").prose.map((p) => p.id)).toContain(391);
  });

  it("never matches a bare number — the noun is required", () => {
    expect(parseBugReferences("bumped the cap to 413").prose).toEqual([]);
    expect(parseBugReferences("413 questions were requantified").prose).toEqual([]);
    expect(parseBugReferences("see EK-0413 for the rationale").prose).toEqual([]);
  });

  it("skips a negated or merely-referential line", () => {
    for (const line of [
      "this is not a fix for bug 413",
      "does not fix bug 413",
      "Reverts the change from bug 413",
      "see also bug 413",
      "duplicate of bug 413",
      "caused by bug 413",
    ]) {
      expect(parseBugReferences(line).prose, line).toEqual([]);
    }
  });

  it("judges negation per line, so one hedged line does not mask a real one", () => {
    const msg = "fix(x): real fix\n\nCloses bug 407.\nThis does not fix bug 413.";
    const ids = parseBugReferences(msg).prose.map((p) => p.id);
    expect(ids).toContain(407);
    expect(ids).not.toContain(413);
  });
});

describe("matchReports — ONLY a trailer closes a row", () => {
  const rows413 = [{ id: 413, submittedAt: FILED_413 }];

  it("closes on an explicit trailer", () => {
    const { closes, candidates } = matchReports(rows413, [COMMIT_413], always);
    expect(closes).toHaveLength(1);
    expect(closes[0].id).toBe(413);
    expect(closes[0].kind).toBe("trailer");
    expect(closes[0].matched).toBe("Fixes-Bug: 413");
    expect(candidates).toEqual([]);
  });

  it("closes on a trailer even from a root-only commit — the trailer IS the intent", () => {
    const trailerOnly = {
      sha: "0000000dddddddddddddddddddddddddddddddddd",
      isoDate: "2026-08-08T01:00:00.000Z",
      subject: "chore: retire the offending config",
      message: "chore: retire the offending config\n\nFixes-Bug: 413",
    };
    expect(matchReports(rows413, [trailerOnly], never).closes).toHaveLength(1);
  });

  it("does NOT close on prose — it reports a candidate instead", () => {
    // The regression this rule exists for: run against real history, prose matching closed attempt 407
    // against 0deddf9 "fix(coach): attach the question a bug was filed from", which merely CITES 407
    // while fixing something adjacent. The real fix (98075a1) never names 407 in its message.
    const { closes, candidates } = matchReports([{ id: 407, submittedAt: FILED_407 }], [COMMIT_407], always);
    expect(closes).toEqual([]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].kind).toBe("prose");
    expect(candidates[0].matched.toLowerCase()).toContain("407");
  });

  it("does not even offer a candidate for a root-only commit — the EK-citation vector", () => {
    // Empirical-knowledge entries quote attempt ids as evidence and touch no code. A report must never
    // be closed, or even flagged, because its own postmortem was written.
    const ekCommit = {
      sha: "f0b87a6ccccccccccccccccccccccccccccccccc",
      isoDate: "2026-08-08T01:00:00.000Z",
      subject: "docs(ek): EK-0159 — the shopping-brief postmortem [skip ci]",
      message: `docs(ek): EK-0159 — the shopping-brief postmortem [skip ci]

evidence: Coach bug report attempt 413 (user 2, route /live-tasting/lts_idpk44j2t)`,
    };
    const { closes, candidates } = matchReports(rows413, [ekCommit], never);
    expect(closes).toEqual([]);
    expect(candidates).toEqual([]);
  });
});

describe("matchReports — a fix cannot predate its report", () => {
  it("ignores a trailer on a commit older than the report", () => {
    const older = { ...COMMIT_413, isoDate: "2026-08-07T10:00:00.000Z" };
    expect(matchReports([{ id: 413, submittedAt: FILED_413 }], [older], always).closes).toEqual([]);
  });

  it("matches each report to its own trailer when several are in range", () => {
    const fix407 = {
      sha: "98075a1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      isoDate: "2026-08-07T19:50:36.000Z",
      subject: "fix(stems): stop inventing mark totals in Stem Detail variants",
      message: "fix(stems): stop inventing mark totals\n\nFixes-Bug: 407",
    };
    const rows = [
      { id: 407, submittedAt: FILED_407 },
      { id: 413, submittedAt: FILED_413 },
    ];
    const { closes } = matchReports(rows, [COMMIT_413, fix407], always);
    expect(closes.map((x) => [x.id, x.sha.slice(0, 7)])).toEqual([
      [407, "98075a1"],
      [413, "c4f4f14"],
    ]);
  });

  it("records the EARLIEST trailered commit, not a later follow-up that repeats it", () => {
    const later = {
      sha: "9999999eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      isoDate: "2026-08-09T00:00:00.000Z",
      subject: "test: pin the regression",
      message: "test: pin the regression\n\nFixes-Bug: 413",
    };
    const { closes } = matchReports([{ id: 413, submittedAt: FILED_413 }], [later, COMMIT_413], always);
    expect(closes).toHaveLength(1);
    expect(closes[0].sha.slice(0, 7)).toBe("c4f4f14");
  });

  it("reports nothing at all when no commit references the row", () => {
    const out = matchReports([{ id: 391, submittedAt: FILED_407 }], [COMMIT_413], always);
    expect(out.closes).toEqual([]);
    expect(out.candidates).toEqual([]);
  });
});

describe("touchesApp — must be anchored at the repo root", () => {
  it("passes -C <root> so the pathspec is not resolved against the cwd", () => {
    // The bug this pins shipped in the first draft and failed CLOSED: the script and its workflow both
    // run from study-app/, where the pathspec `study-app/` means `study-app/study-app/`. touchesApp
    // returned false for every commit, so no prose candidate was ever reported and the mechanism looked
    // like "nobody references their bug reports".
    const seen = [];
    const runner = (args) => {
      seen.push(args);
      return "study-app/src/lib/x.ts\n";
    };
    expect(touchesApp("abc123", runner)).toBe(true);
    expect(seen[0]).toContain("study-app/");
    expect(seen[0]).toContain("diff-tree");
  });

  it("reads no change as false", () => {
    expect(touchesApp("abc123", () => "\n")).toBe(false);
  });
});

describe("readCommits", () => {
  it("parses the NUL/RS-delimited log format, multi-line bodies intact", () => {
    const fake = () =>
      [
        `aaa\x00 2026-08-08T00:00:00Z\x00subj one\x00subj one\n\nbody line\nFixes-Bug: 5\x1e`,
        `bbb\x002026-08-07T00:00:00Z\x00subj two\x00subj two\x1e`,
      ].join("");
    const out = readCommits("2026-08-01T00:00:00Z", fake);
    expect(out).toHaveLength(2);
    expect(out[0].sha).toBe("aaa");
    expect(out[0].message).toContain("Fixes-Bug: 5");
    expect(parseBugReferences(out[0].message).trailer).toEqual([5]);
    expect(out[1].subject).toBe("subj two");
  });

  it("returns nothing without a since bound rather than scanning all history", () => {
    expect(readCommits(null, () => "should not be called")).toEqual([]);
  });
});

describe("buildNote", () => {
  const m = {
    id: 413, sha: "c4f4f14bbbb", subject: "fix(live-tasting): scope the brief",
    isoDate: "2026-08-08T00:24:00.000Z", kind: "trailer", matched: "Fixes-Bug: 413",
  };

  it("records the fix, how it was linked, and how to undo it", () => {
    const note = buildNote(m, "0740997aaaa");
    expect(note).toContain("c4f4f14");
    expect(note).toContain("fix(live-tasting): scope the brief");
    expect(note).toContain("0740997");
    expect(note).toMatch(/set feedback_status back to NULL/i);
  });

  it("omits the master sha when it could not be resolved", () => {
    expect(buildNote(m, "")).not.toMatch(/Master at/);
  });
});
