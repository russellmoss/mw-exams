#!/usr/bin/env node
// compare-question-quality.mjs — did a config change make the QUESTIONS worse?
//
// First-pass rate measures how often a draft survives the validators. It says nothing about whether
// the surviving questions are any good, so optimising it alone is exactly how you end up with a fast
// generator that produces dull, repetitive, or unrealistic exam questions. This script is the
// counterweight: it scores generated questions against the REAL 10-year corpus on the structural
// axes we can measure, and dumps full text for a human to read on the axes we cannot.
//
// It compares arms — by model, or by prompt version — so "Sonnet instead of Opus" is a question with
// an answer rather than a matter of taste.
//
// Usage:
//   DATABASE_URL=... node scripts/compare-question-quality.mjs [--by model|version] [--days 7] [--samples 2]
//
// Read-only.

import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const flag = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : d;
};
const groupBy = flag("by", "model");
const days = Number(flag("days", 7));
const samplesPerArm = Number(flag("samples", 2));

// Fall back to .env.local like every other script in this directory — see analyze-generation.mjs.
if (!process.env.DATABASE_URL) {
  try {
    process.env.DATABASE_URL = readFileSync(".env.local", "utf8")
      .match(/DATABASE_URL\s*=\s*"?([^"\n\r]+)"?/)[1].trim();
  } catch { /* fall through to the error below */ }
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required (env or study-app/.env.local).");
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);

// ── Structural measures, all computed the same way for corpus and generated questions ────────────
const SUBQ_SPLIT = /^\s*([a-h])\)\s*/gim;
const MARK_TOKEN = /\(\s*(?:(\d+)\s*[x×]\s*)?(\d+)\s*marks?\s*\)/gi;
const ID_ASK =
  /\b(?:identif\w*|name|state|determine|suggest|specify|give|what\s+(?:is|are)|which)\b[^.?]{0,80}?(?:\bgrape\b|\bvariet(?:y|ies)|\bgrapes\b|\bvintage|\borigin|\bregion|\bcountr|\bappellation|\bprovenance|\bgeograph)/i;
const BENCHMARK =
  /\b(premier\s*cru|1er\s*cru|grand\s*cru|cru\s*class|pauillac|margaux|saint[- ]julien|saint[- ]estephe|saint[- ]emilion|pomerol|pessac[- ]leognan|sauternes|barsac|meursault|puligny|chassagne|chablis|corton|gevrey|chambolle|vosne|nuits[- ]saint|pommard|volnay|barolo|barbaresco|brunello|chianti\s*classico|vino\s*nobile|taurasi|hermitage|cote[- ]rotie|cornas|chateauneuf|marlborough|sancerre|pouilly[- ]fume|vouvray|savennieres|rioja|ribera|priorat|vintage\s*port|lbv|fino|manzanilla|amontillado|oloroso|madeira|tokaj|napa|oakville|rutherford|barossa|stellenbosch|willamette|wachau|kamptal)\b/i;
const OLD_WORLD = /\b(france|italy|spain|portugal|germany|austria|greece|hungary|england|georgia|switzerland|croatia|slovenia|israel|lebanon)\b/i;
const NEW_WORLD = /\b(south africa|new zealand|usa|united states|australia|argentina|chile|canada|uruguay|brazil|japan|mexico|china)\b/i;

const norm = (t) => (t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function measure(questionText, wines) {
  const t = questionText || "";
  const labels = [...t.matchAll(SUBQ_SPLIT)];
  const parts =
    labels.length === 0
      ? [t]
      : labels.map((l, i) =>
          t.slice((l.index ?? 0) + l[0].length, i + 1 < labels.length ? labels[i + 1].index ?? t.length : t.length)
        );
  let total = 0;
  let idMarks = 0;
  for (const p of parts) {
    let pm = 0;
    for (const m of p.matchAll(MARK_TOKEN)) pm += (m[1] ? +m[1] : 1) * +m[2];
    if (!pm) continue;
    total += pm;
    if (ID_ASK.test(p)) idMarks += pm;
  }
  const labels_ = wines.map((w) => norm(w.fullText || ""));
  const worlds = new Set(
    labels_.map((l) => (OLD_WORLD.test(l) ? "old" : NEW_WORLD.test(l) ? "new" : null)).filter(Boolean)
  );
  return {
    wineCount: wines.length,
    // NB: never call .test() on MARK_TOKEN — it carries the /g flag, so .test() advances lastIndex
    // and String.matchAll inherits that offset, silently skipping the first tokens of the NEXT
    // question. That bug made a correct 50-mark question measure as 30 and produced a fake
    // "quality regression" across every arm. Use a local non-global pattern for boolean checks.
    subQuestions: parts.filter((p) => /\(\s*(?:\d+\s*[x×]\s*)?\d+\s*marks?\s*\)/i.test(p)).length || parts.length,
    totalMarks: total,
    marksCorrect: total > 0 && total === wines.length * 25,
    idShare: total > 0 ? idMarks / total : null,
    bankers: labels_.filter((l) => BENCHMARK.test(l)).length,
    worldMix: worlds.size > 1,
    stemWords: t.split(/\s+/).length,
  };
}

function summarise(name, rows) {
  const m = rows.map((r) => measure(r.question_text, r.wines));
  const n = m.length;
  if (n === 0) return null;
  const mean = (f) => {
    const v = m.map(f).filter((x) => x !== null && x !== undefined && !Number.isNaN(x));
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const share = (f) => m.filter(f).length / n;
  return {
    name,
    n,
    marksCorrect: share((x) => x.marksCorrect),
    idShare: mean((x) => x.idShare),
    meanWines: mean((x) => x.wineCount),
    flightSizes: [...new Set(m.map((x) => x.wineCount))].sort((a, b) => a - b).join("/"),
    bankerPresent: share((x) => x.bankers > 0),
    meanBankers: mean((x) => x.bankers),
    worldMix: share((x) => x.worldMix),
    meanStemWords: mean((x) => x.stemWords),
  };
}

function printTable(rowsIn) {
  const rows = rowsIn.filter(Boolean);
  if (rows.length === 0) return;
  const cols = [
    ["arm", (r) => r.name, 26],
    ["n", (r) => String(r.n), 4],
    ["marks ok", (r) => `${Math.round(r.marksCorrect * 100)}%`, 9],
    ["ID share", (r) => (r.idShare === null ? "n/a" : `${Math.round(r.idShare * 100)}%`), 9],
    ["wines", (r) => (r.meanWines ?? 0).toFixed(1), 6],
    ["sizes", (r) => r.flightSizes, 10],
    ["banker", (r) => `${Math.round(r.bankerPresent * 100)}%`, 7],
    ["OW/NW mix", (r) => `${Math.round(r.worldMix * 100)}%`, 10],
    ["stem words", (r) => Math.round(r.meanStemWords ?? 0), 11],
  ];
  console.log(cols.map(([h, , w]) => String(h).padEnd(w)).join(""));
  console.log("-".repeat(cols.reduce((a, [, , w]) => a + w, 0)));
  for (const r of rows) console.log(cols.map(([, f, w]) => String(f(r)).padEnd(w)).join(""));
}

// ── The reference: real MW questions ─────────────────────────────────────────────────────────────
let corpusRow = null;
try {
  const corpus = JSON.parse(
    readFileSync(join(process.cwd(), "tests/fixtures/generated-questions-corpus.json"), "utf-8")
  );
  corpusRow = summarise("(served corpus, historical)", corpus);
} catch {
  /* fixture optional */
}

// ── The arms ─────────────────────────────────────────────────────────────────────────────────────
// Join to the telemetry's "shipped" marker row (attempt = 0) so each question carries the PROMPT
// VERSION that produced it. Grouping by model alone is contaminated: a single day's benchmarking
// spans several prompt versions on the same model, so a "Sonnet" column would mix pre-spec and
// post-spec questions and report the average of two different systems.
const rows = await sql`
  SELECT q.question_id, q.paper, q.family, q.question_text, q.wines, q.metadata, q.created_at,
         a.prompt_version
  FROM generated_questions q
  LEFT JOIN LATERAL (
    SELECT prompt_version FROM generation_attempts
    WHERE question_id = q.question_id ORDER BY created_at LIMIT 1
  ) a ON TRUE
  WHERE q.created_at > NOW() - (${days} || ' days')::interval
  ORDER BY q.created_at ASC`;

const parsed = rows.map((r) => ({
  ...r,
  wines: typeof r.wines === "string" ? JSON.parse(r.wines) : r.wines,
  model: r.metadata?.genModel || "unknown",
  specVersion: r.metadata?.flightSpec?.specVersion || "none",
  promptVersion: r.prompt_version || "pre-telemetry",
}));

const groups = new Map();
for (const r of parsed) {
  const key =
    groupBy === "version"
      ? r.promptVersion
      : groupBy === "both"
        ? `${r.promptVersion} / ${r.model.replace("claude-", "")}`
        : r.model;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(r);
}

console.log(`\n${"=".repeat(92)}`);
console.log(`QUESTION QUALITY — structural comparison against the real corpus (last ${days} days)`);
console.log("=".repeat(92));
console.log(
  `\nWhat "good" looks like: marks ok 100%, ID share ~46% (EK-0098), banker present on 3+ wine flights,\n` +
    `a spread of flight sizes rather than one, and OW/NW mix on non-same-origin families.\n`
);
printTable([corpusRow, ...[...groups.entries()].map(([k, v]) => summarise(k, v))]);

// ── Repetition: the axis a validator cannot see ──────────────────────────────────────────────────
console.log(`\nREPETITION CHECK (a fast generator that repeats itself is worse, not better)`);
for (const [key, group] of groups) {
  const wineNames = group.flatMap((q) => q.wines.map((w) => norm(w.fullText).split(",")[0].trim()));
  const uniqueWines = new Set(wineNames);
  const stems = group.map((q) => norm(q.question_text).slice(0, 90));
  console.log(
    `  ${key.padEnd(24)} ${group.length} questions, ` +
      `${uniqueWines.size}/${wineNames.length} distinct wines (${Math.round((uniqueWines.size / Math.max(wineNames.length, 1)) * 100)}%), ` +
      `${new Set(stems).size}/${stems.length} distinct stem openings`
  );
}

// ── Samples for a human to read ──────────────────────────────────────────────────────────────────
console.log(`\n${"=".repeat(92)}`);
console.log(`SAMPLES — the axes no script can score. Read these: do they sound like a real MW paper?`);
console.log("=".repeat(92));
for (const [key, group] of groups) {
  for (const q of group.slice(-samplesPerArm)) {
    console.log(`\n--- ${key} | ${q.question_id} | P${q.paper} ${q.family} ---`);
    console.log(q.question_text.trim());
    console.log("  Wines:");
    for (const w of q.wines) console.log(`    ${w.slot}. ${w.fullText}`);
  }
}
console.log("");
