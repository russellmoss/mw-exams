// import-historical-stems.mjs — bank the REAL IMW question stems (2011-2026) with fresh wines.
//
//   node --import ./scripts/ts-loader.mjs scripts/import-historical-stems.mjs \
//        [--paper=1|2|3|all] [--year=2013] [--from=2018] [--limit=N] [--redo] [--dry-run]
//
// WHAT IT DOES. For each past-paper question it takes the stem verbatim (renumbering only the wine
// slots, 1..n — see historical-stems.ts) and drives the normal engine to choose a NEW flight and
// write a NEW model answer against it. The wines the Institute actually poured are not carried over:
// a 2011 wine list is a museum piece, and the study value is in the question shape.
//
// WHY NOT A BULK INSERT. Because then nothing would be validated. Running it through
// generateFreshQuestion means every wine-side rule the bank relies on — paper scope, variety
// consistency against the stem's own claims, origin and country diversity, the producer caps, P3
// composition, the answer-content gate — judges these flights exactly as it judges generated ones.
// Only three flight-CHOICE checks stand down, and question-engine.ts documents why at each site.
//
// EVERY ROW LANDS status='pending' under a batch, so the Fill-the-Bank review pane gates the lot.
// Ids are deterministic (`hist_<year>_p<paper>_q<n>`), so a re-run resumes rather than duplicating;
// --redo regenerates rows that already exist.

import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { generateFreshQuestion } from "@/lib/question-engine";

// Was imported from lib/bank-worker, which was deleted with the Fill-the-Bank generator. This script
// is a deliberate, hand-run import (not reachable from the app), so it keeps the worker's old
// per-call ceiling verbatim rather than dragging the whole module back for one number.
const WORKER_CALL_TIMEOUT_MS = Number(process.env.BANK_WORKER_CALL_TIMEOUT_MS) || 130_000;
import {
  selectImportableStems,
  historicalQuestionId,
  historicalMetadata,
} from "@/lib/historical-stems";
import {
  getRunningBatchForPaper,
  releaseStalledBatches,
  createBankBatch,
  incrementBatchCounts,
  setBankBatchStatus,
  getBatchActualCost,
} from "@/lib/db";

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const PAPER = arg("paper", "all");
const YEAR = arg("year", null);
// Comma-separated qids or hist_ ids, for repairing specific rows without re-spending on a whole
// tranche (e.g. the four stems the length check rewrote before it was gated off this path).
const ONLY = (arg("only", "") || "")
  .split(",")
  .map((s) => s.trim().replace(/^hist_/, ""))
  .filter(Boolean);
const FROM = Number(arg("from", "0")) || 0;
const LIMIT = Number(arg("limit", "0")) || Infinity;
const REDO = process.argv.includes("--redo");
const DRY = process.argv.includes("--dry-run");

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!DRY && !apiKey) throw new Error("ANTHROPIC_API_KEY not set");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
const sql = neon(process.env.DATABASE_URL);

// Same per-question budget as the CI fill: no serverless ceiling, so a stem that needs a fourth
// attempt gets one instead of failing. An anchored question is if anything HARDER than a free
// generation — the model cannot reshape the question to fit the wines it thought of first.
const BUDGET_MS = Number(process.env.IMPORT_GENERATION_BUDGET_MS) || 240_000;
const CONCURRENCY = Number(process.env.IMPORT_CONCURRENCY) || 2;
const MAX_CONSECUTIVE_FAILURES = Number(process.env.IMPORT_MAX_CONSECUTIVE_FAILURES) || 5;

const corpus = JSON.parse(readFileSync(new URL("../../data/structured/corpus_questions.json", import.meta.url), "utf8"));
const { stems, ineligible } = selectImportableStems(corpus);

console.log(`[import] corpus holds ${corpus.length} questions; ${stems.length} are importable`);
for (const i of ineligible) console.log(`   SKIP ${i.qid}: ${i.detail}`);

// Filters
let queue = stems;
if (ONLY.length) {
  queue = queue.filter((s) => ONLY.includes(s.qid));
  const missing = ONLY.filter((q) => !queue.some((s) => s.qid === q));
  if (missing.length) throw new Error(`--only names ${missing.join(", ")}, which are not importable stems`);
}
if (PAPER !== "all") queue = queue.filter((s) => s.paper === Number(PAPER));
if (YEAR) queue = queue.filter((s) => s.year === Number(YEAR));
if (FROM) queue = queue.filter((s) => s.year >= FROM);

// Resume: skip what is already banked. A partially-imported corpus is the normal state, since the
// run is long and gets interrupted.
const existing = new Set(
  (await sql`SELECT question_id FROM generated_questions WHERE question_id LIKE 'hist_%'`).map((r) => r.question_id)
);
const already = queue.filter((s) => existing.has(historicalQuestionId(s)));
if (!REDO) queue = queue.filter((s) => !existing.has(historicalQuestionId(s)));
if (already.length) {
  console.log(`[import] ${already.length} already banked${REDO ? " — --redo will regenerate them" : " — skipping"}`);
}

// --redo has to DELETE first. saveGeneratedQuestion's ON CONFLICT (question_id) DO UPDATE
// deliberately preserves question_text, wines and total_marks — it exists for the background
// model-answer re-save of the SAME question, not for a genuine regeneration. Upserting over an
// existing row therefore kept the first attempt's flight and marks while the run reported success.
//
// Three tables carry an FK to generated_questions, all ON DELETE NO ACTION. stem_answer_keys is
// derived and goes with the question. user_attempts and live_tasting_sessions are NOT: an attempt is
// a candidate's own work, and regenerating a question out from under one would rewrite what they
// answered. Anything with either is REFUSED, not cascaded — bin it in the review pane instead.
if (REDO && already.length) {
  const candidates = already.map((s) => historicalQuestionId(s));
  const attempted = new Set(
    (await sql`
      /* theory-mode-guard: all-modes -- an attempt in ANY mode means a candidate answered this
         question; the point is to REFUSE to regenerate it, so narrowing by mode could only let a
         real attempt slip through and be destroyed. */
      SELECT DISTINCT question_id FROM user_attempts WHERE question_id = ANY(${candidates})
    `).map((r) => r.question_id)
  );
  for (const r of await sql`SELECT DISTINCT question_id FROM live_tasting_sessions WHERE question_id = ANY(${candidates})`) {
    attempted.add(r.question_id);
  }
  const ids = candidates.filter((id) => !attempted.has(id));
  if (attempted.size) {
    console.error(
      `::warning::refusing to regenerate ${attempted.size} question(s) that already have a user attempt or ` +
        `live-tasting session — bin them in the review pane instead: ${[...attempted].join(", ")}`
    );
    queue = queue.filter((s) => !attempted.has(historicalQuestionId(s)));
  }
  if (DRY) {
    console.log(`[import] dry run — would delete ${ids.length} existing rows before regenerating`);
  } else if (ids.length) {
    await sql`DELETE FROM stem_answer_keys WHERE question_id = ANY(${ids})`;
    await sql`DELETE FROM question_views WHERE question_id = ANY(${ids})`;
    await sql`DELETE FROM generated_questions WHERE question_id = ANY(${ids})`;
    console.log(`[import] deleted ${ids.length} existing rows so they regenerate cleanly`);
  }
}

queue = queue.slice(0, LIMIT === Infinity ? undefined : LIMIT);

const byPaper = new Map();
for (const s of queue) byPaper.set(s.paper, [...(byPaper.get(s.paper) || []), s]);
console.log(
  `[import] ${queue.length} to generate` +
    (queue.length ? ` — ` + [...byPaper].sort().map(([p, l]) => `P${p}:${l.length}`).join(" ") : "")
);
if (!queue.length) { console.log("[import] nothing to do"); process.exit(0); }
if (DRY) {
  for (const s of queue) {
    console.log(`\n--- ${historicalQuestionId(s)}  ${s.family}/${s.subcategory}  ${s.flightSize} wines`);
    console.log(s.stemText);
  }
  console.log(`\n[import] dry run — stopping before generation`);
  process.exit(0);
}

const startedAt = Date.now();
let made = 0, failed = 0;
const failures = [];

for (const [paper, list] of [...byPaper].sort()) {
  // One batch per paper, and never alongside another running batch for it — two batches on one paper
  // see each other's questions in their novelty windows and both redraft harder (see fill-bank.mjs).
  await releaseStalledBatches();
  const busy = await getRunningBatchForPaper(paper);
  if (busy) {
    console.error(`::warning::P${paper} skipped — batch ${busy.id} is already running for this paper`);
    continue;
  }
  const batch = await createBankBatch({
    paper,
    requestedCount: list.length,
    replaceBinned: false,
    createdBy: null,
    estCostUsd: Math.round(list.length * 1.31 * 100) / 100,
  });
  console.log(`\n[import] P${paper}: batch ${batch.id} for ${list.length} historical stems`);

  let consecutive = 0;
  for (let i = 0; i < list.length; i += CONCURRENCY) {
    if (consecutive >= MAX_CONSECUTIVE_FAILURES) {
      console.error(`::warning::P${paper}: ${consecutive} consecutive failures — stopping this paper`);
      break;
    }
    const slice = list.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      slice.map(async (stem) => {
        const qid = historicalQuestionId(stem);
        try {
          const outcome = await generateFreshQuestion(
            stem.paper, stem.family, apiKey,
            { source: "server", userId: null, batchId: batch.id },
            undefined, undefined,
            {
              status: "pending",
              batchId: batch.id,
              awaitBackgroundWork: true,
              familyTargeted: true,
              budgetMs: BUDGET_MS,
              callTimeoutMs: WORKER_CALL_TIMEOUT_MS,
              anchoredStem: {
                text: stem.stemText,
                wineCount: stem.flightSize,
                family: stem.family,
                questionId: qid,
                metadata: historicalMetadata(stem),
              },
            }
          );
          // A banked FALLBACK is a failure here: the point is this stem, not any question.
          const ok = !("error" in outcome) && outcome.source === "generated";
          if (!ok) failures.push([qid, "error" in outcome ? outcome.error : `fell back to ${outcome.source}`]);
          return ok;
        } catch (err) {
          const msg = err?.message || String(err);
          console.error(`[import] ${qid}: ${msg}`);
          failures.push([qid, msg]);
          return false;
        }
      })
    );
    const ok = results.filter(Boolean).length;
    made += ok; failed += results.length - ok;
    consecutive = ok > 0 ? 0 : consecutive + results.length;
    await incrementBatchCounts(batch.id, { generated: ok, failed: results.length - ok });
    console.log(
      `[import] P${paper}: ${Math.min(i + CONCURRENCY, list.length)}/${list.length}` +
        `  (overall ${made} ok, ${failed} failed, ${((Date.now() - startedAt) / 60000).toFixed(0)}m)`
    );
  }

  const cost = await getBatchActualCost(batch.id).catch(() => 0);
  await setBankBatchStatus(batch.id, "complete", { completed: true, actualCostUsd: cost });
  console.log(`[import] P${paper} batch complete — $${Number(cost).toFixed(2)}`);
}

console.log(`\n[import] DONE — ${made} banked, ${failed} failed, ${((Date.now() - startedAt) / 60000).toFixed(1)} min`);
if (failures.length) {
  console.log("\n[import] failures (re-run to retry; ids are deterministic so nothing duplicates):");
  for (const [qid, why] of failures) console.log(`   ${qid}  ${why}`);
}
if (made === 0) { console.error("::error::import banked 0 questions"); process.exit(1); }
