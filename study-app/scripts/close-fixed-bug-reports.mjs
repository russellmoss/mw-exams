/**
 * Close app bug reports whose fix has reached master.
 *
 * No shebang on purpose — tests/close-fixed-bug-reports.test.mjs imports this module, and Vitest
 * wraps a module body in a function before evaluating it, so a `#!` line (only legal at byte 0)
 * becomes "SyntaxError: Invalid or unexpected token" and the suite collects 0 tests. Same reason as
 * scripts/migrate.mjs. It is never executed directly anyway — the workflow runs
 * `node scripts/close-fixed-bug-reports.mjs`.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────────────────────────────
 * An app bug filed from the Coach (`file_bug`) writes a `user_attempts` row and stops. Nothing
 * analyses it and nothing ever closed it, so a bug could be fixed, merged and deployed while its row
 * still read `feedback_status = NULL` — "open" — in the admin queue. Observed 2026-08-07: attempt 407
 * (a footer printing "Total: 44 marks" over sub-parts summing to 50) was fixed in 98075a1 and live in
 * production for five hours while still showing as open, and the only way to answer "did my bug get
 * fixed?" was to read the git log by hand.
 *
 * ── WHY NOT THE EXISTING SWEEPER ───────────────────────────────────────────────────────────────────
 * `sweepStrandedFeedback` deliberately excludes app-level rows (`scope = 'general'`, or no question),
 * and that exclusion is correct: `runFeedbackAnalysis` prompts on the stem, the wines and the model
 * answer, so handing it a footer rendering bug would make it rule on the QUESTION — find it sound,
 * therefore "reject" — and possibly dispatch a generation-rule PR for a bug in a React component. See
 * the comment on that query. App bugs need a write-back keyed on the CODE FIX, which is this.
 *
 * ── THE SIGNAL ─────────────────────────────────────────────────────────────────────────────────────
 * The canonical link is a git trailer on the fixing commit:
 *
 *     Fixes-Bug: 413
 *     Fixes-Bug: 407, 413          (comma- or space-separated, optional #)
 *
 * The trailer is the ONLY thing that closes a row, and it must postdate the report (a commit cannot fix
 * a bug filed after it). Prose references are parsed too, but only to REPORT a candidate — see
 * matchReports for the evidence that talked me out of closing on prose.
 *
 * Every close records the sha, the subject and the matched trailer in `feedback_admin_note`, so a wrong
 * one is auditable and reversible — set `feedback_status` back to NULL and the report reopens. Rows with
 * a status already set are NEVER touched: a human decision is final.
 *
 *   node scripts/close-fixed-bug-reports.mjs                  # dry run, prints what it would close
 *   node scripts/close-fixed-bug-reports.mjs --apply           # writes
 *   node scripts/close-fixed-bug-reports.mjs --apply --sha=abc # names the deployed sha in the note
 */
import { neon } from "@neondatabase/serverless";
import { execFileSync } from "node:child_process";

const APPLY = process.argv.includes("--apply");
const SHA_ARG = (process.argv.find((a) => a.startsWith("--sha=")) || "").slice(6);

// `Fixes-Bug: 407, 413` — one or more ids, optional #, comma or whitespace separated.
const TRAILER = /^[ \t]*fixes-bug[ \t]*:[ \t]*([0-9#,\s]+)$/gim;

// Prose: a bug/attempt/report reference carrying an id. "bug 413", "attempt 407", "bug report 413",
// "feedback row 391". Requires the noun — a bare number never matches.
const PROSE = /\b(?:bug(?:\s+report)?|attempt|feedback\s+row|report)\s*#?\s*(\d{1,6})\b/gi;

// If the matched LINE says this, it is not a claim to have fixed anything.
const NEGATION = /\b(?:not?\s+(?:a\s+)?fix|does\s?n[o']t\s+fix|revert(?:s|ed|ing)?|unrelated\s+to|see\s+also|cf\.|superseded\s+by|duplicate\s+of|caused\s+by)\b/i;

/**
 * Ids referenced by a commit message, split by how strong the signal is.
 * @param {string} message full commit message (subject + body)
 * @returns {{ trailer: number[], prose: Array<{ id: number, text: string }> }}
 */
export function parseBugReferences(message) {
  const msg = String(message || "");
  const trailer = new Set();
  const prose = [];

  for (const m of msg.matchAll(TRAILER)) {
    for (const n of m[1].match(/\d+/g) || []) trailer.add(Number(n));
  }

  for (const line of msg.split(/\r?\n/)) {
    // A trailer line is already handled above; don't also count it as prose.
    if (/^[ \t]*fixes-bug[ \t]*:/i.test(line)) continue;
    if (NEGATION.test(line)) continue;
    for (const m of line.matchAll(PROSE)) {
      const id = Number(m[1]);
      if (!trailer.has(id)) prose.push({ id, text: m[0].trim() });
    }
  }
  return { trailer: [...trailer], prose };
}

/** `git log` since an ISO timestamp, as {sha, isoDate, subject, message} records. */
export function readCommits(sinceIso, gitRunner = defaultGit) {
  if (!sinceIso) return [];
  const RS = "\x1e";
  const out = gitRunner([
    "log", `--since=${sinceIso}`, "--no-merges", `--format=%H%x00%aI%x00%s%x00%B${RS}`,
  ]);
  return out
    .split(RS)
    .map((rec) => rec.replace(/^[\r\n]+/, ""))
    .filter((rec) => rec.trim())
    .map((rec) => {
      const [sha, isoDate, subject, message] = rec.split("\x00");
      return { sha, isoDate, subject, message: message ?? "" };
    });
}

/**
 * Every git call is anchored at the repository root with `-C`, and that is not cosmetic.
 *
 * A pathspec is resolved relative to the CURRENT DIRECTORY, and both this script and the workflow that
 * runs it live in `study-app/` — so `-- study-app/` silently became `study-app/study-app/`, matched
 * nothing, and touchesApp() returned false for every commit. Guard 1 then rejected every prose match:
 * the mechanism reported "no fixing commit found" for a commit that plainly carried the fix. It failed
 * CLOSED, which is the safe direction, and would have looked exactly like "nobody references their bug
 * reports" forever.
 */
let cachedRoot;
function repoRoot() {
  if (cachedRoot === undefined) {
    try {
      cachedRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
    } catch {
      cachedRoot = "";
    }
  }
  return cachedRoot;
}

function defaultGit(args) {
  const root = repoRoot();
  return execFileSync("git", root ? ["-C", root, ...args] : args, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
}

/** Did this commit change anything under study-app/? */
export function touchesApp(sha, gitRunner = defaultGit) {
  const out = gitRunner(["diff-tree", "--no-commit-id", "--name-only", "-r", sha, "--", "study-app/"]);
  return out.trim().length > 0;
}

/**
 * Match open reports against commits.
 *
 * ONLY A TRAILER CLOSES A ROW, and that limit is empirical rather than cautious-by-default. The first
 * build of this script also closed on prose, and run against real history it closed attempt 407 against
 * `0deddf9` — "fix(coach): attach the question a bug was filed from" — which merely CITES 407 as the
 * motivating example while fixing something adjacent. The commit that actually fixed 407 (`98075a1`)
 * never names it in its message at all; the reference lives in a code comment.
 *
 * Put the two side by side and they are indistinguishable to a machine:
 *
 *   0deddf9  subject "fix(coach): attach the question a bug was filed from"   body "Attempt 407 …"
 *   c4f4f14  subject "fix(live-tasting): hold the shopping brief to its …"    body "Coach bug 413: …"
 *
 * Same conventional-commit `fix(` subject, same bare reference in the body — one is a fix claim, one is
 * a citation, and nothing in the text separates them. A wrong close is the failure that matters here: it
 * tells a candidate their bug is fixed when it is not. So prose is reported as a CANDIDATE for a human
 * and never written.
 *
 * Pure — no git, no DB — so the rules are testable.
 *
 * @param {Array<{id:number,submittedAt:string}>} rows open app bug reports
 * @param {Array<{sha:string,isoDate:string,subject:string,message:string}>} commits newest-first
 * @param {(sha:string)=>boolean} appTouch reports whether a commit changed study-app/
 * @returns {{ closes: object[], candidates: object[] }}
 */
export function matchReports(rows, commits, appTouch) {
  const closes = [];
  const candidates = [];
  for (const row of rows) {
    const filedAt = new Date(row.submittedAt).getTime();
    // Oldest first: the FIRST commit carrying the trailer is the fix, not a later follow-up or the test
    // that pins it.
    const eligible = [...commits]
      .reverse()
      .filter((c) => new Date(c.isoDate).getTime() >= filedAt); // guard: cannot predate the report

    const hit = eligible.find((c) => parseBugReferences(c.message).trailer.includes(row.id));
    if (hit) {
      closes.push({
        id: row.id, sha: hit.sha, subject: hit.subject, isoDate: hit.isoDate,
        kind: "trailer", matched: `Fixes-Bug: ${row.id}`,
      });
      continue;
    }

    // No trailer. Surface prose so a fixed-but-unlabelled report is visible in the run rather than
    // silently open forever. Still requires a code change — an empirical-knowledge commit citing the
    // row as evidence is not even a candidate.
    for (const c of eligible) {
      const proseHit = parseBugReferences(c.message).prose.find((p) => p.id === row.id);
      if (!proseHit || !appTouch(c.sha)) continue;
      candidates.push({
        id: row.id, sha: c.sha, subject: c.subject, isoDate: c.isoDate,
        kind: "prose", matched: proseHit.text,
      });
      break;
    }
  }
  return { closes, candidates };
}

export function buildNote(m, deployedSha) {
  return [
    `VALID — FIXED. Closed automatically by scripts/close-fixed-bug-reports.mjs, linked by a Fixes-Bug trailer.`,
    `Fix: ${m.sha.slice(0, 7)} "${m.subject}" (${m.isoDate}).`,
    deployedSha ? `Master at ${deployedSha.slice(0, 7)} when this ran.` : null,
    `If this is wrong, set feedback_status back to NULL — the report reopens.`,
  ]
    .filter(Boolean)
    .join(" ");
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required.");
    process.exit(1);
  }
  const sql = neon(process.env.DATABASE_URL);

  // Open APP-LEVEL reports only. `scope = 'general'` is the Coach's file_bug shape and is what
  // sweepStrandedFeedback excludes; category 'bug' catches a question-scoped row filed via the bug
  // chip. Question-quality feedback stays with the analyser.
  const rows = await sql`
    /* theory-mode-guard: all-modes -- an app bug is an app bug whatever surface it was filed from */
    SELECT id, category, scope, route, feedback_submitted_at
    FROM user_attempts
    WHERE user_feedback IS NOT NULL AND trim(user_feedback) <> ''
      AND feedback_status IS NULL
      AND (scope = 'general' OR category = 'bug')
      AND feedback_submitted_at IS NOT NULL
    ORDER BY feedback_submitted_at ASC
  `;
  if (!rows.length) {
    console.log("No open app bug reports. Nothing to do.");
    return;
  }

  const oldest = rows[0].feedback_submitted_at;
  const sinceIso = new Date(oldest).toISOString();
  const commits = readCommits(sinceIso);
  console.log(
    `${rows.length} open app bug report(s); scanning ${commits.length} commit(s) since ${sinceIso}.`
  );

  const { closes, candidates } = matchReports(
    rows.map((r) => ({ id: r.id, submittedAt: r.feedback_submitted_at })),
    commits,
    (sha) => touchesApp(sha)
  );

  // Printed as a GitHub warning annotation so a fix that forgot its trailer shows up in the Actions run
  // instead of leaving the row open indefinitely. Never written — see matchReports.
  for (const c of candidates) {
    const line =
      `attempt ${c.id} may be fixed by ${c.sha.slice(0, 7)} "${c.subject}" ` +
      `(matched "${c.matched}") but carries no Fixes-Bug trailer, so it stays OPEN. ` +
      `Confirm and close it, or add the trailer next time.`;
    console.log(process.env.GITHUB_ACTIONS ? `::warning title=Unlabelled bug fix::${line}` : `CANDIDATE: ${line}`);
  }

  if (!closes.length) {
    console.log(
      `No open report carries a Fixes-Bug trailer on master yet.` +
        (candidates.length ? ` ${candidates.length} prose candidate(s) reported above.` : "")
    );
    return;
  }

  const deployedSha = SHA_ARG || safeHead();
  let closed = 0;
  for (const m of closes) {
    const note = buildNote(m, deployedSha);
    console.log(`${APPLY ? "CLOSING" : "would close"} attempt ${m.id} — ${m.sha.slice(0, 7)} "${m.subject}"`);
    if (!APPLY) continue;
    // The status guard is repeated in the WHERE clause, not just the SELECT: a human could have
    // decided this row in the seconds since, and their decision wins.
    const updated = await sql`
      UPDATE user_attempts SET
        feedback_status = 'accepted',
        feedback_decided_by = 'auto',
        feedback_reviewed_at = NOW(),
        feedback_admin_note = ${note}
      WHERE id = ${m.id} AND feedback_status IS NULL
      RETURNING id
    `;
    if (updated.length) closed++;
    else console.log(`  skipped ${m.id} — status changed under us (human decided it).`);
  }
  console.log(
    APPLY
      ? `Closed ${closed} report(s).`
      : `Dry run — ${closes.length} report(s) would close. Pass --apply to write.`
  );
}

function safeHead() {
  try {
    return defaultGit(["rev-parse", "HEAD"]).trim();
  } catch {
    return "";
  }
}

// Only run when executed, never on import (the tests import the helpers above).
if (process.argv[1] && process.argv[1].endsWith("close-fixed-bug-reports.mjs")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
