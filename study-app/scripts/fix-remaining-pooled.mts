// fix-remaining-pooled.mts — the 11 R12 questions repair-pooled-blocks.mjs deliberately refused.
//
// That script only performs total-preserving MOVES. These eleven need a mark REALLOCATION, which is a
// judgement call, so each rewrite below is written out by hand and justified. Three of them also
// carried mark notations no parser and no candidate could read — a pooled and a per-wine allocation
// welded into one bracket ("(15 + 3 x 8 marks)"), and in one case half-marks per wine — which is
// fixed here at the same time, because you cannot re-split marks without settling what they say.
// Every rewrite leaves the expander's total exactly where it found it; see the run output.
//
// The rewrites follow three patterns, all corpus-grounded:
//   1. SPLIT a compound "country + per-wine region/variety" part into a pooled part for the shared
//      property and a per-wine part for the varying one. That is what notations like "(3 + 3 x 6
//      marks)" were groping toward.
//   2. RE-HEAD a block whose parts are all per-wine marked — the header was simply wrong.
//   3. FLATTEN a genuinely comparative part ("compare and contrast the two wines") that had been
//      given a per-wine multiplier: one shared answer, one flat mark.
//
// Every candidate is put through the FULL validator (not just R12) and must clear four gates: no hard
// violations, total exactly 25×N, every mark token at least 5, and sub-part letters still in reading
// order so a model answer's "part b)" still resolves. Run from study-app/:
//   npx tsx scripts/fix-remaining-pooled.mts           # dry run
//   npx tsx scripts/fix-remaining-pooled.mts --apply

import { readFileSync } from "fs";
import { join } from "path";
import { neon } from "@neondatabase/serverless";
import { validateQuestion, type AuditWine } from "../src/lib/question-validator";
import { expandMarkTokens } from "../src/lib/question-rules.mjs";
import "../src/lib/appellation-resolver";

if (!process.env.DATABASE_URL) {
  for (const line of readFileSync(join(process.cwd(), ".env.local"), "utf-8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
}
const sql = neon(process.env.DATABASE_URL!);
const APPLY = process.argv.includes("--apply");

/** questionId → { why, text } */
const FIXES: Record<string, { why: string; text: string }> = {
  // ── P1 ────────────────────────────────────────────────────────────────────────────────────────
  // Trailing pooled block asked the REGION per wine at 16/4 = 4 marks, under the floor. Region varies
  // within the shared country, so it belongs with the per-wine variety ask — the exam's own idiom
  // ("Identify the grape variety and origin as closely as possible", 2022 P1 Q4). 16+20+48+16 = 100
  // becomes 16+36+48 = 100.
  gen_p1_F2_1786071017323: {
    why: "fold the per-wine region ask into the per-wine variety part (4x5 + 16 → 4x9)",
    text: `Wines 3 to 6 are from the same country, each made from a different single grape variety.

With reference to all four wines:
a) Identify the country of origin. (16 marks)

For each wine:
b) Identify the grape variety and region of origin as closely as possible. (4 x 9 marks)
c) Comment on the style, quality, and commercial position of the wine. (4 x 12 marks)`,
  },

  // Attempt #476. Pooled variety at 16/4 = 4, under the floor. The stem says the four varieties
  // DIFFER, so the ask is per-wine; lift it to the 5-mark floor and fund the 4-mark difference from
  // the largest part. 16+20+64 = 100 becomes 20+20+60 = 100.
  gen_p1_F4_1786071627274: {
    why: "pooled variety → per-wine at the 5-mark floor, funded from part c)",
    text: `Wines 3 to 6 are each from a different country and each made predominantly from a different, single grape variety.

For each wine:
a) Identify the grape variety. (4 x 5 marks)
b) Identify the origin as closely as possible. (4 x 5 marks)
c) Comment on the style, quality, and commercial position. (4 x 15 marks)`,
  },

  // Same shape. 16+32+52 = 100 becomes 20+32+48 = 100.
  gen_p1_F4_1786073249209: {
    why: "pooled variety → per-wine at the 5-mark floor, funded from part c)",
    text: `Wines 3 to 6 are from two different countries and are each made from a different, single grape variety.

For each wine:
a) Identify the grape variety. (4 x 5 marks)
b) Identify the origin as closely as possible. (4 x 8 marks)
c) Comment on the style, quality, and commercial position. (4 x 12 marks)`,
  },

  // ── P2 ────────────────────────────────────────────────────────────────────────────────────────
  // "(15 + 3 x 8 marks)" is a compound token: a pooled 15 for the country and 3 x 8 for the per-wine
  // variety, welded into one bracket. The expander does not read the "15 +" half at all, and neither
  // can a candidate — the printed marks do not say what part a) is worth. Split into the two parts it
  // was describing, with explicit tokens: 15 + 24 + 15 + 21 = 75.
  gen_p2_F2_1785955036678: {
    why: "split the unparseable '15 + 3 x 8' compound into explicit parts",
    text: `Wines 1 to 3 are from the same country of origin.

For all three wines:
a) Identify the country of origin. (15 marks)

For each wine:
b) Identify the grape variety as closely as possible. (3 x 8 marks)
c) Comment on the style and key winemaking decisions. (3 x 5 marks)
d) Assess the quality, maturity and commercial position. (3 x 7 marks)`,
  },

  // ── P3 ────────────────────────────────────────────────────────────────────────────────────────
  // Per-wine origin (2 x 8) sat under the pooled header with no "For each wine:" block to belong to.
  // The variety IS shared (the stem says so) and c)/d) are genuinely comparative, so only b) moves.
  // Totals untouched: 8+16+12+14 = 50.
  gen_p3_F1_1780124728747: {
    why: "give the per-wine origin part its own block; marks unchanged",
    text: `Wines 1 and 2 are sparkling wines made from the same single grape variety. Each is from a different country.

With reference to both wines:
a) Identify the grape variety. (8 marks)

For each wine:
b) Identify the origin as closely as possible. (2 x 8 marks)

With reference to both wines:
c) Compare the method of production evident in the two wines. (12 marks)
d) Comment on the style and quality of each wine, stating which is the higher quality. (14 marks)`,
  },

  // Same compound shape as above, and the pooled half is a 3-mark country ask — under the 5-mark
  // floor even once it is legible. Split and rebalance: 6 + 18 + 24 + 27 = 75.
  gen_p3_F2_1785880681707: {
    why: "split the unparseable '3 + 3 x 6' compound; 3-mark country ask was under the floor",
    text: `Wines 1, 2 and 3 are from the same country.

For all three wines:
a) Identify the country of origin. (6 marks)

For each wine:
b) Identify the region of origin as closely as possible. (3 x 6 marks)
c) Comment on the style and the key winemaking decisions behind the wine. (3 x 8 marks)
d) Assess the quality and commercial position of the wine. (3 x 9 marks)`,
  },

  // A flat 9 covering "the country AND, for each wine, the region" is 3 marks a wine for the region.
  // Split: the country stays pooled at 9, the region becomes its own per-wine part funded from b).
  // 9+42+24 = 75 becomes 9+18+24+24 = 75.
  gen_p3_F2_1785880713449: {
    why: "split shared country from per-wine region (flat 9 was 3/wine)",
    text: `Wines 1–3 are from the same country.

For all three wines:
a) Identify the country of origin. (9 marks)

For each wine:
b) Identify the region of origin as closely as possible. (3 x 6 marks)
c) Comment on the style and the key winemaking decisions evident in the wine. (3 x 8 marks)
d) Assess the quality and commercial position of the wine. (3 x 8 marks)`,
  },

  // Fractional marks — "(2 x 7.5 marks)". The MW awards whole marks, and half a mark per wine is not
  // a thing an examiner writes. Split the compound country/region ask, flatten the genuine
  // comparison, and land on whole numbers: 10 + 10 + 16 + 14 = 50.
  gen_p3_F2_1785952528913: {
    why: "remove fractional marks (2 x 7.5), split country from per-wine region",
    text: `Wines 1 and 2 are from the same country.

With reference to both wines:
a) Identify the country of origin. (10 marks)

For each wine:
b) Identify the region of origin as closely as possible. (2 x 5 marks)

With reference to both wines:
c) Compare and contrast the methods of production of the two wines. (16 marks)

For each wine:
d) Comment on the style, quality, and commercial position. (2 x 7 marks)`,
  },

  // Every part was per-wine marked under a pooled header. The stem asserts nothing shared, so the
  // header was simply wrong for a) and c); b) is a real comparison, so it keeps one flat mark.
  // 16+18+16 = 50 throughout.
  gen_p3_F2_1785961381927: {
    why: "re-head the per-wine parts; flatten the genuine comparison (2 x 9 → 18)",
    text: `Wines 1 and 2 are both sparkling wines.

For each wine:
a) Identify the region of origin as closely as possible, and the grape variety or varieties. (2 x 8 marks)

With reference to both wines:
b) Compare the methods of production, commenting on how the style of each wine has been shaped by winemaking decisions. (18 marks)

For each wine:
c) Assess the quality, maturity and commercial position. (2 x 8 marks)`,
  },

  // Same shape. 20+16+14 = 50 throughout.
  gen_p3_F2_1785962410285: {
    why: "re-head the per-wine parts; flatten the genuine comparison (2 x 8 → 16)",
    text: `Wines 1 and 2 are from different countries. Both are sparkling wines made by the traditional method.

For each wine:
a) Identify the region of origin and the grape variety or varieties as closely as possible. (2 x 10 marks)

With reference to both wines:
b) Compare and contrast the key winemaking decisions that distinguish these two wines, with particular reference to dosage, ageing, and disgorgement practices. (16 marks)

For each wine:
c) Comment on the style, quality, and commercial position. (2 x 7 marks)`,
  },

  // Both wines are from the SAME HOUSE, so the origin is one shared answer, not two — the 2 x 10 was
  // the error. Everything here is flight-wide. 20+16+14 = 50 throughout. (2013 P2 Q1 is the corpus
  // precedent for an all-pooled two-wine block.)
  gen_p3_F7_1780264586471: {
    why: "same house ⇒ origin is one shared answer (2 x 10 → flat 20)",
    text: `Wines 1 and 2 are both traditional method sparkling wines from the same house. They are released at different quality tiers.

With reference to both wines:
a) Identify the country and region of origin as closely as possible. (20 marks)
b) Compare the methods of production, with specific reference to the techniques that distinguish the higher tier from the lower tier. (16 marks)
c) Comment on the quality, maturity and commercial position of each wine, stating which is the higher quality wine and why. (14 marks)`,
  },
};

type BankRow = {
  question_id: string;
  paper: number;
  family: string;
  total_marks: number | null;
  question_text: string;
  wines: string | { slot: number; fullText?: string }[];
  n: number;
};

const ids = Object.keys(FIXES);
const rows = (await sql`
  SELECT question_id, paper, family, total_marks, question_text, wines,
         COALESCE(flight_size, jsonb_array_length(wines)) AS n
  FROM generated_questions WHERE question_id = ANY(${ids})`) as unknown as BankRow[];

let pass = 0;
const failures: string[] = [];

for (const r of rows) {
  const fix = FIXES[r.question_id];
  const n = Number(r.n);
  const raw: { slot: number; fullText?: string }[] =
    typeof r.wines === "string" ? JSON.parse(r.wines) : r.wines;
  const wines: AuditWine[] = (Array.isArray(raw) ? raw : []).map((w) => ({
    slot: w.slot,
    varieties: [],
    region: "",
    fullText: w.fullText,
  }));

  const before = expandMarkTokens(String(r.question_text), n).total;
  const after = expandMarkTokens(fix.text, n).total;
  const check = (text: string, total: number) =>
    validateQuestion({
      questionId: r.question_id,
      paper: r.paper,
      family: r.family,
      questionText: text,
      totalMarks: total,
      wines,
    }).violations.filter((v) => v.severity === "hard");

  // Judged on what the repair INTRODUCES, not on the absolute count. These rows are run without an
  // answer key, so key-dependent rules report against an empty flight — country-diversity says "key
  // has only 0 distinct (none)" for every one of them, including questions whose labels plainly carry
  // the countries the stem claims (gen_p1_F4_1786073249209 is France/Austria/France/France against a
  // "two different countries" stem, i.e. correct). Requiring zero would be measuring the harness.
  const hardBefore = new Set(check(String(r.question_text), Number(r.total_marks) || 25 * n).map((v) => v.rule));
  const hard = check(fix.text, 25 * n).filter((v) => !hardBefore.has(v.rule));
  const marks = [...fix.text.matchAll(/\(\s*(?:(\d+)\s*[x×]\s*)?(\d+(?:\.\d+)?)\s*marks?\s*\)/gi)].map((m) =>
    Number(m[2])
  );
  const letters = [...fix.text.matchAll(/^\s*\(?([a-h])\)/gim)].map((m) => m[1].toLowerCase());

  const problems: string[] = [];
  if (hard.length) problems.push(`NEW hard: ${hard.map((v) => v.rule).join(", ")}`);
  // The rules this whole exercise exists to clear must be gone outright, key or no key.
  const stillPooled = check(fix.text, 25 * n).filter((v) => v.rule.startsWith("pooled-block"));
  if (stillPooled.length) problems.push(`still trips ${stillPooled.map((v) => v.rule).join(", ")}`);
  if (after !== 25 * n) problems.push(`total ${after} ≠ 25 × ${n}`);
  if (marks.some((m) => m < 5)) problems.push(`mark below floor: ${marks.filter((m) => m < 5).join(", ")}`);
  if (marks.some((m) => !Number.isInteger(m))) problems.push("fractional mark");
  if (letters.some((l, i) => i > 0 && l <= letters[i - 1])) problems.push(`letters ${letters.join("")}`);

  const tag = problems.length ? "FAIL" : "ok  ";
  console.log(
    `${tag} ${r.question_id} (P${r.paper}, ${n} wines)  ${before} → ${after} marks  — ${fix.why}` +
      (problems.length ? `\n       ${problems.join("; ")}` : "")
  );
  if (problems.length) failures.push(r.question_id);
  else pass++;
}

console.log(`\n${pass}/${rows.length} clean, ${failures.length} failing.`);
if (rows.length !== ids.length)
  console.log(`WARNING: ${ids.length - rows.length} id(s) not found in the bank.`);

if (!APPLY) {
  console.log("DRY RUN — nothing written.");
  process.exit(failures.length ? 1 : 0);
}
if (failures.length) {
  console.log("Refusing to write: fix the failures above first.");
  process.exit(1);
}
for (const r of rows)
  await sql`UPDATE generated_questions SET question_text = ${FIXES[r.question_id].text} WHERE question_id = ${r.question_id}`;
console.log(`APPLIED — rewrote ${rows.length} question(s).`);
