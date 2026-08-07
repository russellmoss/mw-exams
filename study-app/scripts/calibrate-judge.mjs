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
// Free-tier Gemini rate-limits aggressively; 3 keeps the retry path from doing all the work.
const CONCURRENCY = Number(opt("--concurrency", "3"));
const PROVIDER = opt("--provider", "gemini");
const MODEL = opt("--model", PROVIDER === "gemini" ? "gemini-3.1-pro-preview" : "claude-sonnet-4-6");

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

/**
 * Provider adapters. Both return the model's raw text; everything downstream is provider-agnostic.
 *
 * `crossFamily` is the flag that decides whether a qualified judge may actually gate. Claude judging
 * Claude is a closed loop — see evals/judge.ts — so an anthropic run is a development signal even
 * when every calibration bar clears.
 */
function makeProvider(provider, model) {
  if (provider === "gemini") {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is required for --provider gemini");
    return {
      name: "gemini",
      crossFamily: true,
      async score(system, user) {
        // Retry on 429/5xx with exponential backoff. The free tier rate-limits hard, and an
        // unretried 429 does not fail loudly — it silently drops the item, shrinking the sample and
        // every confidence interval's denominator with it. Honouring the API's own retryDelay where
        // offered beats guessing.
        let lastErr;
        for (let attempt = 0; attempt < 5; attempt++) {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
            {
              method: "POST",
              headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
              body: JSON.stringify({
                system_instruction: { parts: [{ text: system }] },
                contents: [{ role: "user", parts: [{ text: user }] }],
                generationConfig: {
                  temperature: 0,
                  // Gemini 3.1 Pro reasons before answering and thinking shares this budget, so a
                  // tight cap truncates the JSON mid-object — the same failure class as Opus in the
                  // generation path (question-engine.ts:575). 2048 produced MAX_TOKENS cut-offs.
                  maxOutputTokens: 8192,
                  responseMimeType: "application/json",
                },
              }),
            }
          );
          if (res.ok) {
            const body = await res.json();
            const cand = body.candidates?.[0];
            return {
              text: (cand?.content?.parts ?? []).map((p) => p.text ?? "").join(""),
              usage: body.usageMetadata ?? {},
              finishReason: cand?.finishReason,
            };
          }
          const text = await res.text();
          lastErr = `Gemini ${res.status}: ${text.slice(0, 120)}`;
          if (res.status !== 429 && res.status < 500) break;
          const suggested = Number(text.match(/"retryDelay":\s*"(\d+)s"/)?.[1]);
          const waitMs = Number.isFinite(suggested)
            ? suggested * 1000
            : Math.min(60000, 2000 * 2 ** attempt);
          await new Promise((r) => setTimeout(r, waitMs));
        }
        throw new Error(lastErr ?? "Gemini: exhausted retries");
      },
    };
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required for --provider anthropic");
  const client = new Anthropic({ apiKey });
  return {
    name: "anthropic",
    crossFamily: false,
    async score(system, user) {
      const msg = await client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: user }],
      });
      return {
        text: msg.content.filter((b) => b.type === "text").map((b) => b.text).join(""),
        usage: msg.usage,
      };
    },
  };
}

async function main() {
  const judge = makeProvider(PROVIDER, MODEL);
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

  console.log(
    `Judge: ${MODEL} (${judge.name} — ` +
      (judge.crossFamily
        ? "CROSS-FAMILY, independent of the generator"
        : "SAME FAMILY as the generator, closed loop; see evals/judge.ts") +
      ")"
  );
  console.log(`Split: ${SPLIT} (${target.length}) + synthetic floor (${floor.length}) = ${items.length}`);
  console.log(`Golden hash: ${meta.hash}\n`);

  let done = 0;
  const results = await mapLimit(items, CONCURRENCY, async (item) => {
    try {
      const { text, usage, finishReason } = await judge.score(RUBRIC, buildUser(item));
      const parsed = parse(text);
      done++;
      if (done % 20 === 0) process.stdout.write(`  ${done}/${items.length}\n`);
      return { item, parsed, usage, finishReason, raw: parsed ? null : text.slice(0, 300) };
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
  const binnedPositives = positives.filter((r) => r.parsed.verdict === "bin");
  // A bin that cites a factual fault is a CLAIM TO CHECK, not a judge error. Counting these against
  // the judge would disqualify it for out-performing its own reference — see evals/judge.ts.
  const disputed = binnedPositives.filter((r) => r.parsed.scores.factual_accuracy <= 2);
  const falseBins = binnedPositives.length - disputed.length;

  const synthHits = synth.filter((r) => r.parsed.verdict === "bin").length;
  const missed = synth.filter((r) => r.parsed.verdict !== "bin").map((r) => r.item.reasonTags[0]);

  const cacheRead = results.reduce((a, r) => a + (r.usage?.cache_read_input_tokens ?? 0), 0);
  const cacheWrite = results.reduce((a, r) => a + (r.usage?.cache_creation_input_tokens ?? 0), 0);

  const falseBinRate = positives.length ? falseBins / positives.length : 0;

  // Same four bars as evals/judge.ts CALIBRATION_BARS.
  const failures = [];
  if (kappa < 0.6) failures.push(`kappa ${kappa.toFixed(3)} < 0.6`);
  if (ci.lo < 0.7) failures.push(`bin-recall lower bound ${ci.lo.toFixed(3)} < 0.70`);
  if (falseBinRate > 0.25)
    failures.push(`false-bin rate ${(falseBinRate * 100).toFixed(1)}% > 25% (too strict)`);
  if (synth.length && synthHits < synth.length)
    failures.push(`synthetic floor ${synthHits}/${synth.length}`);

  const report = {
    model: MODEL,
    provider: judge.name,
    crossFamily: judge.crossFamily,
    split: SPLIT,
    goldenHash: meta.hash,
    scored: ok.length,
    unparsed: results.length - ok.length,
    kappa,
    binRecall: recall,
    binRecallLo: ci.lo,
    binRecallHi: ci.hi,
    negatives: negatives.length,
    falseBinRate,
    disputed: disputed.map((r) => ({ questionId: r.item.questionId, rationale: r.parsed.rationale })),
    syntheticFloorHits: synthHits,
    syntheticFloorTotal: synth.length,
    missedCorruptions: [...new Set(missed)],
    qualified: failures.length === 0,
    failures,
    cacheReadTokens: cacheRead,
    cacheCreationTokens: cacheWrite,
  };

  // Unparsed items silently shrink the sample, which shrinks every confidence interval's
  // denominator without anyone noticing. Diagnose them, never just count them.
  const failed = results.filter((r) => !r.parsed);
  if (failed.length) {
    console.log("\n── unparsed ──");
    const byReason = {};
    for (const f of failed) {
      const k = f.error ? `error: ${f.error.slice(0, 70)}` : `finishReason=${f.finishReason ?? "?"}`;
      byReason[k] = (byReason[k] ?? 0) + 1;
    }
    for (const [k, v] of Object.entries(byReason)) console.log(`  ${v}x ${k}`);
    const sample = failed.find((f) => f.raw);
    if (sample) console.log(`  sample: ${JSON.stringify(sample.raw).slice(0, 200)}`);
  }

  console.log("\n────────── CALIBRATION ──────────");
  console.log(`  scored              ${ok.length}/${results.length}` + (report.unparsed ? ` (${report.unparsed} unparsed)` : ""));
  console.log(`  Cohen's kappa       ${kappa.toFixed(3)}   (bar: >= 0.60)`);
  console.log(`  bin-recall          ${(recall * 100).toFixed(1)}%  95% CI [${(ci.lo * 100).toFixed(1)}%, ${(ci.hi * 100).toFixed(1)}%]  on ${negatives.length} negatives`);
  console.log(`  -> lower bound      ${(ci.lo * 100).toFixed(1)}%  (bar: >= 70%)`);
  console.log(`  false-bin rate      ${((report.falseBinRate) * 100).toFixed(1)}%  (kept questions binned WITHOUT a factual claim)`);
  console.log(`  disputed            ${disputed.length}  (kept by human, binned for a FACTUAL fault - adjudicate these)`);
  for (const r of disputed.slice(0, 5)) console.log(`    - ${r.item.questionId}: ${r.parsed.rationale.slice(0, 120)}`);
  console.log(`  synthetic floor     ${synthHits}/${synth.length}   (bar: perfect)`);
  if (missed.length) console.log(`    missed: ${[...new Set(missed)].join(", ")}`);
  console.log(`  prompt cache        ${cacheRead} read / ${cacheWrite} written`);
  console.log(`\n  VERDICT: ${report.qualified ? "QUALIFIED to gate" : "NOT QUALIFIED - advisory only"}`);
  for (const f of failures) console.log(`    - ${f}`);
  console.log("─────────────────────────────────\n");

  mkdirSync(join(root, "evals", "reports"), { recursive: true });
  // Timestamped. An earlier version keyed the filename on provider+split+hash only, so a quick
  // 8-item smoke run silently overwrote a 60-item calibration and destroyed its disputed list —
  // evidence a human still had to adjudicate. Runs are cheap; overwriting one is not.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const out = join(
    root,
    "evals",
    "reports",
    `judge-calibration-${judge.name}-${SPLIT}-n${ok.length}-${meta.hash}-${stamp}.json`
  );
  writeFileSync(out, JSON.stringify({ ...report, verdicts: ok.map((r) => ({ questionId: r.item.questionId, split: r.item.split, human: r.item.verdict, judge: r.parsed.verdict, scores: r.parsed.scores, rationale: r.parsed.rationale })) }, null, 2) + "\n");
  console.log(`Wrote ${out.replace(root, ".")}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
