#!/usr/bin/env node
// analyze-generation.mjs — the readout for the generation improvement loop (Layer 3).
//
// Reads the generation_attempts table and answers the questions you actually need to steer on:
//
//   1. What is the FIRST-PASS RATE? (attempt 1 passed / all attempt 1s)  <- the headline metric
//   2. Which validator is doing the rejecting, ranked by how many first drafts it kills?
//   3. Does the repair loop work — do repair attempts pass more often than fresh retries?
//   4. Did the last prompt/spec version actually improve anything, or did it just move cost around?
//
// The loop this drives: run it, take the top rule, fix that ONE thing (usually by making the spec
// decide it, or by correcting a validator that is wrong), bump PROMPT_VERSION in
// src/lib/generation-telemetry.ts, ship, and run this again to see the number move. That is the
// whole "train it to get it right first time" mechanism — offline, cheap, and measured.
//
// Usage:
//   node scripts/analyze-generation.mjs [--days 30] [--paper 1|2|3] [--examples]
//
// Requires DATABASE_URL. Read-only.

import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};
const days = Number(flag("days", 30));
const paperFilter = flag("paper", null);
const showExamples = args.includes("--examples");

// Fall back to .env.local like every other script in this directory (audit-questions.mjs,
// remediate-questions.mjs, rematch-wine-profiles.mjs). Requiring the variable to be exported made
// this the only script you had to set up differently, which is most of why it never got run.
if (!process.env.DATABASE_URL) {
  try {
    process.env.DATABASE_URL = readFileSync(".env.local", "utf8")
      .match(/DATABASE_URL\s*=\s*"?([^"\n\r]+)"?/)[1].trim();
  } catch { /* fall through to the error below */ }
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required (env or study-app/.env.local).");
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);

const pct = (n, d) => (d === 0 ? "  n/a" : `${String(Math.round((n / d) * 100)).padStart(3)}%`);
const bar = (n, d, width = 24) =>
  d === 0 ? "" : "█".repeat(Math.round((n / d) * width)).padEnd(width, "·");

// Attempt rows only — attempt 0 is the "shipped" marker written when a question is saved.
const rows = await sql`
  SELECT * FROM generation_attempts
  WHERE attempt > 0
    AND created_at > NOW() - (${days} || ' days')::interval
    ${paperFilter ? sql`AND paper = ${Number(paperFilter)}` : sql``}
  ORDER BY created_at ASC`;

if (rows.length === 0) {
  console.log(
    `\nNo generation attempts recorded in the last ${days} days.\n\n` +
      `If the app has served questions in that window, migration 018 probably hasn't run yet —\n` +
      `it applies automatically in prebuild (npm run migrate).\n`
  );
  process.exit(0);
}

console.log(`\n${"=".repeat(78)}`);
console.log(`GENERATION ANALYSIS — last ${days} days${paperFilter ? `, Paper ${paperFilter}` : ""}`);
console.log(`${rows.length} attempts recorded`);
console.log("=".repeat(78));

// ── 1. First-pass rate ───────────────────────────────────────────────────────────────────────────
const firsts = rows.filter((r) => r.attempt === 1);
const firstPass = firsts.filter((r) => r.passed);
console.log(`\n1. FIRST-PASS RATE  ${pct(firstPass.length, firsts.length)}  (${firstPass.length}/${firsts.length})`);
console.log(`   ${bar(firstPass.length, firsts.length, 40)}`);
console.log(`   This is the number the whole project moves. Every point of it is a redraft the`);
console.log(`   candidate never waits through.`);

// Attempts needed to converge, per generation request.
const attemptsPerRun = new Map();
for (const r of rows) {
  const key = `${r.paper}|${r.spec_axis}|${new Date(r.created_at).toISOString().slice(0, 16)}`;
  attemptsPerRun.set(key, Math.max(attemptsPerRun.get(key) || 0, r.attempt));
}
const counts = [...attemptsPerRun.values()].sort((a, b) => a - b);
if (counts.length) {
  const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
  console.log(`\n   Attempts to converge: mean ${mean.toFixed(2)}, median ${counts[Math.floor(counts.length / 2)]}, worst ${counts[counts.length - 1]}`);
}

// ── 2. Which rule rejects the most first drafts ─────────────────────────────────────────────────
const ruleFirstDraft = {};
const ruleAll = {};
for (const r of rows) {
  for (const rule of r.rules_fired || []) {
    ruleAll[rule] = (ruleAll[rule] || 0) + 1;
    if (r.attempt === 1) ruleFirstDraft[rule] = (ruleFirstDraft[rule] || 0) + 1;
  }
}
const ranked = Object.entries(ruleFirstDraft).sort((a, b) => b[1] - a[1]);
console.log(`\n2. WHAT REJECTS FIRST DRAFTS  (fix the top row, then re-run this)`);
if (ranked.length === 0) {
  console.log(`   Nothing — every first draft passed.`);
} else {
  console.log(`   ${"rule".padEnd(18)} ${"1st drafts".padStart(11)}  ${"all".padStart(5)}`);
  for (const [rule, n] of ranked) {
    console.log(`   ${rule.padEnd(18)} ${`${n} (${Math.round((n / firsts.length) * 100)}%)`.padStart(11)}  ${String(ruleAll[rule]).padStart(5)}  ${bar(n, firsts.length, 18)}`);
  }
}

// ── 3. Does repair beat resampling? ─────────────────────────────────────────────────────────────
const retries = rows.filter((r) => r.attempt > 1);
const repairs = retries.filter((r) => r.is_repair);
const plainRetries = retries.filter((r) => !r.is_repair);
console.log(`\n3. REPAIR vs PLAIN RETRY`);
console.log(`   repair attempts      ${pct(repairs.filter((r) => r.passed).length, repairs.length)} pass  (${repairs.filter((r) => r.passed).length}/${repairs.length})`);
console.log(`   plain retries        ${pct(plainRetries.filter((r) => r.passed).length, plainRetries.length)} pass  (${plainRetries.filter((r) => r.passed).length}/${plainRetries.length})`);
console.log(`   Repair should win clearly. If it doesn't, the violation text is probably not`);
console.log(`   actionable enough for the model to act on — rewrite the message, not the prompt.`);
const stuck = rows.filter((r) => (r.rules_fired || []).includes("repair-stuck")).length;
if (stuck) console.log(`   ${stuck} repair(s) returned an identical draft and were restarted.`);

// ── 4. Version comparison ───────────────────────────────────────────────────────────────────────
const byVersion = new Map();
for (const r of firsts) {
  const key = `${r.prompt_version || "?"} / ${r.spec_version || "none"}`;
  const v = byVersion.get(key) || { n: 0, passed: 0, first: r.created_at, last: r.created_at };
  v.n++;
  if (r.passed) v.passed++;
  v.last = r.created_at;
  byVersion.set(key, v);
}
console.log(`\n4. FIRST-PASS RATE BY VERSION  (did the last change help?)`);
console.log(`   ${"prompt / spec".padEnd(24)} ${"n".padStart(5)} ${"first-pass".padStart(11)}`);
for (const [key, v] of byVersion) {
  console.log(`   ${key.padEnd(24)} ${String(v.n).padStart(5)} ${pct(v.passed, v.n).padStart(11)}  ${bar(v.passed, v.n, 18)}`);
}
if (byVersion.size === 1) {
  console.log(`   Only one version seen. Bump PROMPT_VERSION in src/lib/generation-telemetry.ts`);
  console.log(`   when you change the prompt, so the next run can compare.`);
}

// ── 5. Failure modes that aren't validator rejections ───────────────────────────────────────────
const parseFails = rows.filter((r) => r.parse_failed).length;
const modelErrors = rows.filter((r) => r.model_error).length;
if (parseFails || modelErrors) {
  console.log(`\n5. NON-VALIDATOR FAILURES`);
  if (parseFails) console.log(`   ${parseFails} unparseable draft(s) — output-format drift, not question quality.`);
  if (modelErrors) console.log(`   ${modelErrors} model call failure(s) — timeout / overload, not question quality.`);
}

// ── Examples ────────────────────────────────────────────────────────────────────────────────────
if (showExamples && ranked.length > 0) {
  const topRule = ranked[0][0];
  console.log(`\n${"-".repeat(78)}\nREAL "${topRule}" VIOLATIONS (most recent 5) — read these before changing anything:\n`);
  const examples = rows
    .filter((r) => (r.rules_fired || []).includes(topRule))
    .slice(-5)
    .reverse();
  for (const ex of examples) {
    const v = ex.violations?.[topRule] || [];
    console.log(`  P${ex.paper} ${ex.family || "any"} attempt ${ex.attempt}${ex.is_repair ? " (repair)" : ""} — axis ${ex.spec_axis}`);
    for (const line of v) console.log(`    · ${line}`);
    console.log("");
  }
} else if (ranked.length > 0) {
  console.log(`\nRun with --examples to see real violation text for the top rule.`);
}

console.log("");
