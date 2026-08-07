#!/usr/bin/env node
// calibrate-judge.mjs — score a golden split with the judge and report whether it may gate.
//
//   node scripts/calibrate-judge.mjs [--split calibration] [--limit 60] [--concurrency 6]
//
// Always includes the synthetic floor, whatever --split says: the floor is the only objective bar,
// and a calibration run that skipped it could "qualify" a judge that cannot spot a red wine in
// Paper 1. Writes evals/reports/judge-calibration-<split>-<hash>.json.
//
// Cost note: the rubric is cached (cache_control on the system block), so the marginal cost is
// roughly the per-question tokens only — ~$0.01–0.02 per item on Sonnet.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const args = process.argv.slice(2);
const opt = (flag, dflt) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : dflt;
};
const SPLIT = opt("--split", "calibration");
const LIMIT = Number(opt("--limit", "0"));
const CONCURRENCY = Number(opt("--concurrency", "6"));
const MODEL = opt("--model", "claude-sonnet-4-6");

const DIMENSIONS = [
  "exam_realism",
  "wine_plausibility",
  "obscurity_calibration",
  "stem_quality",
  "factual_accuracy",
  "answer_fidelity",
];

const RUBRIC = `You are an examiner for the Institute of Masters of Wine practical (blind tasting) exam.
You are reviewing a GENERATED practice question to decide whether it is fit to put in front of a
candidate preparing for the real exam.

Score each dimension 1-5 (5 = indistinguishable from a real IMW question, 1 = unusable):

- exam_realism: does the stem read like a real IMW paper - terse, premise-then-asks, no coaching?
- wine_plausibility: could an IMW panel realistically source and pour these wines together?
- obscurity_calibration: is the difficulty right? Score LOW both for wines no candidate could
  reasonably place (too obscure) AND for wines that give themselves away (too easy).
- stem_quality: does the stem carry real information that narrows the field, as real stems do?
- factual_accuracy: are the appellations, varieties, ABVs and production claims correct and mutually
  consistent? A wine that cannot exist as described scores 1.
- answer_fidelity: does the model answer address every sub-part, in order, at the right mark weight?

Then give an overall verdict: "keep" or "bin".

Bin it if a careful MW examiner would refuse to use it. The most common real reasons for binning,
in observed order of frequency: the wines are too obscure; a wine is duplicated or near-duplicated;
it is too easy; the flight is not realistic; the stem is weak and carries no information; something
stated is factually wrong.

Be decisive. Roughly a third of generated questions are genuinely not fit for use - a judge that
keeps almost everything is useless. But do not bin a sound question for being merely unexciting.

Respond with ONLY a JSON object:
{"scores":{"exam_realism":N,"wine_plausibility":N,"obscurity_calibration":N,"stem_quality":N,
"factual_accuracy":N,"answer_fidelity":N},"verdict":"keep"|"bin","rationale":"one sentence"}`;

function cohensKappa(a, b) {
  const n = a.length;
  if (n === 0 || a.length !== b.length) return 0;
  let agree = 0, aT = 0, bT = 0;
  for (let i = 0; i < n; i++) {
    if (a[i] === b[i]) agree++;
    if (a[i]) aT++;
    if (b[i]) bT++;
  }
  const po = agree / n;
  const pe = (aT / n) * (bT / n) + (1 - aT / n) * (1 - bT / n);
  return pe === 1 ? (po === 1 ? 1 : 0) : (po - pe) / (1 - pe);
}

function wilson(successes, n, z = 1.96) {
  if (n === 0) return { lo: 0, hi: 1 };
  const p = successes / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const s = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return { lo: Math.max(0, (c - s) / d), hi: Math.min(1, (c + s) / d) };
}

function buildUser(item) {
  const wines = item.wines.map((w) => `${w.slot}. ${w.fullText}`).join("\n");
  const answer = item.modelAnswer
    ? `\n\n## MODEL ANSWER\n${item.modelAnswer.slice(0, 6000)}`
    : "\n\n## MODEL ANSWER\n(none supplied - score answer_fidelity 3)";
  return `## QUESTION UNDER REVIEW - Paper ${item.paper}${item.totalMarks ? ` (${item.totalMarks} marks)` : ""}

${item.questionText}

## WINES
${wines}${answer}`;
}

function parse(raw) {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const p = JSON.parse(m[0]);
    if (p.verdict !== "keep" && p.verdict !== "bin") return null;
    const scores = {};
    for (const d of DIMENSIONS) {
      const v = Number(p.scores?.[d]);
      if (!Number.isFinite(v) || v < 1 || v > 5) return null;
      scores[d] = v;
    }
    return { scores, verdict: p.verdict, rationale: String(p.rationale ?? "") };
  } catch {
    return null;
  }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (true) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await fn(items[i], i);
      }
    })
  );
  return out;
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is required.");
    process.exit(1);
  }
  const goldenPath = join(root, "evals", "golden", "questions.jsonl");
  if (!existsSync(goldenPath)) {
    console.error("No golden set. Run: node scripts/build-golden-set.mjs");
    process.exit(1);
  }
  const meta = JSON.parse(readFileSync(join(root, "evals", "golden", "meta.json"), "utf-8"));
  const all = readFileSync(goldenPath, "utf-8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

  let target = all.filter((i) => i.split === SPLIT);
  if (LIMIT > 0) {
    // Keep the natural keep/bin ratio when sampling, or recall is measured on the wrong mix.
    const bins = target.filter((i) => i.verdict === "bin");
    const keeps = target.filter((i) => i.verdict === "keep");
    const nBin = Math.round(LIMIT * (bins.length / target.length));
    target = [...bins.slice(0, nBin), ...keeps.slice(0, LIMIT - nBin)];
  }
  const floor = all.filter((i) => i.split === "synthetic_floor");
  const items = [...target, ...floor];

  console.log(`Judge: ${MODEL} (anthropic — SAME FAMILY as the generator, see evals/judge.ts)`);
  console.log(`Split: ${SPLIT} (${target.length}) + synthetic floor (${floor.length}) = ${items.length}`);
  console.log(`Golden hash: ${meta.hash}\n`);

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let done = 0;
  const results = await mapLimit(items, CONCURRENCY, async (item) => {
    try {
      const msg = await client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system: [{ type: "text", text: RUBRIC, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: buildUser(item) }],
      });
      const raw = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
      const parsed = parse(raw);
      done++;
      if (done % 20 === 0) process.stdout.write(`  ${done}/${items.length}\n`);
      return { item, parsed, usage: msg.usage };
    } catch (err) {
      done++;
      return { item, parsed: null, error: String(err?.message ?? err) };
    }
  });

  const ok = results.filter((r) => r.parsed);
  const real = ok.filter((r) => r.item.split !== "synthetic_floor");
  const synth = ok.filter((r) => r.item.split === "synthetic_floor");

  const humanBin = real.map((r) => r.item.verdict === "bin");
  const judgeBin = real.map((r) => r.parsed.verdict === "bin");
  const kappa = cohensKappa(humanBin, judgeBin);

  const negatives = real.filter((r) => r.item.verdict === "bin");
  const caught = negatives.filter((r) => r.parsed.verdict === "bin").length;
  const recall = negatives.length ? caught / negatives.length : 0;
  const ci = wilson(caught, negatives.length);
  const positives = real.filter((r) => r.item.verdict === "keep");
  const falseBins = positives.filter((r) => r.parsed.verdict === "bin").length;

  const synthHits = synth.filter((r) => r.parsed.verdict === "bin").length;
  const missed = synth.filter((r) => r.parsed.verdict !== "bin").map((r) => r.item.reasonTags[0]);

  const cacheRead = results.reduce((a, r) => a + (r.usage?.cache_read_input_tokens ?? 0), 0);
  const cacheWrite = results.reduce((a, r) => a + (r.usage?.cache_creation_input_tokens ?? 0), 0);

  const failures = [];
  if (kappa < 0.6) failures.push(`kappa ${kappa.toFixed(3)} < 0.6`);
  if (ci.lo < 0.7) failures.push(`bin-recall lower bound ${ci.lo.toFixed(3)} < 0.70`);
  if (synth.length && synthHits < synth.length)
    failures.push(`synthetic floor ${synthHits}/${synth.length}`);

  const report = {
    model: MODEL,
    provider: "anthropic",
    crossFamily: false,
    split: SPLIT,
    goldenHash: meta.hash,
    scored: ok.length,
    unparsed: results.length - ok.length,
    kappa,
    binRecall: recall,
    binRecallLo: ci.lo,
    binRecallHi: ci.hi,
    negatives: negatives.length,
    falseBinRate: positives.length ? falseBins / positives.length : 0,
    syntheticFloorHits: synthHits,
    syntheticFloorTotal: synth.length,
    missedCorruptions: [...new Set(missed)],
    qualified: failures.length === 0,
    failures,
    cacheReadTokens: cacheRead,
    cacheCreationTokens: cacheWrite,
  };

  console.log("\n────────── CALIBRATION ──────────");
  console.log(`  scored              ${ok.length}/${results.length}` + (report.unparsed ? ` (${report.unparsed} unparsed)` : ""));
  console.log(`  Cohen's kappa       ${kappa.toFixed(3)}   (bar: >= 0.60)`);
  console.log(`  bin-recall          ${(recall * 100).toFixed(1)}%  95% CI [${(ci.lo * 100).toFixed(1)}%, ${(ci.hi * 100).toFixed(1)}%]  on ${negatives.length} negatives`);
  console.log(`  -> lower bound      ${(ci.lo * 100).toFixed(1)}%  (bar: >= 70%)`);
  console.log(`  false-bin rate      ${((report.falseBinRate) * 100).toFixed(1)}%  (kept questions wrongly binned)`);
  console.log(`  synthetic floor     ${synthHits}/${synth.length}   (bar: perfect)`);
  if (missed.length) console.log(`    missed: ${[...new Set(missed)].join(", ")}`);
  console.log(`  prompt cache        ${cacheRead} read / ${cacheWrite} written`);
  console.log(`\n  VERDICT: ${report.qualified ? "QUALIFIED to gate" : "NOT QUALIFIED - advisory only"}`);
  for (const f of failures) console.log(`    - ${f}`);
  console.log("─────────────────────────────────\n");

  mkdirSync(join(root, "evals", "reports"), { recursive: true });
  const out = join(root, "evals", "reports", `judge-calibration-${SPLIT}-${meta.hash}.json`);
  writeFileSync(out, JSON.stringify({ ...report, verdicts: ok.map((r) => ({ questionId: r.item.questionId, split: r.item.split, human: r.item.verdict, judge: r.parsed.verdict, scores: r.parsed.scores, rationale: r.parsed.rationale })) }, null, 2) + "\n");
  console.log(`Wrote ${out.replace(root, ".")}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
