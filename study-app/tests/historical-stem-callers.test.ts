// historical-stem-callers.test.ts — every DB-backed validateQuestion caller must be import-aware.
//
// `stemIsAuthoritative` scopes the stem-shape rules off a verbatim past-paper stem. That only works
// if EVERY place that judges a stored question passes it, and the first attempt missed four of them.
// The consequence was not subtle: the daily corpus audit (question-audit-daily.yml ->
// scripts/audit-questions.mjs) re-ran hours after the import and re-quarantined eleven rows that had
// passed generation cleanly, on id-mark-allocation — a rule that rejects 64% of the real corpus.
//
// This is the same shape of guard as audit-paper-scope-default.test.ts, and for the same reason: a
// contract each caller has to remember is a contract that gets forgotten. A caller reading questions
// out of the database must either pass the flag or say in a comment why it cannot apply.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";

const ROOT = join(__dirname, "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === "dist") continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mts|mjs|js)$/.test(entry)) out.push(p);
  }
  return out;
}

// A caller that builds its question from the DB is one whose object literal reads a row: it sets
// questionText from a snake_case column. Fixtures in tests/ and the corpus-measurement scripts build
// their questions from disk, so they are not DB-backed and are not required to pass the flag.
const DB_BACKED = /questionText:\s*(?:\(?\s*)?(?:r|q|row|rec)\??\.(?:question_text)/;

describe("historical imports are honoured by every DB-backed validator caller", () => {
  it.each(["src", "scripts"])("every validateQuestion caller under %s/ is import-aware", (subdir) => {
    const offenders: string[] = [];
    for (const file of walk(join(ROOT, subdir))) {
      const src = readFileSync(file, "utf8");
      if (!/validateQuestion\s*\(\s*\{/.test(src)) continue;
      if (!DB_BACKED.test(src)) continue;
      if (/stemIsAuthoritative/.test(src)) continue;
      offenders.push(relative(ROOT, file));
    }
    expect(
      offenders,
      "these read questions from the database and judge them without honouring metadata.source " +
        "= 'historical_stem', so they will re-quarantine every imported row on stem-shape rules"
    ).toEqual([]);
  });

  it("no script rewrites a historical import", () => {
    // repair-quarantined-questions.mjs and remediate-questions.mjs fix a question by REGENERATING
    // it. On a historical row that means rewriting a verbatim past-paper stem, which defeats the
    // entire point of the import — so both must exclude the rows in SQL rather than rely on the
    // stem-shape rules never firing.
    for (const name of ["repair-quarantined-questions.mjs", "remediate-questions.mjs"]) {
      const src = readFileSync(join(ROOT, "scripts", name), "utf8");
      expect(src, `${name} must exclude metadata.source = 'historical_stem' from the rows it rewrites`)
        .toMatch(/metadata->>'source'\)?\s+IS\s+DISTINCT\s+FROM\s+'historical_stem'/i);
    }
  });
});
