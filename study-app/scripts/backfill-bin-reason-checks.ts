// backfill-bin-reason-checks.ts — one-off sweep (2026-08-05): adjudicate the reasoned bins that
// landed BEFORE the pushback check existed (migration 041). New reasoned bins are checked at write
// time; historical rows sit at check_verdict NULL, which the digest/lessons gates treat as
// "unchecked → feeds forward" — so until this runs, a historical wrong reason still teaches the
// generator. Ends by regenerating the distilled "Lessons for new questions" summary so it is
// re-distilled from the now-gated rows immediately (not on the next reasoned bin).
//
// Run AFTER migration 041 is live, from study-app/, with DATABASE_URL + ANTHROPIC_API_KEY in the
// environment (it hits the production DB and spends real tokens — one Claude call per unchecked row):
//
//   npx esbuild scripts/backfill-bin-reason-checks.ts --bundle --platform=node --format=cjs \
//     "--alias:@=./src" --outfile=.tmp/backfill-bin-reason-checks.cjs
//   node .tmp/backfill-bin-reason-checks.cjs
//
// Safe to re-run: rows already carrying a fingerprint are skipped by runBinReasonCheck itself, and
// the WHERE below doesn't select them in the first place.

import { neon } from "@neondatabase/serverless";
import { runBinReasonCheck } from "@/lib/bin-reason-check";
import { regenerateBinLessons } from "@/lib/bin-lessons";

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!process.env.DATABASE_URL || !apiKey) {
    throw new Error("DATABASE_URL and ANTHROPIC_API_KEY must be set");
  }

  const sql = neon(process.env.DATABASE_URL);
  const rows = (await sql`
    SELECT item_id FROM bank_bin_reasons
    WHERE (reason_tags IS NOT NULL OR reason_note IS NOT NULL)
      AND check_fingerprint IS NULL
    ORDER BY binned_at ASC
  `) as { item_id: string }[];
  console.log(`${rows.length} unchecked reasoned bins to adjudicate`);

  const tally: Record<string, number> = {};
  for (const [i, row] of rows.entries()) {
    const r = await runBinReasonCheck({ itemId: row.item_id, apiKey, source: "server" });
    const key = r.status === "checked" ? `checked:${r.verdict}` : r.status;
    tally[key] = (tally[key] ?? 0) + 1;
    console.log(`[${i + 1}/${rows.length}] ${row.item_id} → ${key}`);
  }
  console.log("tally:", JSON.stringify(tally));

  console.log("regenerating the lessons summary from the gated rows…");
  await regenerateBinLessons(apiKey, null);
  console.log("done");
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
