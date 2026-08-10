// rematch-wine-profiles.mjs — re-run the bank matcher over every stored wine profile and report (or
// repair) the ones the OLD substring matcher resolved to the wrong bottle.
//
//   node --import ./scripts/ts-loader.mjs scripts/rematch-wine-profiles.mjs            (dry run)
//   node --import ./scripts/ts-loader.mjs scripts/rematch-wine-profiles.mjs --apply    (clear + re-enrich)
//   ... --apply --limit=50                                                             (bounded batch)
//
// WHY THIS EXISTS. matchScore compared producer tokens with `qt.includes(pt) || pt.includes(qt)`, so
// any token CONTAINING another counted as a hit. With `clos`/`vina`/`casa`/`bodegas` treated as noise
// a producer often reduced to one short token, and one substring hit scored a perfect 1.0 on the
// producer half — which is why every bad match carried confidence:"high". Alto Adige matched Bodegas
// Aalto; Hunter Valley matched Clos du Val; Carmenère matched Viña Carmen; Châteauneuf-du-Pape Blanc
// matched Clos des Papes and served a red Grenache/Syrah/Mourvèdre profile for a white Roussanne.
//
// The fix is in wine-bank-lookup.ts. This script deals with the profiles already written under the
// old one, which are the ones a candidate is actually shown.
//
// WHAT IT DOES, PER STORED PROFILE with source_method='bank_lookup':
//   re-run lookupWine on the label and compare the entry id to the stored bank_match.
//     same id      → CLEAN, left alone.
//     different id → REMATCHED (the old matcher preferred a wrong entry that outscored the right one).
//     no match     → ORPHANED (the old match was pure substring luck; nothing legitimate replaces it).
//
// --apply repairs REMATCHED and ORPHANED rows by DELETING the stale slot from wine_profiles and
// re-running enrichWineProfiles for the affected question, which re-looks-up under the new matcher
// and falls through to research for anything the bank genuinely does not hold. It is deliberately
// question-at-a-time and bounded: enrichment spends Tavily quota.
//
// IT DOES NOT rewrite model answers or answer keys built from the old profile. Those are downstream
// and a repaired profile only makes the NEXT build correct — see the report's final line for how many
// questions carry an answer written against a wrong bottle.

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { neon } from "@neondatabase/serverless";

// --- env bootstrap (matches remediate-questions.mjs; imported libs read process.env directly) ---
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENV = (() => {
  try { return readFileSync(join(ROOT, ".env.local"), "utf8"); } catch { return ""; }
})();
const envVal = (k) =>
  process.env[k] || (ENV.match(new RegExp(k + '\\s*=\\s*"?([^"\\n\\r]+)"?'))?.[1]?.trim() ?? "");
process.env.DATABASE_URL = envVal("DATABASE_URL");
process.env.TAVILY_API_KEY = envVal("TAVILY_API_KEY");
process.env.ANTHROPIC_API_KEY = envVal("ANTHROPIC_API_KEY");
if (!process.env.DATABASE_URL) {
  console.error("Missing DATABASE_URL (env or .env.local).");
  process.exit(1);
}

// Imported AFTER the env bootstrap — wine-bank-lookup opens a neon() client at module scope.
const { lookupWine, loadBankWithDb } = await import("../src/lib/wine-bank-lookup.ts");
const { enrichWineProfiles } = await import("../src/lib/wine-enrichment.ts");

const apply = process.argv.includes("--apply");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? Number(limitArg.slice("--limit=".length)) : Infinity;
const APIKEY = process.env.TAVILY_API_KEY;

const sql = neon(process.env.DATABASE_URL);

await loadBankWithDb();

// Live rows only. An archived or retired question is not served and not worth spending enrichment on.
const rows = await sql`
  SELECT question_id, wines, wine_profiles, model_answer IS NOT NULL AS has_answer
  FROM generated_questions
  WHERE wine_profiles IS NOT NULL
    AND COALESCE(is_retired, false) = false
    AND (metadata->>'archived') IS DISTINCT FROM 'true'
  ORDER BY question_id`;

const parse = (v) => (typeof v === "string" ? JSON.parse(v) : v);

let clean = 0, rematched = 0, orphaned = 0, skipped = 0;
const affected = new Map(); // question_id → { slots: number[], answerAtRisk: boolean }

for (const r of rows) {
  const wines = parse(r.wines);
  const profiles = parse(r.wine_profiles);
  if (!Array.isArray(wines) || !profiles) continue;

  for (const w of wines) {
    const p = profiles[String(w.slot)];
    // Only bank_lookup profiles are in scope. An llm_enrichment profile was never matched against the
    // bank, so the substring bug cannot have produced it — it has its own (separate) evidence problem.
    if (!p || p.source_method !== "bank_lookup" || !p.bank_match) { skipped++; continue; }

    const match = lookupWine(w.fullText);
    if (match && match.entry.id === p.bank_match) { clean++; continue; }

    if (match) rematched++; else orphaned++;
    const prev = affected.get(r.question_id) || { slots: [], answerAtRisk: r.has_answer };
    prev.slots.push(w.slot);
    affected.set(r.question_id, prev);

    console.log(
      `${match ? "REMATCH " : "ORPHAN  "} ${r.question_id} slot ${w.slot}\n` +
      `           label: ${w.fullText}\n` +
      `           was:   ${p.bank_match}${p.colour ? ` (${p.colour})` : ""}\n` +
      `           now:   ${match ? match.entry.id : "— no bank entry —"}`
    );
  }
}

console.log(`\n──────── REMATCH SUMMARY ────────`);
console.log(`bank_lookup profiles checked: ${clean + rematched + orphaned}`);
console.log(`  still resolve to same entry: ${clean}`);
console.log(`  resolve to a DIFFERENT entry: ${rematched}`);
console.log(`  no longer resolve at all:     ${orphaned}`);
console.log(`profiles not in scope (llm/none): ${skipped}`);
console.log(`questions affected: ${affected.size}`);
console.log(
  `  of which already carry a model answer written off the wrong bottle: ` +
  `${[...affected.values()].filter((a) => a.answerAtRisk).length}`
);

if (!apply) {
  console.log(`\n(dry run — pass --apply to clear the stale slots and re-enrich)`);
  process.exit(0);
}

if (!APIKEY) {
  console.error(`\nTAVILY_API_KEY is not set. Re-enrichment researches wines the bank does not hold;`);
  console.error(`without it every orphaned slot would fail soft and be left with no profile at all.`);
  process.exit(1);
}

let repaired = 0, failed = 0;
for (const [questionId, info] of affected) {
  if (repaired >= LIMIT) { console.log(`\nstopping at --limit=${LIMIT}`); break; }
  try {
    const cur = (await sql`SELECT wines FROM generated_questions WHERE question_id = ${questionId}`)[0];
    if (!cur) { failed++; continue; }
    // forceSlots is enrichWineProfiles' own maintenance hatch, built for precisely this: re-research
    // the named slots even though the bank would serve them from cache, without touching the slots
    // that are already right. Slot-scoped, so repairing one wine does not re-spend on its whole flight.
    await enrichWineProfiles(questionId, parse(cur.wines), APIKEY, undefined, { forceSlots: info.slots });
    repaired++;
    console.log(`repaired ${questionId} (slots ${info.slots.join(", ")})  [${repaired}/${Math.min(LIMIT, affected.size)}]`);
  } catch (e) {
    failed++;
    console.warn(`FAILED  ${questionId}: ${e.message}`);
  }
}

console.log(`\nre-enriched: ${repaired}, failed: ${failed}`);
