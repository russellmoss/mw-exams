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
//   --repair             ONLY the broken rows: structurally broken (missing answer, NULL tail
//                        section, tool-call transcript) OR off the mark-proportional word budget,
//                        measured in code — see the selector below
//   --repair-structural  the structural half of --repair only; skips answers that are merely
//                        off-budget (use when you want the broken rows fixed without requeueing
//                        the ~185-row off-budget corpus)
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
const { buildModelAnswerPrompt, parseModelAnswerSections, modelAnswerMaxTokens, modelAnswerEffort } = await import("../src/lib/prompts/model-answer-prompt.ts");
const { buildTastingLexiconGuidance } = await import("../src/lib/prompts/tasting-lexicon.ts");
const { getTastingLexicon, saveGeneratedQuestion, applyAnswerLength } = await import("../src/lib/db.ts");
// Gated tier-1 production references — the same call both live model-answer paths make. Imported
// here for the reason stated at the top of this file: the offline path must not drift from
// production. Without it this script would quietly regenerate exemplars WITHOUT the references the
// live routes use, which is the exact drift the "ONE source of truth" note warns about.
// Needs VOYAGE_API_KEY; getKnowledgeContext fails soft to null if it is missing.
const { getKnowledgeContext, buildCitationBlock } = await import("../src/lib/knowledge/context.ts");
// Researched per-wine profiles, for the same no-drift reason as the KB block above.
const { loadStoredWineProfiles } = await import("../src/lib/wine-bank-lookup.ts");
// The SAME budget + measurement the generator gates on, so this script's selector and the live path
// can never disagree about whether an answer is on target. That is the whole reason answer-length.ts
// is dependency-free.
const { answerWordBudget, classifyAnswerLength, countAnswerBodyWords, marksForWineCount } =
  await import("../src/lib/answer-length.ts");
const { enforceAnswerLength } = await import("../src/lib/answer-length-gate.ts");

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
  repairStructural: has("--repair-structural"),
};
if (!opt.all && !opt.paper && !opt.questionId && !opt.repair && !opt.repairStructural) {
  console.error("Refusing to run without a selector. Pass one of: --question-id ID | --paper N | --all | --repair | --repair-structural\nUse --dry-run to preview. See header for all flags.");
  process.exit(1);
}
const limit = opt.questionIds.length
  ? opt.questionIds.length
  : (opt.all || opt.repair || opt.repairStructural) ? null : (opt.limit ?? 5);

// ---- select rows to regen ----
const sql = neon(process.env.DATABASE_URL);
let rows;
if (opt.repair || opt.repairStructural) {
  // REPAIR selector — the rows that are actually broken, rather than every row.
  //
  // Deliberately NOT `--all`: that selects `model_answer IS NOT NULL`, which skips the questions
  // whose answer is missing entirely — precisely the ones most in need of repair — while burning an
  // Opus call on healthy ones and replacing good answers with different ones.
  //
  // TWO HALVES, and they are selected differently on purpose.
  //
  // ── 1. STRUCTURALLY BROKEN (SQL, below) ────────────────────────────────────────────────────────
  // "Short" is < 2000 chars: a complete package runs ~2,900-3,300, and the truncated examples
  // measured 1,221 and 1,618. A NULL tail section is the other truncation signature.
  //
  // TOOL-CALL TRANSCRIPTS are the worst of the failures and look like a long answer. The model
  // narrates reading the repo — "I'll load the necessary files and wine research data before writing
  // the answer" — then emits fabricated <function_calls> blocks instead of an answer, running to
  // 29,000 characters.
  //
  // ── 2. OFF THE WORD BUDGET (measured in JS, below) ─────────────────────────────────────────────
  // This half used to key on `actual_word_count: TBD`, on the reasoning that a filled-in self-count
  // correlates with health (1 of 151 such answers exceeded 8000 chars, against 17 of 63 TBD ones).
  // The correlation was real but it conflated "not catastrophically bloated" with "on target", and
  // the number it trusted was fabricated: across 319 banked answers the reported values span 392-447
  // with a median of 424, while the measured median body is 458 — the model writes a number near the
  // target instead of counting, so a made-up `431` sailed through the gate. Gating on it made the
  // corpus look healthier than it was.
  //
  // So: measure. countAnswerBodyWords() is the SAME function the generator gates on, applied to the
  // stored answer — that is why it strips the appended citation block as well as the frontmatter and
  // headers, and why lib/answer-length.ts has no imports. The budget is mark-proportional (6.5
  // words/mark, band 4.5-8.5) because a flat ceiling cannot tell a padded two-wine question from a
  // starved six-wine one: measured against a flat 420 the corpus looked 75% "too long", but per mark
  // it is 95 of 125 fifty-mark answers OVER and 41 of 86 hundred-mark answers UNDER.
  //
  // The budget test has to run in JS (it needs countAnswerBodyWords, and reimplementing the strip
  // rules in SQL would be a second source of truth), so this reads every live row and filters here.
  // ~350 rows — a single cheap scan, and it lets --dry-run print exactly why each was picked.
  const candidates = await sql`
    SELECT question_id, paper, family, family_label, subcategory, question_text, wines, total_marks,
           model_answer, length(model_answer) AS old_len,
           (proposed_annotation IS NULL)  AS anno_null,
           (reasoning_trace IS NULL)      AS trace_null,
           (study_diagram_assist IS NULL) AS diagram_null
    FROM generated_questions
    WHERE (metadata->>'archived') IS DISTINCT FROM 'true'
    ORDER BY created_at DESC`;

  let structural = 0, offBudget = 0;
  rows = candidates.filter((r) => {
    if (
      !r.model_answer ||
      r.model_answer.length < 2000 ||
      /<function_calls>|<tool_call>|<invoke name=/.test(r.model_answer) ||
      r.anno_null || r.trace_null || r.diagram_null
    ) {
      structural++;
      r.repairReason = "structurally broken";
      return true;
    }
    if (opt.repairStructural) return false;

    const marks = r.total_marks > 0 ? r.total_marks : marksForWineCount((r.wines || []).length);
    const budget = answerWordBudget(marks);
    const words = countAnswerBodyWords(r.model_answer);
    const verdict = classifyAnswerLength(words, budget);
    if (verdict === "ok") return false;
    offBudget++;
    r.repairReason = `${verdict}: ${words}w vs ${budget.min}-${budget.max} for ${marks} marks`;
    return true;
  });
  // Never silently truncate coverage — say what was selected and why (and what was skipped).
  console.log(
    `Repair selector: ${structural} structurally broken, ` +
    `${opt.repairStructural ? `off-budget rows SKIPPED (--repair-structural)` : `${offBudget} off the word budget`}` +
    ` — of ${candidates.length} live rows.`
  );
} else if (opt.questionIds.length) {
  rows = await sql`SELECT question_id, paper, family, family_label, subcategory, question_text, wines, total_marks, model_answer, length(model_answer) AS old_len FROM generated_questions WHERE question_id = ANY(${opt.questionIds})`;
} else if (opt.paper && opt.family) {
  rows = await sql`SELECT question_id, paper, family, family_label, subcategory, question_text, wines, total_marks, model_answer, length(model_answer) AS old_len FROM generated_questions WHERE model_answer IS NOT NULL AND paper = ${opt.paper} AND family = ${opt.family} ORDER BY created_at DESC`;
} else if (opt.paper) {
  rows = await sql`SELECT question_id, paper, family, family_label, subcategory, question_text, wines, total_marks, model_answer, length(model_answer) AS old_len FROM generated_questions WHERE model_answer IS NOT NULL AND paper = ${opt.paper} ORDER BY created_at DESC`;
} else {
  rows = await sql`SELECT question_id, paper, family, family_label, subcategory, question_text, wines, total_marks, model_answer, length(model_answer) AS old_len FROM generated_questions WHERE model_answer IS NOT NULL ORDER BY created_at DESC`;
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

// Raw fetch, not the SDK — so none of the SDK's retry/timeout behaviour applies and it has to be
// supplied here. Without it a single dropped connection permanently skips that question: a 22-question
// batch lost 3 to "fetch failed" and then STALLED, because a hung request with no timeout holds its
// concurrency slot forever and the run never finishes.
//
// Retries on transport errors, timeouts, 429 and 5xx. NOT on 4xx (bad request, auth, model-not-found)
// — those are deterministic and retrying only burns tokens on the same failure.
const MAX_ATTEMPTS = 4;
const REQUEST_TIMEOUT_MS = 180_000; // an 8000-token Opus package takes ~40-90s; 3 min is a stall, not slowness

async function callClaude(system, user) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        // Sizing + effort come from the ONE shared helper (prompts/model-answer-prompt.ts), which
        // carries the evidence. This was hard-coded here at 8000 — the script's own history is why:
        // one call produces FOUR sections, and at 4000 the response was cut intermittently (same
        // input, three runs, 1,618 / 3,294 / 3,170 chars, the short one stopping mid-word at
        // "Wine 4 — Chardonnay; Côte de"). Truncation lands on the TAIL, which is why 17-21 of 104
        // banked questions had a NULL annotation / reasoning_trace / study_diagram_assist. 8000
        // reduced that but did not end it — measured, Opus still hit the cap on 30% of calls.
        body: JSON.stringify({
          model,
          max_tokens: modelAnswerMaxTokens(model),
          ...modelAnswerEffort(model),
          system,
          messages: [{ role: "user", content: user }],
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (r.status === 429 || r.status >= 500) {
        throw Object.assign(new Error(`HTTP ${r.status}`), { retryable: true });
      }
      const d = await r.json();
      // A 4xx surfaces here as d.error; treat it as terminal.
      if (d.error) throw new Error(JSON.stringify(d.error));
      if (d.stop_reason === "max_tokens") {
        console.warn(`  ⚠ hit max_tokens (${modelAnswerMaxTokens(model)}) on ${model} — tail sections may be missing`);
      }
      return d.content?.filter((b) => b.type === "text").map((b) => b.text).join("") ?? "";
    } catch (e) {
      // fetch() rejects with TypeError("fetch failed") on transport errors and TimeoutError on abort;
      // neither carries a status, so anything that is not an explicit API error is treated as transient.
      const terminal = e.message?.startsWith("{") && !e.retryable;
      if (terminal || attempt === MAX_ATTEMPTS) throw e;
      lastErr = e;
      const backoffMs = 2000 * 2 ** (attempt - 1); // 2s, 4s, 8s
      console.warn(`    retry ${attempt}/${MAX_ATTEMPTS - 1} after ${e.message} — waiting ${backoffMs / 1000}s`);
      await new Promise((res) => setTimeout(res, backoffMs));
    }
  }
  throw lastErr;
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
  const marks = row.total_marks > 0 ? row.total_marks : marksForWineCount(wines.length);
  const oldWords = countAnswerBodyWords(row.model_answer);
  const prompt = buildModelAnswerPrompt(row.question_text, wines, row.paper, lexiconGuidance, knowledgeBlock, wineProfiles, marks);
  const text = await callClaude(prompt.system, prompt.user);
  const s = parseModelAnswerSections(text);
  // Same mark-proportional gate the live paths run, before the citations go on. Without it this
  // script would be the one path that can write an off-budget exemplar — exactly the offline/production
  // drift the header of this file exists to prevent.
  const lengthOutcome = await enforceAnswerLength(s.modelAnswer, marks, API_KEY, {
    questionId: row.question_id,
    questionText: row.question_text,
  });
  // Append the source list exactly as the live routes do. Without this a bulk regeneration would
  // silently strip citations from every exemplar it touched — the same offline/production drift the
  // header of this file warns about, and the second time it has bitten in this feature.
  s.modelAnswer = lengthOutcome.modelAnswer + buildCitationBlock(passages);
  const newLen = s.modelAnswer.length;
  const budget = answerWordBudget(marks);
  const kb = `${passages.length} passage(s) [${reason}]`;
  const words = `${oldWords}→${lengthOutcome.wordCount}w (target ${budget.target}, band ${budget.min}-${budget.max}) ${lengthOutcome.status}`;
  if (opt.dryRun) {
    return { id: row.question_id, oldLen: row.old_len, newLen, kb, words, preview: s.modelAnswer.slice(0, 240).replace(/\s+/g, " ") };
  }
  await saveGeneratedQuestion({
    questionId: row.question_id, paper: row.paper, family: row.family || "F4",
    familyLabel: row.family_label || "", subcategory: row.subcategory || undefined,
    questionText: row.question_text, wines, totalMarks: marks,
    modelAnswer: s.modelAnswer, proposedAnnotation: s.proposedAnnotation || undefined,
    reasoningTrace: s.reasoningTrace || undefined, studyDiagramAssist: s.studyDiagramAssist || undefined,
  });
  await applyAnswerLength(row.question_id, {
    status: lengthOutcome.status,
    wordCount: lengthOutcome.wordCount,
    answerLength: lengthOutcome.answerLength,
  });
  return { id: row.question_id, oldLen: row.old_len, newLen, kb, words, wrote: true };
}

// ---- bounded-concurrency pool ----
let i = 0, ok = 0, fail = 0;
async function worker() {
  while (i < rows.length) {
    const row = rows[i++];
    try {
      const r = await regenOne(row);
      ok++;
      console.log(`  [${ok + fail}/${rows.length}] ${r.id}  p${row.paper}/${row.family}  ${r.words}  ${r.oldLen}→${r.newLen} chars  kb: ${r.kb}${r.wrote ? " (written)" : ""}${row.repairReason ? `  [picked: ${row.repairReason}]` : ""}`);
      if (opt.dryRun) console.log(`        preview: ${r.preview}…`);
    } catch (e) {
      fail++;
      console.error(`  [${ok + fail}/${rows.length}] ${row.question_id}  FAILED: ${e.message}`);
    }
  }
}
await Promise.all(Array.from({ length: Math.min(opt.concurrency, rows.length) }, worker));
console.log(`${"=".repeat(70)}\nDONE. ${ok} ok, ${fail} failed${opt.dryRun ? " (DRY RUN — nothing written)" : ""}.`);
