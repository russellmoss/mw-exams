// sweep-duplicate-flights.mjs — retire exact-duplicate flights from the servable bank.
//   node scripts/sweep-duplicate-flights.mjs            (dry run: report only)
//   node scripts/sweep-duplicate-flights.mjs --apply    (bin the duplicates)
//
// Why this exists: the reviewer filed "you keep giving me the same question" three times in one
// sitting (attempts #495, #503, #507). The bulk-generation era banked the SAME wine set repeatedly
// under trivially re-worded stems — 9 groups / 10 surplus questions at the time this landed — and
// the review queue then showed each copy as if it were new work. Generation-time novelty
// (validateNoveltyAgainstLatest) only compares against a recent window, so it cannot see a twin
// banked weeks earlier; this sweep is the whole-bank backstop, run daily from
// .github/workflows/question-audit-daily.yml.
//
// Scope is EXACT wine-set duplicates within a paper, deliberately:
//   - exact = same normalized wine labels, order-insensitive. Same-wine-different-stem is still a
//     duplicate for the candidate (the flight IS the question); different-but-overlapping flights
//     are a judgement call and stay with the human reviewer.
//   - gen_ rows only. Historical imports (hist_) pin real past-paper stems; the real exam repeats
//     itself year to year, and that is a fact about the exam, not a defect.
//
// Keeper choice: the most-served copy (its id is what user history rows point at), tie broken by
// earliest created_at (stable across runs). Losers are binned with the review-queue's own soft-delete
// semantics (status='rejected', review_state='binned') plus a bank_bin_reasons ledger row tagged
// duplicate_wine naming the kept twin — so The Bin page can display and reverse it like any other bin.
import { readFileSync } from "fs";
import { neon } from "@neondatabase/serverless";

const DB = process.env.DATABASE_URL || readFileSync(".env.local", "utf8").match(/DATABASE_URL\s*=\s*"?([^"\n\r]+)"?/)[1].trim();
const sql = neon(DB);
const apply = process.argv.includes("--apply");

const rows = await sql`
  SELECT question_id, paper, family, wines, created_at,
         GREATEST(COALESCE(times_served, 0), COALESCE(served_count, 0)) AS served
  FROM generated_questions
  WHERE status = 'approved' AND review_state = 'kept'
    AND (metadata->>'archived') IS DISTINCT FROM 'true'
    AND question_id LIKE 'gen_%'
  ORDER BY paper, question_id`;

// Order-insensitive, whitespace/case-insensitive label signature. Nothing cleverer on purpose —
// vintage and cuvée stay significant, so "the same producer, a different cuvée" is NOT a duplicate
// (that distinction is load-bearing in the producer-dedup prompt rules too).
const signature = (paper, wines) => {
  const list = (typeof wines === "string" ? JSON.parse(wines) : wines) || [];
  const labels = list
    .map((w) => String(w.fullText || "").toLowerCase().replace(/\s+/g, " ").replace(/[.\s]+$/, "").trim())
    .filter(Boolean)
    .sort();
  return labels.length ? `p${paper}|${labels.join(" + ")}` : null;
};

const groups = new Map();
for (const r of rows) {
  const sig = signature(r.paper, r.wines);
  if (!sig) continue;
  if (!groups.has(sig)) groups.set(sig, []);
  groups.get(sig).push(r);
}

let surplus = 0;
for (const [sig, members] of groups) {
  if (members.length < 2) continue;
  // Most-served first (user history references its id), then oldest — a stable keeper across runs.
  members.sort((a, b) => Number(b.served) - Number(a.served) || new Date(a.created_at) - new Date(b.created_at));
  const keeper = members[0];
  const losers = members.slice(1);
  surplus += losers.length;
  console.log(`\n[dup x${members.length}] ${sig.slice(0, 140)}`);
  console.log(`  keep   ${keeper.question_id} (served ${keeper.served})`);
  for (const l of losers) {
    console.log(`  ${apply ? "bin " : "would bin"}  ${l.question_id} (served ${l.served})`);
    if (!apply) continue;
    const updated = await sql`
      UPDATE generated_questions SET
        status = 'rejected', review_state = 'binned', review_status = 'binned', reviewed_at = NOW()
      WHERE question_id = ${l.question_id} AND review_state = 'kept'
      RETURNING paper, family`;
    if (updated.length === 0) continue; // raced with another sweep/reviewer — someone else decided
    await sql`
      INSERT INTO bank_bin_reasons (item_id, paper, family_id, reason_tags, reason_note, binned_by)
      VALUES (${l.question_id}, ${updated[0].paper}, ${updated[0].family},
              ${["duplicate_wine"]}, ${`auto-sweep: exact duplicate flight of ${keeper.question_id} (same wine set)`}, NULL)`;
  }
}

console.log(`\n${groups.size} distinct flights among ${rows.length} servable gen questions; ${surplus} surplus duplicate(s)${apply ? " binned" : " (dry run — pass --apply to bin)"}.`);
