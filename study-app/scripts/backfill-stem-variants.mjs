// One-off / repeatable backfill of the two Stem Detail variants for banked questions.
//
// Why this exists: variants used to be derived on the /api/get-question critical path, which added a
// model call to every serve and contributed to "Question generation timed out". Derivation now
// happens out of band, and this script warms the existing bank so the runtime backfill endpoint is a
// no-op for questions users are already being served.
//
// Mirrors lib/stem-detail.ts exactly: one call derives both levels, each level is accepted only
// if it preserves the sub-question labels + mark tokens + mark total, and a level that fails is left
// NULL for a later pass (never overwritten with a placeholder).
//
// Usage (from study-app/):
//   node scripts/backfill-stem-variants.mjs            # backfill every incomplete question
//   node scripts/backfill-stem-variants.mjs --limit 5  # do a few first
//   node scripts/backfill-stem-variants.mjs --dry-run  # derive + validate, write nothing

import { existsSync, readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import Anthropic from "@anthropic-ai/sdk";

// ── env ───────────────────────────────────────────────────────────────────────────────────────
// .env.local is gitignored, so it exists in the primary checkout but not in a git worktree. Fall
// back through the likely locations, and accept vars that are already exported.
// scripts/ -> study-app -> <worktree> -> worktrees -> .claude -> <primary checkout>
const ENV_CANDIDATES = [
  new URL("../.env.local", import.meta.url),
  new URL("../../../../../study-app/.env.local", import.meta.url),
];
for (const url of ENV_CANDIDATES) {
  if (!existsSync(url)) continue;
  for (const line of readFileSync(url, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  break;
}
for (const required of ["DATABASE_URL", "ANTHROPIC_API_KEY"]) {
  if (!process.env[required]) {
    console.error(`Missing ${required} (set it in study-app/.env.local or the environment).`);
    process.exit(1);
  }
}

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const LIMIT = args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) : Infinity;
const MODEL = "claude-sonnet-4-6";

const sql = neon(process.env.DATABASE_URL);
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── validation (must stay in lockstep with lib/prompts/stemDetail.ts) ──────────────────────────
const MARK_TOKEN_RE = /\(\s*(?:(\d+)\s*[x×]\s*)?(\d+)\s*marks?\s*\)/gi;
const SUBQ_LABEL_RE = /(?:^|\n|\s)\(?([a-h]|i{1,3}|iv|v|vi{0,3})\)\s/gi;

function extractStemSignature(text) {
  const clean = (text || "").replace(/\*\*/g, "").replace(/&nbsp;/g, " ");
  const subLabels = [...clean.matchAll(SUBQ_LABEL_RE)].map((m) => m[1].toLowerCase());
  const markTokens = [];
  let markTotal = 0;
  for (const m of clean.matchAll(MARK_TOKEN_RE)) {
    const mult = m[1] ? parseInt(m[1], 10) : 1;
    const per = parseInt(m[2], 10);
    markTokens.push(m[1] ? `${mult}x${per}` : `${per}`);
    markTotal += mult * per;
  }
  return { subLabels, markTokens, markTotal };
}

function variantPreservesStructure(canonical, variant) {
  const a = extractStemSignature(canonical);
  const b = extractStemSignature(variant);
  if (a.markTotal !== b.markTotal) return false;
  if (a.subLabels.length !== b.subLabels.length) return false;
  if (a.markTokens.length !== b.markTokens.length) return false;
  return (
    a.subLabels.every((v, i) => v === b.subLabels[i]) &&
    a.markTokens.every((v, i) => v === b.markTokens[i])
  );
}

// ── prompt (mirrors buildStemVariantsPrompt) ──────────────────────────────────────────────────
const SYSTEM = `You rewrite the FRAMING PROSE of a Master of Wine practical tasting question stem at two levels of "stem detail". The two levels serve the SAME wines, the SAME sub-questions, the SAME marks and are graded identically — ONLY the amount of organising information in the preamble changes.

ABSOLUTE RULES (apply to every level):
- NEVER alter the sub-question wording. Reproduce each lettered sub-question and its instruction verbatim.
- NEVER alter, add, remove or renumber marks. Every mark token — e.g. "(4 x 3 marks)", "(10 marks)", "Total: 100 marks" — and the running total MUST be identical to the source, character-for-character.
- NEVER change the number of wines or the wine numbering.
- Output candidate-facing exam prose only. Do NOT mention these instructions, "levels", "variants", or any meta commentary.

THE TWO LEVELS:

EXAM-REAL — reduce the preamble to ONLY what the IMW would actually print on the paper: the wine numbers, the sub-questions, the mark allocation, and any constraint the real exam genuinely states (e.g. "Wines 1–6 are from two countries"). STRIP any sentence that names the organising principle, the hierarchy, the mechanism, or that otherwise coaches the candidate on how to think. Keep genuine printed constraints; remove teaching.

GUIDED — the richer, organising-principle-explicit version. It MAY state the flight's organising logic in plain terms (e.g. "these form a quality hierarchy ascending from regional through village to top cru"). If the source stem is already lean, ADD exactly ONE clarifying sentence naming the flight's organising logic. Guided explains the STRUCTURE, never the answers: do NOT reveal specific grape varieties, the country of any individual wine, producers or vintages that the exam-real level withholds.

Output STRICT JSON, no markdown fence, exactly:
{"exam_real": "<full stem text>", "guided": "<full stem text>"}
Each value is the COMPLETE stem (preamble + every sub-question with its marks + the Total line), ready to print.`;

async function deriveOnce(canonical) {
  const message = await client.messages.create(
    {
      model: MODEL,
      max_tokens: 2500,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `CANONICAL STEM (source of truth for sub-questions and marks — reproduce these verbatim in every level):\n\n${canonical}\n\nReturn the JSON with the two rewritten stems.`,
        },
      ],
    },
    { timeout: 30_000, maxRetries: 1 }
  );
  const text = message.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

const pick = (raw, level, canonical) => {
  const v = raw?.[level];
  if (typeof v !== "string" || !v.trim()) return null;
  return variantPreservesStructure(canonical, v) ? v.trim() : null;
};

// ── run ───────────────────────────────────────────────────────────────────────────────────────
const rows = await sql`
  SELECT question_id, paper, question_text, stem_guided, stem_exam_real
  FROM generated_questions
  WHERE stem_guided IS NULL OR stem_exam_real IS NULL
  ORDER BY paper, question_id
`;

const todo = rows.slice(0, LIMIT);
console.log(`${rows.length} question(s) incomplete; processing ${todo.length}${DRY_RUN ? " (DRY RUN)" : ""}\n`);

const stats = { done: 0, complete: 0, partial: 0, failed: 0, eqCanonical: 0 };

for (const [i, q] of todo.entries()) {
  const canonical = q.question_text;
  let raw = null;
  try {
    raw = await deriveOnce(canonical);
  } catch (err) {
    console.log(`  ${q.question_id}  ERROR ${err.message}`);
    stats.failed++;
    continue;
  }

  let guided = pick(raw, "guided", canonical);
  let exam_real = pick(raw, "exam_real", canonical);

  if (!guided || !exam_real) {
    try {
      const retry = await deriveOnce(canonical);
      guided ??= pick(retry, "guided", canonical);
      exam_real ??= pick(retry, "exam_real", canonical);
    } catch { /* keep whatever we have */ }
  }

  // The bug this backfill also verifies: a level identical to the canonical stem is a VALID result
  // (the canonical stem is already exam-real prose) and must be persisted, not discarded.
  const identical = [guided, exam_real].filter((v) => v && v === canonical).length;
  stats.eqCanonical += identical;

  if (!DRY_RUN) {
    await sql`
      UPDATE generated_questions SET
        stem_guided    = COALESCE(stem_guided,    ${q.stem_guided ? null : guided}),
        stem_exam_real = COALESCE(stem_exam_real, ${q.stem_exam_real ? null : exam_real})
      WHERE question_id = ${q.question_id}
    `;
  }

  const got = [guided && "G", exam_real && "E"].filter(Boolean).join("");
  if (got.length === 2) stats.complete++;
  else if (got.length > 0) stats.partial++;
  else stats.failed++;
  stats.done++;
  console.log(`  [${i + 1}/${todo.length}] p${q.paper} ${q.question_id}  ${got || "none"}${identical ? `  (${identical} == canonical)` : ""}`);
}

console.log(`\nprocessed=${stats.done} allBoth=${stats.complete} partial=${stats.partial} failed=${stats.failed}`);
console.log(`levels identical to canonical (previously DISCARDED, now stored): ${stats.eqCanonical}`);

const [after] = await sql`
  SELECT count(*)::int AS total,
         count(*) FILTER (WHERE stem_guided IS NOT NULL AND stem_exam_real IS NOT NULL)::int AS complete
  FROM generated_questions
`;
console.log(`bank now: ${after.complete}/${after.total} fully backfilled`);
