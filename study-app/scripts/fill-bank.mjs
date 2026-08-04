// fill-bank.mjs — bring on-grid paper × family buckets up to a target count.
//
//   node --import ./scripts/ts-loader.mjs scripts/fill-bank.mjs [--paper=1|2|3|all] [--target=10]
//                                                               [--max=N] [--dry-run]
//
// Drives the real engine (generateFreshQuestion) exactly as the bank worker does — same validators,
// same awaitBackgroundWork so nothing is banked without its model answer, wine profiles and answer
// key — but PER FAMILY rather than through the worker's round-robin, and without a serverless
// invocation ceiling.
//
// WHY NOT THE WORKER / THE ADMIN UI:
//   - The worker's familyOrder cycles every on-grid family for the paper, so a run sized to a paper's
//     total deficit keeps adding to families already at target while the thin ones lag.
//   - Targeting can only pin F1/F2/F4/F6 (QUESTION_TYPE_TO_FAMILY); there is no questionType for F3,
//     F5 or F7, which is most of what a fill needs.
//   - A 300s invocation fits only a couple of questions, so a large fill becomes a long chain of
//     resume hops driven by an hourly cron.
//
// WHY FROM CI: generation is long-running and network-heavy. Run from a laptop it failed on
// connection timeouts alone — 31 in 32 minutes, against 15 budget exhaustions and a handful of
// genuine validator rejections. The work is fine; the link was not. GitHub's runners have a stable
// route to the API, and a 6-hour job ceiling instead of 300 seconds.
//
// Every question lands status='pending' under a per-paper batch, so the Fill-the-Bank review pane
// still gates everything — showing the hard-validator verdict per question.

import { neon } from "@neondatabase/serverless";
import { generateFreshQuestion } from "@/lib/question-engine";
import {
  getRunningBatchForPaper,
  releaseStalledBatches,
  createBankBatch,
  incrementBatchCounts,
  setBankBatchStatus,
  getBatchActualCost,
} from "@/lib/db";

// Corpus paper×family grid (EK-0077) — the same table the worker rotates through.
const ON_GRID = {
  1: ["F1", "F2", "F3", "F4", "F5", "F7"],
  2: ["F1", "F2", "F3", "F4", "F7"],
  3: ["F1", "F2", "F4", "F5", "F6", "F7"],
};

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const PAPER = arg("paper", "all");
const TARGET = Number(arg("target", "10"));
const MAX = Number(arg("max", "0")) || Infinity; // hard ceiling on questions this run
const DRY = process.argv.includes("--dry-run");

const CONCURRENCY = Number(process.env.FILL_CONCURRENCY) || 2;
// A bucket failing this many times in a row is broken, not unlucky. Mirrors the worker's breaker:
// a failed question still bills for every model call it made, so grinding on is real money for
// nothing — two batches once went 0-for-6 and 0-for-3 and $16.55 went out the door in 14 minutes.
const MAX_CONSECUTIVE_FAILURES = Number(process.env.FILL_MAX_CONSECUTIVE_FAILURES) || 4;

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
const sql = neon(process.env.DATABASE_URL);

const papers = PAPER === "all" ? [1, 2, 3] : [Number(PAPER)];
for (const p of papers) if (!ON_GRID[p]) throw new Error(`--paper must be 1, 2, 3 or all (got ${PAPER})`);

// A bucket's count is USABLE questions: not quarantined by the hard validator, not retired, not
// archived. Pending-but-unreviewed rows count — they are real questions awaiting a keep/bin, and
// counting them stops a re-run regenerating what the last run already produced.
async function deficits() {
  const rows = await sql`
    SELECT paper, family, COUNT(*)::int AS n FROM generated_questions
    WHERE invalid_reasons IS NULL AND is_retired IS NOT TRUE
      AND (metadata->>'archived') IS DISTINCT FROM 'true'
    GROUP BY paper, family`;
  const have = new Map(rows.map((r) => [`${r.paper}:${r.family}`, r.n]));
  const out = [];
  for (const paper of papers) {
    for (const family of ON_GRID[paper]) {
      const need = Math.max(0, TARGET - (have.get(`${paper}:${family}`) ?? 0));
      if (need > 0) out.push({ paper, family, need, have: have.get(`${paper}:${family}`) ?? 0 });
    }
  }
  return out;
}

const plan = await deficits();
const planned = plan.reduce((s, b) => s + b.need, 0);
const cap = Math.min(planned, MAX);
console.log(`[fill] target ${TARGET}/bucket · ${plan.length} buckets short · ${planned} questions needed`);
for (const b of plan) console.log(`   P${b.paper} ${b.family}: have ${b.have}, need ${b.need}`);
if (cap < planned) console.log(`[fill] capped at ${cap} by --max`);
if (!cap) { console.log("[fill] nothing to do"); process.exit(0); }
if (DRY) { console.log("[fill] dry run — stopping before generation"); process.exit(0); }

const startedAt = Date.now();
let made = 0, failed = 0;

for (const paper of papers) {
  if (made >= cap) break;
  const buckets = plan.filter((b) => b.paper === paper);
  if (!buckets.length) continue;
  const paperNeed = Math.min(buckets.reduce((s, b) => s + b.need, 0), cap - made);

  // Refuse to run alongside another batch for this paper. The app's route checks this; calling
  // createBankBatch directly bypassed it, and on 2026-08-04 a CI fill and an admin-UI batch ran on
  // Paper 1 together — each saw the other's questions in its novelty window, both redrafted harder,
  // and the pair cost ~$61 for 17 questions. Stale 'running' rows are released first so a batch
  // killed mid-flight cannot block this forever.
  await releaseStalledBatches();
  const busy = await getRunningBatchForPaper(paper);
  if (busy) {
    console.error(`::warning::P${paper} skipped — batch ${busy.id} is already running for this paper`);
    continue;
  }

  const batch = await createBankBatch({
    paper,
    requestedCount: paperNeed,
    replaceBinned: false,
    createdBy: null,
    // Observed per-question spend from a clean pilot run, not the stale $0.35 default.
    estCostUsd: Math.round(paperNeed * 1.31 * 100) / 100,
  });
  console.log(`\n[fill] P${paper}: batch ${batch.id} for ${paperNeed}`);

  for (const bucket of buckets) {
    let done = 0, consecutive = 0;
    while (done < bucket.need && made < cap) {
      if (consecutive >= MAX_CONSECUTIVE_FAILURES) {
        console.error(`::warning::P${paper} ${bucket.family}: ${consecutive} consecutive failures — skipping the rest of this bucket`);
        break;
      }
      const slots = Math.min(CONCURRENCY, bucket.need - done, cap - made);
      const results = await Promise.all(
        Array.from({ length: slots }, async () => {
          try {
            const outcome = await generateFreshQuestion(
              paper, bucket.family, apiKey,
              // batchId on the meta is what makes a FAILED attempt costable (migration 029).
              { source: "server", userId: null, batchId: batch.id },
              undefined, undefined,
              { status: "pending", batchId: batch.id, awaitBackgroundWork: true, familyTargeted: true }
            );
            return !("error" in outcome) && outcome.source === "generated";
          } catch (err) {
            console.error(`[fill] P${paper} ${bucket.family}:`, err?.message || err);
            return false;
          }
        })
      );
      const ok = results.filter(Boolean).length;
      done += ok; made += ok; failed += results.length - ok;
      consecutive = ok > 0 ? 0 : consecutive + results.length;
      await incrementBatchCounts(batch.id, { generated: ok, failed: results.length - ok });
      console.log(
        `[fill] P${paper} ${bucket.family}: ${done}/${bucket.need}` +
        `  (overall ${made}/${cap}, ${failed} failed, ${((Date.now() - startedAt) / 60000).toFixed(0)}m)`
      );
    }
  }

  const cost = await getBatchActualCost(batch.id).catch(() => 0);
  await setBankBatchStatus(batch.id, "complete", { completed: true, actualCostUsd: cost });
  console.log(`[fill] P${paper} batch complete — $${Number(cost).toFixed(2)}`);
}

console.log(
  `\n[fill] DONE — ${made} generated, ${failed} failed, ` +
  `${((Date.now() - startedAt) / 60000).toFixed(1)} min`
);
// A run that banked nothing is a failure worth surfacing in the Actions UI.
if (made === 0) { console.error("::error::fill banked 0 questions"); process.exit(1); }
