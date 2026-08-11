#!/usr/bin/env node
// analyze-proposal-outcomes.mjs — did the root-cause fixes we shipped actually work?
//
//   node --import ./scripts/ts-loader.mjs scripts/analyze-proposal-outcomes.mjs [--days=30]
//
// The bin-fix miner has shipped 21 proposals and has never once been told whether any of them
// helped. That is how fifteen rules accumulated while the measured reject rate went 34% -> 42%.
// This is the missing half of that loop. Read-only; DATABASE_URL from env or .env.local.
//
// It leads with the signal it can defend (rule persistence), reports a weak one with its weakness
// stated, and refuses a third — see the header of src/lib/proposal-outcomes.ts for why.

import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
import { findRecurrences, ruleTrends, outcomeLabel } from "../src/lib/proposal-outcomes";

if (!process.env.DATABASE_URL) {
  try {
    process.env.DATABASE_URL = readFileSync(".env.local", "utf8")
      .match(/DATABASE_URL\s*=\s*"?([^"\n\r]+)"?/)[1].trim();
  } catch { /* fall through */ }
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required (env or study-app/.env.local).");
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);

const daysArg = process.argv.find((a) => a.startsWith("--days="));
const DAYS = daysArg ? Number(daysArg.slice("--days=".length)) : 30;

const bar = (n, max, width = 16) =>
  "█".repeat(Math.round((Math.min(n, max) / (max || 1)) * width)).padEnd(width, "·");

const proposals = (
  await sql.query(
    `SELECT id::text AS id, theme, kind, status, retired_at, created_at
     FROM bin_fix_proposals ORDER BY id`
  )
).map((r) => ({
  id: r.id,
  theme: r.theme,
  kind: r.kind,
  status: r.status,
  shippedAt: r.retired_at ? new Date(r.retired_at).toISOString() : null,
  createdAt: new Date(r.created_at).toISOString(),
}));

const shipped = proposals.filter((p) => p.status === "shipped");
const recurrences = findRecurrences(proposals);

console.log(`\n${"=".repeat(94)}`);
console.log(`ROOT-CAUSE FIX OUTCOMES — ${shipped.length} shipped proposals`);
console.log(`${"=".repeat(94)}`);

// ── 1. Are the rules still firing? ───────────────────────────────────────────────────────────────
//
// The cut is the MEDIAN ship date, not per-proposal: 21 ships land inside four days, so per-proposal
// windows would overlap almost entirely and attribute the same attempts to every fix.
const shipDates = shipped.map((p) => new Date(p.shippedAt).getTime()).sort((a, b) => a - b);
const cut = new Date(shipDates[Math.floor(shipDates.length / 2)]).toISOString();

const rows = await sql.query(
  `SELECT rules_fired, created_at FROM generation_attempts
   WHERE created_at > now() - ($1 || ' days')::interval AND rules_fired IS NOT NULL`,
  [String(DAYS)]
);
const tally = new Map();
let beforeTotal = 0, afterTotal = 0;
for (const r of rows) {
  const isAfter = new Date(r.created_at).toISOString() > cut;
  if (isAfter) afterTotal++; else beforeTotal++;
  for (const rule of r.rules_fired || []) {
    if (!tally.has(rule)) tally.set(rule, { rule, beforeFired: 0, afterFired: 0 });
    const t = tally.get(rule);
    if (isAfter) t.afterFired++; else t.beforeFired++;
  }
}
const trends = ruleTrends([...tally.values()].map((t) => ({ ...t, beforeTotal, afterTotal })));

console.log(`\n1. RULE PERSISTENCE — the signal to actually read`);
console.log(`   Share of attempts each rule rejected, before vs after ${cut.slice(0, 10)}.`);
console.log(`   A rule still firing after a fix shipped for it did not work, whatever the PR said.`);
console.log(`   before: ${beforeTotal} attempts | after: ${afterTotal} attempts\n`);
console.log(`   rule                      before    after    change`);
const maxRate = Math.max(...trends.map((t) => t.afterRate), 1);
for (const t of trends.slice(0, 14)) {
  const flag = !t.reliable ? "  (thin — not reliable)" : t.deltaPp > 2 ? "  ← firing MORE" : "";
  console.log(
    `   ${t.rule.padEnd(24)} ${String(t.beforeRate).padStart(6)}% ${String(t.afterRate).padStart(7)}% ` +
      `${(t.deltaPp > 0 ? "+" : "") + t.deltaPp}pp`.padStart(9) +
      `  ${bar(t.afterRate, maxRate)}${flag}`
  );
}

// ── 2. Did the fault get re-proposed? ────────────────────────────────────────────────────────────
console.log(`\n2. FAULT RECURRENCE — weak by construction, read section 1 first\n`);
if (recurrences.length === 0) {
  console.log(`   No theme match found, and that is NOT evidence the fixes held. This detector`);
  console.log(`   under-reports for two reasons:`);
  console.log(`     - The miner is INSTRUCTED never to duplicate an existing proposal's theme, so the`);
  console.log(`       clearest sign a fix failed is exactly what the prompt suppresses.`);
  console.log(`     - Themes are 80-char model prose. Measured on a real pair — #3 "no banker / too many`);
  console.log(`       curveballs" (shipped 08-06) and #23 "banker status judged by grape variety alone"`);
  console.log(`       (raised 08-09, same fault) — token containment scores 0.20. No threshold catches`);
  console.log(`       that without matching unrelated themes.`);
} else {
  for (const r of recurrences) {
    console.log(`   #${r.proposalId} shipped ${r.shippedAt.slice(0, 10)} — ${r.theme}`);
    for (const again of r.recurredAs) {
      console.log(
        `        came back as #${again.proposalId} (${again.createdAt.slice(0, 10)}, overlap ${again.overlap}) — ${again.theme}`
      );
    }
  }
  console.log(`\n   ${recurrences.length} of ${shipped.length} shipped fixes visibly did not hold. A HIT here is`);
  console.log(`   meaningful; a miss is not. Read the pairs before trusting the match.`);
}

// ── 3. What this deliberately does not claim ─────────────────────────────────────────────────────
console.log(`\n3. NOT MEASURED — per-proposal first-pass rate before/after`);
console.log(`   Daily first-pass swings 12% -> 55% -> 17% on volumes falling 605/day to 20/day, and all`);
console.log(`   ${shipped.length} ships land inside four days. Any before/after window is dominated by that noise`);
console.log(`   and by whatever else shipped the same day. The number would look authoritative and mean`);
console.log(`   nothing — which is the failure this report exists to correct.`);
console.log(`   Global first-pass is in scripts/analyze-generation.mjs.`);

// ── 4. The labels the miner will see ─────────────────────────────────────────────────────────────
console.log(`\n4. OUTCOME LABELS fed back into the miner prompt\n`);
for (const p of shipped) console.log(`   #${p.id} [${p.kind}] ${outcomeLabel(p, recurrences)}`);
console.log("");
