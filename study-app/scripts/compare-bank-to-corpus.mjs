// compare-bank-to-corpus.mjs — how far the generated bank has drifted from what the exam pours.
//
//   node --import ./scripts/ts-loader.mjs scripts/compare-bank-to-corpus.mjs
//
// Reads outputs/wine_engine/corpus_flight_profile.json (build-corpus-flight-profile.mjs) and scores
// the LIVE servable bank against it. Every number the reviewer asserted by eye — "we're over-indexing
// on Soave Classico", "a hugely disproportionate number of sparkling Syrah", "the same Hunter Valley
// Semillon against Hunter Valley Chardonnay again" — is a row in this table, and the ratio column is
// the thing to fix.
//
// This is a DIAGNOSTIC, not a gate. It quarantines nothing. Its output is the target the wine selector
// samples toward, and the before/after that says whether the selector worked.

import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { isBanker, matchesAnchorPair } from "@/lib/question-validator";
import "@/lib/appellation-resolver";
import { winesFromText, detectCountryName } from "@/lib/question-rules.mjs";
import { classifyWineStyle } from "@/lib/p3-category.mjs";

const profile = JSON.parse(
  readFileSync(new URL("../../outputs/wine_engine/corpus_flight_profile.json", import.meta.url), "utf8")
);
const OLD_WORLD = new Set([
  "france", "italy", "spain", "portugal", "germany", "austria", "greece",
  "hungary", "england", "georgia", "switzerland", "croatia", "slovenia", "israel", "lebanon",
]);

const sql = neon(process.env.DATABASE_URL);
const rows = await sql`
  SELECT question_id, paper, family, wines FROM generated_questions
  WHERE status='approved' AND invalid_reasons IS NULL AND review_state='kept'
    AND is_retired IS NOT TRUE AND scope='pool'
`;

const bank = { slots: 0, varietyRegion: {}, world: {}, anchorsByPaperAndSize: {} };
for (const r of rows) {
  const raw = typeof r.wines === "string" ? JSON.parse(r.wines) : r.wines;
  const labels = (Array.isArray(raw) ? raw : []).map((w) => w.fullText || "").filter(Boolean);
  if (!labels.length) continue;
  const wines = winesFromText(labels.map((fullText, i) => ({ slot: i + 1, fullText }))).map((w) => {
    const seg = (w.fullText || "").replace(/\([^)]*%\)\s*$/, "").split(/\.\s+/).map((s) => s.trim()).filter(Boolean);
    const parts = (seg[seg.length - 1] || "").split(",").map((s) => s.trim()).filter(Boolean);
    return { ...w, region: parts[0] || "", country: (w.country || parts[parts.length - 1] || "").toLowerCase(), style: "" };
  });
  const key = `p${r.paper}_n${wines.length}`;
  (bank.anchorsByPaperAndSize[key] ??= { flights: 0, anchorCounts: {} });
  bank.anchorsByPaperAndSize[key].flights++;
  const anchors = wines.filter((w) => matchesAnchorPair(w)).length;
  bank.anchorsByPaperAndSize[key].anchorCounts[String(anchors)] =
    (bank.anchorsByPaperAndSize[key].anchorCounts[String(anchors)] || 0) + 1;
  for (const w of wines) {
    bank.slots++;
    const country = (w.country || detectCountryName(w.fullText) || "").toLowerCase();
    const world = OLD_WORLD.has(country) ? "old" : country && country !== "unknown" ? "new" : "unknown";
    (bank.world[`p${r.paper}`] ??= { old: 0, new: 0, unknown: 0 })[world]++;
    const v = (w.varieties || [])[0] || "";
    const reg = (w.region || "").toLowerCase();
    if (v && reg) bank.varietyRegion[`${v} | ${reg}`] = (bank.varietyRegion[`${v} | ${reg}`] || 0) + 1;
  }
}

const cSlots = profile.builtFrom.slots;
const pct = (n, d) => (d ? (n / d) * 100 : 0);

console.log(`\ncorpus: ${cSlots} slots over ${profile.builtFrom.questions} real questions`);
console.log(`bank:   ${bank.slots} slots over ${rows.length} servable questions\n`);

console.log("OVER-REPRESENTED SLOTS — bank share vs corpus share, worst 16");
console.log("  ratio   bank%   corpus%   variety | region");
const overs = Object.entries(bank.varietyRegion)
  .map(([k, n]) => {
    const b = pct(n, bank.slots);
    const c = pct(profile.varietyRegionFrequency[k] || 0, cSlots);
    // +0.19 is one corpus slot — the floor for "the exam does this at all", so a pairing the exam
    // never pours is scored against having poured it once rather than against zero.
    return { k, n, b, c, ratio: b / Math.max(c, pct(1, cSlots)) };
  })
  .filter((x) => x.n >= 4)
  .sort((a, b) => b.ratio - a.ratio)
  .slice(0, 16);
for (const o of overs) {
  console.log(`  ${o.ratio.toFixed(1).padStart(5)}x  ${o.b.toFixed(2).padStart(5)}  ${o.c.toFixed(2).padStart(7)}   ${o.k}  (${o.n} slots)`);
}

console.log("\nOLD / NEW WORLD — bank vs corpus");
for (const p of ["p1", "p2", "p3"]) {
  const b = bank.world[p] || { old: 0, new: 0, unknown: 0 };
  const c = profile.worldMixByPaper[p] || { old: 0, new: 0, unknown: 0 };
  const bt = b.old + b.new + b.unknown || 1;
  const ct = c.old + c.new + c.unknown || 1;
  console.log(`  ${p}  bank old ${pct(b.old, bt).toFixed(0)}% / new ${pct(b.new, bt).toFixed(0)}%      corpus old ${pct(c.old, ct).toFixed(0)}% / new ${pct(c.new, ct).toFixed(0)}%`);
}

console.log("\nFLIGHTS WITH ZERO ANCHORED WINES — bank vs corpus");
for (const key of Object.keys(profile.anchorsByPaperAndSize).sort()) {
  const c = profile.anchorsByPaperAndSize[key];
  const b = bank.anchorsByPaperAndSize[key];
  if (!b || c.flights < 4) continue;
  console.log(
    `  ${key.padEnd(8)} bank ${String(b.anchorCounts["0"] || 0).padStart(3)}/${String(b.flights).padEnd(4)} (${pct(b.anchorCounts["0"] || 0, b.flights).toFixed(0).padStart(3)}%)   ` +
      `corpus ${String(c.anchorCounts["0"] || 0).padStart(2)}/${String(c.flights).padEnd(3)} (${pct(c.anchorCounts["0"] || 0, c.flights).toFixed(0).padStart(3)}%)`
  );
}
console.log("");
