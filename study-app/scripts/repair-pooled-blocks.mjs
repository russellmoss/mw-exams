// repair-pooled-blocks.mjs — mechanically un-break the questions R12 flags.
//
// R12 (question-rules.mjs) catches a per-wine part pooled under a flight-wide header. This repairs
// the ones whose correction is mechanical, and REFUSES the rest. Two shapes:
//
//   A. The part already carries "(N x M marks)". It is per-wine in its own marks and only its
//      POSITION is wrong, so the repair is purely structural — move it under "For each wine:". No
//      arithmetic, so the mark total is unchanged by construction. (96 rows, 62 servable.)
//   B. The part carries a flat "(F marks)" and F is divisible by the wine count with a quotient of
//      at least 5. Move it AND rewrite the mark as "(N x F/N marks)". N x F/N = F, so the total is
//      again unchanged. (15 rows, 13 servable.)
//
// Everything else is left alone and reported: a flat mark that will not divide, a quotient under the
// 5-mark floor, an unparseable mark. Those need a human to decide where the marks go — the exam's own
// idiom is to fold the orphaned identification into the per-wine origin part and sum the marks
// ("Identify the grape variety and origin as closely as possible. (4 x 15 marks)", 2022 P1 Q4) — and
// guessing that reallocation is exactly the kind of silent edit this script must not make.
//
// Usage:
//   node scripts/repair-pooled-blocks.mjs            # dry run, prints a diff per question
//   node scripts/repair-pooled-blocks.mjs --apply    # writes
//   node scripts/repair-pooled-blocks.mjs --all      # include non-servable rows too
//
// Every repair must clear FIVE gates before it is written. If any fails the question is skipped
// whole, never partially edited (same contract as normalizeMarkAllocation in question-engine.ts).

import { neon } from "@neondatabase/serverless";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyQuestionRules,
  expandMarkTokens,
  markScopeForHeader,
  HEADER_LINE_RE,
} from "../src/lib/question-rules.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes("--apply");
const ALL = process.argv.includes("--all");

if (!process.env.DATABASE_URL) {
  const envPath = path.join(HERE, "..", ".env.local");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
    }
  }
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set and not found in study-app/.env.local");

const sql = neon(process.env.DATABASE_URL);

const POOLED_RULES = new Set(["pooled-block-marked-per-wine", "pooled-block-per-wine-task"]);
const PART_RE = /^\s*\(?([a-h])\)\s*(.*)$/i;
const MULT_RE = /\(\s*(\d+)\s*[x×]\s*(\d+)\s*(?:marks?)?\s*\)/i;
const FLAT_RE = /\(\s*(\d+)\s*marks?\s*\)/i;
const PER_WINE_PHRASE_RE = /,?\s*\b(?:of|for)\s+each\s+wine\b/i;

const bareWines = (n) => Array.from({ length: n }, (_, i) => ({ slot: i + 1, varieties: [] }));
const rulesOf = (text, n) =>
  applyQuestionRules({ paper: 0, questionText: text, wines: bareWines(n) }).map((v) => v.rule);

/** Classify every line once: header (with its scope), lettered part, or prose. */
function scan(lines, n) {
  let scope = null;
  return lines.map((line) => {
    const h = line.match(HEADER_LINE_RE);
    if (h) {
      const s = markScopeForHeader(h[1], n);
      if (s) {
        scope = s;
        return { line, kind: "header", scope: s };
      }
    }
    const p = line.match(PART_RE);
    if (p) return { line, kind: "part", scope, letter: p[1].toLowerCase(), body: p[2] };
    return { line, kind: "prose", scope };
  });
}

/**
 * @returns {{ ok: true, text: string, moved: string[] } | { ok: false, reason: string }}
 */
function repair(original, n) {
  const text = original.replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  let tagged = scan(lines, n);

  // Inline sub-parts ("… (16 marks) b) Identify …") would need the whole question reflowed. Rare and
  // not worth the risk of rewriting formatting we did not have to touch.
  if (tagged.some((t) => t.kind !== "part" && /\s\(?[a-h]\)\s+\S/.test(t.line)))
    return { ok: false, reason: "inline sub-parts — needs reflow, skipped" };

  const offenders = tagged
    .map((t, i) => ({ ...t, i }))
    .filter(
      (t) =>
        t.kind === "part" &&
        t.scope?.kind === "pooled" &&
        (MULT_RE.test(t.line) ||
          (/^\s*\(?[a-h]\)\s*(?:identify|name|state)\b/i.test(t.line) &&
            /\b(?:of|for)\s+each\s+wine\b/i.test(t.body) &&
            !/(?:with reference to|referencing|by reference to|drawing on)\s+each|in each case/i.test(t.body)))
    );
  if (offenders.length === 0) return { ok: false, reason: "no offending part found" };

  // The destination: a header that distributes over the WHOLE flight. Anything narrower (a pair, a
  // slot range, a single wine) is a different question about different wines.
  const targetIdx = tagged.findIndex((t) => t.kind === "header" && t.scope?.kind === "each" && t.scope.count === n);
  if (targetIdx === -1) return { ok: false, reason: 'no "For each wine:" block to move the part into' };

  const moved = [];
  /** @type {Map<number, string>} */
  const rewritten = new Map();
  for (const o of offenders) {
    let body = o.body;
    if (!MULT_RE.test(o.line)) {
      // Shape B — a flat mark that has to become per-wine. Refuse anything that does not divide
      // exactly or lands under the floor; those are reallocations, not repairs.
      const flat = o.line.match(FLAT_RE);
      if (!flat) return { ok: false, reason: "pooled part has no parseable mark" };
      const F = Number(flat[1]);
      if (F % n !== 0) return { ok: false, reason: `flat ${F} marks does not divide by ${n} wines` };
      const q = F / n;
      if (q < 5) return { ok: false, reason: `flat ${F}/${n} = ${q} marks per wine, below the 5-mark floor` };
      // "Identify the grape variety of each wine." → "Identify the grape variety." The header now
      // says "for each wine"; repeating it in the task is what made the part read as pooled.
      body = body.replace(PER_WINE_PHRASE_RE, "").replace(FLAT_RE, `(${n} x ${q} marks)`);
      body = body.replace(/\s+([.,])/g, "$1").replace(/\s{2,}/g, " ").trim();
      moved.push(`${o.letter}) flat ${F} → ${n} x ${q}`);
    } else {
      moved.push(`${o.letter}) moved (marks unchanged)`);
    }
    rewritten.set(o.i, `${o.letter}) ${body}`);
  }

  // Rebuild: drop the offenders from the pooled block, insert them just after the target header in
  // their original letter order.
  const offenderIdx = new Set(offenders.map((o) => o.i));
  const insert = offenders.map((o) => rewritten.get(o.i));
  const out = [];
  for (let i = 0; i < tagged.length; i++) {
    if (offenderIdx.has(i)) continue;
    out.push(tagged[i].line);
    if (i === targetIdx) out.push(...insert);
  }

  // A header with no parts left under it is scaffolding for nothing — moving the only part out of a
  // pooled block always strands its header, which is the whole point of the move.
  const rebuilt = scan(out, n);
  const deadIdx = new Set();
  for (let i = 0; i < rebuilt.length; i++) {
    if (rebuilt[i].kind !== "header") continue;
    let sawPart = false;
    for (let j = i + 1; j < rebuilt.length && rebuilt[j].kind !== "header"; j++)
      if (rebuilt[j].kind === "part") sawPart = true;
    if (!sawPart) deadIdx.add(i);
  }
  const finalLines = out.filter((_, i) => !deadIdx.has(i));
  const result = finalLines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+$/gm, "")
    .trim();

  // ---- gates -------------------------------------------------------------------------------
  const before = rulesOf(text, n);
  const after = rulesOf(result, n);
  if (after.some((r) => POOLED_RULES.has(r))) return { ok: false, reason: "still trips R12 after repair" };
  const beforeTotal = expandMarkTokens(text, n).total;
  const afterTotal = expandMarkTokens(result, n).total;
  if (beforeTotal !== afterTotal)
    return { ok: false, reason: `mark total moved ${beforeTotal} → ${afterTotal}` };
  const newRules = after.filter((r) => !POOLED_RULES.has(r) && !before.includes(r));
  if (newRules.length) return { ok: false, reason: `repair introduced ${[...new Set(newRules)].join(", ")}` };
  // Letters must still read in order, or the model answer's "part b)" references stop matching.
  const letters = scan(result.split("\n"), n)
    .filter((t) => t.kind === "part")
    .map((t) => t.letter);
  if (letters.some((l, i) => i > 0 && l < letters[i - 1]))
    return { ok: false, reason: `sub-part letters out of order (${letters.join("")})` };
  if (result === text) return { ok: false, reason: "no change produced" };

  return { ok: true, text: result, moved };
}

// ---- main ----------------------------------------------------------------------------------

const rows = await sql`
  SELECT question_id, paper, status, is_retired, served_count, question_text,
         COALESCE(flight_size, jsonb_array_length(wines)) AS n
  FROM generated_questions
  ORDER BY paper, question_id`;

const candidates = rows.filter((r) => {
  if (!ALL && !(r.status === "approved" && r.is_retired === false)) return false;
  const n = Number(r.n) || 0;
  return n >= 2 && rulesOf(String(r.question_text || "").replace(/\r\n/g, "\n"), n).some((x) => POOLED_RULES.has(x));
});

const fixed = [];
const skipped = [];
for (const r of candidates) {
  const res = repair(String(r.question_text), Number(r.n));
  if (res.ok) fixed.push({ r, res });
  else skipped.push({ r, reason: res.reason });
}

console.log(`R12-defective ${ALL ? "(whole bank)" : "(servable only)"}: ${candidates.length}`);
console.log(`  repairable : ${fixed.length}`);
console.log(`  needs human: ${skipped.length}\n`);

for (const { r, res } of fixed.slice(0, Number(process.env.SHOW ?? 3))) {
  console.log(`──── ${r.question_id} (P${r.paper}, ${r.n} wines) — ${res.moved.join("; ")}`);
  console.log("BEFORE:\n" + String(r.question_text).trim());
  console.log("AFTER:\n" + res.text + "\n");
}
if (skipped.length) {
  console.log("Left for a human:");
  const by = {};
  for (const s of skipped) (by[s.reason] ??= []).push(s.r.question_id);
  for (const [reason, ids] of Object.entries(by)) console.log(`  ${ids.length}x ${reason}\n      ${ids.join(", ")}`);
}

if (!APPLY) {
  console.log(`\nDRY RUN — nothing written. Re-run with --apply to write ${fixed.length} question(s).`);
  process.exit(0);
}

let n = 0;
for (const { r, res } of fixed) {
  await sql`UPDATE generated_questions SET question_text = ${res.text} WHERE question_id = ${r.question_id}`;
  n++;
}
console.log(`\nAPPLIED — rewrote ${n} question(s).`);
