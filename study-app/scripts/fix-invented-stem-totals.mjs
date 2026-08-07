#!/usr/bin/env node
// fix-invented-stem-totals.mjs — correct LLM-invented "Total: N marks" lines in the stem variants.
//
//   node scripts/fix-invented-stem-totals.mjs [--apply]
//
// Defaults to a DRY RUN. Pass --apply to write.
//
// WHY THIS EXISTS. The Stem Detail derivation prompt used to order the model to emit "the Total line"
// unconditionally, even when the canonical stem printed none. So the model computed one — and
// sometimes computed it wrong. `variantPreservesStructure` could not catch it, because MARK_TOKEN_RE
// requires parentheses and a total line has none: the invented line contributed nothing to either
// signature's markTotal, so the variant looked structurally identical to the canonical.
//
// Reported from the Coach on gen_p2_F5_1786049788105 (attempt 407): sub-parts of 6 + (2x5) + (2x8) +
// (2x9) = 50, total_marks = 50, and both variants ended "Total: 44 marks" — 44 being the "For each
// wine" parts (10+16+18) with the flight-wide 6 for part (a) dropped. Measured across the bank:
// 62 questions carry an invented total line (the canonical prints one on only 3), of which 19
// disagree with their own total_marks.
//
// WHY IT IS NOT ONLY COSMETIC. study/page.tsx sends `displayedStem` — the level-resolved VARIANT, not
// the canonical text — as `questionText` to /api/evaluate-full. So the wrong total was being read by
// the model grading the candidate's answer, not merely printed in a footer. (The footer itself now
// renders the authoritative `total_marks`, so this script is about what the MODELS read.)
//
// WHAT IT CHANGES, AND WHAT IT DELIBERATELY DOES NOT.
//   * Rewrites only the NUMBER on a total line that disagrees with the authoritative `total_marks`,
//     preserving the surrounding text. `total_marks` is the authority: question-rules.mjs enforces it
//     as flightSize x 25 as a HARD rule.
//   * Leaves the 43 invented-but-CORRECT total lines alone. Stripping every invented line would also
//     be defensible — it is what the tightened gate now demands of a fresh derivation — but it would
//     remove the total footer from ~62 questions, which is a product decision and not this fix's job.
//     Nothing reads them wrongly, so they are left for that call.
//   * Never touches question_text. The canonical stem is the source of truth and is not the problem.
//
// Re-running is safe: once a line agrees with total_marks it no longer matches the selection.

import { neon } from "@neondatabase/serverless";

const APPLY = process.argv.includes("--apply");

// Line-anchored, mirroring PRINTED_TOTAL_RE in src/lib/prompts/stemDetail.ts, so this script and the
// gate agree on what counts as a printed total.
const TOTAL_LINE = /^([ \t]*Total[ \t]*:[ \t]*)(\d+)([ \t]*marks?)/im;

function readTotal(text) {
  const m = (text || "").match(TOTAL_LINE);
  return m ? parseInt(m[2], 10) : null;
}

// Swap only the digits, keeping the caller's spacing and "marks"/"mark" spelling intact.
function rewriteTotal(text, authoritative) {
  return text.replace(TOTAL_LINE, (_m, lead, _n, tail) => `${lead}${authoritative}${tail}`);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required.");
    process.exit(1);
  }
  const sql = neon(process.env.DATABASE_URL);

  const rows = await sql`
    SELECT question_id, paper, total_marks, served_count, question_text, stem_exam_real, stem_guided
    FROM generated_questions
    WHERE stem_exam_real IS NOT NULL OR stem_guided IS NOT NULL
  `;

  const fixes = [];
  for (const r of rows) {
    const authoritative = r.total_marks;
    if (!authoritative || authoritative <= 0) continue;

    const next = {};
    for (const col of ["stem_exam_real", "stem_guided"]) {
      const text = r[col];
      if (!text) continue;
      const printed = readTotal(text);
      if (printed === null || printed === authoritative) continue;
      next[col] = { from: printed, text: rewriteTotal(text, authoritative) };
    }
    if (Object.keys(next).length === 0) continue;

    fixes.push({
      questionId: r.question_id,
      paper: r.paper,
      authoritative,
      servedCount: r.served_count,
      canonicalPrintsTotal: readTotal(r.question_text) !== null,
      next,
    });
  }

  if (fixes.length === 0) {
    console.log("Nothing to fix — every printed total already agrees with total_marks.");
    return;
  }

  console.log(`${APPLY ? "APPLYING" : "DRY RUN —"} ${fixes.length} question(s) with a wrong printed total:\n`);
  for (const f of fixes) {
    const cols = Object.entries(f.next)
      .map(([col, v]) => `${col}: ${v.from} -> ${f.authoritative}`)
      .join(", ");
    console.log(
      `  ${f.questionId}  P${f.paper}  served=${f.servedCount ?? 0}` +
        `${f.canonicalPrintsTotal ? "  [canonical prints one too — REVIEW BY HAND]" : ""}\n` +
        `    ${cols}`
    );
  }

  if (!APPLY) {
    console.log("\nRe-run with --apply to write these changes.");
    return;
  }

  let written = 0;
  for (const f of fixes) {
    // Written per column so a row with only one bad variant leaves the other byte-identical.
    if (f.next.stem_exam_real) {
      await sql`
        UPDATE generated_questions SET stem_exam_real = ${f.next.stem_exam_real.text}
        WHERE question_id = ${f.questionId}
      `;
    }
    if (f.next.stem_guided) {
      await sql`
        UPDATE generated_questions SET stem_guided = ${f.next.stem_guided.text}
        WHERE question_id = ${f.questionId}
      `;
    }
    written++;
  }
  console.log(`\nUpdated ${written} question(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
