// regen-model-answers.mjs — offline BATCH regeneration of the DB-stored model answers.
//
// Refreshes generated_questions.{model_answer, proposed_annotation, reasoning_trace,
// study_diagram_assist} using the SAME live generator the API route uses
// (buildModelAnswerPrompt + parseModelAnswerSections + saveGeneratedQuestion via the ts-loader),
// so there is ONE source of truth and the offline path can never drift from production.
//
// Primary use: after a generator-prompt change (e.g. R4 AT-1/AT-2 differentiate+reconcile) the
// already-stored exemplars are stale; this re-runs them in bulk. Also the prerequisite for R6
// (the structural-scaffold grader clause) — regenerate before tightening so the app's own
// exemplars don't model the failure the grader penalises.
//
// NOTE: only touches the DB exemplars for *generated* questions (the TS generator). The 112
// historical outputs/mock_answers/*.md come from the separate Python pipeline
// (scripts/generate_mock_answers.py) and are NOT in scope here.
//
// Run FROM study-app/ (buildModelAnswerPrompt resolves public/data via process.cwd()):
//   node --import ./scripts/ts-loader.mjs scripts/regen-model-answers.mjs [flags]
// Flags:
//   --paper N            only paper N (1|2|3)
//   --family F4          only this family
//   --question-id ID     only this question id
//   --all                every question that already has a model_answer (overrides --limit)
//   --limit N            cap rows (default 5 unless --all/--question-id)
//   --concurrency N      parallel API calls (default 3)
//   --model opus|sonnet  generation tier (default opus — matches the route)
//   --repair             ONLY the broken rows: missing/short model answer, or a NULL
//                        annotation / reasoning trace / diagram assist
//   --dry-run            generate but DO NOT write; print a preview + size delta
// Requires DATABASE_URL + ANTHROPIC_API_KEY (env or study-app/.env.local).

import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

// ---- env (prefer process.env; fall back to study-app/.env.local) ----
function fromEnvLocal(key) {
  try {
    const m = readFileSync("./.env.local", "utf8").match(new RegExp(`^${key}\\s*=\\s*"?([^"\\n\\r]+)"?`, "m"));
    return m?.[1]?.trim();
  } catch { return undefined; }
}
process.env.DATABASE_URL ||= fromEnvLocal("DATABASE_URL");
process.env.ANTHROPIC_API_KEY ||= fromEnvLocal("ANTHROPIC_API_KEY");
// The KB retriever reads VOYAGE_API_KEY straight off process.env. It was never bootstrapped from
// .env.local, so every local run silently logged "knowledge retrieval is unavailable" and wrote
// answers grounded in 0 passages — the offline path drifting from production, which this script
// exists to prevent. TAVILY_API_KEY likewise, for the wine-enrichment path.
process.env.VOYAGE_API_KEY ||= fromEnvLocal("VOYAGE_API_KEY");
process.env.TAVILY_API_KEY ||= fromEnvLocal("TAVILY_API_KEY");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set");
const API_KEY = process.env.ANTHROPIC_API_KEY;

// ---- the LIVE generator + parser + writer (single source of truth; resolved by ts-loader) ----
const { buildModelAnswerPrompt, parseModelAnswerSections } = await import("../src/lib/prompts/model-answer-prompt.ts");
const { buildTastingLexiconGuidance } = await import("../src/lib/prompts/tasting-lexicon.ts");
const { getTastingLexicon, saveGeneratedQuestion } = await import("../src/lib/db.ts");
// Gated tier-1 production references — the same call both live model-answer paths make. Imported
// here for the reason stated at the top of this file: the offline path must not drift from
// production. Without it this script would quietly regenerate exemplars WITHOUT the references the
// live routes use, which is the exact drift the "ONE source of truth" note warns about.
// Needs VOYAGE_API_KEY; getKnowledgeContext fails soft to null if it is missing.
const { getKnowledgeContext, buildCitationBlock } = await import("../src/lib/knowledge/context.ts");
// Researched per-wine profiles, for the same no-drift reason as the KB block above.
const { loadStoredWineProfiles } = await import("../src/lib/wine-bank-lookup.ts");

// ---- args ----
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const has = (name) => args.includes(name);
const opt = {
  paper: flag("--paper") ? Number(flag("--paper")) : undefined,
  family: flag("--family"),
  // Comma-separated list accepted: repairing a batch (e.g. every question whose wine profiles were
  // just re-researched) otherwise means one node process and one model-resolution round trip per id.
  questionId: flag("--question-id"),
  questionIds: (flag("--question-id") || "").split(",").map((s) => s.trim()).filter(Boolean),
  all: has("--all"),
  limit: flag("--limit") ? Number(flag("--limit")) : undefined,
  concurrency: flag("--concurrency") ? Number(flag("--concurrency")) : 3,
  model: flag("--model") || "opus",
  dryRun: has("--dry-run"),
  repair: has("--repair"),
};
if (!opt.all && !opt.paper && !opt.questionId && !opt.repair) {
  console.error("Refusing to run without a selector. Pass one of: --question-id ID | --paper N | --all | --repair\nUse --dry-run to preview. See header for all flags.");
  process.exit(1);
}
const limit = opt.questionIds.length ? opt.questionIds.length : (opt.all || opt.repair) ? null : (opt.limit ?? 5);

// ---- select rows to regen ----
const sql = neon(process.env.DATABASE_URL);
let rows;
if (opt.repair) {
  // REPAIR selector — the rows that are actually broken, rather than every row.
  //
  // Deliberately NOT `--all`: that selects `model_answer IS NOT NULL`, which skips the 15 questions
  // whose answer is missing entirely — precisely the ones most in need of repair — while burning an
  // Opus call on ~85 healthy ones and replacing good answers with different ones.
  //
  // "Short" is < 2000 chars: a complete package runs ~2,900-3,300, and the truncated examples
  // measured 1,221 and 1,618. A NULL tail section is the other truncation signature.
  //
  // TOO LONG is a failure too, and the original selector missed it entirely. The answer targets ~430
  // words (the prompt sets target_word_count) because the exam allows ~8 minutes of writing; a
  // 15,000-character answer does not model the discipline the whole system teaches. 8000 chars is
  // roughly double a healthy package, so it flags bloat without catching a merely thorough answer.
  //
  // TOOL-CALL TRANSCRIPTS are the worst of the failures and look like a long answer, so they hid
  // behind the missing length check. The model narrates reading the repo — "I'll load the necessary
  // files and wine research data before writing the answer" — then emits fabricated <function_calls>
  // blocks instead of an answer. 15 of 62 pending questions and 3 already-approved ones are in this
  // state, running to 29,000 characters.
  // `actual_word_count: TBD` is the SHARPEST signal of the three length checks, because it catches
  // the CAUSE rather than a symptom. The answer frontmatter declares a target (~400-430 words) and
  // is supposed to report the actual count back. When the model fills that in, it lands on target:
  // 1 of 151 such answers exceeds 8000 chars. When it writes TBD and skips the self-check, 17 of 63
  // do, running as far as 14,593 chars — five times the stated target.
  //
  // Length alone therefore under-detects: 46 of those 63 sit UNDER 8000 and look healthy, while
  // having been produced by exactly the same unverified path. Length also over-detects, since a
  // genuinely thorough answer can be long. Trigger on the missing self-count itself.
  rows = await sql`
    SELECT question_id, paper, family, family_label, subcategory, question_text, wines, total_marks,
           length(model_answer) AS old_len
    FROM generated_questions
    WHERE (metadata->>'archived') IS DISTINCT FROM 'true'
      AND (model_answer IS NULL
        OR length(model_answer) < 2000
        OR length(model_answer) > 8000
        OR model_answer ~ 'actual_word_count:\s*TBD'
        OR model_answer ~ '<function_calls>|<tool_call>|<invoke name='
        OR proposed_annotation IS NULL
        OR reasoning_trace IS NULL
        OR study_diagram_assist IS NULL)
    ORDER BY created_at DESC`;
} else if (opt.questionIds.length) {
  rows = await sql`SELECT question_id, paper, family, family_label, subcategory, question_text, wines, total_marks, length(model_answer) AS old_len FROM generated_questions WHERE question_id = ANY(${opt.questionIds})`;
} else if (opt.paper && opt.family) {
  rows = await sql`SELECT question_id, paper, family, family_label, subcategory, question_text, wines, total_marks, length(model_answer) AS old_len FROM generated_questions WHERE model_answer IS NOT NULL AND paper = ${opt.paper} AND family = ${opt.family} ORDER BY created_at DESC`;
} else if (opt.paper) {
  rows = await sql`SELECT question_id, paper, family, family_label, subcategory, question_text, wines, total_marks, length(model_answer) AS old_len FROM generated_questions WHERE model_answer IS NOT NULL AND paper = ${opt.paper} ORDER BY created_at DESC`;
} else {
  rows = await sql`SELECT question_id, paper, family, family_label, subcategory, question_text, wines, total_marks, length(model_answer) AS old_len FROM generated_questions WHERE model_answer IS NOT NULL ORDER BY created_at DESC`;
}
if (limit) rows = rows.slice(0, limit);
console.log(`Selected ${rows.length} question(s) to regenerate${opt.dryRun ? " (DRY RUN — no writes)" : ""}.`);
if (!rows.length) { console.log("Nothing to do."); process.exit(0); }

// ---- model + lexicon ----
async function resolveModel() {
  if (opt.model === "sonnet") return "claude-sonnet-4-6";
  try {
    const r = await fetch("https://api.anthropic.com/v1/models?limit=100", { headers: { "x-api-key": API_KEY, "anthropic-version": "2023-06-01" } });
    const d = await r.json();
    return (d.data || []).filter((m) => m.id.includes("opus")).map((m) => m.id).sort().reverse()[0] || "claude-sonnet-4-6";
  } catch { return "claude-sonnet-4-6"; }
}
const model = await resolveModel();
const lexiconGuidance = buildTastingLexiconGuidance(await getTastingLexicon());
console.log(`Model: ${model} | concurrency: ${opt.concurrency}\n${"=".repeat(70)}`);

async function callClaude(system, user) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    // 8000, not 4000. One call produces FOUR sections (model answer ~420 words, proposed annotation,
    // reasoning trace, study-diagram walkthrough) and 4000 was marginal for that, so the response was
    // being cut intermittently — same input, three runs, 1,618 / 3,294 / 3,170 chars, the short one
    // stopping mid-word at "Wine 4 — Chardonnay; Côte de". Truncation lands on the TAIL sections, which
    // is why 17-21 of 104 banked questions have a NULL annotation / reasoning_trace /
    // study_diagram_assist. Matches the 8000 already used for the thinking-on path in question-engine.
    body: JSON.stringify({ model, max_tokens: 8000, system, messages: [{ role: "user", content: user }] }),
  });
  const d = await r.json();
  if (d.error) throw new Error(JSON.stringify(d.error));
  return d.content?.filter((b) => b.type === "text").map((b) => b.text).join("") ?? "";
}

async function regenOne(row) {
  const wines = row.wines; // JSONB → already parsed array of { slot, fullText, ... }
  const { block: knowledgeBlock, passages, reason } = await getKnowledgeContext({
    questionText: row.question_text,
    family: row.family,
  });
  // Same researched profiles the live routes now pass, fetched per row rather than added to the six
  // different SELECTs above. One extra read per question is nothing in an offline bulk pass, and it
  // keeps this script from being the one path that regenerates an exemplar off the wine's name alone.
  const wineProfiles = await loadStoredWineProfiles(row.question_id, wines);
  const prompt = buildModelAnswerPrompt(row.question_text, wines, row.paper, lexiconGuidance, knowledgeBlock, wineProfiles);
  const text = await callClaude(prompt.system, prompt.user);
  const s = parseModelAnswerSections(text);
  // Append the source list exactly as the live routes do. Without this a bulk regeneration would
  // silently strip citations from every exemplar it touched — the same offline/production drift the
  // header of this file warns about, and the second time it has bitten in this feature.
  s.modelAnswer = (s.modelAnswer || "") + buildCitationBlock(passages);
  const newLen = (s.modelAnswer || "").length;
  const kb = `${passages.length} passage(s) [${reason}]`;
  if (opt.dryRun) {
    return { id: row.question_id, oldLen: row.old_len, newLen, kb, preview: (s.modelAnswer || "").slice(0, 240).replace(/\s+/g, " ") };
  }
  await saveGeneratedQuestion({
    questionId: row.question_id, paper: row.paper, family: row.family || "F4",
    familyLabel: row.family_label || "", subcategory: row.subcategory || undefined,
    questionText: row.question_text, wines, totalMarks: row.total_marks || 100,
    modelAnswer: s.modelAnswer, proposedAnnotation: s.proposedAnnotation || undefined,
    reasoningTrace: s.reasoningTrace || undefined, studyDiagramAssist: s.studyDiagramAssist || undefined,
  });
  return { id: row.question_id, oldLen: row.old_len, newLen, kb, wrote: true };
}

// ---- bounded-concurrency pool ----
let i = 0, ok = 0, fail = 0;
async function worker() {
  while (i < rows.length) {
    const row = rows[i++];
    try {
      const r = await regenOne(row);
      ok++;
      console.log(`  [${ok + fail}/${rows.length}] ${r.id}  p${row.paper}/${row.family}  ${r.oldLen}→${r.newLen} chars  kb: ${r.kb}${r.wrote ? " (written)" : ""}`);
      if (opt.dryRun) console.log(`        preview: ${r.preview}…`);
    } catch (e) {
      fail++;
      console.error(`  [${ok + fail}/${rows.length}] ${row.question_id}  FAILED: ${e.message}`);
    }
  }
}
await Promise.all(Array.from({ length: Math.min(opt.concurrency, rows.length) }, worker));
console.log(`${"=".repeat(70)}\nDONE. ${ok} ok, ${fail} failed${opt.dryRun ? " (DRY RUN — nothing written)" : ""}.`);
