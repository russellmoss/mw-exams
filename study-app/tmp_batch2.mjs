// Broader measurement: family=any across papers. Real engine (generateFreshQuestion). Measures the true
// fresh-generation success rate AND categorizes the per-attempt GENERATION failures (not the banked-
// fallback filter). Run from study-app/: node --import ./scripts/ts-loader.mjs tmp_batch2.mjs
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
const envl = readFileSync("./.env.local","utf8");
process.env.DATABASE_URL ||= envl.match(/DATABASE_URL\s*=\s*"?([^"\n\r]+)/)[1].trim();
process.env.ANTHROPIC_API_KEY ||= (envl.match(/ANTHROPIC_API_KEY\s*=\s*"?([^"\n\r]+)/)||[])[1]?.trim();
const API_KEY = process.env.ANTHROPIC_API_KEY;
const { generateFreshQuestion } = await import("./src/lib/question-engine.ts");
const sql = neon(process.env.DATABASE_URL);

const jobs = [["1","any"],["1","any"],["1","any"],["2","any"],["2","any"],["2","any"],["3","any"],["3","any"],["3","any"]];
const startIso = new Date(Date.now() - 5000).toISOString();

// Capture BOTH console streams per job.
const realErr = console.error, realLog = console.log;
let buf = [];
const cap = (...a) => buf.push(a.map(x => typeof x === "string" ? x : JSON.stringify(x)).join(" "));

// Categorize a generation-attempt failure's violation text.
function categorize(s) {
  const cats = [];
  if (/paper scope|still wine|sparkling|fortified|rosé|oxidativ/i.test(s)) cats.push("paper-scope");
  if (/variety/i.test(s)) cats.push("variety");
  if (/"rule":\s*"marks"|total marks|!= \d+x25|25 ?[x×]/i.test(s)) cats.push("marks");
  if (/country|origin|diversity/i.test(s)) cats.push("origin/country");
  if (/banker|benchmark/i.test(s)) cats.push("banker");
  if (/novel|duplicate|template|same.*structure/i.test(s)) cats.push("novelty");
  if (/flight size/i.test(s)) cats.push("flight-size");
  if (/parse error/i.test(s)) cats.push("parse");
  if (/model error/i.test(s)) cats.push("model-error");
  return cats.length ? cats : ["other"];
}

const results = [];
const catTotals = {};
for (const [paper, family] of jobs) {
  buf = [];
  console.error = cap; console.log = cap;
  let res;
  try { res = await generateFreshQuestion(Number(paper), family, API_KEY); }
  catch (e) { res = { error: e.message }; }
  console.error = realErr; console.log = realLog;

  const logs = buf.join("\n");
  // GENERATION attempt failures only (exclude "Bank filter:" lines, which are fallback filtering).
  const failLines = logs.split("\n").filter(l => /Generation attempt \d+\/\d+ (failed|model error)/i.test(l));
  const timedOut = /budget \d+ms exhausted/i.test(logs);
  const fellBack = res?.source === "pre-populated" || /falling back to a banked/i.test(logs);
  const cats = new Set();
  for (const l of failLines) for (const c of categorize(l)) cats.add(c);
  for (const c of cats) catTotals[c] = (catTotals[c]||0) + 1;
  results.push({ paper, family, source: res?.source || `ERR`, qid: res?.question?.question_id, failedAttempts: failLines.length, timedOut, fellBack, cats: [...cats] });
}

console.log(`\n${"=".repeat(80)}\nBROADER BATCH — family=any × ${jobs.length} (3 per paper), real engine\n${"=".repeat(80)}`);
let fresh = 0, fall = 0;
for (const r of results) {
  if (r.source === "generated") fresh++; if (r.fellBack) fall++;
  console.log(`P${r.paper}/any: source=${r.source}  failed-attempts=${r.failedAttempts}  timedOut=${r.timedOut}  failTypes=[${r.cats.join(", ")}]${r.qid?`  ${r.qid}`:""}`);
}
console.log(`\nFresh generated (served live): ${fresh}/${jobs.length}   |   Fell back to banked: ${fall}/${jobs.length}`);
console.log(`Generation-attempt failure types (jobs in which each gate fired):`);
for (const [c,n] of Object.entries(catTotals).sort((a,b)=>b[1]-a[1])) console.log(`   ${c}: ${n}/${jobs.length}`);

const saved = await sql`SELECT question_id, paper, question_text, wines FROM generated_questions WHERE created_at > ${startIso} ORDER BY created_at`;
const sumMarks=(t)=>{let s=0;for(const m of (t||"").matchAll(/\((\d+)\s*[x×]\s*(\d+)\s*marks?\)|\((\d+)\s*marks?\)/gi)) s+= m[1]!==undefined? +m[1]*+m[2] : +m[3]; return s;};
console.log(`\nFreshly-saved this run: ${saved.length}`);
for (const q of saved) { const n=(q.wines||[]).length,t=sumMarks(q.question_text); console.log(`   ${q.question_id}: wines=${n} marks=${t} (expect ${n*25}) ${t===n*25?"✅":"❌"}`); }
console.log(`${"=".repeat(80)}`);
