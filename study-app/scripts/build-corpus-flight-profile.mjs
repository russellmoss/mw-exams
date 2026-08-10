// build-corpus-flight-profile.mjs — what the IMW actually pours, as numbers.
//
//   node --import ./scripts/ts-loader.mjs scripts/build-corpus-flight-profile.mjs
//   → outputs/wine_engine/corpus_flight_profile.json
//
// WHY THIS EXISTS. Wine selection is the dominant defect in the generated bank, measured: a reviewer
// rejected 31.5% of questions carrying a REAL past-paper stem, where the only thing we supplied was
// the wines. Structure is not the problem; the bottles are.
//
// And his complaints are overwhelmingly about FREQUENCY, stated in exactly those terms — "we're
// over-indexing on Soave Classico ... at a disproportionate level to what it [appears in the exam]",
// "a hugely disproportionate number of sparkling Syrah based on what is [in the real papers]", the
// same Hunter Valley Semillon/Chardonnay pair again and again. Sparkling Shiraz: once in 160 real
// questions, sixteen times in the servable bank.
//
// You cannot fix a frequency problem with prohibitions. Every rule written from one rejection
// over-fits — measured today, the anchor rule rejected 13.1% of real past-paper flights and
// flight-composition's zero-banker arm 6.9%. The fix is to SAMPLE to the real distribution instead of
// generating freely and rejecting bad draws. This script is that distribution.
//
// Deterministic and offline: it reads data/exams.json and the corpus, and calls no model.

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { selectImportableStems } from "@/lib/historical-stems";
import { isBanker, matchesAnchorPair } from "@/lib/question-validator";
import "@/lib/appellation-resolver";
import { winesFromText, detectCountryName } from "@/lib/question-rules.mjs";
import { classifyWineStyle } from "@/lib/p3-category.mjs";

const dataDir = new URL("../../data/", import.meta.url);
const outDir = new URL("../../outputs/wine_engine/", import.meta.url);
const corpus = JSON.parse(readFileSync(new URL("structured/corpus_questions.json", dataDir), "utf8"));
const exams = JSON.parse(readFileSync(new URL("exams.json", dataDir), "utf8"));

const OLD_WORLD = new Set([
  "france", "italy", "spain", "portugal", "germany", "austria", "greece",
  "hungary", "england", "georgia", "switzerland", "croatia", "slovenia", "israel", "lebanon",
]);

const wineAt = new Map();
for (const y of exams) for (const p of y.papers || []) for (const w of p.wines || [])
  wineAt.set(`${y.year}_${p.paper}_${w.slot}`, w.full_text);

// The corpus writes "Cuvee, Producer. Vintage. Region, Country (ABV%)" — the origin is the last
// sentence-segment. Parsing it out matters: passing the whole label as `region` makes every wine read
// as a curveball to the banker check.
function parseOrigin(label) {
  const noAbv = (label || "").replace(/\([^)]*%\)\s*$/, "").trim();
  const seg = noAbv.split(/\.\s+/).map((s) => s.trim()).filter(Boolean);
  const parts = (seg[seg.length - 1] || "").split(",").map((s) => s.trim()).filter(Boolean);
  return { region: parts[0] || "", country: parts[parts.length - 1] || "" };
}

function auditWines(labels) {
  return winesFromText(labels.map((fullText, i) => ({ slot: i + 1, fullText }))).map((w) => {
    const { region, country } = parseOrigin(w.fullText);
    return { ...w, region, country: w.country || country.toLowerCase(), style: "" };
  });
}

const bump = (obj, key, by = 1) => { if (key) obj[key] = (obj[key] || 0) + by; };

const { stems } = selectImportableStems(corpus);
const flights = [];
for (const s of stems) {
  const labels = s.originalSlots.map((slot) => wineAt.get(`${s.year}_${s.paper}_${slot}`) || "").filter(Boolean);
  if (!labels.length) continue;
  const wines = auditWines(labels);
  flights.push({
    qid: s.qid, paper: s.paper, family: s.family, size: wines.length,
    wines: wines.map((w) => {
      const country = (w.country || detectCountryName(w.fullText) || "").toLowerCase();
      return {
        label: w.fullText,
        country,
        region: (w.region || "").toLowerCase(),
        variety: (w.varieties || [])[0] || "",
        style: classifyWineStyle(w.fullText) || "",
        world: OLD_WORLD.has(country) ? "old" : country && country !== "unknown" ? "new" : "unknown",
        banker: isBanker(w),
        anchored: matchesAnchorPair(w),
      };
    }),
  });
}

// ── Aggregate ─────────────────────────────────────────────────────────────────────────────────────
const profile = {
  builtFrom: { questions: flights.length, slots: flights.reduce((n, f) => n + f.size, 0) },
  // Per paper x flight size: how many wines the Institute anchors. This is the composition target —
  // "too many curveballs for a four wine question" made countable.
  anchorsByPaperAndSize: {},
  // Old/New World mix per paper. "I think if you had this question it would be more heavily weighted
  // towards France" is a claim about this table.
  worldMixByPaper: {},
  // THE FREQUENCY TABLES. Everything the reviewer called over-indexed lives here, and the cap that
  // stops it is derived from these counts rather than from a prohibition written after the fact.
  varietyFrequency: {},
  regionFrequency: {},
  countryFrequency: {},
  styleFrequencyByPaper: {},
  // The exact pairing that drew "we keep seeing the same question" — a variety+region as a SLOT, so a
  // generator can be told how often the exam actually pours it.
  varietyRegionFrequency: {},
};

for (const f of flights) {
  const key = `p${f.paper}_n${f.size}`;
  const anchors = f.wines.filter((w) => w.anchored).length;
  (profile.anchorsByPaperAndSize[key] ??= { flights: 0, anchorCounts: {} });
  profile.anchorsByPaperAndSize[key].flights++;
  bump(profile.anchorsByPaperAndSize[key].anchorCounts, String(anchors));

  (profile.worldMixByPaper[`p${f.paper}`] ??= { old: 0, new: 0, unknown: 0 });
  (profile.styleFrequencyByPaper[`p${f.paper}`] ??= {});
  for (const w of f.wines) {
    profile.worldMixByPaper[`p${f.paper}`][w.world]++;
    bump(profile.varietyFrequency, w.variety);
    bump(profile.regionFrequency, w.region);
    bump(profile.countryFrequency, w.country);
    bump(profile.styleFrequencyByPaper[`p${f.paper}`], w.style);
    if (w.variety && w.region) bump(profile.varietyRegionFrequency, `${w.variety} | ${w.region}`);
  }
}

mkdirSync(outDir, { recursive: true });
writeFileSync(new URL("corpus_flight_profile.json", outDir), JSON.stringify(profile, null, 2));

// ── Report ────────────────────────────────────────────────────────────────────────────────────────
const slots = profile.builtFrom.slots;
console.log(`\n${flights.length} real questions, ${slots} wine slots\n`);

console.log("ANCHORED WINES PER FLIGHT (the composition target)");
for (const [key, v] of Object.entries(profile.anchorsByPaperAndSize).sort()) {
  if (v.flights < 4) continue;
  const dist = Object.entries(v.anchorCounts).sort().map(([n, c]) => `${n}:${c}`).join("  ");
  console.log(`  ${key.padEnd(8)} ${String(v.flights).padStart(3)} flights   anchors → ${dist}`);
}

console.log("\nOLD / NEW WORLD BY PAPER");
for (const [p, m] of Object.entries(profile.worldMixByPaper).sort()) {
  const tot = m.old + m.new + m.unknown || 1;
  console.log(`  ${p}  old ${((m.old / tot) * 100).toFixed(0)}%   new ${((m.new / tot) * 100).toFixed(0)}%   unresolved ${((m.unknown / tot) * 100).toFixed(0)}%`);
}

console.log(`\nHOW OFTEN A SLOT IS THE SAME VARIETY+REGION (top 12 of ${Object.keys(profile.varietyRegionFrequency).length})`);
console.log("  the ceiling a generated bank should respect, per slot");
for (const [k, n] of Object.entries(profile.varietyRegionFrequency).sort((a, b) => b[1] - a[1]).slice(0, 12)) {
  console.log(`  ${String(n).padStart(3)}  ${((n / slots) * 100).toFixed(1).padStart(4)}%  ${k}`);
}

console.log("\nTHE WINES THE REVIEWER CALLED OVER-INDEXED, as the corpus has them:");
for (const probe of ["soave", "hunter valley", "sparkling shiraz", "margaret river"]) {
  const hits = flights.flatMap((f) => f.wines).filter((w) => `${w.label}`.toLowerCase().includes(probe)).length;
  console.log(`  ${probe.padEnd(18)} ${hits} of ${slots} slots (${((hits / slots) * 100).toFixed(2)}%)`);
}
console.log("");
