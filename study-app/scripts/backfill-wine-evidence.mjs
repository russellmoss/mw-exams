// backfill-wine-evidence.mjs — re-research every banked wine through the tiered evidence pipeline
// (tech sheet -> critic -> web -> inferred) so existing rows gain typed sources and per-field
// citations instead of a flat list of URLs from one unscoped search.
//
//   node --import ./scripts/ts-loader.mjs scripts/backfill-wine-evidence.mjs              (dry run)
//   node --import ./scripts/ts-loader.mjs scripts/backfill-wine-evidence.mjs --apply --limit 20
//   node --import ./scripts/ts-loader.mjs scripts/backfill-wine-evidence.mjs --apply
//
// RESUMABLE BY CONSTRUCTION: it selects rows whose tasting_profile has no `evidence_tier`, which is
// exactly the set the new pipeline has not yet touched. Kill it and re-run; it picks up where it
// stopped. No progress file to go stale.
//
// Writes land on the row's OWN id (idOverride), never on a freshly derived one -- re-classifying can
// return a slightly different producer string, and without the override the upsert would insert a
// near-duplicate instead of upgrading the row.
//
// Flags: --apply, --limit N, --concurrency N (default 4), --id ROW_ID (single row, for spot checks)

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { neon } from "@neondatabase/serverless";

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
const APIKEY = process.env.ANTHROPIC_API_KEY;
if (!process.env.DATABASE_URL || !APIKEY) {
  console.error("Missing DATABASE_URL or ANTHROPIC_API_KEY."); process.exit(1);
}
if (!process.env.TAVILY_API_KEY) {
  // Without it every wine silently degrades to an LLM-only grid -- which would overwrite real
  // researched profiles with model recall. Refuse rather than corrupt the bank.
  console.error("TAVILY_API_KEY not set — backfill would overwrite profiles with inference. Aborting.");
  process.exit(1);
}

const { researchAndBankWine, isTavilyQuotaExhausted } = await import("../src/lib/wine-enrichment.ts");

const sql = neon(process.env.DATABASE_URL);
const args = process.argv.slice(2);
const has = (n) => args.includes(n);
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const APPLY = has("--apply");
const LIMIT = flag("--limit") ? Number(flag("--limit")) : undefined;
const CONCURRENCY = flag("--concurrency") ? Number(flag("--concurrency")) : 4;
const ONE_ID = flag("--id");

// ── select ──────────────────────────────────────────────────────────────────
// --retry-inferred targets rows the pipeline marked `inferred` with ZERO sources. Those are the
// casualties of a run that lost its Tavily quota partway through: the wine is not necessarily
// obscure, we were simply blind when we looked. The default selector cannot reach them, because they
// now HAVE an evidence_tier.
const rows = ONE_ID
  ? await sql`SELECT id, producer, wine_name, country, region, tasting_profile FROM wine_bank WHERE id = ${ONE_ID}`
  : has("--retry-inferred")
  ? await sql`
      SELECT id, producer, wine_name, country, region, tasting_profile
      FROM wine_bank
      WHERE tasting_profile->>'evidence_tier' = 'inferred'
        AND jsonb_array_length(COALESCE(tasting_profile->'sources','[]'::jsonb)) = 0
      ORDER BY id`
  : await sql`
      SELECT id, producer, wine_name, country, region, tasting_profile
      FROM wine_bank
      WHERE tasting_profile->>'evidence_tier' IS NULL
      ORDER BY id`;

// ── vintage recovery ────────────────────────────────────────────────────────
// Bank rows are vintage-agnostic, but a tech-sheet search is much sharper with a vintage. Recover one
// from a real question wine ONLY on an unambiguous match (producer AND cuvée both present in the
// reference string). A loose producer-only match would hand "Vietti" the Barolo Cannubi sheet when
// the row is the Roero Arneis, so a wrong vintage is worse than none -- we fall back to the row.
const refWines = await sql`
  SELECT DISTINCT w->>'fullText' AS t
  FROM generated_questions q, jsonb_array_elements(q.wines) w
  WHERE q.wines IS NOT NULL AND length(w->>'fullText') BETWEEN 20 AND 200`;
const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const refIndex = refWines.map((r) => ({ raw: r.t, n: norm(r.t) }));

function subjectFor(row) {
  const p = norm(row.producer), w = norm(row.wine_name);
  if (p.length > 3) {
    const hits = refIndex.filter((r) => r.n.includes(p) && (!w || r.n.includes(w)));
    // One unambiguous cuvée match: use the real reference string, vintage and all.
    if (hits.length && new Set(hits.map((h) => h.raw.replace(/\b(19|20)\d{2}\b/, ""))).size === 1) return hits[0].raw;
  }
  return [row.producer, row.wine_name, row.region, row.country].filter(Boolean).join(", ");
}

const list = LIMIT ? rows.slice(0, LIMIT) : rows;
console.log(`${rows.length} banked wine(s) not yet upgraded; processing ${list.length} at concurrency ${CONCURRENCY}.`);
console.log(APPLY ? "MODE: APPLY (rewrites wine_bank.tasting_profile)\n" : "MODE: DRY RUN (no writes)\n");
if (!list.length) process.exit(0);

if (!APPLY) {
  for (const row of list.slice(0, 15)) {
    const s = subjectFor(row);
    console.log(`  ${row.id.slice(0, 52).padEnd(54)} ${s === undefined ? "" : s.slice(0, 70)}${s.match(/\b(19|20)\d{2}\b/) ? "  [vintage recovered]" : ""}`);
  }
  if (list.length > 15) console.log(`  … and ${list.length - 15} more`);
  process.exit(0);
}

// ── run ─────────────────────────────────────────────────────────────────────
const t0 = Date.now();
const spendBefore = await spend();
const tally = { tech_sheet: 0, critic: 0, web: 0, inferred: 0, skipped: 0, failed: 0 };
let done = 0;

async function spend() {
  const [c] = await sql`SELECT COALESCE(SUM(cost_usd),0) AS v FROM model_usage WHERE task_type = 'wine_enrichment'`;
  const [t] = await sql`SELECT COALESCE(SUM(cost_usd),0) AS v FROM tavily_usage WHERE task_type LIKE 'wine%'`;
  return Number(c.v) + Number(t.v);
}

let aborted = false;

async function one(row) {
  try {
    const profile = await researchAndBankWine(subjectFor(row), APIKEY, {
      bankId: row.id,
      meta: { source: "server" },
      // Only ever upgrade. A row that already has sources must not be replaced by an unsourced grid.
      writeOnlyIfSourced: (row.tasting_profile?.sources?.length ?? 0) > 0,
    });
    if (profile.written === false) { tally.skipped++; console.log(`  [${++done}/${list.length}] skipped   (no sources found; kept existing profile)  ${row.id.slice(0, 46)}`); return; }
    const tier = profile.evidence_tier ?? "inferred";
    tally[tier] = (tally[tier] ?? 0) + 1;
    const n = profile.tasting_profile?.sources?.length ?? 0;
    const cites = profile.tasting_profile?.citations ?? {};
    const sourced = Object.values(cites).filter((r) => r.length).length;
    console.log(`  [${++done}/${list.length}] ${tier.padEnd(10)} ${String(n).padStart(2)} src  ${String(sourced).padStart(2)}/${Object.keys(cites).length} cited  ${row.id.slice(0, 46)}`);
  } catch (e) {
    tally.failed++;
    console.warn(`  [${++done}/${list.length}] FAILED  ${row.id.slice(0, 46)}: ${e.message}`);
  }
}

// Fixed-size worker pool: a wine that hits a slow PDF must not stall the whole batch behind it.
const queue = [...list];
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (queue.length) {
    // Stop the moment the plan limit is hit. Continuing would burn Claude tokens rewriting every
    // remaining wine from model knowledge alone while reporting success -- the failure that cost 447
    // rows on the first run.
    if (isTavilyQuotaExhausted()) { aborted = true; break; }
    await one(queue.shift());
  }
}));
if (aborted) {
  console.error(`
!! ABORTED: Tavily returned 432 (plan usage limit). ${queue.length} wine(s) left untouched.`);
  console.error("   Restore quota, then re-run. Rows already written are kept; the selector resumes.");
}

const spentUsd = (await spend()) - spendBefore;
const mins = (Date.now() - t0) / 60000;
console.log(`\n${"=".repeat(70)}`);
console.log(`tech_sheet ${tally.tech_sheet} | critic ${tally.critic} | web ${tally.web} | inferred ${tally.inferred} | skipped ${tally.skipped} | failed ${tally.failed}`);
console.log(`elapsed ${mins.toFixed(1)} min  |  spend $${spentUsd.toFixed(2)}  |  $${(spentUsd / Math.max(1, list.length)).toFixed(3)}/wine`);
const remaining = rows.length - list.length;
if (remaining > 0) {
  console.log(`\n${remaining} wine(s) remain. Projected: $${(spentUsd / Math.max(1, list.length) * remaining).toFixed(2)}, ~${(mins / Math.max(1, list.length) * remaining).toFixed(0)} min.`);
}
