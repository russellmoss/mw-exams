// probe-wine-evidence.mjs — run ONE wine through the real enrichment pipeline and print what it
// found: which evidence tier, which documents, and which grid field each document actually supports.
//
// Diagnostic tool, not part of any flow. Use it to answer "why does this note say that?" and to check
// the tech-sheet tier is firing for a given producer before running a batch.
//
//   ENV_FILE=../study-app/.env.local node --import ./scripts/ts-loader.mjs scripts/probe-wine-evidence.mjs "Producer, Cuvée, 2021. Region, Country. (13.5%)"
//
// Writes the wine to wine_bank (that is the pipeline's normal behaviour and the row is real).
// Passes a synthetic question id, so the generated_questions UPDATE matches zero rows by design.

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENV = (() => {
  for (const p of [process.env.ENV_FILE, join(ROOT, ".env.local")].filter(Boolean)) {
    try { return readFileSync(p, "utf8"); } catch { /* next */ }
  }
  return "";
})();
const envVal = (k) =>
  process.env[k] || (ENV.match(new RegExp(k + '\\s*=\\s*"?([^"\\n\\r]+)"?'))?.[1]?.trim() ?? "");
process.env.DATABASE_URL = envVal("DATABASE_URL");
process.env.ANTHROPIC_API_KEY = envVal("ANTHROPIC_API_KEY");
process.env.TAVILY_API_KEY = envVal("TAVILY_API_KEY");
if (!process.env.DATABASE_URL || !process.env.ANTHROPIC_API_KEY || !process.env.TAVILY_API_KEY) {
  console.error("Need DATABASE_URL, ANTHROPIC_API_KEY and TAVILY_API_KEY (env or .env.local).");
  process.exit(1);
}

const { enrichWineProfiles } = await import("../src/lib/wine-enrichment.ts");
const { describeSource } = await import("../src/lib/wine-bank-lookup.ts");

const fullText = process.argv.slice(2).join(" ").trim();
if (!fullText) { console.error("Pass a wine reference string as the argument."); process.exit(1); }

console.log(`\nProbing: ${fullText}\n${"=".repeat(78)}`);
const profiles = await enrichWineProfiles(
  `probe_${Date.now()}`,
  [{ slot: 1, fullText }],
  process.env.ANTHROPIC_API_KEY,
  { source: "server" }
);

const p = profiles["1"];
if (!p) { console.error("No profile returned."); process.exit(1); }

console.log(`\nsource_method : ${p.source_method}`);
console.log(`evidence_tier : ${p.evidence_tier}`);
console.log(`confidence    : ${p.confidence}`);
console.log(`style         : ${p.style_category}  grapes: ${(p.grape_varieties || []).join(", ")}`);

const sources = p.tasting_profile?.sources || [];
console.log(`\nDocuments (${sources.length}):`);
sources.forEach((s, i) => console.log(`  [${i + 1}] ${s.type.padEnd(10)} ${describeSource(s)}\n      ${s.url}`));

const grid = p.tasting_grid || {};
const cites = p.tasting_profile?.citations || {};
console.log(`\nGrid field -> value -> supporting document(s):`);
for (const [field, value] of Object.entries(grid)) {
  if (["sources", "citations", "inferred_fields"].includes(field)) continue;
  const refs = cites[field];
  const label = !refs ? "?" : refs.length ? refs.map((r) => `[${r + 1}] ${describeSource(sources[r])}`).join("; ") : "INFERRED";
  console.log(`  ${field.padEnd(26)} ${String(value).slice(0, 58).padEnd(60)} ${label}`);
}

const total = Object.keys(cites).length;
const sourced = Object.values(cites).filter((r) => r.length).length;
console.log(`\n${sourced}/${total} fields backed by a document; ${total - sourced} inferred.`);
