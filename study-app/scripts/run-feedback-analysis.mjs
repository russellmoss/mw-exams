#!/usr/bin/env node
/**
 * One-off / recovery runner for server-side feedback analysis. Analyzes a specific
 * attempt's feedback using the SAME shared library the app uses (src/lib/feedback-analysis),
 * so it exercises the real path end-to-end. Use it to recover feedback that was stranded
 * before the durable server-side trigger existed.
 *
 * Run from the study-app dir so process.cwd() is the app root (the ts-loader maps "@/" -> src/):
 *   node --import ./scripts/ts-loader.mjs scripts/run-feedback-analysis.mjs --attempt=130
 *
 * Env is read from study-app/.env.local (+ repo-root .env for TAVILY_API_KEY). GITHUB_TOKEN
 * is optional: without it, an "accept" verdict that needs a GitHub dispatch will not ship
 * (the analysis still completes); reject / partial / question-quarantine verdicts resolve fully.
 */
import { readFileSync, existsSync } from "node:fs";

function loadEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim().replace(/^["']|["']$/g, "");
    if (val && process.env[key] === undefined) process.env[key] = val;
  }
}
loadEnv("./.env.local"); // study-app/.env.local (ANTHROPIC_API_KEY, DATABASE_URL)
loadEnv("../.env"); // repo root .env (TAVILY_API_KEY)

const attemptArg = process.argv.find((a) => a.startsWith("--attempt="));
const attemptId = attemptArg ? parseInt(attemptArg.split("=")[1], 10) : NaN;
if (!attemptId || Number.isNaN(attemptId)) {
  console.error("Usage: node --import ./scripts/ts-loader.mjs scripts/run-feedback-analysis.mjs --attempt=<id>");
  process.exit(1);
}
if (!process.env.DATABASE_URL || !process.env.ANTHROPIC_API_KEY) {
  console.error("Missing DATABASE_URL or ANTHROPIC_API_KEY (looked in ./.env.local).");
  process.exit(1);
}

const { runFeedbackAnalysis } = await import("../src/lib/feedback-analysis");

console.log(`\nAnalyzing feedback for attempt ${attemptId} …`);
console.log(`  GITHUB_TOKEN present: ${process.env.GITHUB_TOKEN ? "yes" : "no (accept→dispatch verdicts won't ship)"}\n`);

const result = await runFeedbackAnalysis({ attemptId, source: "server" });
console.log("Result:", JSON.stringify(result, null, 2));

if (result.status === "complete") {
  if (result.autoApplied) console.log("\n→ Accepted & dispatched (or quarantined). Item left the open queue.");
  else if (result.autoRejected) console.log("\n→ Auto-rejected. Item resolved.");
  else if (result.autoPartial) console.log("\n→ Auto-marked partial. Item resolved (no code shipped).");
  else if (result.recommendation === "accept")
    console.log("\n→ Verdict was ACCEPT but auto-apply did not complete (likely a dispatch needing GITHUB_TOKEN). Analysis is saved; finish via the deployed 'Apply & ship' button or re-run with a token.");
  else console.log(`\n→ Verdict: ${result.recommendation}. Auto-apply may be off.`);
}
process.exit(result.status === "complete" ? 0 : 1);
