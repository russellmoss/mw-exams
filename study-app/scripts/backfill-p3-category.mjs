// backfill-p3-category.mjs — one-off backfill of generated_questions.p3_category for existing
// Paper 3 rows (migration 015). New P3 questions are tagged at insert (see lib/db.ts
// saveGeneratedQuestion); this fills every P3 row that predates that.
//
// Idempotent: only classifies P3 rows and re-writes the tag from the deterministic classifier, so
// re-running converges. Uses the SAME classifier the app uses (lib/p3-category.mjs) — no LLM.
//
//   node scripts/backfill-p3-category.mjs           (dry run: classify + report, write nothing)
//   node scripts/backfill-p3-category.mjs --apply    (write p3_category on every Paper 3 row)
//
// Run from study-app/.  Reads DATABASE_URL from env or .env.local.

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { neon } from "@neondatabase/serverless";
import { classifyP3Category, P3_CATEGORIES } from "../src/lib/p3-category.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENV = (() => {
  try { return readFileSync(join(ROOT, ".env.local"), "utf8"); } catch { return ""; }
})();
const envVal = (k) =>
  process.env[k] || (ENV.match(new RegExp(k + '\\s*=\\s*"?([^"\\n\\r]+)"?'))?.[1]?.trim() ?? "");

const DATABASE_URL = envVal("DATABASE_URL");
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set (env or .env.local). Aborting.");
  process.exit(1);
}

const APPLY = process.argv.includes("--apply");
const sql = neon(DATABASE_URL);

function parseWines(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { return []; }
  }
  return [];
}

async function main() {
  const rows = await sql`
    SELECT question_id, wines, p3_category
    FROM generated_questions
    WHERE paper = 3
    ORDER BY created_at ASC
  `;
  console.log(`Found ${rows.length} Paper 3 question(s).`);

  const tally = Object.fromEntries(P3_CATEGORIES.map((c) => [c, 0]));
  let changed = 0;

  for (const row of rows) {
    const category = classifyP3Category(parseWines(row.wines));
    tally[category]++;
    if (row.p3_category !== category) {
      changed++;
      if (APPLY) {
        await sql`
          UPDATE generated_questions SET p3_category = ${category}
          WHERE question_id = ${row.question_id}
        `;
      } else {
        console.log(`  ${row.question_id}: ${row.p3_category ?? "NULL"} -> ${category}`);
      }
    }
  }

  console.log("Category distribution:", tally);
  console.log(
    APPLY
      ? `Applied: ${changed} row(s) updated.`
      : `Dry run: ${changed} row(s) would change. Re-run with --apply to write.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
