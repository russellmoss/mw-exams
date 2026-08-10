#!/usr/bin/env node
// analyze-corpus-shapes.mjs — derive question SHAPES from the 153 real MW questions.
//
// The flight spec fixed the arithmetic but flattened the prose: every generated question came out as
// "Wines 1 to N [claim] -> a) Identify -> b) winemaking/maturity -> c) style, quality, commercial",
// because that is roughly all my eight hand-written mark templates could say. Hand-writing more
// templates would just be more invention. The corpus already contains the real distribution of
// shapes; this reads it out so the templates can be built from evidence.
//
// Reports: how many sub-parts real questions use, in what ROLE ORDER, how often a part is shared
// across the flight vs per-wine, which mark values actually occur, and how the opening sentences are
// phrased.
//
// Usage: node scripts/analyze-corpus-shapes.mjs [--limit N]
import { readFileSync } from "node:fs";
import { join } from "node:path";

const exams = JSON.parse(readFileSync(join(process.cwd(), "..", "data", "exams.json"), "utf-8"));
const questions = [];
(function walk(o) {
  if (Array.isArray(o)) return o.forEach(walk);
  if (o && typeof o === "object") {
    if (typeof o.text === "string" && /\(\d+/.test(o.text)) questions.push(o);
    Object.values(o).forEach(walk);
  }
})(exams);

// Classify a sub-question by what it asks. Order matters — the first match wins, so the more
// specific asks sit above the general ones.
const ROLES = [
  ["state_rs", /\b(state|indicate|estimate)\b[^.]{0,60}\b(residual sugar|sugar level|alcohol level|abv)\b/i],
  ["identification", /\b(identif\w+|name|state|determine|suggest)\b[^.]{0,70}\b(grape|variet|origin|region|countr|appellation|vintage)\b/i],
  ["winemaking", /\bwinemak|\bvinif|\bmethod of production|\bproduction\b|\bhow .{0,30}(made|produced)|\boak\b|\bmaturation|\bfermentat|\belevage|\blees\b|\bmalolactic/i],
  ["maturity", /\bmaturit|\bageing|\baging|\bage\s*\/|\bvintage\b[^.]{0,40}\bdevelop|\bdrink|\bcellar|\bpotential to (develop|improve)|\bhow much longer/i],
  ["commercial", /\bcommercial|\bmarket|\bprice|\bconsumer|\bretail|\bwho would buy|\bsales\b|\btarget\b/i],
  ["quality_style", /\bquality|\bstyle|\btypicity|\bfinesse|\bmerit|\bstandard/i],
  ["structure", /\bstructure|\btannin|\bacidit|\bbody\b|\bbalance|\balcohol\b/i],
];

const MARK_RE = /\((?:(\d+)\s*[x×]\s*)?(\d+)\s*marks?\)/i;
const PART_RE = /^\s*([a-h])\)\s*/;

function parseQuestion(text) {
  const lines = text.split(/\r?\n/);
  const parts = [];
  let stemLines = [];
  let current = null;
  for (const line of lines) {
    if (PART_RE.test(line)) {
      if (current) parts.push(current);
      current = { text: line };
    } else if (current) {
      current.text += " " + line;
    } else {
      stemLines.push(line);
    }
  }
  if (current) parts.push(current);

  const wineCount = (text.match(/wines?\s+1\s+(?:to|and|–|-)\s+(\d+)/i) || [])[1];
  const n = wineCount ? Number(wineCount) : null;

  for (const p of parts) {
    const m = p.text.match(MARK_RE);
    p.marks = m ? (m[1] ? Number(m[1]) * Number(m[2]) : Number(m[2])) : 0;
    p.perWine = !!(m && m[1]);
    p.perWineValue = m && m[1] ? Number(m[2]) : null;
    p.role = (ROLES.find(([, re]) => re.test(p.text)) || ["other"])[0];
  }
  return { stem: stemLines.join(" ").trim(), parts, n };
}

const parsed = questions.map((q) => parseQuestion(q.text)).filter((q) => q.parts.length > 0);

// ── 1. How many sub-parts? ───────────────────────────────────────────────────────────────────────
const byCount = {};
for (const q of parsed) byCount[q.parts.length] = (byCount[q.parts.length] || 0) + 1;
console.log(`\n=== REAL MW QUESTION SHAPES (${parsed.length} questions) ===\n`);
console.log("SUB-PART COUNT");
for (const [k, v] of Object.entries(byCount).sort())
  console.log(`  ${k} parts  ${String(v).padStart(3)}  ${Math.round((v / parsed.length) * 100)}%`);

// ── 2. Role sequences — what shape does a real question actually take? ───────────────────────────
const seqs = {};
for (const q of parsed) {
  const seq = q.parts.map((p) => p.role).join(" -> ");
  seqs[seq] = (seqs[seq] || 0) + 1;
}
console.log("\nROLE SEQUENCES (top 20)");
for (const [seq, n] of Object.entries(seqs).sort((a, b) => b[1] - a[1]).slice(0, 20))
  console.log(`  ${String(n).padStart(3)}  ${seq}`);

// ── 3. Does identification always come first? ────────────────────────────────────────────────────
const withId = parsed.filter((q) => q.parts.some((p) => p.role === "identification"));
const idFirst = withId.filter((q) => q.parts[0].role === "identification").length;
const noId = parsed.length - withId.length;
console.log(`\nIDENTIFICATION POSITION`);
console.log(`  questions with an identification part : ${withId.length}/${parsed.length}`);
console.log(`  ...where it is part a)                : ${idFirst}/${withId.length} (${Math.round((idFirst / withId.length) * 100)}%)`);
console.log(`  questions with NO identification part : ${noId} (${Math.round((noId / parsed.length) * 100)}%)`);

// ── 4. Shared vs per-wine parts ──────────────────────────────────────────────────────────────────
const allParts = parsed.flatMap((q) => q.parts);
const shared = allParts.filter((p) => !p.perWine && p.marks > 0).length;
console.log(`\nPART SCOPE`);
console.log(`  per-wine "(N x M marks)"  ${allParts.length - shared}/${allParts.length}`);
console.log(`  shared   "(M marks)"      ${shared}/${allParts.length} (${Math.round((shared / allParts.length) * 100)}%)`);
const withShared = parsed.filter((q) => q.parts.some((p) => !p.perWine && p.marks > 0)).length;
console.log(`  questions containing at least one shared part: ${withShared}/${parsed.length} (${Math.round((withShared / parsed.length) * 100)}%)`);

// ── 5. Per-wine mark values actually used ────────────────────────────────────────────────────────
const perWineValues = {};
for (const p of allParts) if (p.perWineValue) perWineValues[p.perWineValue] = (perWineValues[p.perWineValue] || 0) + 1;
console.log(`\nPER-WINE MARK VALUES USED`);
console.log(
  "  " +
    Object.entries(perWineValues)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([v, n]) => `${v}m x${n}`)
      .join("   ")
);

// ── 6. Role frequency — which asks does the exam actually make? ──────────────────────────────────
const roleMarks = {};
let totalMarks = 0;
for (const p of allParts) {
  roleMarks[p.role] = (roleMarks[p.role] || 0) + p.marks;
  totalMarks += p.marks;
}
console.log(`\nSHARE OF MARKS BY ROLE`);
for (const [r, m] of Object.entries(roleMarks).sort((a, b) => b[1] - a[1]))
  console.log(`  ${r.padEnd(16)} ${String(Math.round((m / totalMarks) * 100)).padStart(3)}%`);

// ── 7. Stem openings ─────────────────────────────────────────────────────────────────────────────
console.log(`\nSTEM OPENING SENTENCES (a sample of the real phrasings)`);
const openings = [...new Set(parsed.map((q) => q.stem.split(/\.\s/)[0].trim()).filter((s) => s.length > 15))];
for (const o of openings.slice(0, 22)) console.log(`  · ${o.slice(0, 120)}`);
console.log(`\n  (${openings.length} distinct openings across ${parsed.length} questions)\n`);
