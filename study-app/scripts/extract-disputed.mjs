#!/usr/bin/env node
// extract-disputed.mjs — turn a calibration report's disputed claims into an adjudication worksheet.
//
//   node scripts/extract-disputed.mjs [report.json] [--out evals/adjudications/<name>.md]
//
// A "disputed" claim is one the HUMAN kept and the JUDGE binned while scoring factual_accuracy <= 2.
// Those are the rows where the eval has found something neither the validators nor the reviewer
// caught — and the only ones that need a person. This script pulls them out with the wine list
// attached, so adjudicating is "read the claim, check the wine, write a verdict" rather than
// "go dig the question out of a 2.7MB jsonl first".
//
// Defaults to the newest gemini report if no path is given, because the cross-family judge is the
// one whose disagreements are worth a human's time.

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const OUT = outIdx >= 0 ? args[outIdx + 1] : null;
const explicit = args.find((a) => a.endsWith(".json"));

function newestReport() {
  const dir = join(root, "evals", "reports");
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .filter((f) => f.startsWith("judge-calibration-gemini") && f.endsWith(".json"))
    .sort();
  return files.length ? join(dir, files[files.length - 1]) : null;
}

const reportPath = explicit ? join(root, explicit) : newestReport();
if (!reportPath || !existsSync(reportPath)) {
  console.error("No calibration report found. Run: npm run eval:judge");
  process.exit(1);
}

const report = JSON.parse(readFileSync(reportPath, "utf-8"));
const disputed = report.disputed ?? [];

// The report stores only ids + rationales; join back to the golden set for the wines and stem.
const golden = new Map();
for (const line of readFileSync(join(root, "evals", "golden", "questions.jsonl"), "utf-8").split("\n")) {
  if (!line.trim()) continue;
  const item = JSON.parse(line);
  golden.set(item.questionId, item);
}

const scoresById = new Map((report.verdicts ?? []).map((v) => [v.questionId, v.scores]));

const L = [];
L.push(`# Adjudication worksheet — ${report.split} run`);
L.push("");
L.push(`**Judge:** ${report.model} (${report.provider}${report.crossFamily ? ", cross-family" : ", SAME FAMILY — weak evidence"})`);
L.push(`**Report:** \`${basename(reportPath)}\` · **golden hash:** \`${report.goldenHash}\``);
L.push(`**Scored:** ${report.scored}${report.unparsed ? ` (${report.unparsed} unparsed)` : ""}`);
L.push("");
L.push(
  "A *disputed* claim is one the **human kept** and the **judge binned** while scoring " +
    "`factual_accuracy ≤ 2`. These are not judge errors until a person rules on them — counting " +
    "them as errors would disqualify a judge for out-performing its own reference."
);
L.push("");
L.push(`**${disputed.length} to adjudicate.** For each: check the claim against an independent`);
L.push("source (producer sheet, importer, appellation body — never a model's recall), then write");
L.push("**JUDGE RIGHT**, **JUDGE WRONG**, or **UNRESOLVED**. Do not guess; UNRESOLVED is a real answer.");
L.push("");
L.push("---");
L.push("");

disputed.forEach((d, i) => {
  const item = golden.get(d.questionId);
  const scores = scoresById.get(d.questionId);
  L.push(`## ${i + 1}. \`${d.questionId}\` — **VERDICT: ???**`);
  L.push("");
  L.push(`**Judge:** ${d.rationale}`);
  L.push("");
  if (item) {
    L.push(`**Paper ${item.paper}${item.family ? ` · ${item.family}` : ""}** · human verdict: \`${item.verdict}\``);
    L.push("");
    L.push("**Wines:**");
    for (const w of item.wines) L.push(`- ${w.fullText}`);
    L.push("");
    L.push("<details><summary>Stem</summary>");
    L.push("");
    L.push("```");
    L.push(item.questionText.trim());
    L.push("```");
    L.push("</details>");
    L.push("");
  } else {
    L.push("_(question not found in the golden set — the set may have been rebuilt since this run)_");
    L.push("");
  }
  if (scores) {
    L.push(
      `**Scores:** ` +
        Object.entries(scores)
          .map(([k, v]) => `${k} ${v}`)
          .join(" · ")
    );
    L.push("");
  }
  L.push("**Sources checked:**");
  L.push("");
  L.push("**Verdict:**");
  L.push("");
  L.push("---");
  L.push("");
});

L.push("## Tally");
L.push("");
L.push("| | count |");
L.push("|---|---|");
L.push(`| Disputed | ${disputed.length} |`);
L.push("| Judge right | |");
L.push("| Judge wrong | |");
L.push("| Unresolved | |");
L.push("");

const outPath = OUT
  ? join(root, OUT)
  : join(root, "evals", "adjudications", `worksheet-${report.split}-${basename(reportPath, ".json")}.md`);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, L.join("\n") + "\n");

console.log(`${disputed.length} disputed claim(s) from ${basename(reportPath)}`);
console.log(`Wrote ${outPath.replace(root, ".")}`);
if (disputed.length === 0) {
  console.log(
    "\nNo disputed claims. Either the judge found no factual faults in kept questions, or it is\n" +
      "not scoring factual_accuracy low enough to register — check the score distribution before\n" +
      "concluding the bank is clean."
  );
}
