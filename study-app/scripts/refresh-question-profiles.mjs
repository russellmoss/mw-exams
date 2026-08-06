// refresh-question-profiles.mjs — re-point each question's stored wine_profiles snapshot at the
// upgraded wine bank.
//
// WHY THIS IS NEEDED, AND WHY IT COMES FIRST
// generated_questions.wine_profiles is a SNAPSHOT taken when the question was generated, not a view
// onto the bank. loadStoredWineProfiles prefers it over a live bank lookup (deliberately — it is the
// evidence the candidate's tasting notes were actually built from). So after the bank was
// re-researched into tiered/cited profiles, ~433 questions still held pre-upgrade snapshots with no
// evidence_tier and no citations.
//
// Regenerating a model answer before running this would spend a full Opus call rewriting the answer
// against the SAME old evidence. This must run first.
//
// Cheap by design: enrichWineProfiles only calls out for wines it cannot find in the bank. With the
// bank now at ~1,025 rows nearly every wine is a hit, so most questions cost nothing but a DB read.
//
//   node --import ./scripts/ts-loader.mjs scripts/refresh-question-profiles.mjs            (dry run)
//   node --import ./scripts/ts-loader.mjs scripts/refresh-question-profiles.mjs --apply --limit 20
//   node --import ./scripts/ts-loader.mjs scripts/refresh-question-profiles.mjs --apply
//
// Flags: --apply, --limit N, --concurrency N (default 4), --include-rejected

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

const { enrichWineProfiles, isTavilyQuotaExhausted } = await import("../src/lib/wine-enrichment.ts");

const sql = neon(process.env.DATABASE_URL);
const args = process.argv.slice(2);
const has = (n) => args.includes(n);
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const APPLY = has("--apply");
const LIMIT = flag("--limit") ? Number(flag("--limit")) : undefined;
const CONCURRENCY = flag("--concurrency") ? Number(flag("--concurrency")) : 4;

// Stale = not one wine slot carries an evidence_tier, i.e. the snapshot predates tiered evidence.
// Rejected questions are excluded by default: they are never served, so refreshing them is spend
// with no candidate-facing benefit.
const rows = await sql`
  SELECT question_id, status, wines
  FROM generated_questions
  WHERE wine_profiles IS NOT NULL
    AND jsonb_typeof(wine_profiles) = 'object'
    AND (SELECT count(*) FROM jsonb_each(wine_profiles) v WHERE v.value ? 'evidence_tier') = 0
    AND (${has("--include-rejected")} OR status <> 'rejected')
  ORDER BY question_id`;

const list = LIMIT ? rows.slice(0, LIMIT) : rows;
console.log(`${rows.length} question(s) holding a pre-upgrade snapshot; processing ${list.length}.`);
console.log(APPLY ? "MODE: APPLY (rewrites generated_questions.wine_profiles)\n" : "MODE: DRY RUN\n");
if (!APPLY || !list.length) {
  for (const r of list.slice(0, 10)) console.log(`  ${r.question_id}  (${r.status}, ${(r.wines || []).length} wines)`);
  process.exit(0);
}

const t0 = Date.now();
const before = await spend();
const tally = { refreshed: 0, researched_wines: 0, failed: 0 };
let done = 0, aborted = false;

async function spend() {
  const [c] = await sql`SELECT COALESCE(SUM(cost_usd),0) AS v FROM model_usage WHERE task_type = 'wine_enrichment'`;
  const [t] = await sql`SELECT COALESCE(SUM(cost_usd),0) AS v FROM tavily_usage WHERE task_type LIKE 'wine%'`;
  return Number(c.v) + Number(t.v);
}

async function one(row) {
  try {
    const wines = (row.wines || []).map((w) => ({ slot: w.slot, fullText: w.fullText }));
    const profiles = await enrichWineProfiles(row.question_id, wines, APIKEY, { source: "server" });
    // Anything not resolved from the bank had to be researched — worth counting, because it is the
    // only part of this pass that costs money.
    const researched = Object.values(profiles).filter((p) => p?.source_method !== "bank_lookup").length;
    tally.researched_wines += researched;
    tally.refreshed++;
    const tiers = Object.values(profiles).map((p) => (p?.evidence_tier ?? "-")[0]).join("");
    console.log(`  [${++done}/${list.length}] ${row.question_id.slice(0, 34).padEnd(36)} tiers=${tiers}${researched ? `  (${researched} researched)` : ""}`);
  } catch (e) {
    tally.failed++;
    console.warn(`  [${++done}/${list.length}] FAILED ${row.question_id}: ${e.message}`);
  }
}

const queue = [...list];
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (queue.length) {
    if (isTavilyQuotaExhausted()) { aborted = true; break; }
    await one(queue.shift());
  }
}));
if (aborted) console.error(`\n!! ABORTED: Tavily plan limit reached. ${queue.length} question(s) untouched.`);

const spent = (await spend()) - before;
const mins = (Date.now() - t0) / 60000;
console.log(`\n${"=".repeat(70)}`);
console.log(`refreshed ${tally.refreshed} | wines needing research ${tally.researched_wines} | failed ${tally.failed}`);
console.log(`elapsed ${mins.toFixed(1)} min  |  spend $${spent.toFixed(2)}`);
