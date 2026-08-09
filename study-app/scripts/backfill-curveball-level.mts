// backfill-curveball-level.mts — give the curveball columns a real value.
//
// `curveball` was derived from metadata.curveball / metadata.difficulty, which nothing writes, so
// deriveCurveball() fell through to "low" for every row: 805 "low", 137 NULL, no other value ever
// stored. `curveball_level` was worse — the engine parsed a "CurveballLevel:" line the model was
// asked to emit and then never passed it to the save, so it was NULL on all 942 rows. Both feed the
// admin balance view and the curveball-targeted generation predicate, which were therefore reporting
// on, and selecting by, a constant.
//
// Both are now MEASURED from the flight with isBanker — the same detector the hard flight-composition
// rule gates on, so the dashboard and the gate cannot disagree:
//
//   low     no curveballs at all
//   medium  curveballs are at most half the flight
//   high    curveballs are more than half (this includes every bankerless flight)
//
// Single-wine rows get NULL: a flight of one has no balance to describe.
//
// Deliberately NOT touched: curveball_slots. It feeds stem_answer_keys.ground_truth[].role and is
// ENFORCED (validateAnswerKeyClaims stops a debrief calling the flight's anchor a curveball). Its NULL
// means "the generator did not declare a role", and inventing roles from a heuristic would turn an
// unstated fact into an enforced one.
//
//   npx tsx scripts/backfill-curveball-level.mts            # dry run
//   npx tsx scripts/backfill-curveball-level.mts --apply

import { readFileSync } from "fs";
import { join } from "path";
import { neon } from "@neondatabase/serverless";
import { isBanker, type AuditWine } from "../src/lib/question-validator";
import "../src/lib/appellation-resolver";

if (!process.env.DATABASE_URL) {
  for (const line of readFileSync(join(process.cwd(), ".env.local"), "utf-8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
}
const sql = neon(process.env.DATABASE_URL!);
const APPLY = process.argv.includes("--apply");

type Row = {
  question_id: string;
  paper: number;
  wines: string | { slot: number; fullText?: string }[];
  curveball: string | null;
  curveball_level: string | null;
};

const rows = (await sql`
  SELECT question_id, paper, wines, curveball, curveball_level
  FROM generated_questions ORDER BY question_id`) as unknown as Row[];

const level = (n: number, curveballs: number): "low" | "medium" | "high" | null => {
  if (n < 2) return null;
  if (curveballs === 0) return "low";
  return curveballs * 2 <= n ? "medium" : "high";
};

const counts: Record<string, number> = { low: 0, medium: 0, high: 0, null: 0 };
const changes: { id: string; from: string; to: string }[] = [];

for (const r of rows) {
  const raw = (typeof r.wines === "string" ? JSON.parse(r.wines) : r.wines) as { slot: number; fullText?: string }[];
  const flight: AuditWine[] = (Array.isArray(raw) ? raw : []).map((w) => ({
    slot: w.slot,
    varieties: [],
    region: "",
    fullText: w.fullText,
  }));
  const cb = flight.filter((w) => !isBanker(w)).length;
  const lv = level(flight.length, cb);
  counts[lv ?? "null"]++;
  if (lv !== r.curveball_level) changes.push({ id: r.question_id, from: r.curveball_level ?? "NULL", to: lv ?? "NULL" });
}

console.log(`${rows.length} banked questions re-measured with isBanker\n`);
console.log("  new curveball_level distribution:");
for (const k of ["low", "medium", "high", "null"]) console.log(`    ${k.padEnd(7)} ${counts[k]}`);
console.log(`\n  rows whose stored level changes: ${changes.length}`);
console.log(`  (was: 805 rows "low" + 137 NULL on the curveball column, and NULL on every curveball_level)`);

if (!APPLY) {
  console.log("\nDRY RUN — nothing written.");
  process.exit(0);
}

let n = 0;
for (const r of rows) {
  const raw = (typeof r.wines === "string" ? JSON.parse(r.wines) : r.wines) as { slot: number; fullText?: string }[];
  const flight: AuditWine[] = (Array.isArray(raw) ? raw : []).map((w) => ({
    slot: w.slot,
    varieties: [],
    region: "",
    fullText: w.fullText,
  }));
  const lv = level(flight.length, flight.filter((w) => !isBanker(w)).length);
  await sql`
    UPDATE generated_questions
       SET curveball_level = ${lv},
           curveball = COALESCE(${lv}, curveball)
     WHERE question_id = ${r.question_id}`;
  n++;
}
console.log(`\nAPPLIED — re-measured ${n} rows.`);
