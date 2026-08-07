#!/usr/bin/env node
// reset-drifted-stem-variants.mjs — clear stem variants whose SUB-PART MARKS drifted from canonical.
//
//   node scripts/reset-drifted-stem-variants.mjs [--apply]
//
// Defaults to a DRY RUN. Pass --apply to write.
//
// WHY THIS EXISTS. Stem Detail variants are LLM rewrites of the canonical stem, and the prompt has
// always forbidden touching the marks ("NEVER alter, add, remove or renumber marks"). Some legacy
// rows broke it anyway: measured 2026-08-07, 28 of the 154 questions with stored variants carry
// sub-part mark tokens that sum to something other than the canonical's — almost always INFLATED
// (a 50-mark question whose variant sub-parts sum to 70). In every case the canonical agrees with
// total_marks and the VARIANT is the wrong one.
//
// WHY IT MATTERS. study/page.tsx serves `displayedStem` — the variant — and sends that same text to
// /api/evaluate-full. So on these questions the candidate both READS and is GRADED AGAINST a mark
// allocation the question does not have. That is worse than a wrong footer, which is how it was
// found: the footer fix (attempt 407, gen_p2_F5_1786049788105) exposed it.
//
// WHY NULL RATHER THAN REPAIR. There is no safe way to rewrite a drifted variant here — the marks are
// woven into rewritten prose, and guessing which sub-part lost or gained marks would be inventing
// exam content. NULL is the state ensureStemVariants already knows how to handle: on the next serve it
// re-derives that level, and `variantPreservesStructure` now also compares the printed Total, so a
// bad re-derivation is rejected and the level falls back to the canonical stem instead of being
// stored. Repairing by hand is what the gate exists to make unnecessary.
//
// ONLY THE DRIFTED COLUMN IS CLEARED. Where one level is sound it is left byte-identical;
// updateStemVariants COALESCEs, so re-derivation fills only the NULL column.
//
// KNOWN COST. A level that keeps failing the gate stays NULL and is retried on each serve — the
// re-derivation loop documented in ensureStemVariants. Bounded here: these 28 have served 0-5 times
// each, and the derivation is one Sonnet call, so the worst case is tens of calls rather than a
// runaway. Correctness first; if a specific question proves unfixable it should be quarantined.
//
// Re-running is safe: a NULL column is no longer a drifted column, so it drops out of the selection.

import { neon } from "@neondatabase/serverless";

const APPLY = process.argv.includes("--apply");

// Mirrors MARK_TOKEN_RE in src/lib/prompts/stemDetail.ts — kept inline so this script has no build
// step, the same tradeoff fix-invented-stem-totals.mjs makes. If that regex changes, change this.
// NOTE it requires parentheses, so an unparenthesised "Total: N marks" line is deliberately NOT
// counted here; that line is the other script's problem.
const MARK_TOKEN_RE = /\(\s*(?:(\d+)\s*[x×]\s*)?(\d+)\s*marks?\s*\)/gi;

function markTotal(text) {
  let sum = 0;
  for (const m of (text || "").replace(/\*\*/g, "").matchAll(MARK_TOKEN_RE)) {
    sum += (m[1] ? parseInt(m[1], 10) : 1) * parseInt(m[2], 10);
  }
  return sum;
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

  const resets = [];
  for (const r of rows) {
    const canonical = markTotal(r.question_text);
    // A canonical that disagrees with its own total_marks is a different defect; clearing variants
    // would not fix it and the comparison base would be untrustworthy. Skip loudly.
    if (canonical !== r.total_marks) {
      console.log(
        `  SKIP ${r.question_id}: canonical sub-parts sum ${canonical} but total_marks is ${r.total_marks} — fix the question first.`
      );
      continue;
    }

    const cols = [];
    for (const col of ["stem_exam_real", "stem_guided"]) {
      if (!r[col]) continue;
      const variant = markTotal(r[col]);
      if (variant !== canonical) cols.push({ col, variant });
    }
    if (cols.length === 0) continue;

    resets.push({ questionId: r.question_id, paper: r.paper, canonical, servedCount: r.served_count, cols });
  }

  if (resets.length === 0) {
    console.log("Nothing to reset — every stored variant agrees with its canonical stem on marks.");
    return;
  }

  console.log(`\n${APPLY ? "APPLYING" : "DRY RUN —"} clearing variants on ${resets.length} question(s):\n`);
  for (const r of resets) {
    const detail = r.cols.map((c) => `${c.col} (sums ${c.variant}, should be ${r.canonical})`).join(", ");
    console.log(`  ${r.questionId}  P${r.paper}  served=${r.servedCount ?? 0}\n    clearing ${detail}`);
  }

  if (!APPLY) {
    console.log("\nRe-run with --apply to write these changes.");
    return;
  }

  let cleared = 0;
  for (const r of resets) {
    // Per column, so a sound level is never rewritten. Column names come from the closed literal list
    // above, never from data, so the interpolation below cannot be influenced by a row.
    for (const { col } of r.cols) {
      if (col === "stem_exam_real") {
        await sql`UPDATE generated_questions SET stem_exam_real = NULL WHERE question_id = ${r.questionId}`;
      } else {
        await sql`UPDATE generated_questions SET stem_guided = NULL WHERE question_id = ${r.questionId}`;
      }
      cleared++;
    }
  }
  console.log(`\nCleared ${cleared} variant column(s) across ${resets.length} question(s).`);
  console.log("They re-derive on next serve; a derivation that fails the gate falls back to canonical.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
