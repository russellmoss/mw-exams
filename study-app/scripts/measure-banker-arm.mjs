// measure-banker-arm.mjs — blast radius for the flight-anchor rules the 2026-08-09 review binned on.
//
//   node --import ./scripts/ts-loader.mjs scripts/measure-banker-arm.mjs
//
// Four reviewer down-votes proposed variations on "this flight has no wine the candidate can reach".
// Three of them reduce to promoting the EXISTING flight-composition rule from soft to hard; the fourth
// is a genuinely uncovered shape (a same-variety flight spanning countries with no Old World wine in
// it). This measures each candidate separately against the real corpus — where every hit is a false
// positive by construction, the input being a genuine past paper — and against the live bank, where
// every hit is a question that would stop being servable.

import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { selectImportableStems } from "@/lib/historical-stems";
import { flightCompositionViolations, validateOldWorldAnchor, flightAnchorPairingViolations } from "@/lib/question-validator";
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

const CANDIDATES = [
  ["flight-composition:zero-banker", (q) => flightCompositionViolations(q.wines).filter((v) => /has no banker/.test(v.detail))],
  ["flight-composition:over-curveball", (q) => flightCompositionViolations(q.wines).filter((v) => !/has no banker/.test(v.detail))],
  ["old-world-anchor (R-OW-ANCHOR)", (q) => validateOldWorldAnchor(q)],
  ["flight-anchor-pairing", (q) => flightAnchorPairingViolations(q.wines)],
];

function tally(rows) {
  const out = new Map(CANDIDATES.map(([name]) => [name, new Set()]));
  for (const q of rows) {
    for (const [name, fn] of CANDIDATES) {
      let hits = [];
      try {
        hits = fn(q) || [];
      } catch (err) {
        console.error(`${name} threw on ${q.questionId}: ${err?.message || err}`);
      }
      if (hits.length) out.get(name).add(q.questionId);
    }
  }
  return out;
}

const { stems } = selectImportableStems(corpus);
const realRows = stems.map((s) => ({
  questionId: s.qid,
  paper: s.paper,
  family: s.family,
  questionText: s.stemText,
  totalMarks: s.totalMarks,
  wines: toAuditWines(s.originalSlots.map((slot) => wineAt.get(`${s.year}_${s.paper}_${slot}`) || "")),
}));
const real = tally(realRows);

const sql = neon(process.env.DATABASE_URL);
const banked = await sql`
  SELECT question_id, paper, family, question_text, wines FROM generated_questions
  WHERE status = 'approved' AND (invalid_reasons IS NULL OR jsonb_array_length(invalid_reasons) = 0)
`;
const bankRows = banked.map((r) => {
  const w = typeof r.wines === "string" ? JSON.parse(r.wines) : r.wines;
  return {
    questionId: r.question_id,
    paper: r.paper,
    family: r.family,
    questionText: r.question_text,
    wines: toAuditWines((Array.isArray(w) ? w : []).map((x) => x.fullText || x.full_text || "")),
  };
});
const bank = tally(bankRows);

const pct = (a, b) => `${((a / b) * 100).toFixed(1)}%`;
console.log(`\n${"candidate rule".padEnd(36)} real IMW (n=${realRows.length})     live bank (n=${bankRows.length})`);
console.log("-".repeat(78));
for (const [name] of CANDIDATES) {
  const r = real.get(name).size;
  const b = bank.get(name).size;
  console.log(`${name.padEnd(36)} ${String(r).padStart(4)} ${pct(r, realRows.length).padStart(7)} (false +)  ${String(b).padStart(4)} ${pct(b, bankRows.length).padStart(7)}`);
}

for (const [name] of CANDIDATES) {
  console.log(`\n${name} — real-exam questions it would reject:\n  ${[...real.get(name)].join(", ") || "none"}`);
}
console.log("\nthe four reviewer-binned questions:");
for (const qid of ["gen_p1_F1_1786073867995", "gen_p1_F1_1786070772599", "gen_p1_F2_1786074235214", "gen_p1_F2_1786073972529"]) {
  const caught = CANDIDATES.map(([name]) => (bank.get(name).has(qid) ? name : null)).filter(Boolean);
  console.log(`  ${qid}: ${caught.join(" + ") || "NOT CAUGHT"}`);
}
