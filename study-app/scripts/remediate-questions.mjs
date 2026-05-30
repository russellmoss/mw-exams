// remediate-questions.mjs — Phase D: replace quarantined questions with valid regenerations.
//
// For every quarantined question (stem_answer_keys.validated=false, not archived), regenerate a
// fresh question for the SAME paper×family through the hardened generation pipeline, gate it on the
// ACCURATE validator (question-validator.ts against the resolved answer key) AND the key builder's
// §2b validation, retry until valid, build its model answer, then archive the old row so it leaves
// the live pool. This fully closes CF-1: the 6 invalid questions are replaced by valid ones.
//
//   node scripts/remediate-questions.mjs            (dry run: regenerate + verify, do NOT commit)
//   node scripts/remediate-questions.mjs --apply     (commit: upsert keys, archive old rows)
//
// Run from study-app/.  Reads DATABASE_URL + ANTHROPIC_API_KEY from env or .env.local.

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { neon } from "@neondatabase/serverless";
import Anthropic from "@anthropic-ai/sdk";

// --- env bootstrap (imported libs read process.env.DATABASE_URL / ANTHROPIC_API_KEY) ---
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENV = (() => {
  try { return readFileSync(join(ROOT, ".env.local"), "utf8"); } catch { return ""; }
})();
const envVal = (k) =>
  process.env[k] || (ENV.match(new RegExp(k + '\\s*=\\s*"?([^"\\n\\r]+)"?'))?.[1]?.trim() ?? "");
process.env.DATABASE_URL = envVal("DATABASE_URL");
process.env.ANTHROPIC_API_KEY = envVal("ANTHROPIC_API_KEY");
process.env.TAVILY_API_KEY = process.env.TAVILY_API_KEY || envVal("TAVILY_API_KEY");
const APIKEY = process.env.ANTHROPIC_API_KEY;
if (!process.env.DATABASE_URL || !APIKEY) {
  console.error("Missing DATABASE_URL or ANTHROPIC_API_KEY (env or .env.local).");
  process.exit(1);
}

const { buildQuestionGenerationPrompt } = await import("../src/lib/prompts/question-generation-prompt.ts");
const { buildModelAnswerPrompt } = await import("../src/lib/prompts/model-answer-prompt.ts");
const { enrichWineProfiles } = await import("../src/lib/wine-enrichment.ts");
const { saveGeneratedQuestion, getQuestionsByFilter, getRecentGeneratedQuestions } = await import("../src/lib/db.ts");
const { validateQuestion } = await import("../src/lib/question-validator.ts");
const { getLatestOpus } = await import("../src/lib/model-resolver.ts");
const { buildKeyForRow, upsertKey } = await import("./build-stem-answer-keys.mjs");

const sql = neon(process.env.DATABASE_URL);
const APPLY = process.argv.includes("--apply");
const LIMIT = Number((process.argv.find((a) => a.startsWith("--limit=")) || "").split("=")[1]) || Infinity;
const MAX_ATTEMPTS = 6;

const FAMILY_LABELS = {
  F1: "Same Variety", F2: "Same Origin", F3: "Blend Logic", F4: "Mixed Breadth",
  F5: "Method / Production", F6: "Style Mechanism", F7: "Quality Hierarchy",
};

// --- parser (mirrors get-question/route.ts parseGeneratedQuestion) ---
function sanitizeSubcategory(value) {
  return value
    .replace(/^Subcategory:\s*/i, "")
    .replace(/\s*\((?:[^)]*(?:Italy|France|Spain|Portugal|Germany|Austria|Greece|Hungary|Australia|Argentina|Chile|Canada|California|United States|USA|South Africa|New Zealand)[^)]*)\)/gi, "")
    .replace(/\b(?:Italy|Italian|France|French|Spain|Spanish|Portugal|Portuguese|Germany|German|Austria|Austrian|Greece|Greek|Hungary|Hungarian|Australia|Australian|Argentina|Argentinian|Chile|Chilean|Canada|Canadian|California|Californian|United States|USA|South Africa|South African|New Zealand)\b/gi, "")
    .replace(/\s{2,}/g, " ").replace(/\s+([,;:])/g, "$1").replace(/[,\s]+$/g, "").trim();
}

function parseGenerated(text, paper, family) {
  try {
    const questionMatch = text.match(/## Question\s*\n([\s\S]*?)(?=\n## Wines|\n## Metadata)/i);
    const questionText = questionMatch ? questionMatch[1].trim() : "";
    const winesMatch = text.match(/## Wines\s*\n([\s\S]*?)(?=\n## Wine Appearance|\n## Metadata|\n## |$)/i);
    const wines = [];
    if (winesMatch) {
      for (const line of winesMatch[1].split("\n").filter((l) => /^\d+\./.test(l.trim()))) {
        const m = line.trim().match(/^(\d+)\.\s+(.*)/);
        if (m) wines.push({ slot: parseInt(m[1]), fullText: m[2].trim() });
      }
    }
    const appearanceMatch = text.match(/## Wine Appearance\s*\n([\s\S]*?)(?=\n## Metadata|\n## |$)/i);
    if (appearanceMatch) {
      for (const line of appearanceMatch[1].split("\n").filter((l) => /^\d+\./.test(l.trim()))) {
        const m = line.trim().match(/^(\d+)\.\s+(.*)/);
        if (m) { const w = wines.find((x) => x.slot === parseInt(m[1])); if (w) w.appearance = m[2].trim(); }
      }
    }
    const familyMatch = text.match(/Family:\s*(F\d)/i);
    const subcatMatch = text.match(/Subcategory:\s*(.*)/i);
    const parsedFamily = familyMatch ? familyMatch[1] : family;
    let totalMarks = 0;
    for (const m of questionText.matchAll(/\((\d+)\s*[x×]\s*(\d+)\s*marks?\)/gi)) totalMarks += parseInt(m[1]) * parseInt(m[2]);
    for (const m of questionText.matchAll(/\((\d+)\s*marks?\)/gi)) totalMarks += parseInt(m[1]);
    if (!totalMarks) totalMarks = wines.length * 25;
    if (!questionText || wines.length === 0) return null;
    const stemCountMatch = questionText.match(/wines\s+1\s+(?:to|–|-)\s+(\d+)/i);
    if (stemCountMatch && wines.length < parseInt(stemCountMatch[1])) return null;
    return {
      family: parsedFamily,
      familyLabel: FAMILY_LABELS[parsedFamily] || "Unknown",
      subcategory: sanitizeSubcategory(subcatMatch ? subcatMatch[1].trim() : ""),
      questionText, wines, totalMarks,
    };
  } catch { return null; }
}

function extractSection(text, startHeader, endHeader) {
  const startMatch = text.match(new RegExp(`#+\\s*\\d*\\.?\\s*${startHeader}[\\s\\S]*?\\n`, "i"));
  if (!startMatch) return null;
  const startIdx = text.indexOf(startMatch[0]) + startMatch[0].length;
  if (endHeader) {
    const remaining = text.slice(startIdx);
    const endMatch = remaining.match(new RegExp(`#+\\s*\\d*\\.?\\s*${endHeader}`, "i"));
    if (endMatch) return remaining.slice(0, remaining.indexOf(endMatch[0])).trim();
  }
  return text.slice(startIdx).trim();
}

const client = new Anthropic({ apiKey: APIKEY });
let OPUS = "claude-sonnet-4-6";
try { OPUS = await getLatestOpus(APIKEY); } catch { /* fall back to sonnet */ }

async function callModel(model, system, user) {
  const msg = await client.messages.create(
    { model, max_tokens: 2000, system, messages: [{ role: "user", content: user }] },
    { timeout: 90_000, maxRetries: 2 }
  );
  return msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
}

async function genModelAnswer(questionText, wines, paper) {
  try {
    const p = buildModelAnswerPrompt(questionText, wines, paper);
    const text = await callModel(OPUS, p.system, p.user);
    return extractSection(text, "Model Answer", "Proposed Annotation") || text;
  } catch (e) {
    console.warn("    model-answer generation failed:", e.message);
    return null;
  }
}

// Regenerate ONE valid replacement for a quarantined question. Returns {newId, key, audit} or null.
async function remediateOne(old, existingWines, latest) {
  const paper = old.paper, family = old.family;
  const prompt = await buildQuestionGenerationPrompt(paper, family, existingWines, latest);
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const model = attempt === 1 ? OPUS : "claude-sonnet-4-6";
    let text;
    try { text = await callModel(model, prompt.system, prompt.user); }
    catch (e) { console.warn(`    attempt ${attempt}: model error ${e.message}`); continue; }

    const cand = parseGenerated(text, paper, family);
    if (!cand) { console.warn(`    attempt ${attempt}: parse failed`); continue; }

    const newId = `gen_p${paper}_${family}_${Date.now()}`;
    await saveGeneratedQuestion({
      questionId: newId, paper, family: cand.family, familyLabel: cand.familyLabel,
      subcategory: cand.subcategory, questionText: cand.questionText, wines: cand.wines,
      totalMarks: cand.totalMarks,
      metadata: { generatedOnTheFly: true, remediation: true, replaces: old.question_id },
    });
    try { await enrichWineProfiles(newId, cand.wines, APIKEY); }
    catch (e) { console.warn(`    attempt ${attempt}: enrich error ${e.message}`); }

    const row = (await sql`
      SELECT question_id, paper, family, question_text, wines, wine_profiles
      FROM generated_questions WHERE question_id = ${newId}`)[0];
    if (!row || !row.wine_profiles) {
      console.warn(`    attempt ${attempt}: no wine_profiles after enrich — rejecting`);
      await rejectCandidate(newId, ["enrichment produced no profiles"]);
      continue;
    }
    const key = buildKeyForRow(row);
    const audit = validateQuestion({
      questionId: newId, paper, family: cand.family,
      questionText: cand.questionText, totalMarks: cand.totalMarks, wines: key.ground,
    });
    const hard = audit.violations.filter((v) => v.severity === "hard");

    if (audit.ok && key.ok) {
      console.log(`    attempt ${attempt}: ✓ VALID (${cand.wines.length} wines)`);
      return { newId, cand, key, audit };
    }
    console.warn(`    attempt ${attempt}: invalid — keyProblems=[${key.problems.join("; ")}] hard=[${hard.map((v) => v.rule).join(",")}]`);
    await rejectCandidate(newId, [...key.problems, ...hard.map((v) => `${v.rule}: ${v.detail}`)]);
  }
  return null;
}

// Mark a failed candidate row archived so it never enters the pool or the audit.
async function rejectCandidate(id, reasons) {
  await sql`
    UPDATE generated_questions
    SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"archived":true,"remediation_failed":true}'::jsonb,
        invalid_reasons = ${JSON.stringify(reasons.map((r) => ({ rule: "remediation-reject", severity: "hard", detail: r })))}::jsonb
    WHERE question_id = ${id}`;
}

async function main() {
  const bad = await sql`
    SELECT g.question_id, g.paper, g.family
    FROM generated_questions g JOIN stem_answer_keys k USING (question_id)
    WHERE k.validated = false AND (g.metadata->>'archived') IS DISTINCT FROM 'true'
    ORDER BY g.paper, g.family`;
  const targets = Number.isFinite(LIMIT) ? bad.slice(0, LIMIT) : bad;
  console.log(`Remediating ${targets.length}/${bad.length} quarantined question(s). apply=${APPLY}\n`);

  const recent = await getRecentGeneratedQuestions(5);
  const latest = recent[0]
    ? { questionText: recent[0].question_text,
        wines: typeof recent[0].wines === "string" ? JSON.parse(recent[0].wines) : recent[0].wines,
        paper: recent[0].paper, family: recent[0].family }
    : null;

  const results = [];
  for (const old of targets) {
    console.log(`▶ ${old.question_id} (P${old.paper} ${old.family})`);
    // Dedup against existing wines for this paper so the replacement is novel.
    const existing = [];
    for (const q of await getQuestionsByFilter(old.paper)) {
      const ws = typeof q.wines === "string" ? JSON.parse(q.wines) : q.wines;
      for (const w of ws) existing.push(w.fullText);
    }
    const res = await remediateOne(old, existing, latest);
    if (!res) { console.log(`  ✗ FAILED to regenerate a valid replacement\n`); results.push({ old: old.question_id, ok: false }); continue; }

    if (APPLY) {
      await upsertKey(res.newId, res.key); // validated=true
      const ma = await genModelAnswer(res.cand.questionText, res.cand.wines, old.paper);
      if (ma) await saveGeneratedQuestion({
        questionId: res.newId, paper: old.paper, family: res.cand.family, familyLabel: res.cand.familyLabel,
        subcategory: res.cand.subcategory, questionText: res.cand.questionText, wines: res.cand.wines,
        totalMarks: res.cand.totalMarks, modelAnswer: ma,
      });
      // Archive the old row (keeps history; leaves the live pool + audit/build scope).
      await sql`
        UPDATE generated_questions
        SET metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ archived: true, replaced_by: res.newId })}::jsonb
        WHERE question_id = ${old.question_id}`;
      console.log(`  ✓ ${old.question_id} → ${res.newId} (key validated, model_answer=${ma ? "yes" : "no"}, old archived)\n`);
    } else {
      // Dry run: leave the candidate row archived so it doesn't pollute the pool.
      await rejectCandidate(res.newId, ["dry-run candidate (not committed)"]);
      console.log(`  ✓ would replace ${old.question_id} → ${res.newId} (dry run; candidate archived)\n`);
    }
    results.push({ old: old.question_id, new: res.newId, ok: true });
  }

  console.log("──────── REMEDIATION SUMMARY ────────");
  for (const r of results) console.log(`  ${r.ok ? "✓" : "✗"} ${r.old}${r.new ? " → " + r.new : ""}`);
  const okCount = results.filter((r) => r.ok).length;
  console.log(`\n${okCount}/${results.length} regenerated valid.${APPLY ? " Committed + old rows archived." : " (dry run — pass --apply to commit)"}`);
}

await main();
console.log("done.");
