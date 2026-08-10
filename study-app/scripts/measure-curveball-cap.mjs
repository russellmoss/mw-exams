// measure-curveball-cap.mjs — blast radius for tightening the flight-composition curveball cap.
//
//   node --import ./scripts/ts-loader.mjs scripts/measure-curveball-cap.mjs
//
// The 2026-08 expert review (Mike Juergens, 488 reviews) rejected banker-minority flights 74 times —
// the single largest complaint class. This measures moving the per-flight curveball cap from the old
// max(2, ceil(n/2)) to max(1, floor(n/2)) ("bankers hold at least half the flight"):
//   • against the REAL corpus, where every additional hit is a false positive by construction, and
//   • against the live bank, counting NEWLY-failing questions (delta, not raw totals — see the
//     validator-blast-radius method note), cross-tabbed against the reviewer's up/down verdicts.

import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { selectImportableStems } from "@/lib/historical-stems";
import { isBanker } from "@/lib/question-validator";
import "@/lib/appellation-resolver";
import { winesFromText } from "@/lib/question-rules.mjs";

const root = new URL("../../data/", import.meta.url);
const corpus = JSON.parse(readFileSync(new URL("structured/corpus_questions.json", root), "utf8"));
const exams = JSON.parse(readFileSync(new URL("exams.json", root), "utf8"));

const wineAt = new Map();
for (const y of exams) {
  for (const p of y.papers || []) {
    for (const w of p.wines || []) wineAt.set(`${y.year}_${p.paper}_${w.slot}`, w.full_text);
  }
}

function parseOrigin(label) {
  const noAbv = (label || "").replace(/\([^)]*%\)\s*$/, "").trim();
  const segments = noAbv.split(/\.\s+/).map((s) => s.trim()).filter(Boolean);
  const origin = segments[segments.length - 1] || "";
  const parts = origin.split(",").map((s) => s.trim()).filter(Boolean);
  return { region: parts[0] || "", country: parts[parts.length - 1] || "" };
}

function toAuditWines(labels) {
  return winesFromText(labels.map((fullText, i) => ({ slot: i + 1, fullText }))).map((w) => {
    const { region, country } = parseOrigin(w.fullText);
    return { ...w, region, country: w.country || country.toLowerCase(), style: "" };
  });
}

const oldCap = (n) => Math.max(2, Math.ceil(n / 2));
const newCap = (n) => Math.max(1, Math.floor(n / 2));

// Verdict per question under a cap: null = passes, string = why it fails. Zero-banker is reported
// separately — it is unchanged by this edit and would otherwise inflate both columns identically.
function judge(wines, cap) {
  const n = wines.length;
  if (n < 2) return null;
  const cb = wines.filter((w) => !isBanker(w)).length;
  if (cb === n) return "zero-banker";
  return cb > cap(n) ? `over-cap (${cb}/${n})` : null;
}

function tally(rows, label) {
  const stats = { total: 0, zeroBanker: 0, oldFail: 0, newFail: 0, newlyFailing: [] };
  const bySize = new Map();
  for (const q of rows) {
    const n = q.wines.length;
    if (n < 2) continue;
    stats.total += 1;
    const o = judge(q.wines, oldCap);
    const nw = judge(q.wines, newCap);
    if (o === "zero-banker") {
      stats.zeroBanker += 1;
      continue; // unchanged by this edit either way
    }
    if (o) stats.oldFail += 1;
    if (nw) stats.newFail += 1;
    if (nw && !o) {
      stats.newlyFailing.push(q);
      bySize.set(n, (bySize.get(n) ?? 0) + 1);
    }
  }
  const pct = (a, b) => `${((a / Math.max(1, b)) * 100).toFixed(1)}%`;
  console.log(`\n== ${label} (n=${stats.total} multi-wine) ==`);
  console.log(`  zero-banker (unchanged by this edit): ${stats.zeroBanker} ${pct(stats.zeroBanker, stats.total)}`);
  console.log(`  over-cap, old max(2,ceil(n/2)):       ${stats.oldFail} ${pct(stats.oldFail, stats.total)}`);
  console.log(`  over-cap, new max(1,floor(n/2)):      ${stats.newFail} ${pct(stats.newFail, stats.total)}`);
  console.log(`  DELTA (newly failing questions):      ${stats.newlyFailing.length} ${pct(stats.newlyFailing.length, stats.total)}`);
  for (const [size, count] of [...bySize.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`    ${size}-wine flights: ${count}`);
  }
  return stats;
}

const { stems } = selectImportableStems(corpus);
const realRows = stems.map((s) => ({
  questionId: s.qid,
  wines: toAuditWines(s.originalSlots.map((slot) => wineAt.get(`${s.year}_${s.paper}_${slot}`) || "")),
}));
const real = tally(realRows, "REAL IMW corpus (every delta hit is a false positive)");
console.log(`  newly-rejected real questions: ${real.newlyFailing.map((q) => q.questionId).join(", ") || "none"}`);

const sql = neon(process.env.DATABASE_URL);
const banked = await sql`
  SELECT g.question_id, g.paper, g.wines, qr.verdict
  FROM generated_questions g
  LEFT JOIN question_reviews qr ON qr.question_id = g.question_id AND qr.reviewer_id = 1
  WHERE g.status = 'approved' AND g.is_retired = false
`;
const bankRows = banked.map((r) => {
  const w = typeof r.wines === "string" ? JSON.parse(r.wines) : r.wines;
  return {
    questionId: r.question_id,
    paper: r.paper,
    verdict: r.verdict ?? null,
    wines: toAuditWines((Array.isArray(w) ? w : []).map((x) => x.fullText || x.full_text || "")),
  };
});
const bank = tally(bankRows, "LIVE bank (servable)");

// Does the reviewer agree with the questions this would newly flag?
const reviewed = bank.newlyFailing.filter((q) => q.verdict);
const downs = reviewed.filter((q) => q.verdict === "down").length;
const allReviewed = bankRows.filter((q) => q.verdict);
const baseDown = allReviewed.filter((q) => q.verdict === "down").length;
console.log(`\n  reviewer cross-check on the newly-flagged: ${downs}/${reviewed.length} down-voted` +
  ` (${((downs / Math.max(1, reviewed.length)) * 100).toFixed(0)}%)` +
  ` vs ${baseDown}/${allReviewed.length} (${((baseDown / Math.max(1, allReviewed.length)) * 100).toFixed(0)}%) across all reviewed`);
console.log(`  newly-flagged bank questions: ${bank.newlyFailing.map((q) => `${q.questionId}${q.verdict ? ` [${q.verdict}]` : ""}`).join(", ") || "none"}`);
