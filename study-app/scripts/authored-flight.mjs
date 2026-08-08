// authored-flight.mjs — import a historical stem with a HAND-AUTHORED flight and model answer.
//
//   node --import ./scripts/ts-loader.mjs scripts/authored-flight.mjs brief  2018_p1_q1 2018_p1_q2
//   node --import ./scripts/ts-loader.mjs scripts/authored-flight.mjs check  flights.json
//   node --import ./scripts/ts-loader.mjs scripts/authored-flight.mjs commit flights.json
//
// WHY THIS EXISTS. import-historical-stems.mjs drives the full engine, which spends an Opus/Sonnet
// call per redraft on choosing the flight and another on the model answer. Measured over the first
// tranche that came to ~$2.70 per BANKED question, because a failed attempt still bills — 45% of
// attempts failed, mostly on flight-composition, and the model was guessing blind against thresholds
// it could not see.
//
// The two expensive stages are the two a human (or an agent with the rules in front of it) can do
// directly. Everything downstream is cheap or free:
//
//     flight choice     Opus/Sonnet, ~$2.70/question   ->  authored here
//     model answer      Opus                           ->  authored here
//     wine enrichment   Haiku, ~$0.02/question         ->  still runs (it feeds the answer key)
//     answer key        deterministic resolver, free   ->  still runs
//     validators/audit  deterministic, free            ->  still runs
//
// `check` runs the real validators with NO database writes and NO model calls, so a flight can be
// iterated until it passes before anything is spent or persisted. That is the whole point: the
// engine had to guess and pay for its mistakes; this loop gets told exactly what is wrong, for free.
//
// INPUT FORMAT (flights.json) — an array of:
//   {
//     "qid": "2018_p1_q1",
//     "wines": ["Producer, Cuvee, Vintage. Region, Country. (ABV%)", ...],
//     "modelAnswer": "…markdown…",
//     "reasoning": "why these wines satisfy the stem"
//   }
// Wines are given in slot order; the stem is taken from the corpus and never from this file.

import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import "@/lib/appellation-resolver";
import {
  selectImportableStems,
  historicalQuestionId,
  historicalMetadata,
} from "@/lib/historical-stems";
import {
  validatePaperScope,
  validateVarietyConsistency,
  validateWineReferenceShape,
  validateProducerExclusion,
  buildGenerationProducerExclusion,
  PRODUCER_RECENT_WINDOW,
} from "@/lib/question-engine";
import { validateQuestion } from "@/lib/question-validator";
import { winesFromText, expandMarkTokens } from "@/lib/question-rules.mjs";
import {
  saveGeneratedQuestion,
  getProducerTally,
  getRecentProducerKeys,
  getQuestionsByFilter,
} from "@/lib/db";
import { enrichWineProfiles } from "@/lib/wine-enrichment";
import { buildStemKeyForQuestion } from "@/lib/stem-answer-key";
import { auditAndQuarantineQuestion } from "@/lib/question-audit";

const [, , CMD, ...rest] = process.argv;
if (!["brief", "check", "commit"].includes(CMD || "")) {
  console.error("usage: authored-flight.mjs brief <qid…> | check <file.json> | commit <file.json>");
  process.exit(2);
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
const sql = neon(process.env.DATABASE_URL);

const corpus = JSON.parse(readFileSync(new URL("../../data/structured/corpus_questions.json", import.meta.url), "utf8"));
const stems = new Map(selectImportableStems(corpus).stems.map((s) => [s.qid, s]));

// ── brief: everything needed to author a flight well, printed for one or more questions ──────────
if (CMD === "brief") {
  for (const qid of rest) {
    const stem = stems.get(qid.replace(/^hist_/, ""));
    if (!stem) { console.error(`!! ${qid} is not an importable stem`); continue; }

    const [tally, recent, banked] = await Promise.all([
      getProducerTally(stem.paper, { includeRetiredEvidence: true }),
      getRecentProducerKeys(stem.paper, PRODUCER_RECENT_WINDOW),
      getQuestionsByFilter(stem.paper),
    ]);
    const banned = buildGenerationProducerExclusion(tally.rows, recent);
    const used = new Set();
    for (const q of banked) {
      const ws = typeof q.wines === "string" ? JSON.parse(q.wines) : q.wines;
      for (const w of ws || []) used.add(w.fullText);
    }

    console.log(`\n${"=".repeat(78)}`);
    console.log(`${historicalQuestionId(stem)}   Paper ${stem.paper}   ${stem.family}/${stem.subcategory}   ${stem.flightSize} wines   ${stem.totalMarks} marks`);
    console.log(`${"=".repeat(78)}`);
    console.log(`\nSTEM (verbatim — do not alter):\n${stem.stemText}`);
    console.log(`\nPAPER SCOPE: ${
      stem.paper === 1 ? "STILL WHITE only" : stem.paper === 2 ? "STILL RED only" : "sparkling / fortified / sweet / rose / oxidative"
    }`);
    console.log(`\nBANNED PRODUCERS (${banned.length}) — a wine naming any of these is rejected outright:`);
    console.log(`   ${banned.map((b) => `${b.display} [${b.reasons.join("/")}]`).join("; ") || "(none)"}`);
    console.log(`\nCOMPOSITION TARGET: at least one banker; the corpus median for a ${stem.flightSize}-wine flight is`);
    console.log(`   ${stem.flightSize <= 2 ? "1" : stem.flightSize >= 6 ? "3" : "2"} curveball(s).`);
    console.log(`\nALREADY IN THE BANK for Paper ${stem.paper} (${used.size} wines) — avoid repeating a producer+cuvee.`);
  }
  process.exit(0);
}

// ── check / commit ───────────────────────────────────────────────────────────────────────────────
const file = rest[0];
if (!file) throw new Error("give a flights.json path");
const authored = JSON.parse(readFileSync(file, "utf8"));
if (!Array.isArray(authored)) throw new Error("flights.json must be an array");

let bad = 0;
const ready = [];

for (const item of authored) {
  const stem = stems.get(String(item.qid || "").replace(/^hist_/, ""));
  const id = stem ? historicalQuestionId(stem) : `?${item.qid}`;
  const problems = [];
  if (!stem) { console.error(`\n${id}: not an importable stem`); bad++; continue; }

  const wines = (item.wines || []).map((fullText, i) => ({ slot: i + 1, fullText: String(fullText) }));
  if (wines.length !== stem.flightSize) {
    problems.push(`flight holds ${wines.length} wines; this stem was set on exactly ${stem.flightSize}`);
  }
  if (!item.modelAnswer || String(item.modelAnswer).trim().length < 200) {
    problems.push("modelAnswer is missing or implausibly short");
  }

  // Text-stage checks — the same functions the engine runs inside its redraft loop.
  for (const [label, res] of [
    ["wine-shape", validateWineReferenceShape(wines)],
    ["paper-scope", validatePaperScope(stem.paper, wines)],
    ["variety-consistency", validateVarietyConsistency(stem.stemText, wines)],
  ]) {
    for (const v of res.violations) problems.push(`${label}: ${v}`);
  }

  // Producer bans are computed from the live bank, so they need the DB but no model.
  const [tally, recent] = await Promise.all([
    getProducerTally(stem.paper, { includeRetiredEvidence: true }),
    getRecentProducerKeys(stem.paper, PRODUCER_RECENT_WINDOW),
  ]);
  const banned = buildGenerationProducerExclusion(tally.rows, recent);
  for (const v of validateProducerExclusion(new Set(banned.map((b) => b.key)), wines).violations) {
    problems.push(`producer-exclusion: ${v}`);
  }

  // Marks must still balance — the stem is real, so this can only fail if the corpus row is wrong.
  const marks = expandMarkTokens(stem.stemText, wines.length).total;
  if (marks !== stem.flightSize * 25) problems.push(`marks total ${marks}, expected ${stem.flightSize * 25}`);

  // Key-stage gate, on text-derived wines. stemIsAuthoritative because the stem is a real past paper.
  const auditWines = winesFromText(wines).map((w) => {
    const noAbv = w.fullText.replace(/\([^)]*%\)\s*$/, "").trim();
    const segs = noAbv.split(/\.\s+/).map((s) => s.trim()).filter(Boolean);
    const parts = (segs[segs.length - 1] || "").split(",").map((s) => s.trim()).filter(Boolean);
    return { ...w, region: parts[0] || "", country: w.country || (parts[parts.length - 1] || "").toLowerCase(), style: "" };
  });
  const verdict = validateQuestion({
    questionId: id,
    paper: stem.paper,
    family: stem.family,
    questionText: stem.stemText,
    totalMarks: stem.totalMarks,
    wines: auditWines,
    modelAnswer: item.modelAnswer ?? null,
    stemIsAuthoritative: true,
  });
  for (const v of verdict.violations.filter((x) => x.severity === "hard")) {
    problems.push(`${v.rule}: ${v.detail}`);
  }

  if (problems.length) {
    bad++;
    console.log(`\n${id}  ✗ ${problems.length} problem(s)`);
    for (const p of problems) console.log(`     - ${p}`);
  } else {
    console.log(`\n${id}  ✓ passes every check`);
    ready.push({ stem, wines, item });
  }
}

console.log(`\n${"-".repeat(60)}\n${ready.length} ready, ${bad} with problems`);
if (CMD === "check") {
  console.log("(check mode — nothing written, nothing spent)");
  process.exit(bad ? 1 : 0);
}

// ── commit ───────────────────────────────────────────────────────────────────────────────────────
if (!ready.length) { console.error("nothing to commit"); process.exit(1); }
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set (wine enrichment runs on Haiku)");

for (const { stem, wines, item } of ready) {
  const questionId = historicalQuestionId(stem);
  // A row with a user attempt is never overwritten — see import-historical-stems.mjs for why.
  const attempted = await sql`
    /* theory-mode-guard: all-modes -- an attempt in ANY mode means a candidate answered this
       question; this check exists to REFUSE the overwrite, so narrowing by mode could only let a
       real attempt slip through. */
    SELECT 1 FROM user_attempts WHERE question_id = ${questionId} LIMIT 1`;
  if (attempted.length) {
    console.error(`::warning::${questionId} has a user attempt — refusing to overwrite it`);
    continue;
  }
  await sql`DELETE FROM stem_answer_keys WHERE question_id = ${questionId}`;
  await sql`DELETE FROM question_views    WHERE question_id = ${questionId}`;
  await sql`DELETE FROM generated_questions WHERE question_id = ${questionId}`;

  await saveGeneratedQuestion({
    questionId,
    paper: stem.paper,
    family: stem.family,
    familyLabel: stem.family,
    subcategory: stem.subcategory,
    questionText: stem.stemText,
    wines,
    totalMarks: stem.totalMarks,
    modelAnswer: item.modelAnswer,
    status: "pending",
    metadata: {
      generatedOnTheFly: false,
      generationReasoning: item.reasoning ?? null,
      // Distinguishes an authored flight from an engine-generated one inside the historical import,
      // so the two can be compared later on bin rate and candidate feedback.
      authoredFlight: true,
      ...historicalMetadata(stem),
    },
  });

  // Haiku. Ordering is load-bearing: buildStemKeyForQuestion reads back the wine_profiles this writes.
  await enrichWineProfiles(questionId, wines, apiKey, { source: "server", userId: null }).catch((err) => {
    console.error(`[enrich] ${questionId}:`, err?.message || err);
    return {};
  });
  const key = await buildStemKeyForQuestion(questionId);
  if ("error" in key) console.error(`[key] ${questionId}: ${key.error}`);
  else if (!key.ok) console.warn(`[key] ${questionId} validated=false: ${key.problems.join("; ")}`);

  const audit = await auditAndQuarantineQuestion(questionId);
  const verdict = audit.audited && audit.hard.length ? `QUARANTINED: ${audit.hard.map((v) => v.rule).join(", ")}` : "clean";
  console.log(`   ${questionId}  saved · ${verdict}`);
}
console.log(`\ncommitted ${ready.length}`);
