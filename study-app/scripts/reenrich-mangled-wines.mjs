// reenrich-mangled-wines.mjs — repair wine profiles that were researched with a broken search query.
//
// WHY THIS EXISTS
// wine-enrichment.ts used to build its Tavily query from parseWineIdentity (the regex parser) rather
// than classifyWine. The regex splits a wine's reference string at the FIRST ".", so any producer
// carrying an initial was cut mid-name: "R. López de Heredia, Viña Tondonia Gran Reserva, 2012."
// yielded producer="R", wine_name="", and the query "R  2012 tasting notes appearance color aroma
// palate review". That returns generic "how to taste wine" pages, and one such snippet is enough to
// stamp the profile source_method='tavily_research', confidence='medium' — a grid that is really the
// model's own recall, labelled as researched. 25 wines across the bank are in that state.
//
// The query bug is fixed (classifyWine now runs first), but a bank-cached profile is never
// re-researched, so the bad grids are permanent until something forces them. That is this script.
//
// Only the AFFECTED SLOT is re-enriched, not the whole flight — the other wines in the question were
// searched correctly and their cached profiles are fine.
//
//   node --import ./scripts/ts-loader.mjs scripts/reenrich-mangled-wines.mjs           (dry run)
//   node --import ./scripts/ts-loader.mjs scripts/reenrich-mangled-wines.mjs --apply
//
// Flags: --apply (write), --limit N, --include-rejected, --include-garbage
//
// Run from study-app/. Reads DATABASE_URL + ANTHROPIC_API_KEY + TAVILY_API_KEY from env or .env.local.

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { neon } from "@neondatabase/serverless";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
// ENV_FILE lets a git-worktree checkout borrow the main tree's .env.local, which is gitignored and
// therefore absent from every worktree. Shell-sourcing it is not a safe substitute: a DATABASE_URL
// carrying '&' or '$' gets mangled or silently dropped by the shell.
const ENV = (() => {
  for (const p of [process.env.ENV_FILE, join(ROOT, ".env.local")].filter(Boolean)) {
    try { return readFileSync(p, "utf8"); } catch { /* try next */ }
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
  console.error("Missing DATABASE_URL or ANTHROPIC_API_KEY (env or .env.local).");
  process.exit(1);
}
if (!process.env.TAVILY_API_KEY) {
  // Without it searchTavily returns nothing and every wine silently falls through to LLM gap-fill —
  // which is the exact failure this script exists to repair. Refuse rather than re-record it.
  console.error("TAVILY_API_KEY not set — re-enrichment would produce LLM-only grids. Aborting.");
  process.exit(1);
}

const { enrichWineProfiles } = await import("../src/lib/wine-enrichment.ts");

const sql = neon(process.env.DATABASE_URL);
const args = process.argv.slice(2);
const has = (n) => args.includes(n);
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const APPLY = has("--apply");
const LIMIT = flag("--limit") ? Number(flag("--limit")) : undefined;

// The same classifier used to size the problem. `first_part` is what parseWineIdentity saw as the
// producer+cuvée segment; if it does not end in a vintage or NV, the "." it split on was inside the
// name (an initial, "No. 2", "Ste. Michelle") and the search query was built from a fragment.
//
// 'genuine' vs 'garbage': a separate defect stored the generator's own deliberation in the wines
// array ("**Spain** — Amontillado Sherry ... ✓"). Those are not wines and re-researching them would
// only write more junk into the bank, so they are excluded by default and left to the quarantine
// workflow that owns them.
const rows = await sql`
  WITH exploded AS (
    SELECT q.question_id, q.status, q.paper, q.wines,
           (w.ord - 1) AS idx,
           (w.val->>'slot')::int AS slot,
           w.val->>'fullText' AS full_text
    FROM generated_questions q,
         LATERAL jsonb_array_elements(q.wines) WITH ORDINALITY AS w(val, ord)
    WHERE q.wines IS NOT NULL AND length(w.val->>'fullText') > 20
  ), flagged AS (
    SELECT *, btrim(substring(full_text from '^[^.]*')) AS first_part FROM exploded
    WHERE btrim(substring(full_text from '^[^.]*')) !~ '(\\d{4}|NV)$'
  )
  SELECT question_id, status, paper, wines, slot, full_text,
    CASE WHEN full_text ~ '\\(\\d+(\\.\\d+)?%( ABV)?\\)$'
          AND full_text !~ '(✓|✗|\\*\\*|excluded|BANNED|banned|wait|Let me|CORRECTION|sub-rule)'
         THEN 'genuine' ELSE 'garbage' END AS kind
  FROM flagged
  ORDER BY question_id, slot`;

// Exclude questions another process is already rewriting — a question the quarantine workflow
// replaces gets a NEW id and the old row is archived, so re-researching its wines is wasted spend.
const skipIds = new Set((flag("--skip-question") || "").split(",").map((s) => s.trim()).filter(Boolean));
const targets = rows.filter((r) => {
  if (skipIds.has(r.question_id)) return false;
  if (r.kind !== "genuine" && !has("--include-garbage")) return false;
  if (r.status === "rejected" && !has("--include-rejected")) return false;
  return true;
});
const skipped = rows.length - targets.length;

const list = LIMIT ? targets.slice(0, LIMIT) : targets;
console.log(`${rows.length} mangled-parse wine(s) found; ${skipped} skipped (garbage/rejected); processing ${list.length}.`);
console.log(APPLY ? "MODE: APPLY (writes wine_profiles + wine_bank)\n" : "MODE: DRY RUN (no writes)\n");

if (!list.length) process.exit(0);

const results = [];
for (const [i, r] of list.entries()) {
  const label = `[${i + 1}/${list.length}] ${r.question_id} slot ${r.slot}`;
  console.log(`${label}\n    ${r.full_text.slice(0, 110)}`);

  const before = (await sql`
    SELECT wine_profiles->${String(r.slot)} AS p FROM generated_questions WHERE question_id = ${r.question_id}
  `)[0]?.p;
  const beforeMethod = before?.source_method ?? "(none)";
  const beforeSources = before?.tasting_profile?.sources?.length ?? 0;

  if (!APPLY) {
    console.log(`    before: ${beforeMethod}, ${beforeSources} source(s) — would re-research\n`);
    results.push({ ...r, beforeMethod, dryRun: true });
    continue;
  }

  try {
    const profiles = await enrichWineProfiles(
      r.question_id,
      r.wines.map((w) => ({ slot: w.slot, fullText: w.fullText })),
      APIKEY,
      { source: "server" },
      { forceSlots: [r.slot] }
    );
    const after = profiles[String(r.slot)];
    const afterSources = after?.tasting_profile?.sources ?? [];
    console.log(`    ${beforeMethod} (${beforeSources} src) -> ${after?.source_method} (${afterSources.length} src, ${after?.confidence})`);
    if (afterSources.length) console.log(`    ${afterSources.slice(0, 2).join("\n    ")}`);
    console.log("");
    results.push({ ...r, beforeMethod, afterMethod: after?.source_method, afterSources: afterSources.length, confidence: after?.confidence });
  } catch (e) {
    console.error(`    FAILED: ${e.message}\n`);
    results.push({ ...r, beforeMethod, error: e.message });
  }
}

const ok = results.filter((r) => r.afterMethod === "tavily_research");
const llmOnly = results.filter((r) => r.afterMethod === "llm_enrichment");
const failed = results.filter((r) => r.error);
if (APPLY) {
  console.log("=".repeat(70));
  console.log(`re-researched from web sources: ${ok.length}`);
  console.log(`fell back to LLM knowledge:     ${llmOnly.length}`);
  console.log(`errored:                        ${failed.length}`);
  const ids = [...new Set(results.filter((r) => !r.error).map((r) => r.question_id))];
  console.log(`\nquestions to regenerate model answers for (${ids.length}):`);
  console.log(ids.join(","));
}
