// mark-scope-blast-radius.mjs — what the scope-aware mark expander changes on the LIVE bank.
//
//   node --import ./scripts/ts-loader.mjs scripts/mark-scope-blast-radius.mjs
//
// READ-ONLY. Teaching the mark parser section-header scope ("For each wine:" + a bare "(15 marks)")
// and the "per pair" / unitless notations changes what every mark-totalling rule computes. Before
// merging that, this reports the diff over every banked question: how many flip from failing to
// passing, how many flip the other way, and whether any stored served-stem hash would move.
//
// Counted per QUESTION, not per violation instance — a question is what gets quarantined.

import { neon } from "@neondatabase/serverless";
import { expandMarkTokens } from "@/lib/question-rules.mjs";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
const sql = neon(process.env.DATABASE_URL);

// The pre-change reading: face value, "marks" mandatory, no header scope, no per-unit phrase.
function legacyTotal(text) {
  let total = 0;
  for (const m of (text || "").matchAll(/\((\d+)\s*[x×]\s*(\d+)\s*marks?\)/gi)) total += +m[1] * +m[2];
  for (const m of (text || "").matchAll(/\((\d+)\s*marks?\)/gi)) total += +m[1];
  return total;
}
// The pre-change token list, for the 5-mark floor and the stem-hash comparison.
function legacyTokens(text) {
  const out = [];
  for (const m of (text || "").matchAll(/\((?:(\d+)\s*[x×]\s*)?(\d+)\s*marks?\)/gi)) {
    out.push({ raw: m[0], perUnit: +m[2], mult: m[1] ? +m[1] : 1, marks: (m[1] ? +m[1] : 1) * +m[2] });
  }
  return out;
}

const rows = await sql`
  SELECT question_id, paper, family, question_text, wines, invalid_reasons, is_retired, status
  FROM generated_questions`;
console.log(`[blast] ${rows.length} banked questions\n`);

const flips = { totalNowOk: [], totalNowBad: [], floorNowOk: [], floorNowBad: [], hashMoves: [] };
let scopedQuestions = 0;

for (const r of rows) {
  const wines = Array.isArray(r.wines) ? r.wines : JSON.parse(r.wines || "[]");
  const n = wines.length;
  if (!n) continue;
  const text = r.question_text || "";
  const want = n * 25;

  const before = legacyTotal(text);
  const { tokens, total: after } = expandMarkTokens(text, n);
  if (tokens.some((t) => t.origin === "scoped" || t.origin === "per-phrase")) scopedQuestions++;

  // (a) the 25×N total rule — legacy skips a 0 total, so mirror that
  const okBefore = before === 0 || before === want;
  const okAfter = after === 0 || after === want;
  if (!okBefore && okAfter) flips.totalNowOk.push([r.question_id, `${before} -> ${after} (want ${want})`]);
  if (okBefore && !okAfter) flips.totalNowBad.push([r.question_id, `${before} -> ${after} (want ${want})`]);

  // (b) the 5-mark floor — counted on per-unit values, which the expander does not change, but the
  // token SET does (unitless and "per wine" tokens are newly visible).
  const floorBefore = legacyTokens(text).some((t) => t.perUnit >= 1 && t.perUnit <= 4);
  const floorAfter = tokens.some((t) => t.perUnit >= 1 && t.perUnit <= 4);
  if (floorBefore && !floorAfter) flips.floorNowOk.push([r.question_id, "floor token vanished"]);
  if (!floorBefore && floorAfter) flips.floorNowBad.push([r.question_id, "new floor token visible"]);

  // (c) computeServedStemHash is deliberately unscoped, so it only moves if the TOKEN SET changed
  // (a unitless "(4 x 10)", a trailing backslash, or a "per wine" suffix becoming visible).
  const unscoped = expandMarkTokens(text, 0);
  const sigBefore = legacyTokens(text).map((t) => `${t.marks}/${t.perUnit}`).join(",");
  const sigAfter = unscoped.tokens.map((t) => `${t.marks}/${t.perUnit}`).join(",");
  if (sigBefore !== sigAfter) flips.hashMoves.push([r.question_id, `${sigBefore} -> ${sigAfter}`]);
}

const show = (label, list) => {
  console.log(`${label}: ${list.length}`);
  for (const [id, why] of list.slice(0, 15)) console.log(`    ${id}  ${why}`);
  if (list.length > 15) console.log(`    … and ${list.length - 15} more`);
};
console.log(`questions using scoped / per-unit notation: ${scopedQuestions}\n`);
show("25xN total: FAIL -> PASS (unblocked)", flips.totalNowOk);
show("25xN total: PASS -> FAIL (newly quarantined)", flips.totalNowBad);
show("5-mark floor: FAIL -> PASS", flips.floorNowOk);
show("5-mark floor: PASS -> FAIL", flips.floorNowBad);
show("served-stem hash would MOVE", flips.hashMoves);
