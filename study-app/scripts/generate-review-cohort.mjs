#!/usr/bin/env node
// generate-review-cohort.mjs — a blinded cohort for the expert reviewer, to answer one question:
// did the 2026-08-10/11 fixes change what generation produces?
//
//   node --import ./scripts/ts-loader.mjs scripts/generate-review-cohort.mjs            (dry run)
//   node --import ./scripts/ts-loader.mjs scripts/generate-review-cohort.mjs --apply
//   ... --count=40 --tag=post-fix-2026-08-11
//
// WHY A COHORT AND NOT "just look at the numbers". Everything shipped on 2026-08-10/11 is
// instrumented, not validated: the wine matcher fixed 98 wrong profiles, three selection rules
// landed, the model answer now opens by default in /review. None of it has been in front of the
// reviewer. His reject rate has sat at ~42% all week and no question built on the repaired wine data
// has reached him.
//
// THE BLINDING IS ALREADY BUILT AND THAT IS WHY THIS WORKS. getReviewQueue orders by
// paper, family, served_count DESC, then md5(question_id || reviewerId) — a per-reviewer hash added
// precisely because created_at DESC used to serve a generation batch back-to-back and the reviewer
// met four variations on one idea in a row. So a fresh cohort interleaves with the 104 pre-fix
// questions already waiting, and the card renders neither created_at nor any cohort marker. Checked
// before writing this: only 2 of 106 unreviewed questions have served_count > 0, so a cohort of
// zero-serve questions is not a tell and does not sort to the back of a block.
//
// WHAT THIS DELIBERATELY DOES NOT DO:
//   - It does not pin the family. The engine's own family choice IS the pipeline under test; forcing
//     a spread would measure a pipeline nobody runs.
//   - It does not set status='pending'. The /review queue requires review_state='kept', so a pending
//     cohort would never reach the reviewer at all. These land servable, exactly as a candidate-
//     initiated generation does — which is also the honest thing to measure.
//   - It does not stamp the cohort tag until AFTER generation, because saveOpts has no metadata hook.
//     The tag lives in metadata, which no review surface renders.

import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
import { generateFreshQuestion } from "../src/lib/question-engine";

const apply = process.argv.includes("--apply");
const arg = (name, dflt) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};
const COUNT = Number(arg("count", "40"));
const TAG = arg("tag", "post-fix-2026-08-11");

if (!process.env.DATABASE_URL) {
  try {
    process.env.DATABASE_URL = readFileSync(".env.local", "utf8")
      .match(/DATABASE_URL\s*=\s*"?([^"\n\r]+)"?/)[1].trim();
  } catch { /* fall through */ }
}
const APIKEY =
  process.env.ANTHROPIC_API_KEY ||
  (() => {
    try {
      return readFileSync(".env.local", "utf8").match(/ANTHROPIC_API_KEY\s*=\s*"?([^"\n\r]+)"?/)[1].trim();
    } catch { return ""; }
  })();

if (!process.env.DATABASE_URL || !APIKEY) {
  console.error(`Need DATABASE_URL and ANTHROPIC_API_KEY (env or study-app/.env.local).`);
  process.exit(1);
}
// PRE-FLIGHT, for the reason recorded in rematch-wine-profiles.mjs: enrichment catches its own model
// errors, so a key that is PRESENT and WRONG produces a run that reports success while writing empty
// profiles. One cheap call before spending forty generations.
{
  const probe = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": APIKEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 4, messages: [{ role: "user", content: "hi" }] }),
  });
  if (!probe.ok) {
    console.error(`ANTHROPIC_API_KEY rejected (${probe.status}). Refusing to run.`);
    process.exit(1);
  }
}
const sql = neon(process.env.DATABASE_URL);

// Spread across all three papers. P3 is over-weighted relative to its share of the bank on purpose:
// three of the fixes under test are P3-specific (sparkling-Syrah cap, P3 category coherence, the
// residual-sugar ask), and P3 is where the reviewer's "unclear what it is testing" complaints cluster.
const PLAN = [
  { paper: 1, n: Math.round(COUNT * 0.375) },
  { paper: 2, n: Math.round(COUNT * 0.325) },
  { paper: 3, n: COUNT - Math.round(COUNT * 0.375) - Math.round(COUNT * 0.325) },
];

const baseline = (
  await sql.query(`
    SELECT count(*)::int AS n FROM generated_questions g
    WHERE g.invalid_reasons IS NULL AND g.review_state='kept' AND g.is_retired IS NOT TRUE
      AND g.scope='pool'
      AND NOT EXISTS (SELECT 1 FROM stem_answer_keys k WHERE k.question_id=g.question_id AND k.validated=false)
      AND NOT EXISTS (SELECT 1 FROM question_reviews r WHERE r.question_id=g.question_id AND r.reviewer_id=1 AND r.superseded_at IS NULL)
  `)
)[0].n;

console.log(`\n${"=".repeat(80)}`);
console.log(`REVIEW COHORT — ${COUNT} questions, tag "${TAG}"`);
console.log(`${"=".repeat(80)}`);
console.log(`plan:            ${PLAN.map((p) => `P${p.paper}×${p.n}`).join("  ")}`);
console.log(`already waiting: ${baseline} unreviewed pre-fix questions to interleave against`);
console.log(`est. cost:       ~$${(COUNT * 0.76).toFixed(2)} (7-day mean $0.76/question)`);
if (!apply) {
  console.log(`\n(dry run — pass --apply to generate)\n`);
  process.exit(0);
}

// THE BANKED FALLBACK IS THE TRAP THIS RUN EXISTS TO AVOID.
//
// generateFreshQuestion does not fail when its three attempts fail — it falls back to returning an
// EXISTING banked question, which is right for a candidate staring at a spinner and catastrophic
// here. The smoke run hit it immediately: attempt 3/3 failed on a duplicate-Syrah stem and the call
// returned gen_p2_F4_1786070880669, created 2026-08-07. Tagging that as cohort would have labelled a
// PRE-FIX question as post-fix — contaminating the experiment with exactly the population it is
// supposed to be measured against, and biasing it toward "no improvement" since old questions are
// what the reject rate already reflects.
//
// So a returned id counts only if the row was actually created during this run. Cheap, and it cannot
// be fooled by a fallback that happens to be recent.
const RUN_STARTED = new Date().toISOString();
const isFreshlyCreated = async (qid) => {
  const rows = await sql.query(
    `SELECT created_at FROM generated_questions WHERE question_id = $1`,
    [qid]
  );
  if (!rows[0]) return false;
  return new Date(rows[0].created_at).toISOString() >= RUN_STARTED;
};

const made = [];
const failed = [];
const fellBack = [];
let n = 0;
for (const { paper, n: want } of PLAN) {
  for (let i = 0; i < want; i++) {
    n++;
    const t0 = Date.now();
    try {
      const res = await generateFreshQuestion(
        paper,
        undefined, // family: the engine's own choice IS the pipeline under test
        APIKEY,
        { source: "server", userId: null },
        undefined,
        undefined,
        {
          // Block until the model answer and wine enrichment land. Without this they are detached
          // promises and the row banks with model_answer NULL — which /review now renders as
          // "Model answer — none recorded", silently gutting the one thing #185 made visible.
          awaitBackgroundWork: true,
          // No browser is waiting, so do not inherit the interactive 45s/95s ceiling that censors
          // near-complete work (see the note on budgetMs in question-engine.ts).
          budgetMs: 300_000,
          callTimeoutMs: 120_000,
        }
      );
      const qid = res && "question" in res && res.question ? res.question.question_id : null;
      if (!qid) {
        failed.push({ paper, why: (res && res.error) || "no question returned" });
        console.log(`  [${n}/${COUNT}] P${paper} FAILED — ${(res && res.error) || "no question"}`);
        continue;
      }
      if (!(await isFreshlyCreated(qid))) {
        // Generation exhausted its attempts and handed back an existing banked question. Not a
        // cohort member, and NOT silently counted as one.
        fellBack.push({ paper, qid });
        console.log(`  [${n}/${COUNT}] P${paper} fell back to banked ${qid} — excluded`);
        continue;
      }
      made.push(qid);
      console.log(`  [${n}/${COUNT}] P${paper} ${qid}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    } catch (e) {
      failed.push({ paper, why: e.message });
      console.log(`  [${n}/${COUNT}] P${paper} ERROR — ${e.message}`);
    }
  }
}

// Stamp the cohort tag. metadata is JSONB and no review surface renders it, so this identifies the
// cohort for measurement without being visible to the reviewer.
if (made.length) {
  await sql.query(
    `UPDATE generated_questions
       SET metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object('cohort', $1::text)
     WHERE question_id = ANY($2::text[])`,
    [TAG, made]
  );
}

console.log(`\ngenerated: ${made.length}/${COUNT}   fell back to banked: ${fellBack.length}   failed: ${failed.length}`);
if (failed.length) for (const f of failed) console.log(`   failed  P${f.paper}: ${f.why}`);
if (fellBack.length) {
  console.log(
    `\n   ${fellBack.length} call(s) exhausted their attempts and returned an existing banked question.\n` +
      `   Excluded from the cohort — tagging one would put a PRE-fix question in the post-fix arm.\n` +
      `   This rate is itself a finding: it is how often generation cannot produce a valid question at all.`
  );
}
console.log(`\ntagged metadata.cohort = "${TAG}" on ${made.length} question(s)`);
console.log(`\nMeasure later with:`);
console.log(`  SELECT (g.metadata->>'cohort' = '${TAG}') AS in_cohort,`);
console.log(`         count(*) FILTER (WHERE r.verdict='down')::float/count(*) AS down_rate`);
console.log(`  FROM question_reviews r JOIN generated_questions g USING (question_id)`);
console.log(`  WHERE r.reviewer_id=1 AND r.created_at > now() GROUP BY 1;\n`);
