#!/usr/bin/env node
// Run one candidate essay through the frozen legacy prompt and the current two-clock prompt.
// This is operator tooling, not a learner surface. It deliberately prints the evidence and every
// temporal decision next to both verdicts so a changed grade is inspectable.
//
//   npm run theory:diff -- --id th_2016_p5_q5 --essay ../path/to/essay.md
//
// If --essay is omitted, the question's model answer is used as a stable candidate fixture. It is
// never supplied to either grader as a reference answer; it is merely the submitted essay text.

import Anthropic from "@anthropic-ai/sdk";
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildLegacyTheoryEvaluationSystemPrompt,
  buildTheoryEvaluationSystemPrompt,
} from "../src/lib/prompts/theory-evaluation-prompt.ts";
import { countTheoryWords, getTheoryRubric } from "../src/lib/theory/rubric.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(HERE, "..");
const REPO_ROOT = resolve(APP_ROOT, "..");

function opt(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function loadEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)\s*=\s*"?([^"\r\n]+)"?$/.exec(line.trim());
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim();
  }
}

function loadFixture(id) {
  const index = JSON.parse(
    readFileSync(join(REPO_ROOT, "data", "theory", "theory_answers_index.json"), "utf8")
  );
  const row = index.find((item) => item.id === id);
  if (!row) throw new Error(`No answer fixture for ${id}; pass --essay PATH instead.`);
  return readFileSync(join(REPO_ROOT, row.path), "utf8")
    .replace(/^---[\s\S]*?---\s*/, "")
    .trim();
}

function responseText(message) {
  return message.content.map((block) => (block.type === "text" ? block.text : "")).join("");
}

function verdict(text) {
  return /\b(PASS|BORDERLINE|FAIL)\b/i.exec(text)?.[1]?.toUpperCase() || "UNKNOWN";
}

if (process.argv.includes("--help")) {
  console.log("npm run theory:diff -- --id th_YYYY_pN_qN [--essay PATH] [--retrieval PATH] [--model MODEL]");
  process.exit(0);
}

loadEnv(join(APP_ROOT, ".env.local"));
const id = opt("id", "th_2016_p5_q5");
const rubric = getTheoryRubric(id);
if (!rubric) throw new Error(`No examiner-derived rubric for ${id}.`);

const temporalLedger = JSON.parse(
  readFileSync(join(REPO_ROOT, "data", "theory", "rubric_temporal.json"), "utf8")
);
const temporal = temporalLedger.questions.find((question) => question.id === id);
if (!temporal) throw new Error(`No temporal classification for ${id}.`);

const essayPath = opt("essay");
const essay = essayPath
  ? readFileSync(isAbsolute(essayPath) ? essayPath : resolve(process.cwd(), essayPath), "utf8")
  : loadFixture(id);
const retrievalPath = opt("retrieval");
const verification = retrievalPath
  ? JSON.parse(
      readFileSync(isAbsolute(retrievalPath) ? retrievalPath : resolve(process.cwd(), retrievalPath), "utf8")
    )
  : {
      status: "unavailable",
      notice: "No retrieval snapshot supplied to the diff run; factual checking must abstain.",
      passages: [],
    };

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error("ANTHROPIC_API_KEY is required (environment or study-app/.env.local).");
}
const model = opt("model", process.env.THEORY_EVAL_MODEL || "claude-sonnet-4-6");
const words = countTheoryWords(essay);
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const user = `## Question\n${rubric.questionText}\n\n## Candidate answer (${words} words)\n${essay}\n\nMark it against the rubric above.`;

const legacyPrompt = buildLegacyTheoryEvaluationSystemPrompt(rubric, { wordCount: words });
const currentPrompt = buildTheoryEvaluationSystemPrompt(rubric, {
  wordCount: words,
  temporal,
  verification,
  currentDate: new Date().toISOString().slice(0, 10),
});

const request = (system) =>
  client.messages.create({
    model,
    max_tokens: 4000,
    temperature: 0,
    system,
    messages: [{ role: "user", content: user }],
  });

const [legacyMessage, currentMessage] = await Promise.all([
  request(legacyPrompt),
  request(currentPrompt),
]);
const legacy = responseText(legacyMessage);
const current = responseText(currentMessage);

console.log(`\nTHEORY GRADE DIFF — ${id} — ${model} — ${words} words`);
console.log(`Question: ${rubric.questionText}`);
console.log(`Temporal as of: ${temporalLedger.as_of}; ex_ante=${temporal.ex_ante}`);
console.log("\nRUBRIC REQUIREMENTS / TEMPORAL CLASS");
for (const requirement of temporal.requirements) {
  const source = requirement.source?.url ? ` — ${requirement.source.url}` : "";
  console.log(
    `  ${requirement.index + 1}. [${requirement.weight}] ${requirement.temporal_class}: ${requirement.element}${source}`
  );
}
console.log("\nRETRIEVED SOURCES");
console.log(`  status=${verification.status}; ${verification.notice || ""}`);
for (const passage of verification.passages || []) {
  console.log(`  - ${passage.title || passage.publisher || "source"}: ${passage.url || passage.canonicalUrl || "(no URL)"}`);
}
console.log(`\nLEGACY VERDICT: ${verdict(legacy)}\n${legacy}`);
console.log(`\nCURRENT VERDICT: ${verdict(current)}\n${current}`);
