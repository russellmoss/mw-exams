// audit-questions.mjs — run the hard validator over every generated question.
//   node scripts/audit-questions.mjs            (dry run: report only)
//   node scripts/audit-questions.mjs --apply     (quarantine HARD violations: stem_answer_keys.validated=false)
// Reads ground_truth from stem_answer_keys (already-resolved variety/region/country/is_blend per wine).
import { readFileSync } from "fs";
import { neon } from "@neondatabase/serverless";
import { validateQuestion } from "../src/lib/question-validator.ts";

const DB = process.env.DATABASE_URL || readFileSync(".env.local", "utf8").match(/DATABASE_URL\s*=\s*"?([^"\n\r]+)"?/)[1].trim();
const sql = neon(DB);
const apply = process.argv.includes("--apply");

if (apply) {
  await sql`ALTER TABLE stem_answer_keys ADD COLUMN IF NOT EXISTS invalid_reasons JSONB`;
  // CF-1: flag the question row itself so the MAIN study flow (not just Stem Sniper) can exclude it.
  await sql`ALTER TABLE generated_questions ADD COLUMN IF NOT EXISTS invalid_reasons JSONB`;
}

const rows = await sql`
  SELECT g.question_id, g.paper, g.family, g.question_text, g.total_marks, k.ground_truth, k.validated
  FROM generated_questions g JOIN stem_answer_keys k ON k.question_id = g.question_id
  ORDER BY g.paper, g.family`;

let hardCount = 0, softCount = 0, quarantined = 0;
const byRule = {};
for (const r of rows) {
  const gt = typeof r.ground_truth === "string" ? JSON.parse(r.ground_truth) : r.ground_truth;
  const res = validateQuestion({
    questionId: r.question_id, paper: r.paper, family: r.family,
    questionText: r.question_text, totalMarks: r.total_marks, wines: gt,
  });
  const hard = res.violations.filter((x) => x.severity === "hard");
  for (const x of res.violations) byRule[x.rule] = (byRule[x.rule] || 0) + 1;
  if (res.violations.length) {
    console.log(`${hard.length ? "HARD" : "soft"}  ${r.question_id}  (P${r.paper} ${r.family})`);
    res.violations.forEach((x) => console.log(`        [${x.severity}] ${x.rule}: ${x.detail}`));
  }
  if (hard.length) {
    hardCount++;
    if (apply) {
      await sql`UPDATE stem_answer_keys SET validated = false, invalid_reasons = ${JSON.stringify(hard)}::jsonb WHERE question_id = ${r.question_id}`;
      await sql`UPDATE generated_questions SET invalid_reasons = ${JSON.stringify(hard)}::jsonb WHERE question_id = ${r.question_id}`;
      quarantined++;
    }
  } else if (apply) {
    // clean now — clear any stale flag so a fixed/regenerated question returns to service
    await sql`UPDATE generated_questions SET invalid_reasons = NULL WHERE question_id = ${r.question_id} AND invalid_reasons IS NOT NULL`;
  }
  if (!hard.length && res.violations.length) softCount++;
}

console.log(`\n──────── AUDIT SUMMARY ────────`);
console.log(`questions audited:   ${rows.length}`);
console.log(`HARD violations:     ${hardCount}  (${Math.round((hardCount / rows.length) * 100)}%)`);
console.log(`soft-only:           ${softCount}`);
console.log(`by rule:             ${JSON.stringify(byRule)}`);
console.log(apply ? `QUARANTINED (validated=false): ${quarantined}` : `(dry run — pass --apply to quarantine the HARD ones)`);
