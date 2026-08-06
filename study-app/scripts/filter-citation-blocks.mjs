// filter-citation-blocks.mjs — re-filter the "Sources consulted" blocks in already-stored answers.
//
// Generation now gates citations for relevance (citation-rules.mjs via buildCitationBlock), but
// every model answer banked before the gate carries whatever the retriever surfaced — including
// annual-report PDFs and documents about entirely different wines. The retrieval passages are long
// gone, so this cannot re-rank; it FILTERS the stored markdown items with the same rules the live
// gate applies, rewrites the block (or removes it when nothing survives), and leaves the answer
// prose untouched.
//
//   node scripts/filter-citation-blocks.mjs            (dry run: report per-question drops)
//   node scripts/filter-citation-blocks.mjs --apply    (rewrite model_answer)
//
// Requires DATABASE_URL (env or study-app/.env.local).

import { readFileSync } from "fs";
import { neon } from "@neondatabase/serverless";
import { filterCitationDocs, parseCitationBlock } from "../src/lib/citation-rules.mjs";

const DB =
  process.env.DATABASE_URL ||
  readFileSync(".env.local", "utf8").match(/DATABASE_URL\s*=\s*"?([^"\n\r]+)"?/)[1].trim();
const sql = neon(DB);
const apply = process.argv.includes("--apply");

const rows = await sql`
  SELECT question_id, question_text, wines, model_answer
  FROM generated_questions
  WHERE model_answer LIKE '%Sources consulted%'`;

let touched = 0,
  itemsDropped = 0,
  blocksRemoved = 0;
const byReason = {};
for (const r of rows) {
  const cite = parseCitationBlock(r.model_answer);
  if (!cite || cite.docs.length === 0) continue;
  const wines = typeof r.wines === "string" ? JSON.parse(r.wines) : r.wines;
  const ctx = `${r.question_text} ${(wines || []).map((w) => w.fullText || "").join(" ")}`;
  const { kept, dropped } = filterCitationDocs(cite.docs, ctx);
  if (dropped.length === 0) continue;

  touched++;
  itemsDropped += dropped.length;
  for (const d of dropped) byReason[d.reason] = (byReason[d.reason] || 0) + 1;
  console.log(`${r.question_id}: dropping ${dropped.length}/${cite.docs.length}`);
  for (const d of dropped) console.log(`    - ${(d.doc.title || d.doc.url).slice(0, 80)}  [${d.reason}]`);

  if (!apply) continue;
  const prose = r.model_answer.slice(0, cite.blockStart).replace(/\s+$/, "");
  let rewritten;
  if (kept.length === 0) {
    blocksRemoved++;
    rewritten = prose + "\n";
  } else {
    rewritten =
      prose +
      "\n\n---\n\n" +
      "**Sources consulted** — tier-1 references behind the production and appellation points above.\n\n" +
      kept.map((d) => `- [${d.title}](${d.url})`).join("\n") +
      "\n";
  }
  await sql`UPDATE generated_questions SET model_answer = ${rewritten} WHERE question_id = ${r.question_id}`;
}

console.log(`\n──────── CITATION FILTER SUMMARY ────────`);
console.log(`answers with a citation block: ${rows.length}`);
console.log(`answers with drops:            ${touched}`);
console.log(`items dropped:                 ${itemsDropped}`);
console.log(`by reason:                     ${JSON.stringify(byReason, null, 1)}`);
console.log(apply ? `blocks removed entirely:       ${blocksRemoved}` : `(dry run — pass --apply to rewrite)`);
