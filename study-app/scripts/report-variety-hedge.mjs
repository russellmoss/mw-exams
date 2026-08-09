#!/usr/bin/env node
/**
 * report-variety-hedge.mjs — regenerate the audit trail for the 2026-08-09 variety-hedge pass by
 * diffing the pre-change backup (`gq_variety_hedge_backup_20260809`) against the live rows.
 *
 * The report `hedge-variety-asks.mjs` writes describes the run that produced it, and the run was done
 * in two passes (servable first, then the binned tail), so no single report covers the whole change.
 * This reads the state either side of it instead, which is the thing that is actually true.
 */

import { neon } from "@neondatabase/serverless";
import fs from "node:fs";
import path from "node:path";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);

const rows = await sql.query(`
  SELECT b.question_id, g.paper, g.family,
         (g.review_state='kept' AND g.is_retired IS NOT TRUE AND g.invalid_reasons IS NULL AND g.scope='pool') AS servable,
         b.question_text AS before, g.question_text AS after
  FROM gq_variety_hedge_backup_20260809 b
  JOIN generated_questions g USING (question_id)
  WHERE b.question_text IS DISTINCT FROM g.question_text
  ORDER BY g.paper, b.question_id
`);

const lines = [
  "# Singular variety ask over a blended flight — applied 2026-08-09",
  "",
  "A sub-part read `a) Identify the grape variety.` while a wine that part addresses was a blend.",
  'Rewritten to the exam\'s own hedge — printed "grape variety(ies)" in 2018 P2 Q1 and',
  '"grape variety/ies" in 2023 P3 Q1. Where a stem also asserted a single variety over a blend it',
  'became "the same single, or predominant, grape variety" (2015 P2 Q2, 2022 P2 Q5, 2025 P2 Q1/Q3).',
  "",
  `Rewritten: **${rows.length}** questions — **${rows.filter((r) => r.servable).length} servable**, ` +
    `${rows.filter((r) => !r.servable).length} binned/retired/quarantined.`,
  "",
  "Reconstructed by diffing `gq_variety_hedge_backup_20260809` (taken before the first pass) against",
  "the live rows, so it reflects the net change rather than either individual run.",
  "",
  "No `hist_*` question was edited. Two were flagged and left alone, both correctly as printed:",
  "`hist_2022_p2_q1` (its singular ask is scoped to wines 1-3; wine 4 is declared a blend and has its",
  "own parts) and `hist_2025_p2_q1` (its stem already hedges).",
  "",
];

for (const r of rows) {
  lines.push(`## ${r.question_id} — P${r.paper} ${r.family}${r.servable ? "" : " *(not servable)*"}`);
  lines.push("", "```diff");
  const A = r.before.split("\n");
  const B = r.after.split("\n");
  for (let i = 0; i < Math.max(A.length, B.length); i++) {
    if (A[i] === B[i]) continue;
    if (A[i] !== undefined) lines.push(`- ${A[i]}`);
    if (B[i] !== undefined) lines.push(`+ ${B[i]}`);
  }
  lines.push("```", "");
}

const out = path.resolve(process.cwd(), "..", "outputs", "question_fixes", "variety-hedge-2026-08-09.md");
fs.writeFileSync(out, lines.join("\n"), "utf8");
console.log(`${rows.length} rewritten → ${out}`);
