#!/usr/bin/env node
// build-golden-set.mjs — freeze the human-labelled golden set from the live bank.
//
//   node scripts/build-golden-set.mjs [--seed 20260807] [--dry]
//
// Reads every REVIEWED question (review_status kept|binned) plus its bin reasons, stratifies by
// paper × family × verdict, appends the synthetic floor, and writes:
//
//   evals/golden/questions.jsonl   one item per line
//   evals/golden/meta.json         hash + provenance + health report
//
// Re-running on an unchanged bank with the same seed reproduces the same file byte-for-byte.
// Re-running after new reviews lands will legitimately change the hash — which invalidates existing
// baselines, so the script says so rather than letting it pass unnoticed.
//
// The synthetic floor is generated here rather than hand-written so the corruptions stay in lockstep
// with the real corpus shape: each is a REAL kept question with exactly one thing broken, which
// makes a judge miss diagnostic (it saw a plausible question and failed to spot the specific fault)
// rather than a giveaway (an obviously fake question any model would reject on vibes).

import { neon } from "@neondatabase/serverless";
import { createHash } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const args = process.argv.slice(2);
const seedArg = args.indexOf("--seed");
const SEED = seedArg >= 0 ? Number(args[seedArg + 1]) : 20260807;
const DRY = args.includes("--dry");

const WEIGHTS = { calibration: 1, holdout: 1, regression: 1.1 };

function seededRandom(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required (read-only access is enough).");
    process.exit(1);
  }
  const sql = neon(process.env.DATABASE_URL);

  console.log("Reading reviewed questions…");
  const rows = await sql`
    SELECT q.question_id, q.paper, q.family, q.review_status, q.question_text, q.wines,
           q.total_marks, q.model_answer,
           r.reason_tags, r.reason_note
    FROM generated_questions q
    LEFT JOIN LATERAL (
      SELECT reason_tags, reason_note FROM bank_bin_reasons b
      WHERE b.item_id = q.question_id ORDER BY b.binned_at DESC LIMIT 1
    ) r ON true
    WHERE q.review_status IN ('kept','binned')
      AND q.question_text IS NOT NULL
    ORDER BY q.question_id
  `;
  console.log(`  ${rows.length} reviewed questions`);

  const labelled = rows.map((r) => ({
    questionId: r.question_id,
    paper: Number(r.paper),
    family: r.family ?? null,
    verdict: r.review_status === "binned" ? "bin" : "keep",
    reasonTags: r.reason_tags ?? [],
    reasonNote: r.reason_note ?? null,
    questionText: r.question_text,
    wines: normaliseWines(r.wines),
    totalMarks: r.total_marks ?? null,
    modelAnswer: r.model_answer ?? null,
  }));

  const rand = seededRandom(SEED);
  const split = assignSplits(labelled, WEIGHTS, rand);

  console.log("Building the synthetic floor…");
  const floor = buildSyntheticFloor(
    labelled.filter((i) => i.verdict === "keep"),
    seededRandom(SEED + 1)
  );
  console.log(`  ${floor.length} corrupted items`);

  const items = [...split, ...floor];
  const hash = hashItems(items);
  const health = checkHealth(items);

  console.log("");
  for (const [name, c] of Object.entries(health.counts)) {
    console.log(`  ${name.padEnd(16)} ${String(c.total).padStart(4)}  (${c.bin} bin / ${c.keep} keep)`);
  }
  console.log(`\n  hash ${hash}`);
  for (const w of health.warnings) console.warn(`\n  ⚠ ${w}`);

  if (DRY) {
    console.log("\n--dry: nothing written.");
    return;
  }

  const outDir = join(root, "evals", "golden");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "questions.jsonl"), items.map((i) => JSON.stringify(i)).join("\n") + "\n");
  writeFileSync(
    join(outDir, "meta.json"),
    JSON.stringify(
      {
        hash,
        seed: SEED,
        builtAt: new Date().toISOString(),
        sourceRows: rows.length,
        counts: health.counts,
        warnings: health.warnings,
        note:
          "Frozen artifact. Rebuilding after new reviews changes the hash and INVALIDATES existing " +
          "baselines — re-baseline before comparing runs across a rebuild.",
      },
      null,
      2
    ) + "\n"
  );
  console.log(`\nWrote evals/golden/questions.jsonl (${items.length} items)`);
}

function normaliseWines(wines) {
  const parsed = typeof wines === "string" ? JSON.parse(wines) : wines;
  if (!Array.isArray(parsed)) return [];
  return parsed.map((w, i) => ({ slot: Number(w?.slot ?? i + 1), fullText: String(w?.fullText ?? "") }));
}

function assignSplits(items, weights, rand) {
  const strata = new Map();
  for (const item of items) {
    const key = `${item.paper}|${item.family ?? "-"}|${item.verdict}`;
    if (!strata.has(key)) strata.set(key, []);
    strata.get(key).push(item);
  }
  const total = weights.calibration + weights.holdout + weights.regression;
  const out = [];
  for (const key of [...strata.keys()].sort()) {
    const bucket = strata.get(key).slice();
    for (let i = bucket.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [bucket[i], bucket[j]] = [bucket[j], bucket[i]];
    }
    const nCal = Math.round((bucket.length * weights.calibration) / total);
    const nHold = Math.round((bucket.length * weights.holdout) / total);
    bucket.forEach((item, i) => {
      out.push({
        ...item,
        split: i < nCal ? "calibration" : i < nCal + nHold ? "holdout" : "regression",
      });
    });
  }
  return out;
}

// ── The synthetic floor ─────────────────────────────────────────────────────────────────────────
//
// Each corruption breaks ONE thing, in a way that is wrong on the record rather than wrong on taste.
// A judge that cannot catch these has no business gating anything.

const CORRUPTIONS = [
  {
    id: "marks_do_not_sum",
    why: "Mark total contradicts the mandatory 25 marks per wine.",
    apply: (item) => ({
      ...item,
      questionText: item.questionText.replace(/\((\d+)\s*marks\)/i, (m, n) => `(${Number(n) + 7} marks)`),
    }),
  },
  {
    id: "red_wine_in_paper_1",
    why: "A red wine in a white-only paper — an absolute scope violation.",
    apply: (item) =>
      item.paper === 1 && item.wines.length > 0
        ? {
            ...item,
            wines: [
              { ...item.wines[0], fullText: "Château Léoville-Barton, 2016. Saint-Julien, France. (13.5%)" },
              ...item.wines.slice(1),
            ],
          }
        : null,
  },
  {
    id: "stem_contradicts_wines",
    why: "Stem claims a single shared variety; the wine list is plainly mixed.",
    apply: (item) =>
      item.wines.length >= 2
        ? {
            ...item,
            questionText:
              "Wines 1 to " +
              item.wines.length +
              " are all made from the same single grape variety, Riesling.\n" +
              item.questionText,
            wines: item.wines.map((w, i) =>
              i === 0
                ? { ...w, fullText: "Bodegas Muga, Reserva, 2018. Rioja, Spain. (14%)" }
                : w
            ),
          }
        : null,
  },
  {
    id: "hallucinated_appellation",
    why: "Names an appellation that does not exist.",
    apply: (item) =>
      item.wines.length > 0
        ? {
            ...item,
            wines: [
              { ...item.wines[0], fullText: "Domaine Clos-Verdant, Cuvée Ancienne, 2019. Grand Cru Montrachet-Vergisson, France. (13%)" },
              ...item.wines.slice(1),
            ],
          }
        : null,
  },
  {
    id: "impossible_abv",
    why: "An ABV no unfortified still wine reaches.",
    apply: (item) =>
      item.wines.length > 0
        ? {
            ...item,
            wines: [
              { ...item.wines[0], fullText: item.wines[0].fullText.replace(/\([\d.]+%\)/, "(24.5%)") },
              ...item.wines.slice(1),
            ],
          }
        : null,
  },
];

function buildSyntheticFloor(keptItems, rand) {
  const pool = keptItems.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const out = [];
  let cursor = 0;
  // Four of each corruption → 20. Skip candidates a corruption cannot apply to (e.g. paper-1-only).
  for (const corruption of CORRUPTIONS) {
    let made = 0;
    while (made < 4 && cursor < pool.length) {
      const base = pool[cursor++];
      const corrupted = corruption.apply(base);
      if (!corrupted) continue;
      out.push({
        ...corrupted,
        questionId: `synthetic_${corruption.id}_${made + 1}`,
        split: "synthetic_floor",
        verdict: "bin",
        reasonTags: [corruption.id],
        reasonNote: null,
        corruption: corruption.why,
      });
      made++;
    }
  }
  return out;
}

function hashItems(items) {
  const canonical = items
    .map((i) => `${i.questionId}\t${i.split}\t${i.verdict}`)
    .sort()
    .join("\n");
  return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

function checkHealth(items) {
  const splits = ["calibration", "holdout", "regression", "synthetic_floor"];
  const counts = {};
  for (const s of splits) {
    const xs = items.filter((i) => i.split === s);
    counts[s] = {
      total: xs.length,
      bin: xs.filter((i) => i.verdict === "bin").length,
      keep: xs.filter((i) => i.verdict === "keep").length,
    };
  }
  const warnings = [];
  if (counts.holdout.bin < 40)
    warnings.push(
      `Holdout has ${counts.holdout.bin} negatives (< 40). The CI on bin-recall will be too wide to ` +
        `gate on — the judge stays ADVISORY until the label base grows.`
    );
  if (counts.synthetic_floor.total !== 20)
    warnings.push(`Synthetic floor has ${counts.synthetic_floor.total} items, expected 20.`);
  return { counts, warnings };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
