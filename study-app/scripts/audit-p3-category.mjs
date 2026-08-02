// audit-p3-category.mjs — cross-check the Paper 3 style classifier against every INDEPENDENTLY
// labelled wine we hold, so a missing token surfaces as a diff instead of as a silently empty
// Focus category months later.
//
// The classifier in lib/p3-category.mjs is regex//token-driven. That is the right call for the serve
// path (deterministic, free, no network), but tokens rot: a style the corpus expresses only by
// producer name ("Viña Gravonia") or by an untokenised term ("vin de paille") falls into `other`
// and nothing complains. This script gives that failure mode a voice by diffing the regex against
// three labelled sources:
//
//   1. data/mock_wine_bank.json  — the curated bank, hand-authored `style_category`
//   2. wine_bank (Neon)          — the auto-grown bank, `style_category` from the LLM classifyWine()
//   3. data/wines.json (paper 3) — the historical corpus; no labels, so we just DUMP the `other`
//                                  bucket for eyeball review. Every real P3 wine has SOME style;
//                                  a big `other` pile is the signal.
//
//   node scripts/audit-p3-category.mjs            (all sources; needs DATABASE_URL for #2)
//   node scripts/audit-p3-category.mjs --no-db    (files only, no network)
//
// Run from study-app/. Exit code is 0 always — this is a review tool, not a gate. The CI gate is
// the labelled fixture table in tests/p3-category.test.mjs, which is where a confirmed finding
// from this script should end up.

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { classifyWineStyle } from "../src/lib/p3-category.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = join(ROOT, "..");
const NO_DB = process.argv.includes("--no-db");

const readJson = (p) => {
  try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; }
};

// wine_bank / mock_wine_bank style_category vocabulary -> p3 style. `still_off_dry` is deliberately
// unmapped: an off-dry Kabinett is neither reliably `sweet` nor reliably `other` in P3 terms, so
// disagreements there are noise rather than findings.
const STYLE_MAP = {
  sparkling: "sparkling",
  fortified: "fortified",
  still_sweet: "sweet",
  oxidative: "oxidative",
  orange: "oxidative", // p3 folds skin-contact/orange into the oxidative bucket
  still_dry: "other",
  rose: null, // rosé is cross-cutting in p3 (isRose), not a `style` — checked separately
  still_off_dry: null,
};

function label(wine) {
  return [wine.producer, wine.wine_name, wine.appellation, wine.sub_region, wine.region, wine.country]
    .filter(Boolean)
    .join(", ");
}

// The banks classify on a different axis than p3 does: they'll call a Fino "oxidative" and a PX
// "still_sweet", both true, but p3 puts fortification FIRST because that's the defining Paper 3
// style (see the priority comment in p3-category.mjs). Treat that specific collapse as agreement.
const CONSISTENT_WITH_PRECEDENCE = new Set(["oxidative>fortified", "sweet>fortified", "sparkling>fortified"]);

const findings = [];
function check(source, text, expected, extra = "") {
  if (!expected) return null;
  const got = classifyWineStyle(text).style;
  if (got !== expected && !CONSISTENT_WITH_PRECEDENCE.has(`${expected}>${got}`)) {
    findings.push({ source, text: text + extra, expected, got });
  }
  return got;
}

// ── 1. curated bank ──────────────────────────────────────────────────────────────────────────
const mockBank = readJson(join(REPO, "data", "mock_wine_bank.json")) || [];
let mockChecked = 0;
for (const w of mockBank) {
  const expected = STYLE_MAP[w.style_category];
  if (expected === undefined) {
    findings.push({ source: "mock_wine_bank", text: label(w), expected: "<known style_category>", got: w.style_category });
    continue;
  }
  if (expected === null) continue;
  mockChecked++;
  check("mock_wine_bank", label(w), expected);
}
console.log(`mock_wine_bank.json: ${mockChecked}/${mockBank.length} rows checked (rest unmappable by design).`);

// ── 2. auto-grown bank (Neon) ────────────────────────────────────────────────────────────────
let bankChecked = 0;
if (!NO_DB) {
  const ENV = (() => {
    try { return readFileSync(join(ROOT, ".env.local"), "utf8"); } catch { return ""; }
  })();
  const DATABASE_URL =
    process.env.DATABASE_URL ||
    ENV.match(/DATABASE_URL\s*=\s*"?([^"\n\r]+)"?/)?.[1]?.trim() ||
    "";
  if (!DATABASE_URL) {
    console.log("wine_bank: skipped (no DATABASE_URL; pass --no-db to silence).");
  } else {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(DATABASE_URL);
    const rows = await sql`SELECT id, producer, wine_name, country, region, style_category FROM wine_bank`;
    for (const w of rows) {
      const expected = STYLE_MAP[w.style_category];
      if (expected === undefined || expected === null) continue;
      bankChecked++;
      check("wine_bank", label(w), expected);
    }
    console.log(`wine_bank (Neon): ${bankChecked}/${rows.length} rows checked.`);
  }
}

// ── 3. historical Paper 3 corpus — unlabelled, so report the residual bucket ──────────────────
const corpus = (readJson(join(REPO, "data", "wines.json")) || []).filter((w) => w.paper === 3);
const residual = [];
const dist = {};
for (const w of corpus) {
  const { style, isRose } = classifyWineStyle(w.full_text);
  dist[style] = (dist[style] || 0) + 1;
  if (style === "other" && !isRose) residual.push(`${w.id}  ${w.full_text}`);
}
console.log(`\nHistorical Paper 3 corpus (${corpus.length} wines):`, dist);

// ── report ───────────────────────────────────────────────────────────────────────────────────
if (findings.length) {
  console.log(`\n=== ${findings.length} DISAGREEMENT(S) vs the labelled banks ===`);
  for (const f of findings) {
    console.log(`  [${f.source}] expected ${f.expected}, got ${f.got}\n      ${f.text}`);
  }
} else {
  console.log("\nNo disagreements against the labelled banks.");
}

console.log(`\n=== ${residual.length} Paper 3 corpus wine(s) in the residual 'other' bucket ===`);
console.log("(Dry still whites/reds DO legitimately appear in Paper 3 — review, don't assume a bug.)");
for (const line of residual) console.log(`  ${line}`);
