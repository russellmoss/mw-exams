// mark-allocation-distribution.mjs — the evidence behind id-mark-allocation's and
// flight-composition's thresholds. Re-run this before changing either of them.
//
//   node --import ./scripts/ts-loader.mjs scripts/mark-allocation-distribution.mjs
//
// It puts the real IMW papers and our generated bank side by side on the two axes those rules police,
// then sweeps candidate thresholds and prints what share of EACH population they would reject.
//
// The question it answers is not "is this threshold strict?" but "does the generated distribution
// differ from the real one at all?". Measured on 2026-08-08 it did not, for identification marks: the
// bank was TAMER than the real exam at every percentile (median ID share 32% vs 40%, p90 52% vs 60%),
// while the rule was rejecting 63% of real past papers and 305 banked questions. A rule can only earn
// a hard verdict where the two populations actually diverge — which flight-composition does (18% of
// generated flights over the curveball ceiling against 11% of real ones) and the mark caps did not.
//
// Needs DATABASE_URL (read-only) for the generated half; the real half is read off disk.
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { selectImportableStems } from "@/lib/historical-stems";
import { isBanker } from "@/lib/question-validator";
import "@/lib/appellation-resolver";
import { winesFromText, expandMarkTokens } from "@/lib/question-rules.mjs";

const DB = process.env.DATABASE_URL || readFileSync(".env.local", "utf8").match(/DATABASE_URL\s*=\s*"?([^"\n\r]+)"?/)[1].trim();
const sql = neon(DB);
const root = new URL("../../../data/", import.meta.url);
const corpus = JSON.parse(readFileSync(new URL("structured/corpus_questions.json", root), "utf8"));
const exams = JSON.parse(readFileSync(new URL("exams.json", root), "utf8"));
const wineAt = new Map();
for (const y of exams) for (const p of y.papers || []) for (const w of p.wines || [])
  wineAt.set(`${y.year}_${p.paper}_${w.slot}`, w.full_text);

const ID_PART_RE = /identify the (grape variety|region|country|origin)/i;
const parseOrigin = (label) => {
  const noAbv = (label || "").replace(/\([^)]*%\)\s*$/, "").trim();
  const segs = noAbv.split(/\.\s+/).map((s) => s.trim()).filter(Boolean);
  const parts = (segs[segs.length - 1] || "").split(",").map((s) => s.trim()).filter(Boolean);
  return { region: parts[0] || "", country: parts[parts.length - 1] || "" };
};
function marked(text, wineCount) {
  const { tokens } = expandMarkTokens(text || "", wineCount);
  const out = []; let last = 0;
  for (const t of tokens) { out.push({ text: (text || "").slice(last, t.start), marks: t.marks, perUnit: t.perUnit }); last = t.end; }
  return out;
}
function measure(questionText, totalMarks, wines) {
  const ps = marked(questionText, wines.length);
  if (!ps.length) return null;
  const idParts = ps.filter((p) => ID_PART_RE.test(p.text));
  const total = totalMarks > 0 ? totalMarks : ps.reduce((s, p) => s + p.marks, 0);
  if (total <= 0) return null;
  return {
    share: idParts.length ? idParts.reduce((s, p) => s + p.marks, 0) / total : null,
    maxSingle: idParts.length ? Math.max(...idParts.map((p) => p.perUnit)) : null,
    n: wines.length,
    curveballs: wines.filter((w) => !isBanker(w)).length,
  };
}
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
function report(label, rows) {
  const shares = rows.map((r) => r.share).filter((x) => x != null);
  const singles = rows.map((r) => r.maxSingle).filter((x) => x != null);
  console.log(`\n── ${label} (${rows.length} questions, ${shares.length} with an ID part)`);
  console.log(`   ID share      median ${(pct(shares, 0.5) * 100).toFixed(0)}%  p75 ${(pct(shares, 0.75) * 100).toFixed(0)}%  p90 ${(pct(shares, 0.9) * 100).toFixed(0)}%  p99 ${(pct(shares, 0.99) * 100).toFixed(0)}%  max ${(Math.max(...shares) * 100).toFixed(0)}%`);
  console.log(`   max single ID  median ${pct(singles, 0.5)}  p75 ${pct(singles, 0.75)}  p90 ${pct(singles, 0.9)}  p99 ${pct(singles, 0.99)}  max ${Math.max(...singles)}`);
  const multi = rows.filter((r) => r.n >= 2);
  const cbShare = multi.reduce((s, r) => s + r.curveballs, 0) / multi.reduce((s, r) => s + r.n, 0);
  console.log(`   curveball share of wines ${(cbShare * 100).toFixed(0)}%   flights with no banker ${multi.filter((r) => r.curveballs === r.n).length}/${multi.length} (${(multi.filter((r) => r.curveballs === r.n).length / multi.length * 100).toFixed(0)}%)`);
  return { shares, singles, multi };
}

// ── real ──
const { stems } = selectImportableStems(corpus);
const realRows = [];
for (const stem of stems) {
  const wines = winesFromText(stem.originalSlots.map((slot, i) => ({ slot: i + 1, fullText: wineAt.get(`${stem.year}_${stem.paper}_${slot}`) || "" })))
    .map((w) => { const o = parseOrigin(w.fullText); return { ...w, region: o.region, country: w.country || o.country.toLowerCase() }; });
  const m = measure(stem.stemText, stem.totalMarks, wines);
  if (m) realRows.push(m);
}
const real = report("REAL IMW (2011-2026)", realRows);

// ── generated ──
const rows = await sql`
  SELECT g.question_id, g.question_text, g.total_marks, g.wines, k.ground_truth
  FROM generated_questions g LEFT JOIN stem_answer_keys k ON k.question_id = g.question_id
  WHERE (g.metadata->>'archived') IS DISTINCT FROM 'true' AND (g.metadata->>'source') IS DISTINCT FROM 'historical_stem'`;
const parse = (v) => (typeof v === "string" ? JSON.parse(v) : v);
const genRows = [];
for (const r of rows) {
  const gt = parse(r.ground_truth) || [];
  const raw = parse(r.wines) || [];
  const bySlot = new Map((Array.isArray(raw) ? raw : []).map((w) => [w.slot, w.fullText]));
  const wines = (Array.isArray(gt) && gt.length ? gt : raw).map((w) => ({ ...w, fullText: bySlot.get(w.slot) ?? w.fullText, varieties: w.varieties || [], region: w.region || "" }));
  const m = measure(r.question_text, r.total_marks, wines);
  if (m) genRows.push(m);
}
const gen = report("GENERATED BANK", genRows);

// ── where would each candidate threshold bite? ──
console.log(`\n── threshold sweep: %% of each population REJECTED`);
console.log(`   share cap    real    generated`);
for (const cap of [0.35, 0.5, 0.6, 0.7, 0.8]) {
  const r = real.shares.filter((s) => s > cap).length / real.shares.length;
  const g = gen.shares.filter((s) => s > cap).length / gen.shares.length;
  console.log(`   >${(cap * 100).toFixed(0).padStart(3)}%      ${(r * 100).toFixed(0).padStart(4)}%    ${(g * 100).toFixed(0).padStart(4)}%`);
}
console.log(`   single cap   real    generated`);
for (const cap of [10, 15, 20, 25, 30]) {
  const r = real.singles.filter((s) => s > cap).length / real.singles.length;
  const g = gen.singles.filter((s) => s > cap).length / gen.singles.length;
  console.log(`   >${String(cap).padStart(3)}       ${(r * 100).toFixed(0).padStart(4)}%    ${(g * 100).toFixed(0).padStart(4)}%`);
}
console.log(`   curveball ceiling            real    generated`);
for (const [name, fn] of [["min(2,ceil(n/2)) [current]", (n) => Math.min(2, Math.ceil(n / 2))], ["max(2,ceil(n/2))", (n) => Math.max(2, Math.ceil(n / 2))], ["ceil(n/2)+1", (n) => Math.ceil(n / 2) + 1]]) {
  const r = real.multi.filter((x) => x.curveballs > fn(x.n)).length / real.multi.length;
  const g = gen.multi.filter((x) => x.curveballs > fn(x.n)).length / gen.multi.length;
  console.log(`   ${name.padEnd(28)} ${(r * 100).toFixed(0).padStart(4)}%    ${(g * 100).toFixed(0).padStart(4)}%`);
}
